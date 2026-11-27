from datetime import date

import httpx
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import llm, models
from app.config import settings
from app.db import Base
from app.extract import ShopContext, extract, extract_rules
from app.numbers import replace_number_words
from app.seed import seed

TODAY = date(2026, 11, 27)  # a Friday


@pytest.fixture(scope="module")
def ctx():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        shop = seed(db)
        yield ShopContext(shop, list(db.scalars(select(models.Party))), list(db.scalars(select(models.Item))), TODAY)


@pytest.mark.parametrize(
    "spoken, digits",
    [
        ("dhai sau ki bikri", "250 ki bikri"),
        ("saade teen hazaar ka maal", "3500 ka maal"),
        ("do hazaar paanch sau diye", "2500 diye"),
        ("paune do sau", "175"),
        ("teen sau pachas", "350"),
        ("डेढ़ सौ रुपये", "150 रुपये"),
        ("३,२०० का माल", "3200 का माल"),
        ("1,25,000 ka hisaab", "125000 ka hisaab"),
        ("2.5k udhaar", "2500 udhaar"),
        ("two fifty upi", "250 upi"),
        ("Ramesh ko do kilo cheeni", "Ramesh ko 2 kilo cheeni"),
        ("paisa do na", "paisa do na"),  # "do" = give, not 2
    ],
)
def test_spoken_numbers(spoken, digits):
    assert replace_number_words(spoken) == digits


def run(ctx, text):
    return extract_rules(text, ctx)


def test_payment_by_upi(ctx):
    e = run(ctx, "Sharma ji ne 500 UPI se diye")
    assert (e.type, e.party.name, e.party.match_id is not None, e.amount, e.mode) == ("payment", "Sharma ji", True, 500, "upi")
    assert e.missing == [] and e.source == "rules"


def test_udhaar_with_item_quantity_and_due_date(ctx):
    e = run(ctx, "Ramesh ko 2 kilo cheeni udhaar, 15 tareekh tak")
    assert e.type == "udhaar" and e.party.name == "Ramesh"
    assert [(i.name, i.qty) for i in e.items] == [("Cheeni", 2.0)]
    assert e.amount == 90  # 2 kg x ₹45 from the price list
    assert e.due_date == date(2026, 12, 15)


def test_purchase_with_part_payment(ctx):
    e = run(ctx, "Gupta distributor ka maal aaya 3,200 ka, 1,000 cash diye")
    assert (e.type, e.party.name, e.amount, e.paid_now, e.mode) == ("purchase", "Gupta Distributors", 3200, 1000, "cash")


def test_expense(ctx):
    e = run(ctx, "Bijli bill 850 bhara")
    assert (e.type, e.party, e.amount, e.mode) == ("expense", None, 850, "cash")


def test_misspelt_name_and_spoken_amount(ctx):
    e = run(ctx, "Sarma ne dhai sau diye")
    assert (e.type, e.party.name, e.amount) == ("payment", "Sharma ji", 250)


def test_owner_withdrawal_has_no_party(ctx):
    e = run(ctx, "Ghar ke liye 500 nikale")
    assert (e.type, e.party, e.amount) == ("owner_withdrawal", None, 500)


def test_item_quantities_are_not_the_amount(ctx):
    e = run(ctx, "5 maggi becha 75 cash")
    assert e.amount == 75 and e.items[0].qty == 5
    e = run(ctx, "2 parle g 1 maggi")
    assert e.type == "sale" and e.amount == 2 * 10 + 15  # priced from the list
    assert [i.name for i in e.items] == ["Parle-G chhota", "Maggi"]  # item words aren't a person


def test_dozen(ctx):
    e = run(ctx, "do darjan ande becha")
    assert e.items[0].qty == 24 and e.amount == 24 * 7


def test_new_name_with_close_matches_as_chips(ctx):
    e = run(ctx, "Verma ji ko 300 udhaar parson tak")
    assert e.party.name == "Verma ji" and e.party.match_id is None
    assert e.confidence["party"] < 0.8
    assert "Sharma ji" in [o.name for o in e.party_options]
    assert e.due_date == date(2026, 11, 29)


def test_supplier_delivery_is_a_purchase(ctx):
    e = run(ctx, "Raju dairy se 40 packet doodh aaya 1120")
    assert (e.type, e.party.name, e.amount) == ("purchase", "Raju Dairy", 1120)


def test_hindi_script(ctx):
    e = run(ctx, "रमेश को 200 उधार")
    assert (e.type, e.party.name, e.amount) == ("udhaar", "Ramesh", 200)
    assert "due_date" in e.missing


def test_missing_party_is_asked(ctx):
    e = run(ctx, "500 udhaar")
    assert e.missing == ["party", "due_date"]


def test_no_amount_is_asked(ctx):
    assert "amount" in run(ctx, "Ramesh ko udhaar").missing


# --- LLM path (Gemini), with a fake server --------------------------------------------------


def fake_gemini(payload: dict | None, status: int = 200):
    import json

    def handler(req: httpx.Request) -> httpx.Response:
        if payload is None:
            return httpx.Response(status, json={"error": {"message": "boom"}})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]})

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_llm_result_is_matched_by_our_own_fuzzy_matching(ctx, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "llm_api_key", "test")
    payload = {"type": "udhaar", "party_name": "Rames", "items": [{"name": "chini", "qty": 2}], "amount": None,
               "mode": "udhaar", "due_date": "2026-12-15"}
    e = llm.extract_llm("whatever", ctx, fallback=extract_rules, client=fake_gemini(payload))
    assert e.source == "llm"
    assert e.party.match_id is not None and e.party.name == "Ramesh"
    assert e.items[0].item_id is not None and e.amount == 90
    assert e.due_date == date(2026, 12, 15)


def test_llm_failure_falls_back_to_rules(ctx, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "llm_api_key", "test")
    monkeypatch.setattr(llm, "call_gemini", lambda prompt, client=None: (_ for _ in ()).throw(httpx.ConnectError("down")))
    e = extract("Sharma ji ne 500 UPI se diye", ctx)
    assert e.source == "rules" and e.amount == 500


def test_unknown_provider_uses_rules(ctx, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "someone-else")
    monkeypatch.setattr(settings, "llm_api_key", "test")
    assert extract("Bijli bill 850 bhara", ctx).source == "rules"
