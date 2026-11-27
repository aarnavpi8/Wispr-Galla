from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app import ledger
from app.models import Entry

IST = ZoneInfo("Asia/Kolkata")
DAY = date(2026, 11, 27)


def entry(id, type, amount, *, mode=None, party_id=None, paid_now=None, due=None, reverses=None,
          at=datetime(2026, 11, 27, 6, 0, tzinfo=UTC)):
    return Entry(id=id, shop_id=1, type=type, amount=amount, mode=mode, party_id=party_id,
                 paid_now=paid_now, due_date=due, reverses_id=reverses, created_at=at)


def totals(*entries, kinds=None):
    return ledger.daily_totals(entries, [DAY], IST, kinds or {})[0]


def test_sales_split_by_mode():
    t = totals(entry(1, "sale", 500, mode="cash"), entry(2, "sale", 300, mode="upi"),
               entry(3, "sale", 200, mode="udhaar"))
    assert (t.sales_cash, t.sales_upi, t.udhaar_given, t.sales) == (500, 300, 200, 800)


def test_expected_cash_flow():
    t = totals(
        entry(1, "sale", 1000, mode="cash"),
        entry(2, "payment", 200, mode="cash", party_id=7),
        entry(3, "expense", 150, mode="cash"),
        entry(4, "purchase", 3200, paid_now=1000, mode="cash", party_id=9),
        entry(5, "owner_withdrawal", 100, mode="cash"),
        entry(6, "payment", 999, mode="upi", party_id=7),
        kinds={7: "customer", 9: "supplier"},
    )
    assert t.cash_in == 1200
    assert t.upi_in == 999
    assert t.cash_out == 150 + 1000 + 100


def test_upi_expense_does_not_leave_galla():
    assert totals(entry(1, "expense", 850, mode="upi")).cash_out == 0


def test_reversal_cancels_both_entries():
    t = totals(entry(1, "sale", 500, mode="cash"), entry(2, "sale", 500, mode="cash", reverses=1))
    assert t.sales == 0 and t.entries == 0


def test_ist_day_boundary():
    # 20:00 UTC on 26 Nov is 01:30 IST on 27 Nov: counts for 27 Nov.
    late = entry(1, "sale", 100, mode="cash", at=datetime(2026, 11, 26, 20, 0, tzinfo=UTC))
    assert totals(late).sales == 100


def test_naive_datetimes_are_treated_as_utc():
    assert ledger.local_date(datetime(2026, 11, 26, 20, 0), IST) == DAY


def test_customer_balance_and_overdue():
    kinds = {7: "customer"}
    b = ledger.party_balances(
        [entry(1, "udhaar", 350, party_id=7, due=date(2026, 11, 25)),
         entry(2, "payment", 200, party_id=7)],
        kinds, DAY,
    )[7]
    assert b.balance == 150
    assert b.overdue_since == date(2026, 11, 25)


def test_paid_off_customer_is_not_overdue():
    b = ledger.party_balances(
        [entry(1, "udhaar", 350, party_id=7, due=date(2026, 11, 25)),
         entry(2, "payment", 350, party_id=7)],
        {7: "customer"}, DAY,
    )[7]
    assert b.balance == 0 and b.overdue_since is None


def test_udhaar_sale_counts_towards_balance():
    b = ledger.party_balances([entry(1, "sale", 90, mode="udhaar", party_id=7)], {7: "customer"}, DAY)[7]
    assert b.balance == 90


def test_supplier_payable():
    b = ledger.party_balances(
        [entry(1, "purchase", 3200, paid_now=1000, party_id=9), entry(2, "payment", 500, party_id=9)],
        {9: "supplier"}, DAY,
    )[9]
    assert b.balance == 1700


def test_parties_with_no_entries_have_zero_balance():
    assert ledger.party_balances([], {1: "customer"}, DAY)[1].balance == 0
