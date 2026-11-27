"""Pure money maths over saved entries: day totals, expected cash, party balances.

Kept free of the database so it is easy to test. Reversals (D9): an entry that reverses
another, and the entry it reverses, both drop out of every total.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.models import Entry

MONEY_OUT_TYPES = {"purchase", "expense", "owner_withdrawal"}


def active(entries: Iterable[Entry]) -> list[Entry]:
    """Entries that still count: drop reversals and the entries they cancel."""
    entries = list(entries)
    reversed_ids = {e.reverses_id for e in entries if e.reverses_id is not None}
    return [e for e in entries if e.reverses_id is None and e.id not in reversed_ids]


def local_date(dt: datetime, tz: ZoneInfo) -> date:
    # SQLite drops tzinfo; values we write are UTC-aware, so treat naive ones as UTC.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(tz).date()


@dataclass
class DayTotals:
    date: date
    sales_cash: int = 0
    sales_upi: int = 0
    udhaar_given: int = 0
    collected_cash: int = 0
    collected_upi: int = 0
    expenses: int = 0
    purchases_paid: int = 0
    purchases: int = 0  # full bill value of maal bought, paid or not
    withdrawals: int = 0
    entries: int = 0

    @property
    def sales(self) -> int:
        return self.sales_cash + self.sales_upi

    @property
    def cash_in(self) -> int:
        return self.sales_cash + self.collected_cash

    @property
    def upi_in(self) -> int:
        return self.sales_upi + self.collected_upi

    @property
    def cash_out(self) -> int:
        """Money that left the galla in cash. Expenses and purchases default to cash."""
        return self.expenses + self.purchases_paid + self.withdrawals

    def as_dict(self) -> dict:
        return {
            "date": self.date.isoformat(),
            "sales": self.sales,
            "sales_cash": self.sales_cash,
            "sales_upi": self.sales_upi,
            "udhaar_given": self.udhaar_given,
            "collected": self.collected_cash + self.collected_upi,
            "cash_in": self.cash_in,
            "upi_in": self.upi_in,
            "expenses": self.expenses,
            "purchases_paid": self.purchases_paid,
            "purchases": self.purchases,
            "withdrawals": self.withdrawals,
            "cash_out": self.cash_out,
            "entries": self.entries,
        }


def add_to_day(day: DayTotals, e: Entry, party_kind: str | None) -> None:
    day.entries += 1
    if e.type == "sale":
        if e.mode == "udhaar":
            day.udhaar_given += e.amount
        elif e.mode == "upi":
            day.sales_upi += e.amount
        else:
            day.sales_cash += e.amount
    elif e.type == "udhaar":
        day.udhaar_given += e.amount
    elif e.type == "payment":
        if party_kind == "supplier":
            # We paid a supplier: money out.
            if e.mode != "upi":
                day.purchases_paid += e.amount
        elif e.mode == "upi":
            day.collected_upi += e.amount
        else:
            day.collected_cash += e.amount
    elif e.type == "purchase":
        day.purchases += e.amount
        if e.mode != "upi":
            day.purchases_paid += purchase_paid(e)
    elif e.type == "expense":
        if e.mode != "upi":
            day.expenses += e.amount
    elif e.type == "owner_withdrawal":
        if e.mode != "upi":
            day.withdrawals += e.amount


def daily_totals(
    entries: Iterable[Entry], days: list[date], tz: ZoneInfo, party_kinds: dict[int, str]
) -> list[DayTotals]:
    by_day = {d: DayTotals(date=d) for d in days}
    for e in active(entries):
        day = by_day.get(local_date(e.created_at, tz))
        if day is not None:
            add_to_day(day, e, party_kinds.get(e.party_id) if e.party_id else None)
    return [by_day[d] for d in days]


@dataclass
class Balance:
    party_id: int
    balance: int = 0  # customer: they owe us; supplier: we owe them
    overdue_since: date | None = None
    last_entry_at: datetime | None = None
    _due_dates: list[date] = field(default_factory=list)


def purchase_paid(e: Entry) -> int:
    """What the shop paid at the time of a purchase. Not said: all of it, unless bought on credit."""
    if e.paid_now is not None:
        return e.paid_now
    return 0 if e.mode == "udhaar" else e.amount


def party_balances(entries: Iterable[Entry], party_kinds: dict[int, str], today: date) -> dict[int, Balance]:
    out: dict[int, Balance] = {pid: Balance(party_id=pid) for pid in party_kinds}
    for e in sorted(active(entries), key=lambda e: e.created_at):
        if e.party_id is None or e.party_id not in out:
            continue
        b = out[e.party_id]
        kind = party_kinds[e.party_id]
        if kind == "customer":
            if e.type == "udhaar" or (e.type == "sale" and e.mode == "udhaar"):
                b.balance += e.amount
                if e.due_date:
                    b._due_dates.append(e.due_date)
            elif e.type == "payment":
                b.balance -= e.amount
        else:
            if e.type == "purchase":
                b.balance += e.amount - purchase_paid(e)
                if e.due_date:
                    b._due_dates.append(e.due_date)
            elif e.type == "payment":
                b.balance -= e.amount
        b.last_entry_at = e.created_at
    for b in out.values():
        past_due = [d for d in b._due_dates if d < today]
        if b.balance > 0 and past_due:
            b.overdue_since = min(past_due)
        if b.balance <= 0:
            b._due_dates.clear()
    return out
