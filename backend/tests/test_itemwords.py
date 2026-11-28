"""Item words in five languages, asking when a word fits several items, and learning the answer."""

import pytest

from app.itemwords import expanded_names, synonyms
from tests.test_entries import card, client, save_card  # noqa: F401  (client is a fixture)


@pytest.mark.parametrize(
    "spoken, item",
    [
        ("2 kilo khand becha 90 cash", "Cheeni"),  # Gujarati, Roman
        ("2 kilo ખાંડ becha 90 cash", "Cheeni"),  # Gujarati script
        ("2 kilo साखर becha 90 cash", "Cheeni"),  # Marathi
        ("2 kilo shakkar becha 90 cash", "Cheeni"),  # Hinglish
        ("2 kilo sugar sold 90 cash", "Cheeni"),  # English
        ("3 kilo ચોખા becha 150 upi", "Chawal"),
        ("1 kilo tandul becha 60 cash", "Chawal"),
    ],
)
def test_one_item_in_five_languages(client, spoken, item):
    e = card(client, spoken)
    assert e["items"] and e["items"][0]["name"].startswith(item)
    assert e["items"][0]["options"] == []  # sure: no question


@pytest.mark.parametrize("spoken", ["1 kilo daal becha", "2 packet dudh becha"])
def test_a_word_that_fits_several_items_asks_which_one(client, spoken):
    e = card(client, spoken)
    line = e["items"][0]
    assert len(line["options"]) >= 2 and line["heard"]
    assert e["confidence"]["items"] < 0.8  # amber on the card


def test_the_pick_is_remembered(client):
    e = card(client, "1 kilo daal becha")
    line = e["items"][0]
    moong = next(o for o in line["options"] if o["name"].startswith("Moong"))
    e["items"] = [{**line, "item_id": moong["item_id"], "name": moong["name"], "price": moong["price"], "options": []}]
    e["amount"] = moong["price"]  # the card's amount follows the picked item
    assert save_card(client, e, edited=True).status_code == 201
    again = card(client, "1 kilo daal becha 130 cash")["items"][0]
    assert again["name"] == "Moong dal" and again["options"] == []  # learned: no question


def test_word_list_basics():
    assert "साखर" in synonyms("cheeni") and "ખાંડ" in synonyms("sugar")
    assert "dal" in expanded_names(["Toor dal"])  # the general word comes through "dal"
