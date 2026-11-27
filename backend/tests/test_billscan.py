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


# Real OCR output (Tesseract.js 7, the app's settings) from a generated, deliberately messy
# thermal-bill photo: tilted, creased, shadowed, faded column. Note the OCR slips: "7eg" for
# 70g, "Qor Dal" for Toor Dal (on the crease).
OCR_MESSY_BILL = """GUPTA DISTRIBUTORS
Wholesale FMCG & Grocery
Shop 14, Main Bazaar, Pune
GSTIN 27ABCDE1234F175
Inv No: 2381 Date: 27/11/26
Party: Shree Ganesh Kirana
Item Qty Rate Apt
Parle G 10/- 24 9 216
Maggi Noodles 7eg 48 13 624
Surf Exl 1kg 6 128 768
Tata Namak 1kg 10 25 250
Kurkure Masala 20 18 360
Qor Dal 15 148 2220
Red Label Tea 250g 4 132 528
Colgate 100g 12 52 624
Sub Total 5590
CGST 2.5% 140
SGST 2.5% 140
GRAND TOTAL 5870
Paid: Cash 1000 Balance: udhaar
Thank you! visit again
"""


def test_messy_real_ocr_bill_reads_every_item():
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app.db import Base
    from app.models import Item as ItemModel
    from app.seed import seed

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed(db)
        items = {i.id: i for i in db.scalars(select(ItemModel))}
        lines = parse_bill(OCR_MESSY_BILL, list(items.values()))
        got = {(items[l.item_id].name, l.qty) for l in lines if l.item_id}
    assert got == {
        ("Parle-G", 24), ("Maggi", 48), ("Surf Excel", 6), ("Namak", 10),
        ("Kurkure", 20), ("Toor dal", 15), ("Chai patti", 4), ("Colgate", 12),
    }
    # Headers, address, totals and footer don't show up as rows to review.
    assert len(lines) == 8


def test_pack_size_is_not_the_quantity():
    assert quantity("Surf Excel 1kg 6 128 768") == 6
    assert quantity("Tata Namak 1kg 10 25 250") == 10


def test_bill_rate_becomes_the_unit_cost():
    from app.billscan import unit_rate

    assert unit_rate("Surf Excel 1kg 6 128 768") == 128
    assert unit_rate("Parle G 10/- 24 9 216") == 9
    assert unit_rate("Maggi 2 dozen") is None
