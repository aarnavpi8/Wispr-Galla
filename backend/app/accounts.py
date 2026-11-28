"""Accounts overview and close-the-day (flow 3)."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import inventory, ledger, models
from app.stockplan import cost_flows
from app.config import settings
from app.db import get_db
from app.deps import current_shop, iso

router = APIRouter(prefix="/api", tags=["accounts"])


class Accounts(BaseModel):
    days: int
    sales: int  # paid now (cash + UPI)
    credit_sales: int  # goods given on udhaar: earned, to be collected
    sales_cash: int
    sales_upi: int
    purchases: int  # stock bought (full bills, paid or not); not a loss: it is still on the shelf
    expenses: int  # cash + UPI
    withdrawals: int  # cash + UPI taken home (not an expense)
    cogs: int  # what the goods sold had cost
    wastage: int  # stock thrown away, at cost
    net: int  # profit estimate: (sales + credit sales) - cost of goods sold - wastage - expenses
    receivable: int  # customers owe the shop ("lena")
    payable: int  # shop owes suppliers ("dena")
    cash_in: int
    cash_out: int
    upi_in: int
    upi_out: int
    stock_value: int  # at cost (what the shelf stock cost to buy)
    stock_items: int
    low_stock: int


class CashEntry(BaseModel):
    id: int
    type: str
    amount: int
    raw_text: str
    created_at: str


class DayCloseOut(BaseModel):
    id: int
    date: str
    opening: int
    expected: int
    counted: int
    difference: int  # counted - expected; negative means cash is short


class DayCloseView(BaseModel):
    date: str
    opening: int
    cash_in: int
    cash_out: int
    expected: int
    entries: list[CashEntry]  # today's cash entries that could explain a gap
    closed: DayCloseOut | None


class DayCloseIn(BaseModel):
    counted: int = Field(ge=0, le=1_00_00_000)


def _kinds(db: Session, shop_id: int) -> dict[int, str]:
    return {p.id: p.kind for p in db.scalars(select(models.Party).where(models.Party.shop_id == shop_id))}


def _entries(db: Session, shop_id: int) -> list[models.Entry]:
    return list(db.scalars(select(models.Entry).where(models.Entry.shop_id == shop_id)))


@router.get("/accounts", response_model=Accounts)
def accounts(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(current_shop),
) -> Accounts:
    kinds = _kinds(db, shop.id)
    entries = _entries(db, shop.id)
    today = datetime.now(settings.tz).date()
    window = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    totals = ledger.daily_totals(entries, window, settings.tz, kinds)
    balances = ledger.party_balances(entries, kinds, today)
    items = list(db.scalars(select(models.Item).where(models.Item.shop_id == shop.id)))

    def total(attr: str) -> int:
        return sum(getattr(d, attr) for d in totals)

    sales, purchases, expenses = total("sales"), total("purchases"), total("expenses_all")
    start = datetime.combine(window[0], datetime.min.time(), tzinfo=settings.tz)
    flows = cost_flows(db, shop.id, start)
    return Accounts(
        days=days,
        sales=sales,
        credit_sales=total("credit_sales"),
        sales_cash=total("sales_cash"),
        sales_upi=total("sales_upi"),
        purchases=purchases,
        expenses=expenses,
        withdrawals=total("withdrawals_all"),
        cogs=flows.cogs,
        wastage=flows.wastage,
        # Goods given on credit were sold too: their cost is in cost of goods, so their value counts.
        net=sales + total("credit_sales") - flows.cogs - flows.wastage - expenses,
        receivable=sum(max(b.balance, 0) for pid, b in balances.items() if kinds[pid] == "customer"),
        payable=sum(max(b.balance, 0) for pid, b in balances.items() if kinds[pid] == "supplier"),
        cash_in=total("cash_in"),
        cash_out=total("cash_out"),
        upi_in=total("upi_in"),
        upi_out=total("upi_out"),
        stock_value=sum(max(i.stock, 0) * (i.cost_price or i.price) for i in items),
        stock_items=len(items),
        low_stock=sum(1 for i in items if inventory.is_low(i)),
    )


def _today_view(db: Session, shop: models.Shop) -> DayCloseView:
    today = datetime.now(settings.tz).date()
    entries = _entries(db, shop.id)
    t = ledger.daily_totals(entries, [today], settings.tz, _kinds(db, shop.id))[0]
    cash = [
        e for e in ledger.active(entries)
        if ledger.local_date(e.created_at, settings.tz) == today and e.mode != "upi"
        and e.type in {"sale", "payment", "expense", "purchase", "owner_withdrawal"}
    ]
    cash.sort(key=lambda e: e.created_at, reverse=True)
    closed = db.scalar(
        select(models.DayClose)
        .where(models.DayClose.shop_id == shop.id, models.DayClose.date == today)
        .order_by(models.DayClose.id.desc())
        .limit(1)
    )
    return DayCloseView(
        date=today.isoformat(),
        opening=shop.opening_cash,
        cash_in=t.cash_in,
        cash_out=t.cash_out,
        expected=shop.opening_cash + t.cash_in - t.cash_out,
        entries=[CashEntry(id=e.id, type=e.type, amount=e.amount, raw_text=e.raw_text,
                           created_at=iso(e.created_at) or "") for e in cash],
        closed=_close_out(closed) if closed else None,
    )


def _close_out(c: models.DayClose) -> DayCloseOut:
    return DayCloseOut(id=c.id, date=c.date.isoformat(), opening=c.opening, expected=c.expected,
                       counted=c.counted, difference=c.difference)


@router.get("/day-close", response_model=DayCloseView)
def day_close_view(db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> DayCloseView:
    return _today_view(db, shop)


@router.post("/day-close", response_model=DayCloseOut, status_code=201)
def close_day(body: DayCloseIn, db: Session = Depends(get_db), shop: models.Shop = Depends(current_shop)) -> DayCloseOut:
    """Saves the count. Counting again the same day adds a new row; the latest one counts."""
    view = _today_view(db, shop)
    row = models.DayClose(
        shop_id=shop.id,
        date=datetime.fromisoformat(view.date).date(),
        opening=view.opening,
        expected=view.expected,
        counted=body.counted,
        difference=body.counted - view.expected,
    )
    db.add(row)
    db.commit()
    return _close_out(row)
