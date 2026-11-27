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

from app import models
from app.db import get_db
from app.deps import current_shop, iso
from app.extract import ShopContext, extract, today_in_shop
from app.schemas import EntryOut, ExtractedEntry

router = APIRouter(prefix="/api", tags=["entries"])

DUPLICATE_WINDOW = timedelta(minutes=2)
SAVEABLE = Literal["sale", "udhaar", "payment", "purchase", "expense", "owner_withdrawal"]


class ExtractIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class EntryItemIn(BaseModel):
    item_id: int | None = None
    name: str = ""
    qty: float = Field(default=1, gt=0, le=100_000)
    unit: str = "pc"
    price: int | None = None


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
    return extract(body.text, shop_context(db, shop))


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


def _move_stock(db: Session, shop: models.Shop, entry_type: str, items: list[dict], undo: bool = False) -> None:
    """Sales take known items off the shelf, purchases put them on. Undo does the opposite."""
    sign = {"sale": -1, "purchase": 1}.get(entry_type)
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
        item.stock += delta
        reason = "undo" if undo else ("sale" if entry_type == "sale" else "purchase")
        db.add(models.StockMove(shop_id=shop.id, item_id=item.id, delta=delta, reason=reason, stock_after=item.stock))


@router.post("/entries", response_model=EntryOut, status_code=201)
def save_entry(body: EntryIn, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> EntryOut:
    if body.type in {"udhaar", "payment"} and body.party_id is None and not (body.party_name or "").strip():
        raise HTTPException(422, "Kiska hai? Naam batayiye.")
    party = _resolve_party(db, shop, body)

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
    items = [li.model_dump() for li in body.items]
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
