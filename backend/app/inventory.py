"""Inventory (D18): stock per item, every change recorded as a StockMove."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.billscan import parse_bill
from app.db import get_db
from app.deps import current_shop, iso

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


class NewItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    variant: str | None = Field(default=None, max_length=60)
    unit: str = Field(default="pc", min_length=1, max_length=20)
    price: int = Field(ge=0, le=10_00_000)
    stock: int = Field(default=0, ge=0, le=1_00_000)
    low_stock_at: int = Field(default=5, ge=0, le=1_00_000)


class StockChange(BaseModel):
    """`purchase`/`sale`/`wastage` move by `qty`; `count` sets the stock to `qty` (a recount)."""

    reason: MoveReason
    qty: int = Field(ge=0, le=1_00_000)


class MoveOut(BaseModel):
    id: int
    delta: int
    reason: str
    stock_after: int
    created_at: str


def item_out(i: models.Item) -> ItemOut:
    return ItemOut(
        id=i.id,
        name=i.name,
        variant=i.variant,
        unit=i.unit,
        price=i.price,
        stock=i.stock,
        low_stock_at=i.low_stock_at,
        low=i.stock <= i.low_stock_at,
        value=i.stock * i.price,
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
        stock=body.stock,
        low_stock_at=body.low_stock_at,
    )
    db.add(item)
    db.flush()
    if body.stock:
        db.add(models.StockMove(shop_id=shop.id, item_id=item.id, delta=body.stock, reason="opening",
                                stock_after=body.stock))
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
    item.stock += delta
    db.add(models.StockMove(shop_id=shop.id, item_id=item.id, delta=delta, reason=body.reason,
                            stock_after=item.stock))
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


class BatchLine(BaseModel):
    item_id: int
    qty: int = Field(gt=0, le=1_00_000)


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
    touched: dict[int, models.Item] = {}
    for line in body.lines:
        item = items[line.item_id]
        item.stock += line.qty
        db.add(models.StockMove(shop_id=shop.id, item_id=item.id, delta=line.qty, reason=body.reason,
                                stock_after=item.stock))
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
