"""Flow 1: sentence -> entry card -> one tap saves. Plus the 10-second undo.

POST /api/extract          text -> ExtractedEntry (nothing saved)
POST /api/entries          the confirmed card -> saved entry (+ new customer, alias, stock moves)
POST /api/entries/{id}/undo  reversal entry; the original is never deleted (D9)
"""

from datetime import UTC, date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import inventory, ledger, models
from app.db import get_db
from app.deps import current_shop, iso
from app.extract import ShopContext, extract, today_in_shop
from app.stockbook import record_move
from app.schemas import EntryOut, ExtractedEntry

router = APIRouter(prefix="/api", tags=["entries"])

DUPLICATE_WINDOW = timedelta(minutes=2)
SAVEABLE = Literal["sale", "udhaar", "payment", "purchase", "expense", "owner_withdrawal"]


class ExtractIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    # Live preview while speaking/typing: rules only (free, instant), never the LLM.
    preview: bool = False


class EntryItemIn(BaseModel):
    item_id: int | None = None
    name: str = ""
    qty: float = Field(default=1, gt=0, le=100_000)
    unit: str = "pc"
    price: int | None = None
    # The words heard for this line ("dal"): saved as the item's alias, so next time it's found directly.
    heard: str | None = Field(default=None, max_length=60)
    # Buying: what was paid per unit (feeds the item's average cost and profit).
    unit_cost: int | None = Field(default=None, gt=0, le=10_00_000)
    # Buying an item that has no selling price yet: what it will be sold for per unit.
    sell_price: int | None = Field(default=None, gt=0, le=10_00_000)


class EntryIn(BaseModel):
    type: SAVEABLE
    amount: int = Field(gt=0, le=1_00_00_000)
    paid_now: int | None = Field(default=None, ge=0)
    mode: Literal["cash", "upi", "udhaar"] | None = None
    due_date: date | None = None
    party_id: int | None = None
    party_name: str | None = Field(default=None, max_length=120)
    party_kind: Literal["customer", "supplier"] = "customer"
    # The name as spoken, when the shopkeeper picked a different party: saved as an alias.
    heard_as: str | None = Field(default=None, max_length=120)
    items: list[EntryItemIn] = Field(default_factory=list, max_length=50)
    raw_text: str = Field(default="", max_length=500)
    source: Literal["rules", "llm", "manual"] = "rules"
    edited: bool = False
    confidence: dict[str, float] = Field(default_factory=dict)
    force: bool = False  # save even if it looks like a duplicate ("Dobara?" -> yes)
    # Save a sale even though the shelf shows less than was sold (the card asked "save anyway?").
    allow_short_stock: bool = False


def shop_context(db: Session, shop: models.Shop) -> ShopContext:
    return ShopContext(
        shop=shop,
        parties=list(db.scalars(select(models.Party).where(models.Party.shop_id == shop.id))),
        items=list(db.scalars(select(models.Item).where(models.Item.shop_id == shop.id))),
        today=today_in_shop(),
    )


def entry_out(db: Session, e: models.Entry) -> EntryOut:
    party = db.get(models.Party, e.party_id) if e.party_id else None
    reversed_ = db.scalar(select(func.count()).select_from(models.Entry).where(models.Entry.reverses_id == e.id)) or 0
    return EntryOut(
        id=e.id, type=e.type, party_id=e.party_id, party_name=party.name if party else None, amount=e.amount,
        paid_now=e.paid_now, mode=e.mode, due_date=e.due_date, raw_text=e.raw_text, source=e.source,
        reversed=reversed_ > 0, created_at=iso(e.created_at) or "",
    )


