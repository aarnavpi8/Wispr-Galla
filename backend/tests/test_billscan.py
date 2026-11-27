import pytest
from fastapi.testclient import TestClient

from app.billscan import normalise, parse_bill, quantity
from app.main import app
from app.models import Item


def item(id, name, variant=None, aliases=()):
    return Item(id=id, shop_id=1, name=name, variant=variant, unit="pc", price=10, aliases=list(aliases))


ITEMS = [
    item(1, "Parle-G", "chhota", ["parle g", "parley"]),
    item(2, "Maggi", None, ["maggie", "noodles"]),
    item(3, "Cheeni", None, ["sugar", "chini"]),
    item(4, "Surf Excel", "1 kg", ["surf"]),
]


@pytest.mark.parametrize(
    "line, qty",
    [
        ("Maggi 2 dozen", 24),
        ("Sugar 10 kg 450", 10),
        ("Parle G 24 x 10", 24),
        ("Surf Excel   6   140   840", 6),  # qty x rate = amount
        ("Maggi noodles 48", 48),
        ("Maggi", 1),
        ("Maggi 12,000", 1),  # a big number alone is a price, not a quantity
    ],
)
def test_quantity(line, qty):
    assert quantity(line) == qty


def test_normalise_drops_numbers_and_punctuation():
    assert normalise("Parle-G (Chhota) 24") == "parle g chhota"


def test_parse_bill_matches_misspellings_and_skips_totals():
    text = """GUPTA DISTRIBUTORS
    Invoice No 123   Date 27/11/2026
    Parley G 24 x 10 240
    Maggie noodles 4 dozen
    Shugar 10 kg 450
    Total 1890
    GST 5%
    """
    lines = parse_bill(text, ITEMS)
    by_item = {line.item_id: line for line in lines if line.item_id}
    assert by_item[1].qty == 24
    assert by_item[2].qty == 48
    assert by_item[3].qty == 10
    assert not any("Total" in line.raw or "GST" in line.raw for line in lines)


def test_exact_names_are_confident():
    [line] = parse_bill("Surf Excel 6 140 840", ITEMS)
    assert line.item_id == 4 and line.confidence >= 0.8


def test_gibberish_returns_nothing():
    assert parse_bill("%%%%\n1234 5678\nqwzx vbnm", ITEMS) == []


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_scan_endpoint_then_batch_stock_in(client):
    items = {i["name"]: i for i in client.get("/api/items").json() if i["variant"] in (None, "chhota")}
    lines = client.post("/api/items/scan", json={"text": "Maggi 2 dozen\nKurkure 10 x 20 200\nTotal 440"}).json()
    found = {line["item_id"]: line["qty"] for line in lines if line["item_id"]}
    assert found == {items["Maggi"]["id"]: 24, items["Kurkure"]["id"]: 10}

    res = client.post(
        "/api/items/stock-batch",
        json={"lines": [{"item_id": k, "qty": v} for k, v in found.items()]},
    )
    assert res.status_code == 200
    after = {i["id"]: i["stock"] for i in res.json()}
    assert after[items["Maggi"]["id"]] == items["Maggi"]["stock"] + 24
    assert after[items["Kurkure"]["id"]] == items["Kurkure"]["stock"] + 10
    moves = client.get(f"/api/items/{items['Maggi']['id']}/moves").json()
    assert moves[0]["reason"] == "purchase" and moves[0]["delta"] == 24


def test_batch_is_all_or_nothing(client):
    maggi = next(i for i in client.get("/api/items").json() if i["name"] == "Maggi")
    res = client.post("/api/items/stock-batch", json={"lines": [{"item_id": maggi["id"], "qty": 5}, {"item_id": 99999, "qty": 1}]})
    assert res.status_code == 404
    again = next(i for i in client.get("/api/items").json() if i["name"] == "Maggi")
    assert again["stock"] == maggi["stock"]


def test_batch_rejects_zero_qty(client):
    maggi = next(i for i in client.get("/api/items").json() if i["name"] == "Maggi")
    assert client.post("/api/items/stock-batch", json={"lines": [{"item_id": maggi["id"], "qty": 0}]}).status_code == 422
