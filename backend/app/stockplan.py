"""Stock as its own account, plus the classic inventory formulas shopkeepers never had time for.

Account (at cost, weighted average):
    opening + purchases - cost of goods sold - wastage +/- adjustments = closing
    gross profit = sales from stock (at selling price) - cost of goods sold

Planning, per item, from the last N days of sales:
    average daily sales d, daily spread s, supplier lead time L days
    reorder point  ROP = d*L + z*s*sqrt(L)      (z = 1.65: about 95% of days without running out)
    order size     EOQ = sqrt(2*D*S / H)        (D yearly demand, S cost per order, H yearly holding cost per unit)
    days left      stock / d
    ABC            A = items making the first 80% of sales value, B the next 15%, C the rest
    dead stock     items on the shelf that did not sell at all in the period
"""

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.deps import current_shop

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

Z_95 = 1.65


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _moves(db: Session, shop_id: int, since: datetime) -> list[models.StockMove]:
    rows = db.scalars(
        select(models.StockMove).where(models.StockMove.shop_id == shop_id).order_by(models.StockMove.id)
    ).all()
    return [m for m in rows if _utc(m.created_at) >= since]


def _items(db: Session, shop_id: int) -> list[models.Item]:
    return list(db.scalars(select(models.Item).where(models.Item.shop_id == shop_id).order_by(models.Item.id)))


def _sold(m: models.StockMove) -> int:
    """Units this move took off the shelf as a sale (an undo of a sale counts back)."""
    if m.reason == "sale":
        return -m.delta
    if m.reason == "undo" and m.delta > 0:
        return -m.delta
    return 0


def _period_days(db: Session, shop_id: int, days: int, now: datetime) -> int:
    """Days of history actually available (a new shop with 3 days of data shouldn't divide by 30)."""
    first = db.scalar(
        select(models.StockMove.created_at).where(models.StockMove.shop_id == shop_id).order_by(models.StockMove.id).limit(1)
    )
    if first is None:
        return 1
    have = (now - _utc(first)).total_seconds() / 86400
    return max(1, min(days, math.ceil(have)))


# --- Inventory account -----------------------------------------------------------------------


class InventoryAccount(BaseModel):
    days: int
    opening: int  # stock value at cost at the start of the period
    purchases: int  # stock in, at what was paid
    cogs: int  # cost of goods sold
    wastage: int
    adjustments: int  # recounts, opening stock added, undo of a purchase (+ or -)
    closing: int  # stock value at cost now
    sales: int  # what the sold goods fetched (selling price)
    gross_profit: int
    margin_pct: float | None
    turnover: float | None  # cost of goods sold / average stock value, for the period
    no_cost_items: int  # items on the shelf without a cost price (their value counts as 0)


@router.get("/account", response_model=InventoryAccount)
def inventory_account(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(current_shop),
) -> InventoryAccount:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    items = {i.id: i for i in _items(db, shop.id)}
    purchases = cogs = wastage = adjustments = sales = 0
    for m in _moves(db, shop.id, since):
        cost = m.unit_cost or 0
        value = m.delta * cost
        sold = _sold(m)
        if sold:
            cogs += sold * cost
            item = items.get(m.item_id)
            sales += sold * (item.price if item else 0)
        elif m.reason == "purchase" or (m.reason == "undo" and m.delta < 0):
            purchases += value  # an undone purchase comes back off
        elif m.reason == "wastage":
            wastage += -value
        else:
            adjustments += value
    closing = sum(i.stock * i.cost_price for i in items.values())
    opening = closing - purchases + cogs + wastage - adjustments
    gross = sales - cogs
    average_stock = (opening + closing) / 2
    return InventoryAccount(
        days=days,
        opening=opening,
        purchases=purchases,
        cogs=cogs,
        wastage=wastage,
        adjustments=adjustments,
        closing=closing,
        sales=sales,
        gross_profit=gross,
        margin_pct=round(gross * 100 / sales, 1) if sales else None,
        turnover=round(cogs / average_stock, 2) if average_stock > 0 else None,
        no_cost_items=sum(1 for i in items.values() if i.stock > 0 and i.cost_price <= 0),
    )


# --- Planning --------------------------------------------------------------------------------

Status = Literal["out", "order_now", "ok", "dead", "no_sales"]


class ItemPlan(BaseModel):
    item_id: int
    name: str
    variant: str | None
    unit: str
    stock: int
    low_stock_at: int
    sold: int  # units sold in the period
    per_day: float  # average daily sales
    days_left: float | None
    reorder_point: int
    order_qty: int  # suggested order now (0 when not needed)
    eoq: int | None
    abc: Literal["A", "B", "C"]
    sales_value: int
    stock_cost: int  # what the shelf stock cost (0 if no cost price)
    status: Status


class Insights(BaseModel):
    days: int
    lead_days: int
    items: list[ItemPlan]
    order_now: int
    dead_value: int  # money stuck in items that did not sell
    a_items: int


