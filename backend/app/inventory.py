"""Inventory (D18): stock per item, every change recorded as a StockMove."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.billscan import parse_bill
from app.stockbook import record_move
from app.db import get_db
from app.deps import current_shop, iso
from app.spoilage import ShelfLife, shelf_life_of

router = APIRouter(prefix="/api/items", tags=["inventory"])

MoveReason = Literal["purchase", "sale", "wastage", "count"]


class ItemOut(BaseModel):
    id: int
    name: str
    variant: str | None
    unit: str
    price: int
    stock: int
    low_stock_at: int
    low: bool
    value: int  # stock x price, at selling price
    cost_price: int = 0  # weighted-average cost per unit (0 = not known yet)
    margin: int | None = None  # price - cost, when the cost is known
    shelf_life: ShelfLife = "months"  # how long it stays good (drives the spoilage estimate)
    shelf_life_guessed: bool = True  # guessed from the name; the shopkeeper hasn't set it yet


class NewItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    variant: str | None = Field(default=None, max_length=60)
    unit: str = Field(default="pc", min_length=1, max_length=20)
    # Both prices are required for a new item: the books (profit, stock value) need them.
    price: int = Field(gt=0, le=10_00_000)
    stock: int = Field(default=0, ge=0, le=1_00_000)
    low_stock_at: int = Field(default=5, ge=0, le=1_00_000)
    cost_price: int = Field(gt=0, le=10_00_000)
    shelf_life: ShelfLife | None = None  # None: guessed from the name


class StockChange(BaseModel):
    """`purchase`/`sale`/`wastage` move by `qty`; `count` sets the stock to `qty` (a recount)."""

    reason: MoveReason
    qty: int = Field(ge=0, le=1_00_000)
    unit_cost: int | None = Field(default=None, ge=0, le=10_00_000)  # what was paid per unit (stock in)


class MoveOut(BaseModel):
    id: int
    delta: int
    reason: str
    stock_after: int
    created_at: str


def is_low(i: models.Item) -> bool:
    """Alert level 0 means "no alert" (e.g. starter items before the shopkeeper sets them)."""
    return i.low_stock_at > 0 and i.stock <= i.low_stock_at


def item_out(i: models.Item) -> ItemOut:
    return ItemOut(
        id=i.id,
        name=i.name,
        variant=i.variant,
        unit=i.unit,
        price=i.price,
        stock=i.stock,
        low_stock_at=i.low_stock_at,
        low=is_low(i),
        value=i.stock * i.price,
        cost_price=i.cost_price,
        margin=i.price - i.cost_price if i.cost_price else None,
        shelf_life=shelf_life_of(i),
        shelf_life_guessed=i.shelf_life is None,
    )


def _item(db: Session, shop: models.Shop, item_id: int) -> models.Item:
    item = db.get(models.Item, item_id)
    if item is None or item.shop_id != shop.id:
        raise HTTPException(404, "Item nahi mila")
    return item


@router.get("", response_model=list[ItemOut])
def list_items(db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> list[ItemOut]:
    items = db.scalars(select(models.Item).where(models.Item.shop_id == shop.id).order_by(models.Item.name, models.Item.id))
    return [item_out(i) for i in items]


@router.post("", response_model=ItemOut, status_code=201)
def add_item(body: NewItem, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> ItemOut:
    name, variant = body.name.strip(), (body.variant or "").strip() or None
    clash = db.scalar(
        select(models.Item.id).where(
            models.Item.shop_id == shop.id,
            models.Item.name.ilike(name),
            models.Item.variant.is_(None) if variant is None else models.Item.variant.ilike(variant),
        )
    )
    if clash is not None:
        raise HTTPException(409, "Ye item pehle se list mein hai")
    item = models.Item(
        shop_id=shop.id,
        name=name,
        variant=variant,
        unit=body.unit.strip(),
        price=body.price,
        aliases=[],
        stock=0,
        low_stock_at=body.low_stock_at,
        cost_price=body.cost_price,
        shelf_life=body.shelf_life,
    )
    db.add(item)
    db.flush()
    if body.stock:
        record_move(db, shop.id, item, body.stock, "opening", body.cost_price or None)
    db.commit()
    return item_out(item)


class ItemUpdate(BaseModel):
    # Prices can be changed but never cleared back to ₹0.
    price: int | None = Field(default=None, gt=0, le=10_00_000)
    low_stock_at: int | None = Field(default=None, ge=0, le=1_00_000)
    cost_price: int | None = Field(default=None, gt=0, le=10_00_000)
    shelf_life: ShelfLife | None = None


@router.patch("/{item_id}", response_model=ItemOut)
def update_item(
    item_id: int,
    body: ItemUpdate,
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(current_shop),
) -> ItemOut:
    """Change an item's price or alert level (stock changes go through /stock, with history)."""
    item = _item(db, shop, item_id)
    if body.price is not None:
        item.price = body.price
    if body.low_stock_at is not None:
        item.low_stock_at = body.low_stock_at
    if body.cost_price is not None:
        item.cost_price = body.cost_price
    if body.shelf_life is not None:
        item.shelf_life = body.shelf_life
    db.commit()
    return item_out(item)