@router.post("/extract", response_model=ExtractedEntry)
def extract_entry(body: ExtractIn, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> ExtractedEntry:
    """Understand a sentence. Saves nothing: the card is shown for the shopkeeper to confirm."""
    return extract(body.text, shop_context(db, shop), preview=body.preview)


def _resolve_party(db: Session, shop: models.Shop, body: EntryIn) -> models.Party | None:
    party: models.Party | None = None
    if body.party_id is not None:
        party = db.get(models.Party, body.party_id)
        if party is None or party.shop_id != shop.id:
            raise HTTPException(404, "Party nahi mila")
    elif body.party_name and body.party_name.strip():
        name = body.party_name.strip()
        party = db.scalar(
            select(models.Party).where(models.Party.shop_id == shop.id, func.lower(models.Party.name) == name.lower())
        )
        if party is None:  # first time we hear this name: a new customer/supplier
            party = models.Party(shop_id=shop.id, name=name, kind=body.party_kind, phone=None, aliases=[])
            db.add(party)
            db.flush()
    # Learning from corrections: remember how this person was heard.
    heard = (body.heard_as or "").strip()
    if party is not None and heard and heard.lower() != party.name.lower():
        aliases = list(party.aliases or [])
        if heard.lower() not in (a.lower() for a in aliases):
            party.aliases = [*aliases, heard]
    return party


def _learn_item_words(db: Session, shop: models.Shop, lines: list[EntryItemIn]) -> None:
    """Learning from corrections: the word heard for a line becomes that item's alias."""
    for li in lines:
        heard = (li.heard or "").strip().lower()
        if not heard or not li.item_id:
            continue
        item = db.get(models.Item, li.item_id)
        if item is None or item.shop_id != shop.id:
            continue
        known = {item.name.lower(), f"{item.name} {item.variant or ''}".strip().lower(), *(a.lower() for a in item.aliases or [])}
        if heard not in known:
            item.aliases = [*(item.aliases or []), heard]


def _move_stock(db: Session, shop: models.Shop, entry_type: str, items: list[dict], undo: bool = False) -> None:
    """Sales (and goods given on udhaar) take known items off the shelf, purchases put them on.
    Undo does the opposite."""
    sign = {"sale": -1, "udhaar": -1, "purchase": 1}.get(entry_type)
    if sign is None:
        return
    if undo:
        sign = -sign
    for li in items:
        item = db.get(models.Item, li.get("item_id")) if li.get("item_id") else None
        if item is None or item.shop_id != shop.id:
            continue
        delta = sign * int(round(li.get("qty") or 0))
        if delta < 0:
            delta = -min(-delta, item.stock)  # never below zero; the recount fixes the rest
        if delta == 0:
            continue
        reason = "undo" if undo else ("purchase" if entry_type == "purchase" else "sale")
        record_move(db, shop.id, item, delta, reason, li.get("unit_cost") if reason == "purchase" else None)


def _complete_prices(db: Session, shop: models.Shop, body: "EntryIn") -> None:
    """Every stock line carries the prices the books need, and the item keeps them.

    Buying: cost per unit is required (the line's, else the item's known cost), and an item with
    no selling price yet must get one. Selling / udhaar: a selling price is required (the line's,
    else the item's). Prices given for the first time are saved on the item, so the next entry
    is filled in by itself. Missing ones are refused with code "missing_prices", naming the items.
    """
    if body.type not in {"sale", "udhaar", "purchase"}:
        return
    if body.type == "purchase":
        # "40 packet doodh aaya 1120": the one line without a cost takes it from the spoken bill
        # (1120 / 40 = 28 per packet), before any older cost on the item is used.
        open_lines = [li for li in body.items if not li.unit_cost]
        if len(open_lines) == 1:
            rest = sum((li.unit_cost or 0) * li.qty for li in body.items if li.unit_cost)
            each = (body.amount - rest) / open_lines[0].qty
            if each >= 1:
                open_lines[0].unit_cost = round(each)
    need_cost: list[str] = []
    need_price: list[str] = []
    for li in body.items:
        item = db.get(models.Item, li.item_id) if li.item_id else None
        if item is None or item.shop_id != shop.id:
            continue
        label = li.name or item.name
        if body.type == "purchase":
            li.unit_cost = li.unit_cost or item.cost_price or None
            if not li.unit_cost:
                need_cost.append(label)
            if not item.price:
                if li.sell_price:
                    item.price = li.sell_price
                else:
                    need_price.append(label)
        else:
            li.price = li.price or item.price or None
            if not li.price:
                need_price.append(label)
            elif not item.price:
                item.price = li.price  # first time this item is sold: remember its price
    if need_cost or need_price:
        db.rollback()
        raise HTTPException(422, {
            "code": "missing_prices", "cost": need_cost, "price": need_price,
            "detail": "Daam batayiye: " + ", ".join(dict.fromkeys(need_cost + need_price)),
        })


def _owed(db: Session, shop: models.Shop, party: models.Party) -> int:
    """What is still owed with this person: by them (customer) or to them (supplier)."""
    rows = list(db.scalars(select(models.Entry).where(models.Entry.shop_id == shop.id, models.Entry.party_id == party.id)))
    today = datetime.now(UTC).date()
    return max(ledger.party_balances(rows, {party.id: party.kind}, today)[party.id].balance, 0)


def _check_total(db: Session, body: "EntryIn") -> None:
    """The amount must be what the items add up to (selling price, or cost when buying)."""
    if body.type not in {"sale", "udhaar", "purchase"} or not body.items:
        return
    total = 0.0
    slack = 1.0  # rupees; a cost worked out from the bill (1000 / 3) can be off by rounding
    for li in body.items:
        unit = li.unit_cost if body.type == "purchase" else li.price
        if not unit:
            return  # an item without a price: nothing to check against yet
        total += unit * li.qty
        if body.type == "purchase":
            slack = max(slack, li.qty / 2)
    if abs(total - body.amount) > slack:
        db.rollback()
        raise HTTPException(422, {"code": "amount_mismatch", "items_total": round(total), "amount": body.amount,
                                  "detail": f"Items ka jod {round(total)} hai, par amount {body.amount} hai. Dono barabar hone chahiye."})


@router.post("/entries", response_model=EntryOut, status_code=201)
def save_entry(body: EntryIn, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> EntryOut:
    if body.type in {"udhaar", "payment"} and body.party_id is None and not (body.party_name or "").strip():
        raise HTTPException(422, "Kiska hai? Naam batayiye.")
    if body.type == "sale":
        # A sale says what left the shelf and how much: stock and "most demanded" depend on it.
        known = {i for i in db.scalars(select(models.Item.id).where(models.Item.shop_id == shop.id))}
        if not body.items or any(li.item_id not in known for li in body.items):
            raise HTTPException(422, "Kya becha? Stock se item aur kitna, batayiye.")
    if body.type in {"sale", "udhaar"}:
        # Goods can't leave a shelf that doesn't have them: fix the quantity, or record the stock in first.
        short = []
        for li in body.items:
            item = db.get(models.Item, li.item_id) if li.item_id else None
            if item is not None and item.shop_id == shop.id and li.qty > item.stock:
                short.append({"item_id": item.id, "name": li.name or item.name, "have": item.stock, "want": li.qty, "unit": item.unit})
        if short:
            db.rollback()
            names = ", ".join(f"{s['name']} ({s['have']} {s['unit']})" for s in short)
            raise HTTPException(422, {"code": "short_stock", "items": short,
                                      "detail": f"Shelf par itna nahi hai: {names}. Quantity theek karein, ya pehle maal aaya darj karein."})
    party = _resolve_party(db, shop, body)
    if body.type == "udhaar" and party is not None and party.kind == "supplier":
        # Udhaar with a supplier means we bought on credit: we owe them, not the other way round.
        body.type, body.mode = "purchase", "udhaar"
    if body.type == "purchase" and body.paid_now is not None and body.paid_now > body.amount:
        db.rollback()
        raise HTTPException(422, {"code": "paid_too_much", "detail": "Abhi diye paise bill se zyada hain."})
    if body.type == "payment":
        # A payment settles what is owed; more than that doesn't add up.
        owed = _owed(db, shop, party) if party is not None else 0
        if body.amount > owed:
            db.rollback()
            who = party.name if party is not None else (body.party_name or "")
            raise HTTPException(422, {"code": "overpay", "owed": owed, "detail": (
                f"{who} ka sirf {owed} baaki hai. Payment usse zyada nahi ho sakti." if owed > 0
                else f"{who} ka koi baaki nahi hai. Pehle purana udhaar darj karein."
            )})

    if not body.force:
        since = datetime.now(UTC) - DUPLICATE_WINDOW
        dup = db.scalar(
            select(models.Entry)
            .where(
                models.Entry.shop_id == shop.id,
                models.Entry.type == body.type,
                models.Entry.amount == body.amount,
                (models.Entry.party_id == party.id) if party else models.Entry.party_id.is_(None),
                models.Entry.reverses_id.is_(None),
                models.Entry.created_at >= since,
            )
            .order_by(models.Entry.id.desc())
            .limit(1)
        )
        if dup is not None and not entry_out(db, dup).reversed:
            db.rollback()
            raise HTTPException(409, {"code": "duplicate", "entry_id": dup.id, "detail": "Same entry was saved just now. Save again?"})

    mode = body.mode or ("udhaar" if body.type == "udhaar" else "cash")
    _complete_prices(db, shop, body)
    _check_total(db, body)
    _learn_item_words(db, shop, body.items)
    items = [li.model_dump(exclude={"heard"}) for li in body.items]
    entry = models.Entry(
        shop_id=shop.id,
        type=body.type,
        party_id=party.id if party else None,
        items=items,
        amount=body.amount,
        paid_now=body.paid_now if body.type == "purchase" else None,
        mode=mode,
        due_date=body.due_date,
        raw_text=body.raw_text,
        confidence=body.confidence,
        source=body.source,
        edited=body.edited,
    )
    db.add(entry)
    db.flush()
    _move_stock(db, shop, body.type, items)
    db.commit()
    return entry_out(db, entry)


@router.post("/entries/{entry_id}/undo", response_model=EntryOut, status_code=201)
def undo_entry(entry_id: int, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> EntryOut:
    """Cancel an entry with a reversal (D9). Totals and balances drop both; history keeps both."""
    original = db.get(models.Entry, entry_id)
    if original is None or original.shop_id != shop.id:
        raise HTTPException(404, "Entry nahi mili")
    if original.reverses_id is not None:
        raise HTTPException(422, "This is already an undo.")
    if entry_out(db, original).reversed:
        raise HTTPException(409, "Already undone.")
    reversal = models.Entry(
        shop_id=shop.id, type=original.type, party_id=original.party_id, items=original.items,
        amount=original.amount, paid_now=original.paid_now, mode=original.mode, due_date=original.due_date,
        raw_text=f"Undo: {original.raw_text}", confidence={}, source=original.source, edited=False,
        reverses_id=original.id,
    )
    db.add(reversal)
    _move_stock(db, shop, original.type, list(original.items or []), undo=True)
    db.commit()
    return entry_out(db, original)


# --- Selling from the stock screen: money and stock move together ------------------------------


class SellIn(BaseModel):
    qty: int = Field(gt=0, le=100_000)
    mode: Literal["cash", "upi", "udhaar"] = "cash"
    party_id: int | None = None  # who took it on credit (udhaar)


class SellOut(BaseModel):
    item: inventory.ItemOut
    entry: EntryOut | None  # None when the item has no price yet (stock-only)


@router.post("/items/{item_id}/sell", response_model=SellOut, status_code=201)
def sell_from_stock(
    item_id: int, body: SellIn, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)
) -> SellOut:
    """Sold N of an item: one sale entry (money in) + the stock goes down, as a pair.
    Undoing the entry (POST /api/entries/{id}/undo) puts back both the money and the stock."""
    item = db.get(models.Item, item_id)
    if item is None or item.shop_id != shop.id:
        raise HTTPException(404, "Item nahi mila")
    if body.qty > item.stock:
        raise HTTPException(422, f"Stock sirf {item.stock} {item.unit} hai")
    if not item.price:
        # A sale needs a price; an item without one would record ₹0 sales.
        raise HTTPException(422, {"code": "missing_prices", "cost": [], "price": [item.name],
                                  "detail": f"{item.name}: bechne ka daam pehle set kijiye"})
    if body.mode == "udhaar" and body.party_id is None:
        raise HTTPException(422, "Kiska udhaar? Naam batayiye.")
    line = {"item_id": item.id, "name": item.name if not item.variant else f"{item.name} {item.variant}",
            "qty": body.qty, "unit": item.unit, "price": item.price}
    entry = None
    if item.price > 0:
        entry = models.Entry(
            shop_id=shop.id, type="sale", party_id=body.party_id if body.mode == "udhaar" else None,
            items=[line], amount=item.price * body.qty, mode=body.mode,
            raw_text=f"{body.qty} {item.unit} {line['name']}", confidence={}, source="manual",
        )
        db.add(entry)
        db.flush()
    _move_stock(db, shop, "sale", [line])
    db.commit()
    return SellOut(item=inventory.item_out(item), entry=entry_out(db, entry) if entry else None)
