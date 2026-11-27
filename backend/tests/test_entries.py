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
