"""Spoilage: the stock version of depreciation (app/spoilage.py)."""

from datetime import datetime, timedelta, timezone

import pytest

from app import models
from app.spoilage import expected_loss, guess_shelf_life, needs_check
from tests.test_entries import client  # noqa: F401  (fixture)


@pytest.mark.parametrize(
    "names, life",
    [
        (["Amul doodh"], "days"), (["दूध"], "days"), (["Anda"], "days"), (["Paneer"], "days"),
        (["Atta"], "months"), (["Maggi"], "months"),  # unknown -> months
        (["Chawal basmati"], "long"), (["ખાંડ"], "long"), (["Toor dal"], "long"),
        (["Lifebuoy", "soap"], "none"), (["Machis"], "none"),
    ],
)
def test_shelf_life_is_guessed_from_the_name(names, life):
    assert guess_shelf_life(names) == life


def _item(name, stock, cost, life=None):
    return models.Item(shop_id=1, name=name, variant=None, unit="pc", price=cost + 5, aliases=[], stock=stock,
                       low_stock_at=0, cost_price=cost, shelf_life=life)


def test_expected_spoilage_follows_how_perishable_it_is():
    assert expected_loss(_item("Amul doodh", 50, 20)) == 200  # ₹1,000 of milk -> 20% a month
    assert expected_loss(_item("Chawal", 100, 40)) == 40  # ₹4,000 of rice -> 1%
    assert expected_loss(_item("Lifebuoy soap", 10, 30)) == 0
    assert expected_loss(_item("Amul doodh", 50, 20, life="none")) == 0  # the shopkeeper's choice wins


def test_old_stock_is_flagged_for_a_check():
    now = datetime(2026, 11, 28, tzinfo=timezone.utc)
    milk = _item("Amul doodh", 5, 20)
    assert needs_check(milk, now - timedelta(days=6), now) == 6
    assert needs_check(milk, now - timedelta(days=2), now) is None
    assert needs_check(_item("Lifebuoy soap", 5, 30), now - timedelta(days=900), now) is None
    assert needs_check(_item("Amul doodh", 0, 20), now - timedelta(days=30), now) is None  # nothing left


def test_account_shows_spoilage_and_items_can_set_it(client):
    acc = client.get("/api/inventory/account").json()
    assert acc["expected_spoilage"] >= 0 and acc["value_after_spoilage"] == acc["closing"] - acc["expected_spoilage"]
    doodh = next(i for i in client.get("/api/items").json() if i["name"] == "Amul doodh")
    assert doodh["shelf_life"] == "days" and doodh["shelf_life_guessed"] is True
    after = client.patch(f"/api/items/{doodh['id']}", json={"shelf_life": "months"}).json()
    assert after["shelf_life"] == "months" and after["shelf_life_guessed"] is False
