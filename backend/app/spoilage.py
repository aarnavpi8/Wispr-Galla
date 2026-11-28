"""Spoilage: the stock version of depreciation.

Depreciation is for things the shop owns and uses (fridge, scale). Stock loses value differently:
it spoils or expires. Accounting writes stock down to what it can still be sold for; for a small
shop that means two things here:

1. An *expected spoilage* estimate on the inventory account: stock value at cost x a monthly
   loss rate for how perishable the item is. It keeps the profit picture honest; it is shown,
   not booked.
2. A *check prompt* when an item has sat longer than it stays good ("Doodh: bought 6 days ago").
   The shopkeeper looks, and records what really spoiled as wastage, which is booked at cost
   (stockbook.record_move). That turns the estimate into a real, recorded loss.

How perishable an item is ("shelf life") is asked once when the item is added, and otherwise
guessed from its name with the five-language word list (itemwords.py): milk -> days,
atta -> months, rice -> long, soap -> doesn't spoil. Rates are deliberately simple defaults.
"""

from datetime import datetime, timedelta, timezone
from typing import Literal

from app import models
from app.itemwords import GROUPS, _norm, expanded_names

ShelfLife = Literal["days", "months", "long", "none"]

# Share of the stock's cost expected to be lost to spoilage in a month, and the age after which
# the shopkeeper is asked to check it.
MONTHLY_LOSS: dict[str, float] = {"days": 0.20, "months": 0.05, "long": 0.01, "none": 0.0}
CHECK_AFTER_DAYS: dict[str, int | None] = {"days": 4, "months": 60, "long": 180, "none": None}

# Everyday items (first word of each itemwords group) -> how long they stay good.
_BY_GROUP: dict[str, ShelfLife] = {
    "milk": "days", "curd": "days", "cottage cheese": "days", "bread": "days", "eggs": "days",
    "tomato": "days", "green chilli": "days", "coriander": "days",
    "onion": "months", "potato": "months", "ginger": "months", "garlic": "months", "butter": "months",
    "biscuit": "months", "flattened rice": "months", "wheat flour": "months", "refined flour": "months",
    "semolina": "months", "gram flour": "months", "peanuts": "months",
    "tea": "long", "sugar": "long", "rice": "long", "salt": "long", "jaggery": "long", "oil": "long",
    "mustard oil": "long", "ghee": "long", "lentils": "long", "pigeon pea": "long", "green gram": "long",
    "chickpeas": "long", "turmeric": "long", "chilli powder": "long", "cumin": "long", "water bottle": "long",
    "soap": "none", "detergent": "none", "matchbox": "none",
}
_WORD_TO_LIFE: dict[str, ShelfLife] = {}
for _g in GROUPS:
    life = _BY_GROUP.get(_norm(_g[0]))
    if life:
        for _w in _g:
            _WORD_TO_LIFE.setdefault(_norm(_w), life)

# When names point different ways (paneer + "dal"), the most perishable wins: it's the safer guess.
_ORDER = ["days", "months", "long", "none"]


def guess_shelf_life(names: list[str]) -> ShelfLife:
    """Best guess from an item's name and aliases; 'months' when we can't tell."""
    found: set[str] = set()
    for n in [*names, *expanded_names(names)]:
        n = _norm(n)
        if n in _WORD_TO_LIFE:
            found.add(_WORD_TO_LIFE[n])
        for word in n.split():
            if word in _WORD_TO_LIFE:
                found.add(_WORD_TO_LIFE[word])
    for life in _ORDER:
        if life in found:
            return life  # type: ignore[return-value]
    return "months"


def shelf_life_of(item: models.Item) -> ShelfLife:
    if item.shelf_life in MONTHLY_LOSS:
        return item.shelf_life  # type: ignore[return-value]
    return guess_shelf_life([item.name, f"{item.name} {item.variant or ''}", *(item.aliases or [])])


def expected_loss(item: models.Item) -> int:
    """Rupees of this item's stock (at cost) expected to spoil in a month."""
    return round(max(item.stock, 0) * item.cost_price * MONTHLY_LOSS[shelf_life_of(item)])


def needs_check(item: models.Item, last_in: datetime | None, now: datetime | None = None) -> int | None:
    """Days since this stock came in, if that's longer than it stays good (else None)."""
    limit = CHECK_AFTER_DAYS[shelf_life_of(item)]
    if limit is None or item.stock <= 0 or last_in is None:
        return None
    now = now or datetime.now(timezone.utc)
    if last_in.tzinfo is None:
        last_in = last_in.replace(tzinfo=timezone.utc)
    age = (now - last_in) // timedelta(days=1)
    return age if age >= limit else None
