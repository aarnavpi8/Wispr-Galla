import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.setup import STARTER_ITEMS


@pytest.fixture()
def empty_client():
    """The app on a brand-new, empty database (like a fresh install with SEED_ON_START off)."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def db():
        with Session() as s:
            yield s

    app.dependency_overrides[get_db] = db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_fresh_install_has_no_shop(empty_client):
    assert empty_client.get("/api/setup").json() == {"has_shop": False}
    assert empty_client.get("/api/shop").status_code == 404


def test_setup_creates_my_shop_with_starter_items(empty_client):
    res = empty_client.post(
        "/api/setup",
        json={"name": "  Verma Medicals ", "kind": "medical", "vpa": "verma@upi", "language": "hi", "opening_cash": 1500},
    )
    assert res.status_code == 201
    assert res.json()["name"] == "Verma Medicals"
    assert res.json()["items"] == len(STARTER_ITEMS["medical"])

    shop = empty_client.get("/api/shop").json()
    assert shop["name"] == "Verma Medicals" and shop["kind"] == "medical" and shop["vpa"] == "verma@upi"
    assert shop["entries"] == 0 and shop["customers"] == 0
    assert empty_client.get("/api/setup").json() == {"has_shop": True}

    # Nothing is invented: no entries, no customers, starter items at ₹0 with no stock alerts.
    summary = empty_client.get("/api/summary?days=7").json()
    assert summary["expected_cash_today"] == 1500
    assert summary["udhaar_outstanding"] == 0
    items = empty_client.get("/api/items").json()
    assert {i["price"] for i in items} == {0}
    assert not any(i["low"] for i in items)
    assert empty_client.get("/api/accounts").json()["low_stock"] == 0


def test_setup_without_starter_items(empty_client):
    empty_client.post("/api/setup", json={"name": "My Shop", "kind": "kirana", "starter_items": False})
    assert empty_client.get("/api/items").json() == []


def test_other_kind_has_no_starter_items(empty_client):
    assert empty_client.post("/api/setup", json={"name": "Hardware Hub", "kind": "other"}).json()["items"] == 0


def test_setup_only_once(empty_client):
    assert empty_client.post("/api/setup", json={"name": "A"}).status_code == 201
    assert empty_client.post("/api/setup", json={"name": "B"}).status_code == 409
    assert empty_client.post("/api/setup/demo").status_code == 409


def test_setup_validation(empty_client):
    assert empty_client.post("/api/setup", json={"name": ""}).status_code == 422
    assert empty_client.post("/api/setup", json={"name": "X", "kind": "bakery"}).status_code == 422
    assert empty_client.post("/api/setup", json={"name": "X", "opening_cash": -1}).status_code == 422


def test_demo_shop_for_judges(empty_client):
    res = empty_client.post("/api/setup/demo")
    assert res.status_code == 201
    assert res.json()["name"] == "Shree Ganesh Kirana"
    assert empty_client.get("/api/shop").json()["entries"] > 0


def test_price_edit_and_alert_level(empty_client):
    empty_client.post("/api/setup", json={"name": "Sabzi Wala", "kind": "sabzi"})
    aloo = next(i for i in empty_client.get("/api/items").json() if i["name"] == "Aloo")
    res = empty_client.patch(f"/api/items/{aloo['id']}", json={"price": 30, "low_stock_at": 5})
    assert res.status_code == 200
    assert res.json()["price"] == 30 and res.json()["low"] is True  # 0 kg left, alert at 5
    assert empty_client.patch(f"/api/items/{aloo['id']}", json={"price": -5}).status_code == 422
    assert empty_client.patch("/api/items/99999", json={"price": 5}).status_code == 404
