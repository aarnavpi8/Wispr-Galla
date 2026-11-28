import math

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.stockplan import Z_95


@pytest.fixture()
def client():
    """Empty shop (no demo history), so every number in a test comes from that test."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def db():
        with Session() as s:
            yield s

    app.dependency_overrides[get_db] = db
    with TestClient(app) as c:
        assert c.post("/api/setup", json={"name": "Test Store", "kind": "other"}).status_code == 201
        yield c
    app.dependency_overrides.clear()


def add(client, name="Maggi", price=15, stock=0, cost=10, low=5):
    res = client.post("/api/items", json={"name": name, "unit": "pc", "price": price, "stock": stock,
                                          "cost_price": cost, "low_stock_at": low})
    assert res.status_code == 201
    return res.json()


def stock_in(client, item, qty, unit_cost=None):
    body = {"reason": "purchase", "qty": qty}
    if unit_cost is not None:
        body["unit_cost"] = unit_cost
    return client.post(f"/api/items/{item['id']}/stock", json=body).json()


def test_weighted_average_cost(client):
    item = add(client, stock=10, cost=10)
    after = stock_in(client, item, 30, unit_cost=12)
    assert after["cost_price"] == round((10 * 10 + 30 * 12) / 40)  # 11.5 -> 12 (banker's) or 12
    assert after["margin"] == 15 - after["cost_price"]


def test_first_purchase_sets_cost_and_stock_in_without_cost_keeps_it(client):
    item = add(client, cost=11)
    assert stock_in(client, item, 10, unit_cost=11)["cost_price"] == 11
    assert stock_in(client, item, 5)["cost_price"] == 11  # no cost given: the known cost is used


def test_cost_can_be_set_by_hand(client):
    item = add(client, stock=4)
    assert client.patch(f"/api/items/{item['id']}", json={"cost_price": 9}).json()["cost_price"] == 9


def test_account_balances_and_gross_profit(client):
    item = add(client, price=15, stock=0)
    stock_in(client, item, 20, unit_cost=10)  # 200 in
    assert client.post(f"/api/items/{item['id']}/sell", json={"qty": 5}).status_code == 201  # cost 50, sales 75
    client.post(f"/api/items/{item['id']}/stock", json={"reason": "wastage", "qty": 1})  # 10 lost
    acc = client.get("/api/inventory/account?days=30").json()
    assert acc["opening"] == 0
    assert acc["purchases"] == 200 and acc["cogs"] == 50 and acc["wastage"] == 10
    assert acc["closing"] == 14 * 10
    assert acc["opening"] + acc["purchases"] - acc["cogs"] - acc["wastage"] + acc["adjustments"] == acc["closing"]
    assert acc["sales"] == 75 and acc["gross_profit"] == 25 and acc["margin_pct"] == pytest.approx(33.3)


def test_undone_sale_comes_off_cost_of_goods(client):
    item = add(client, stock=0)
    stock_in(client, item, 10, unit_cost=10)
    sale = client.post(f"/api/items/{item['id']}/sell", json={"qty": 2}).json()["entry"]
    client.post(f"/api/entries/{sale['id']}/undo")
    acc = client.get("/api/inventory/account").json()
    assert acc["cogs"] == 0 and acc["sales"] == 0 and acc["closing"] == 100


def test_items_without_cost_are_counted(client):
    # A new shop's starter items begin at ₹0 until the shopkeeper prices them.
    H = {"X-Galla-Device": "nocostcheck0000000001"}
    body = {"name": "Naya", "kind": "kirana", "vpa": "", "language": "hi", "opening_cash": 0}
    assert client.post("/api/setup", json=body, headers=H).status_code == 201
    # Unpriced starters have no stock, and stock can't come in without a cost, so nothing on the
    # shelf is ever valued at ₹0 (only old data could be; the card then asks for the cost).
    assert client.get("/api/inventory/account", headers=H).json()["no_cost_items"] == 0


def test_reorder_point_eoq_and_days_left(client):
    item = add(client, price=15, stock=0)
    stock_in(client, item, 30, unit_cost=10)
    client.post(f"/api/items/{item['id']}/sell", json={"qty": 6})
    plan = next(p for p in client.get("/api/inventory/insights?lead_days=3").json()["items"] if p["item_id"] == item["id"])
    # All history is from today, so the period is 1 day: 6 a day, no spread.
    assert plan["sold"] == 6 and plan["per_day"] == 6
    assert plan["reorder_point"] == 18
    assert plan["days_left"] == 4.0
    assert plan["eoq"] == math.ceil(math.sqrt(2 * 6 * 365 * 50 / (0.2 * 10)))
    assert plan["status"] == "ok" and plan["order_qty"] == 0
    assert Z_95 == 1.65


def test_below_reorder_point_says_order_now(client):
    item = add(client, price=15, stock=0)
    stock_in(client, item, 20, unit_cost=10)
    client.post(f"/api/items/{item['id']}/sell", json={"qty": 8})
    body = client.get("/api/inventory/insights").json()
    plan = body["items"][0]
    assert plan["item_id"] == item["id"] and plan["status"] == "order_now"
    assert plan["order_qty"] >= plan["reorder_point"] - plan["stock"]
    assert body["order_now"] == 1


def test_abc_and_dead_stock(client):
    big = add(client, "Atta", price=400, stock=0)
    small = add(client, "Toffee", price=1, stock=0)
    idle = add(client, "Umbrella", price=200, stock=3, cost=150)
    stock_in(client, big, 10, 300)
    stock_in(client, small, 100, 1)
    client.post(f"/api/items/{big['id']}/sell", json={"qty": 2})
    client.post(f"/api/items/{small['id']}/sell", json={"qty": 5})
    body = client.get("/api/inventory/insights").json()
    by_id = {p["item_id"]: p for p in body["items"]}
    assert by_id[big["id"]]["abc"] == "A"
    assert by_id[small["id"]]["abc"] in ("B", "C")
    assert by_id[idle["id"]]["status"] == "dead"
    assert body["dead_value"] == 450


def test_apply_alerts_sets_low_stock_to_reorder_point(client):
    item = add(client, price=15, stock=0, low=2)
    stock_in(client, item, 30, unit_cost=10)
    client.post(f"/api/items/{item['id']}/sell", json={"qty": 6})
    assert client.post("/api/inventory/apply-alerts", json={}).json()["updated"] == 1
    got = next(i for i in client.get("/api/items").json() if i["id"] == item["id"])
    assert got["low_stock_at"] == 18


def test_bill_scan_batch_records_the_rate_as_cost(client):
    item = add(client, stock=0)
    res = client.post("/api/items/stock-batch", json={"reason": "purchase", "lines": [{"item_id": item["id"], "qty": 12, "unit_cost": 13}]})
    assert res.status_code == 200, res.text
    got = next(i for i in client.get("/api/items").json() if i["id"] == item["id"])
    assert got["cost_price"] == 13 and got["stock"] == 12