def _plan_item(item: models.Item, daily: list[int], period: int, lead: int, order_cost: int, holding_rate: float) -> dict:
    sold = sum(daily)
    d = sold / period
    var = sum((x - d) ** 2 for x in daily) / period
    s = math.sqrt(var)
    rop = math.ceil(d * lead + Z_95 * s * math.sqrt(lead)) if sold > 0 else 0
    unit_cost = item.cost_price or item.price
    yearly = d * 365
    holding = holding_rate * unit_cost
    eoq = math.ceil(math.sqrt(2 * yearly * order_cost / holding)) if yearly > 0 and holding > 0 else None
    need = item.stock <= rop and sold > 0
    order_qty = max(eoq or 0, rop - item.stock + math.ceil(d * lead)) if need else 0
    if item.stock <= 0:
        status: Status = "out" if sold > 0 else "no_sales"
    elif need:
        status = "order_now"
    elif sold == 0:
        status = "dead"
    else:
        status = "ok"
    if item.stock <= 0 and sold > 0:
        order_qty = max(order_qty, eoq or 0, rop + math.ceil(d * lead), 1)
    return {
        "item_id": item.id,
        "name": item.name,
        "variant": item.variant,
        "unit": item.unit,
        "stock": item.stock,
        "low_stock_at": item.low_stock_at,
        "sold": sold,
        "per_day": round(d, 2),
        "days_left": round(item.stock / d, 1) if d > 0 else None,
        "reorder_point": rop,
        "order_qty": order_qty,
        "eoq": eoq,
        "abc": "C",
        "sales_value": sold * item.price,
        "stock_cost": max(0, item.stock) * item.cost_price,
        "status": status,
    }


STATUS_ORDER = {"out": 0, "order_now": 1, "dead": 2, "ok": 3, "no_sales": 4}


def build_insights(
    db: Session, shop: models.Shop, days: int, lead_days: int, order_cost: int, holding_rate: float
) -> Insights:
    now = datetime.now(timezone.utc)
    period = _period_days(db, shop.id, days, now)
    since = now - timedelta(days=period)
    daily: dict[int, list[int]] = defaultdict(lambda: [0] * period)
    for m in _moves(db, shop.id, since):
        if sold := _sold(m):
            day = min(period - 1, int((now - _utc(m.created_at)).total_seconds() // 86400))
            daily[m.item_id][day] += sold
    plans = [
        _plan_item(i, daily[i.id], period, lead_days, order_cost, holding_rate) for i in _items(db, shop.id)
    ]
    # ABC by sales value: the few items that bring most of the money get watched most.
    total = sum(p["sales_value"] for p in plans)
    running = 0
    for p in sorted(plans, key=lambda p: -p["sales_value"]):
        if total and p["sales_value"] > 0:
            share_before = running / total
            p["abc"] = "A" if share_before < 0.8 else "B" if share_before < 0.95 else "C"
            running += p["sales_value"]
    plans.sort(key=lambda p: (STATUS_ORDER[p["status"]], {"A": 0, "B": 1, "C": 2}[p["abc"]], p["days_left"] or 1e9))
    return Insights(
        days=period,
        lead_days=lead_days,
        items=[ItemPlan(**p) for p in plans],
        order_now=sum(1 for p in plans if p["status"] in ("out", "order_now")),
        dead_value=sum(p["stock_cost"] for p in plans if p["status"] == "dead"),
        a_items=sum(1 for p in plans if p["abc"] == "A"),
    )


@router.get("/insights", response_model=Insights)
def insights(
    days: int = Query(30, ge=1, le=365),
    lead_days: int = Query(3, ge=1, le=60),
    order_cost: int = Query(50, ge=0, le=10_000),  # rupees per order: travel, call, time
    holding_rate: float = Query(0.2, gt=0, le=2),  # yearly cost of keeping stock, as a share of its cost
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(current_shop),
) -> Insights:
    return build_insights(db, shop, days, lead_days, order_cost, holding_rate)


class ApplyAlerts(BaseModel):
    item_ids: list[int] | None = Field(default=None, max_length=500)  # None = every item with sales
    lead_days: int = Field(default=3, ge=1, le=60)
    days: int = Field(default=30, ge=1, le=365)


class ApplyAlertsOut(BaseModel):
    updated: int


@router.post("/apply-alerts", response_model=ApplyAlertsOut)
def apply_alerts(
    body: ApplyAlerts, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)
) -> ApplyAlertsOut:
    """Set each item's low-stock alert to its reorder point, so the alert fires in time to restock."""
    plan = build_insights(db, shop, body.days, body.lead_days, 50, 0.2)
    wanted = set(body.item_ids) if body.item_ids is not None else None
    items = {i.id: i for i in _items(db, shop.id)}
    updated = 0
    for p in plan.items:
        if p.sold == 0 or (wanted is not None and p.item_id not in wanted):
            continue
        item = items[p.item_id]
        if item.low_stock_at != p.reorder_point:
            item.low_stock_at = p.reorder_point
            updated += 1
    db.commit()
    return ApplyAlertsOut(updated=updated)

