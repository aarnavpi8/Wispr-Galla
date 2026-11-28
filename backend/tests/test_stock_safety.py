"""Items come from the shopkeeper's own stock; the app says how much is left and stops overselling."""

import pytest

from tests.test_entries import card, client, item_named, save_card  # noqa: F401  (client is a fixture)


@pytest.mark.parametrize(
    "question",
    ["Cheeni kitni bachi hai", "how much sugar do I have", "साखर किती आहे", "ખાંડ કેટલી છે", "चीनी कितनी है"],
)
def test_asking_how_much_is_left(client, question):
    e = card(client, question)
    assert e["type"] == "command" and e["command"] == "item_stock"
    line = e["items"][0]
    assert line["name"] == "Cheeni" and line["in_stock"] == item_named(client, "Cheeni")["stock"]


def test_a_sale_line_says_how_much_is_on_the_shelf(client):
    e = card(client, "2 kilo cheeni becha 90 cash")
    assert e["items"][0]["in_stock"] == item_named(client, "Cheeni")["stock"]


def test_an_unknown_name_offers_close_stock_items(client):
    e = card(client, "2 packet magi becha 28 cash")  # "magi" -> Maggi
    names = [li["name"] for li in e["items"]] + [o["name"] for li in e["items"] for o in li["options"]]
    assert "Maggi" in names


def test_selling_more_than_the_shelf_is_refused(client):
    kurkure = item_named(client, "Kurkure")
    e = card(client, "kurkure becha cash")
    e["items"] = [{"item_id": kurkure["id"], "name": "Kurkure", "qty": kurkure["stock"] + 5, "unit": "pc", "price": 20}]
    e["amount"] = 20 * (kurkure["stock"] + 5)
    res = save_card(client, e, edited=True)
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail["code"] == "short_stock" and detail["items"][0]["have"] == kurkure["stock"]
    assert item_named(client, "Kurkure")["stock"] == kurkure["stock"]  # nothing saved
    # No "save anyway": the old flag changes nothing. Fix the quantity or record stock in first.
    assert save_card(client, e, edited=True, allow_short_stock=True).status_code == 422
