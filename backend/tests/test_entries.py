import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


@pytest.fixture()
def client():
    """Fresh database with the demo shop, per test."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def db():
        with Session() as s:
            yield s

    app.dependency_overrides[get_db] = db
    with TestClient(app) as c:
        assert c.post("/api/setup/demo").status_code == 201
        yield c
    app.dependency_overrides.clear()


def card(client, text):
    res = client.post("/api/extract", json={"text": text})
    assert res.status_code == 200
    return res.json()


def save_card(client, e, **extra):
    body = {
        "type": e["type"],
        "amount": e["amount"],
        "paid_now": e["paid_now"],
        "mode": e["mode"],
        "due_date": e["due_date"],
        "party_id": (e["party"] or {}).get("match_id"),
        "party_name": (e["party"] or {}).get("name"),
        "party_kind": (e["party"] or {}).get("kind", "customer"),
        "items": e["items"],
        "raw_text": e["raw_text"],
        "source": e["source"],
        "confidence": e["confidence"],
        **extra,
    }
    return client.post("/api/entries", json=body)


def balance(client, name):
    return next(p["balance"] for p in client.get("/api/khata").json() if p["name"] == name)


def test_extract_saves_nothing(client):
    before = client.get("/api/shop").json()["entries"]
    card(client, "Sharma ji ne 500 UPI se diye")
    assert client.get("/api/shop").json()["entries"] == before


def test_payment_reduces_what_they_owe(client):
    before = balance(client, "Sharma ji")
    res = save_card(client, card(client, "Sharma ji ne 500 UPI se diye"))
    assert res.status_code == 201
    assert res.json()["party_name"] == "Sharma ji" and res.json()["mode"] == "upi"
    assert balance(client, "Sharma ji") == before - 500
    assert client.get("/api/entries?limit=1").json()[0]["raw_text"] == "Sharma ji ne 500 UPI se diye"


def test_new_customer_is_created(client):
    res = save_card(client, card(client, "Verma ji ko 300 udhaar parson tak"))
    assert res.status_code == 201
    assert balance(client, "Verma ji") == 300


def test_correction_is_learned_as_alias(client):
    e = card(client, "Shrma ji ko 120 udhaar")  # unclear name
    sharma = next(p for p in client.get("/api/khata").json() if p["name"] == "Sharma ji")
    res = save_card(client, e, party_id=sharma["id"], party_name=None, heard_as="Shrma ji", edited=True)
    assert res.status_code == 201
    # Next time the same spelling matches straight away.
    again = card(client, "Shrma ji ko 50 udhaar")
    assert again["party"]["match_id"] == sharma["id"] and again["confidence"]["party"] >= 0.8


def test_duplicate_within_two_minutes_asks_first(client):
    e = card(client, "Bijli bill 850 bhara")
    assert save_card(client, e).status_code == 201
    dup = save_card(client, e)
    assert dup.status_code == 409
    assert dup.json()["detail"]["code"] == "duplicate"
    assert save_card(client, e, force=True).status_code == 201  # "Dobara?" -> yes


def test_undo_reverses_totals_and_stock(client):
    maggi = next(i for i in client.get("/api/items").json() if i["name"] == "Maggi")
    before_cash = client.get("/api/day-close").json()["cash_in"]

    saved = save_card(client, card(client, "5 maggi becha 75 cash")).json()
    assert next(i for i in client.get("/api/items").json() if i["name"] == "Maggi")["stock"] == maggi["stock"] - 5
    assert client.get("/api/day-close").json()["cash_in"] == before_cash + 75

    undone = client.post(f"/api/entries/{saved['id']}/undo")
    assert undone.status_code == 201 and undone.json()["reversed"] is True
    assert client.get("/api/day-close").json()["cash_in"] == before_cash
    assert next(i for i in client.get("/api/items").json() if i["name"] == "Maggi")["stock"] == maggi["stock"]
    # History keeps the original (struck through); the reversal row itself isn't listed.
    rows = client.get("/api/entries?limit=3").json()
    assert rows[0]["id"] == saved["id"] and rows[0]["reversed"] is True
    assert not any(r["raw_text"].startswith("Undo:") for r in rows)
    assert client.post(f"/api/entries/{saved['id']}/undo").status_code == 409


def test_purchase_adds_stock(client):
    doodh = next(i for i in client.get("/api/items").json() if i["name"] == "Amul doodh" and i["variant"] == "aadha litre")
    e = card(client, "Raju dairy se 40 packet doodh aaya 1120")
    assert save_card(client, e).status_code == 201
    after = next(i for i in client.get("/api/items").json() if i["id"] == doodh["id"])
    assert after["stock"] == doodh["stock"] + 40


def test_udhaar_needs_a_name(client):
    res = client.post("/api/entries", json={"type": "udhaar", "amount": 500})
    assert res.status_code == 422


def test_amount_must_be_positive(client):
    assert client.post("/api/entries", json={"type": "sale", "amount": 0}).status_code == 422


def test_undo_unknown_entry(client):
    assert client.post("/api/entries/99999/undo").status_code == 404


def item_named(client, name):
    return next(i for i in client.get("/api/items").json() if i["name"] == name)


def test_selling_from_stock_records_the_money(client):
    maggi = item_named(client, "Maggi")  # ₹15
    cash_before = client.get("/api/day-close").json()["cash_in"]
    res = client.post(f"/api/items/{maggi['id']}/sell", json={"qty": 3, "mode": "cash"})
    assert res.status_code == 201
    body = res.json()
    assert body["item"]["stock"] == maggi["stock"] - 3
    assert body["entry"]["type"] == "sale" and body["entry"]["amount"] == 45 and body["entry"]["mode"] == "cash"
    assert client.get("/api/day-close").json()["cash_in"] == cash_before + 45
    # The stock history shows the sale.
    assert client.get(f"/api/items/{maggi['id']}/moves").json()[0]["reason"] == "sale"


def test_undoing_the_sale_puts_back_money_and_stock(client):
    maggi = item_named(client, "Maggi")
    cash_before = client.get("/api/day-close").json()["cash_in"]
    sale = client.post(f"/api/items/{maggi['id']}/sell", json={"qty": 2}).json()["entry"]
    assert client.post(f"/api/entries/{sale['id']}/undo").status_code == 201
    assert item_named(client, "Maggi")["stock"] == maggi["stock"]
    assert client.get("/api/day-close").json()["cash_in"] == cash_before


def test_upi_sale_from_stock_counts_as_upi(client):
    bread = item_named(client, "Bread")  # ₹45, stock 2
    entry = client.post(f"/api/items/{bread['id']}/sell", json={"qty": 1, "mode": "upi"}).json()["entry"]
    assert entry["mode"] == "upi" and entry["amount"] == 45


def test_udhaar_sale_needs_a_customer_and_adds_to_their_balance(client):
    maggi = item_named(client, "Maggi")
    assert client.post(f"/api/items/{maggi['id']}/sell", json={"qty": 1, "mode": "udhaar"}).status_code == 422
    ramesh = next(p for p in client.get("/api/khata").json() if p["name"] == "Ramesh")
    res = client.post(f"/api/items/{maggi['id']}/sell", json={"qty": 2, "mode": "udhaar", "party_id": ramesh["id"]})
    assert res.status_code == 201
    assert next(p for p in client.get("/api/khata").json() if p["name"] == "Ramesh")["balance"] == ramesh["balance"] + 30


def test_cannot_sell_more_than_in_stock(client):
    bread = item_named(client, "Bread")
    assert client.post(f"/api/items/{bread['id']}/sell", json={"qty": bread["stock"] + 1}).status_code == 422


def test_new_item_needs_both_prices(client):
    no_cost = {"name": "Agarbatti", "unit": "box", "price": 30, "stock": 5}
    assert client.post("/api/items", json=no_cost).status_code == 422
    assert client.post("/api/items", json={**no_cost, "price": 0, "cost_price": 20}).status_code == 422
    assert client.post("/api/items", json={**no_cost, "cost_price": 20}).status_code == 201


def test_goods_on_udhaar_leave_the_shelf(client):
    cheeni = item_named(client, "Cheeni")
    e = card(client, "Ramesh ko 2 kilo cheeni udhaar")
    assert save_card(client, e).status_code == 201
    assert item_named(client, "Cheeni")["stock"] == cheeni["stock"] - 2


def test_items_attached_on_the_card_move_stock(client):
    # "500 ki bikri" names no item; the shopkeeper attaches 4 Kurkure on the card.
    kurkure = item_named(client, "Kurkure")
    e = card(client, "80 ki bikri cash")
    e["items"] = [{"item_id": kurkure["id"], "name": "Kurkure", "qty": 4, "unit": "pc", "price": 20}]
    assert save_card(client, e, edited=True).status_code == 201
    assert item_named(client, "Kurkure")["stock"] == kurkure["stock"] - 4


# --- Buying from a supplier ------------------------------------------------------------------


@pytest.mark.parametrize(
    "text, mode, party",
    [
        ("Bought 10 kg sugar from Gupta traders on credit for 450", "udhaar", "Gupta Distributors"),
        ("Gupta se 10 kilo cheeni udhaar pe kharidi 450", "udhaar", "Gupta Distributors"),
        ("I bought 3 dozen eggs from the vendor 180 cash", "cash", None),
    ],
)
def test_buying_stock_is_a_purchase(client, text, mode, party):
    e = card(client, text)
    assert e["type"] == "purchase" and e["mode"] == mode
    assert (e["party"] or {}).get("name") == party
    assert len(e["items"]) == 1 and e["items"][0]["qty"] in (10, 36)  # 3 dozen eggs = 36 Anda


def test_item_not_in_stock_is_named_on_the_card(client):
    e = card(client, "Bought 5 kg kesar from Gupta traders 600 cash")
    line = next(li for li in e["items"] if li["item_id"] is None)
    assert line["name"].lower().startswith("kesar") and line["qty"] == 5 and line["unit"] == "kg"
    assert e["amount"] == 600  # the 5 is a quantity, not money
    assert save_card(client, e).status_code == 201  # saves; no stock move for an unknown item


def test_purchase_on_credit_is_owed_to_the_supplier(client):
    payable = client.get("/api/accounts").json()["payable"]
    cash_out = client.get("/api/day-close").json()["cash_out"]
    e = card(client, "Gupta se 10 kilo cheeni udhaar pe kharidi 450")
    assert save_card(client, e).status_code == 201
    assert client.get("/api/accounts").json()["payable"] == payable + 450
    assert client.get("/api/day-close").json()["cash_out"] == cash_out  # nothing left the galla


def test_cash_purchase_is_not_owed(client):
    payable = client.get("/api/accounts").json()["payable"]
    e = card(client, "I bought 3 dozen eggs from the vendor 180 cash")
    assert save_card(client, e, party_name="Vendor").status_code == 201
    assert client.get("/api/accounts").json()["payable"] == payable


@pytest.mark.parametrize(
    "text, amount, paid_now, owed",
    [
        ("Gupta se 20 packet Maggi aaya 2400 ka udhaar pe", 2400, None, 2400),  # "udhaar" with a supplier
        ("Gupta Distributors ka maal aaya 5000 ka, kuch nahi diya", 5000, None, 5000),
        ("Raju dairy se 40 packet doodh aaya, 500 diye baaki baad mein", 1120, 500, 620),  # total from prices
    ],
)
def test_buying_from_a_supplier_on_credit(client, text, amount, paid_now, owed):
    e = card(client, text)
    assert e["type"] == "purchase" and e["amount"] == amount and e["paid_now"] == paid_now
    name = e["party"]["name"]
    before = balance(client, name)
    assert save_card(client, e).status_code == 201
    assert balance(client, name) == before + owed


def test_udhaar_saved_against_a_supplier_is_a_credit_purchase(client):
    supplier = next(p for p in client.get("/api/khata").json() if p["kind"] == "supplier")
    before = supplier["balance"]
    res = client.post("/api/entries", json={"type": "udhaar", "amount": 700, "party_id": supplier["id"], "raw_text": "x"})
    assert res.status_code == 201 and res.json()["type"] == "purchase" and res.json()["mode"] == "udhaar"
    assert balance(client, supplier["name"]) == before + 700


def test_paid_now_cannot_exceed_the_bill(client):
    res = client.post("/api/entries", json={"type": "purchase", "amount": 500, "paid_now": 900, "raw_text": "x"})
    assert res.status_code == 422


def test_unknown_item_added_from_the_card_gets_the_purchase_stock(client):
    e = card(client, "Gupta se 12 bottle Harpic liya 1080 udhaar")
    line = next(li for li in e["items"] if li["item_id"] is None)
    assert line["name"].lower().startswith("harpic") and line["qty"] == 12
    # The card's "Not in stock · Add it" creates the item, then the line points at it.
    item = client.post("/api/items", json={"name": "Harpic", "unit": "bottle", "price": 99, "cost_price": 90, "stock": 0}).json()
    line.update(item_id=item["id"], price=item["price"])
    assert save_card(client, e).status_code == 201
    stock = next(i for i in client.get("/api/items").json() if i["id"] == item["id"])["stock"]
    assert stock == 12


def test_a_sale_must_say_what_was_sold_and_how_much(client):
    base = {"type": "sale", "amount": 60, "mode": "cash", "raw_text": "60 ki bikri"}
    assert client.post("/api/entries", json=base).status_code == 422  # no item
    unknown = {"item_id": None, "name": "Kesar", "qty": 1, "unit": "pc"}
    assert client.post("/api/entries", json={**base, "items": [unknown]}).status_code == 422  # not in stock
    kurkure = item_named(client, "Kurkure")
    line = {"item_id": kurkure["id"], "name": "Kurkure", "qty": 3, "unit": "pc", "price": 20}
    assert client.post("/api/entries", json={**base, "items": [line]}).status_code == 201
    assert item_named(client, "Kurkure")["stock"] == kurkure["stock"] - 3


# --- Numbers must add up ---------------------------------------------------------------------


def test_amount_must_match_the_items(client):
    maggi = item_named(client, "Maggi")  # 15 each
    body = {"type": "sale", "amount": 100, "mode": "cash",
            "items": [{"item_id": maggi["id"], "name": "Maggi", "qty": 5, "unit": "pc", "price": 15}]}
    res = client.post("/api/entries", json=body)
    assert res.status_code == 422
    d = res.json()["detail"]
    assert d["code"] == "amount_mismatch" and d["items_total"] == 75 and d["amount"] == 100
    assert item_named(client, "Maggi")["stock"] == maggi["stock"]  # nothing saved
    assert client.post("/api/entries", json={**body, "amount": 75}).status_code == 201


def test_payment_cannot_be_more_than_owed(client):
    sharma = next(p for p in client.get("/api/khata").json() if p["name"] == "Sharma ji")
    res = client.post("/api/entries", json={"type": "payment", "amount": sharma["balance"] + 1, "party_id": sharma["id"], "mode": "cash"})
    assert res.status_code == 422 and res.json()["detail"]["code"] == "overpay"
    assert res.json()["detail"]["owed"] == sharma["balance"]
    ok = client.post("/api/entries", json={"type": "payment", "amount": sharma["balance"], "party_id": sharma["id"], "mode": "cash"})
    assert ok.status_code == 201


def test_payment_from_someone_who_owes_nothing_is_refused(client):
    res = client.post("/api/entries", json={"type": "payment", "amount": 200, "party_name": "Naya Aadmi", "mode": "cash"})
    assert res.status_code == 422 and res.json()["detail"]["code"] == "overpay"


def test_paying_a_supplier_more_than_the_bill_is_refused(client):
    gupta = next(p for p in client.get("/api/khata").json() if p["name"] == "Gupta Distributors")
    res = client.post("/api/entries", json={"type": "payment", "amount": gupta["balance"] + 500, "party_id": gupta["id"], "mode": "cash"})
    assert res.status_code == 422 and res.json()["detail"]["owed"] == gupta["balance"]


def test_purchase_cost_comes_from_the_spoken_bill(client):
    doodh = next(i for i in client.get("/api/items").json() if i["name"] == "Amul doodh" and i["variant"] == "aadha litre")
    assert save_card(client, card(client, "Raju dairy se 40 packet doodh aaya 1120")).status_code == 201
    after = next(i for i in client.get("/api/items").json() if i["id"] == doodh["id"])
    # Average cost moves toward 28 per packet (1120 / 40), not the item's older cost.
    s0, c0 = doodh["stock"], doodh["cost_price"]
    assert after["cost_price"] == round((s0 * c0 + 40 * 28) / (s0 + 40))
