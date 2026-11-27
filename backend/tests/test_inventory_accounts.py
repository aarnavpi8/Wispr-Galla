import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

from app.main import app
from app.migrate import add_missing_columns


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def item_named(client, name, variant=None):
    return next(i for i in client.get("/api/items").json() if i["name"] == name and i["variant"] == variant)


# --- Inventory -----------------------------------------------------------------------------


def test_seed_has_stock_and_low_stock_alerts(client):
    items = client.get("/api/items").json()
    assert len(items) == 25
    assert all(i["stock"] >= 0 for i in items)
    bread = item_named(client, "Bread")
    assert bread["stock"] == 2 and bread["low"] is True
    parle = item_named(client, "Parle-G", "chhota")
    assert parle["low"] is False
    assert parle["value"] == parle["stock"] * parle["price"]


def test_purchase_sale_wastage_and_recount(client):
    dal = item_named(client, "Toor dal")
    start = dal["stock"]
    url = f"/api/items/{dal['id']}/stock"

    assert client.post(url, json={"reason": "purchase", "qty": 10}).json()["stock"] == start + 10
    assert client.post(url, json={"reason": "sale", "qty": 4}).json()["stock"] == start + 6
    assert client.post(url, json={"reason": "wastage", "qty": 1}).json()["stock"] == start + 5
    recount = client.post(url, json={"reason": "count", "qty": 7}).json()
    assert recount["stock"] == 7

    moves = client.get(f"/api/items/{dal['id']}/moves").json()
    assert [m["reason"] for m in moves[:4]] == ["count", "wastage", "sale", "purchase"]
    assert moves[0]["delta"] == 7 - (start + 5)
    assert moves[0]["stock_after"] == 7


def test_cannot_sell_more_than_stock(client):
    bread = item_named(client, "Bread")
    res = client.post(f"/api/items/{bread['id']}/stock", json={"reason": "sale", "qty": bread["stock"] + 1})
    assert res.status_code == 422
    assert item_named(client, "Bread")["stock"] == bread["stock"]


def test_zero_quantity_is_rejected(client):
    bread = item_named(client, "Bread")
    assert client.post(f"/api/items/{bread['id']}/stock", json={"reason": "purchase", "qty": 0}).status_code == 422


def test_unknown_item_is_404(client):
    assert client.post("/api/items/99999/stock", json={"reason": "purchase", "qty": 1}).status_code == 404


def test_add_item_with_opening_stock(client):
    res = client.post("/api/items", json={"name": "Dettol", "variant": "125 ml", "unit": "pc", "price": 62,
                                          "stock": 12, "low_stock_at": 3})
    assert res.status_code == 201
    item = res.json()
    assert item["stock"] == 12 and item["low"] is False
    moves = client.get(f"/api/items/{item['id']}/moves").json()
    assert moves[0]["reason"] == "opening" and moves[0]["delta"] == 12


def test_duplicate_item_is_rejected(client):
    res = client.post("/api/items", json={"name": "maggi", "unit": "pc", "price": 15})
    assert res.status_code == 409


def test_new_item_validation(client):
    assert client.post("/api/items", json={"name": "", "price": 10}).status_code == 422
    assert client.post("/api/items", json={"name": "X", "price": -1}).status_code == 422


# --- Accounts and day close ------------------------------------------------------------------


def test_accounts_overview(client):
    a = client.get("/api/accounts?days=7").json()
    assert a["sales"] == 640 + 1200 + 930 + 1100 + 760
    assert a["purchases"] == 1400 + 3200
    assert a["expenses"] == 850
    assert a["net"] == a["sales"] - a["purchases"] - a["expenses"]
    assert a["receivable"] == 150 + 820 + 240
    assert a["payable"] == 2200
    assert a["stock_items"] >= 25
    assert a["low_stock"] >= 1
    assert a["stock_value"] == sum(i["value"] for i in client.get("/api/items").json())


def test_day_close_records_gap(client):
    view = client.get("/api/day-close").json()
    assert view["expected"] == view["opening"] + view["cash_in"] - view["cash_out"]
    assert view["closed"] is None

    res = client.post("/api/day-close", json={"counted": view["expected"] - 120})
    assert res.status_code == 201
    assert res.json()["difference"] == -120
    assert client.get("/api/day-close").json()["closed"]["counted"] == view["expected"] - 120

    # Counting again the same day: the newest count is the one shown.
    client.post("/api/day-close", json={"counted": view["expected"]})
    assert client.get("/api/day-close").json()["closed"]["difference"] == 0


def test_day_close_rejects_negative_count(client):
    assert client.post("/api/day-close", json={"counted": -5}).status_code == 422


# --- Migration -------------------------------------------------------------------------------


def test_migration_adds_stock_columns_to_old_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/old.db")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE items (id INTEGER PRIMARY KEY, name VARCHAR(120))"))
        conn.execute(text("INSERT INTO items (id, name) VALUES (1, 'Parle-G')"))

    assert add_missing_columns(engine) == ["items.stock", "items.low_stock_at", "items.cost_price"]
    assert {"stock", "low_stock_at"} <= {c["name"] for c in inspect(engine).get_columns("items")}
    with engine.connect() as conn:
        assert conn.execute(text("SELECT stock, low_stock_at FROM items")).one() == (0, 5)

    assert add_missing_columns(engine) == []  # running again is a no-op
