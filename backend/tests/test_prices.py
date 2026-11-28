"""Every transaction carries the prices the books need; an item learns them the first time."""

import pytest
from fastapi.testclient import TestClient

from tests.test_entries import client  # noqa: F401  (fixture)

H = {"X-Galla-Device": "pricecheck00000000001"}


@pytest.fixture()
def fresh(client: TestClient):
    """A just-set-up kirana: starter items at ₹0 selling price and ₹0 cost, no stock."""
    body = {"name": "Naya Kirana", "kind": "kirana", "vpa": "", "language": "hi", "opening_cash": 0}
    assert client.post("/api/setup", json=body, headers=H).status_code == 201
    items = client.get("/api/items", headers=H).json()
    return client, items[0]


def item(client, item_id):
    return next(i for i in client.get("/api/items", headers=H).json() if i["id"] == item_id)


def entry(client, kind, it, qty, amount, **line):
    body = {"type": kind, "amount": amount, "mode": "cash", "raw_text": "test", "party_name": "Gupta" if kind == "purchase" else None,
            "party_kind": "supplier", "items": [{"item_id": it["id"], "name": it["name"], "qty": qty, "unit": it["unit"], **line}]}
    return client.post("/api/entries", json=body, headers=H)


def test_buying_needs_cost_and_a_selling_price_then_remembers_them(fresh):
    client, it = fresh
    res = entry(client, "purchase", it, 10, 400)
    assert res.status_code == 422
    d = res.json()["detail"]
    # The cost comes from the bill (400 / 10 = 40); the selling price can't be guessed.
    assert d["code"] == "missing_prices" and it["name"] not in d["cost"] and it["name"] in d["price"]
    assert entry(client, "purchase", it, 10, 400, sell_price=48).status_code == 201
    after = item(client, it["id"])
    assert (after["cost_price"], after["price"], after["stock"]) == (40, 48, 10)
    # Next time both are known: nothing more to type.
    assert entry(client, "purchase", it, 5, 200).status_code == 201
    assert item(client, it["id"])["stock"] == 15


def test_selling_needs_a_price_and_the_item_keeps_it(fresh):
    client, it = fresh
    assert client.post(f"/api/items/{it['id']}/stock", json={"reason": "purchase", "qty": 5, "unit_cost": 30}, headers=H).status_code == 200
    res = entry(client, "sale", it, 2, 70)
    assert res.status_code == 422 and it["name"] in res.json()["detail"]["price"]
    assert entry(client, "sale", it, 2, 70, price=35).status_code == 201
    assert item(client, it["id"])["price"] == 35


def test_stock_in_and_bill_scan_need_a_cost(fresh):
    client, it = fresh
    res = client.post(f"/api/items/{it['id']}/stock", json={"reason": "purchase", "qty": 5}, headers=H)
    assert res.status_code == 422 and res.json()["detail"]["code"] == "missing_prices"
    res = client.post("/api/items/stock-batch", json={"lines": [{"item_id": it["id"], "qty": 5}]}, headers=H)
    assert res.status_code == 422
    assert client.post("/api/items/stock-batch", json={"lines": [{"item_id": it["id"], "qty": 5, "unit_cost": 30}]}, headers=H).status_code == 200


def test_quick_sell_needs_a_price(fresh):
    client, it = fresh
    client.post(f"/api/items/{it['id']}/stock", json={"reason": "purchase", "qty": 5, "unit_cost": 30}, headers=H)
    res = client.post(f"/api/items/{it['id']}/sell", json={"qty": 1}, headers=H)
    assert res.status_code == 422 and item(client, it["id"])["stock"] == 5


def test_prices_cannot_be_cleared_to_zero(fresh):
    client, it = fresh
    assert client.patch(f"/api/items/{it['id']}", json={"price": 0}, headers=H).status_code == 422