@router.post("/{item_id}/stock", response_model=ItemOut)
def change_stock(
    item_id: int,
    body: StockChange,
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(current_shop),
) -> ItemOut:
    item = _item(db, shop, item_id)
    if body.reason == "count":
        delta = body.qty - item.stock
    elif body.reason == "purchase":
        delta = body.qty
    else:  # sale, wastage
        delta = -body.qty
    if item.stock + delta < 0:
        raise HTTPException(422, f"Stock sirf {item.stock} {item.unit} hai")
    if delta == 0 and body.reason != "count":
        raise HTTPException(422, "Kitna? Quantity 0 se zyada honi chahiye")
    cost = None
    if body.reason == "purchase":
        # Stock coming in must say what it cost (or the item's known cost is used).
        cost = body.unit_cost or item.cost_price or None
        if not cost:
            raise HTTPException(422, {"code": "missing_prices", "cost": [item.name], "price": [],
                                      "detail": f"{item.name}: kharid ka daam (per {item.unit}) batayiye"})
    record_move(db, shop.id, item, delta, body.reason, cost)
    db.commit()
    return item_out(item)


class ScanIn(BaseModel):
    text: str = Field(max_length=20_000)


class ScanLineOut(BaseModel):
    raw: str
    qty: int
    item_id: int | None
    confidence: float
    alternatives: list[int]
    rate: int | None = None  # rupees per unit, from the bill's qty x rate = amount


class BatchLine(BaseModel):
    item_id: int
    qty: int = Field(gt=0, le=1_00_000)
    unit_cost: int | None = Field(default=None, ge=0, le=10_00_000)  # the bill's rate column


class BatchIn(BaseModel):
    reason: Literal["purchase"] = "purchase"
    lines: list[BatchLine] = Field(min_length=1, max_length=200)


@router.post("/scan", response_model=list[ScanLineOut])
def scan_bill(body: ScanIn, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> list[ScanLineOut]:
    """OCR text of a supplier bill -> suggested (item, qty) lines. Changes nothing."""
    items = list(db.scalars(select(models.Item).where(models.Item.shop_id == shop.id)))
    return [ScanLineOut(**vars(line)) for line in parse_bill(body.text, items)]


@router.post("/stock-batch", response_model=list[ItemOut])
def stock_batch(body: BatchIn, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> list[ItemOut]:
    """Add several items to stock in one go (a confirmed bill scan). All or nothing."""
    items = {i.id: i for i in db.scalars(select(models.Item).where(models.Item.shop_id == shop.id))}
    missing = [line.item_id for line in body.lines if line.item_id not in items]
    if missing:
        raise HTTPException(404, f"Item nahi mila: {missing}")
    no_cost = [items[line.item_id].name for line in body.lines if not (line.unit_cost or items[line.item_id].cost_price)]
    if no_cost:
        raise HTTPException(422, {"code": "missing_prices", "cost": no_cost, "price": [],
                                  "detail": "Kharid ka daam batayiye: " + ", ".join(no_cost)})
    touched: dict[int, models.Item] = {}
    for line in body.lines:
        item = items[line.item_id]
        record_move(db, shop.id, item, line.qty, body.reason, line.unit_cost or item.cost_price)
        touched[item.id] = item
    db.commit()
    return [item_out(i) for i in touched.values()]


@router.get("/{item_id}/moves", response_model=list[MoveOut])
def moves(item_id: int, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> list[MoveOut]:
    _item(db, shop, item_id)
    rows = db.scalars(
        select(models.StockMove)
        .where(models.StockMove.item_id == item_id)
        .order_by(models.StockMove.created_at.desc(), models.StockMove.id.desc())
        .limit(50)
    )
    return [MoveOut(id=m.id, delta=m.delta, reason=m.reason, stock_after=m.stock_after,
                    created_at=iso(m.created_at) or "") for m in rows]
