"""Demo shop: 25 items with aliases, 8 customers, 2 suppliers, 3 days of history.

Runs automatically on first start (SEED_ON_START). Manual reset:
    python -m app.seed --reset
"""

import argparse
from datetime import datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import Entry, Item, Party, Shop, StockMove
from app.stockbook import record_move

SHOP = {"name": "Shree Ganesh Kirana", "vpa": "shreeganesh.kirana@upi", "language": "hi", "opening_cash": 2000}

# (name, variant, unit, price, aliases)
ITEMS = [
    ("Parle-G", "chhota", "pc", 10, ["parle g", "parley", "parlay", "पारले जी", "parle chhota"]),
    ("Parle-G", "bada", "pc", 25, ["parle g bada", "parlay bada", "पारले बड़ा"]),
    ("Amul doodh", "aadha litre", "packet", 28, ["amul milk", "doodh", "दूध", "amul aadha"]),
    ("Amul doodh", "1 litre", "packet", 56, ["amul milk litre", "doodh litre", "दूध एक लीटर"]),
    ("Cheeni", None, "kg", 45, ["chini", "sugar", "shakkar", "चीनी", "साखर"]),
    ("Atta", "Aashirvaad 5 kg", "packet", 260, ["aata", "ashirwad", "aashirvad atta", "आटा", "पीठ"]),
    ("Chawal", "basmati", "kg", 90, ["rice", "basmati", "चावल", "तांदूळ"]),
    ("Toor dal", None, "kg", 160, ["arhar dal", "tuvar dal", "dal", "तूर दाल", "तूरडाळ"]),
    ("Moong dal", None, "kg", 130, ["mung dal", "मूंग दाल"]),
    ("Sarson tel", "Fortune 1 litre", "packet", 180, ["mustard oil", "sarso tel", "fortune", "सरसों तेल"]),
    ("Namak", "Tata 1 kg", "packet", 28, ["salt", "tata namak", "नमक", "मीठ"]),
    ("Chai patti", "Red Label 250 g", "packet", 140, ["tea", "red label", "chai", "चाय पत्ती", "चहा"]),
    ("Maggi", None, "pc", 15, ["maggie", "noodles", "मैगी"]),
    ("Surf Excel", "1 kg", "packet", 140, ["surf", "detergent", "सर्फ"]),
    ("Lifebuoy", None, "pc", 38, ["lifeboy", "sabun", "soap", "साबुन"]),
    ("Colgate", "100 g", "pc", 58, ["colget", "toothpaste", "कोलगेट"]),
    ("Anda", None, "pc", 7, ["egg", "ande", "अंडा", "अंडे"]),
    ("Ande ki tray", "30", "tray", 195, ["egg tray", "anda tray", "darjan ande"]),
    ("Bread", None, "pc", 45, ["bred", "double roti", "ब्रेड", "पाव"]),
    ("Haldi", "100 g", "packet", 30, ["turmeric", "हल्दी", "हळद"]),
    ("Mirchi powder", "100 g", "packet", 40, ["lal mirch", "chilli powder", "मिर्च", "तिखट"]),
    ("Poha", None, "kg", 60, ["pohe", "chivda", "पोहा", "पोहे"]),
    ("Besan", None, "kg", 100, ["gram flour", "बेसन"]),
    ("Thums Up", "750 ml", "pc", 40, ["thumbs up", "cold drink", "थम्स अप"]),
    ("Kurkure", None, "pc", 20, ["kurkurey", "कुरकुरे"]),
]

# Opening stock and low-stock alert level per (name, variant). A few are low on purpose
# so the demo shows the alerts. Anything not listed starts at 20, alert at 5.
STOCK = {
    ("Parle-G", "chhota"): (120, 30),
    ("Parle-G", "bada"): (35, 10),
    ("Amul doodh", "aadha litre"): (6, 15),
    ("Amul doodh", "1 litre"): (14, 8),
    ("Cheeni", None): (48, 10),
    ("Atta", "Aashirvaad 5 kg"): (9, 4),
    ("Chawal", "basmati"): (30, 8),
    ("Toor dal", None): (3, 5),
    ("Maggi", None): (60, 24),
    ("Anda", None): (90, 30),
    ("Bread", None): (2, 6),
    ("Thums Up", "750 ml"): (18, 6),
    ("Kurkure", None): (40, 12),
}
DEFAULT_STOCK = (20, 5)

# (name, kind, phone, aliases). Phone numbers are placeholders for the demo.
PARTIES = [
    ("Sharma ji", "customer", "9876500001", ["sharma", "sarma", "sharmaji", "शर्मा जी"]),
    ("Ramesh", "customer", "9876500002", ["ramesh bhai", "rames", "रमेश"]),
    ("Mehta ji", "customer", "9876500003", ["mehta", "meheta", "मेहता जी"]),
    ("Sunita didi", "customer", "9876500004", ["sunita", "सुनीता दीदी"]),
    ("Pappu", "customer", "9876500005", ["pappu bhai", "papu", "पप्पू"]),
    ("Iqbal bhai", "customer", "9876500006", ["iqbal", "ikbal", "इकबाल भाई"]),
    ("Patil kaka", "customer", "9876500007", ["patil", "पाटील काका"]),
    ("Kavita tai", "customer", "9876500008", ["kavita", "kavitha", "कविता ताई"]),
    ("Gupta Distributors", "supplier", "9876500101", ["gupta", "gupta distributor", "गुप्ता"]),
    ("Raju Dairy", "supplier", "9876500102", ["raju", "doodh wala", "dairy", "राजू डेयरी"]),
]

# (days_ago, hour, type, party, amount, paid_now, mode, due_in_days, raw_text)
HISTORY = [
    (3, 9, "purchase", "Raju Dairy", 1400, 1400, "cash", None, "Raju dairy se 50 packet doodh, 1400 cash"),
    (3, 11, "sale", None, 640, None, "cash", None, "640 ki bikri cash"),
    (3, 13, "udhaar", "Ramesh", 350, None, "udhaar", -1, "Ramesh ko 350 udhaar, kal tak"),
    (3, 17, "sale", None, 1200, None, "upi", None, "1200 UPI se aaye"),
    (3, 19, "expense", None, 850, None, "cash", None, "Bijli bill 850 bhara"),
    (2, 10, "udhaar", "Sharma ji", 820, None, "udhaar", 5, "Sharma ji ko 820 ka saman udhaar"),
    (2, 12, "sale", None, 930, None, "cash", None, "930 ki bikri cash"),
    (2, 15, "purchase", "Gupta Distributors", 3200, 1000, "cash", 5, "Gupta distributor ka maal 3200, 1000 diye"),
    (2, 18, "payment", "Mehta ji", 500, None, "upi", None, "Mehta ji ne 500 UPI se diye"),
    (1, 9, "sale", None, 1100, None, "upi", None, "1100 UPI se"),
    (1, 11, "udhaar", "Pappu", 240, None, "udhaar", 2, "Pappu ko 240 udhaar"),
    (1, 14, "sale", None, 760, None, "cash", None, "760 cash bikri"),
    (1, 16, "owner_withdrawal", None, 500, None, "cash", None, "Ghar ke liye 500 nikale"),
    (1, 18, "payment", "Ramesh", 200, None, "cash", None, "Ramesh ne 200 cash diye"),
]


def seed(db: Session) -> Shop:
    shop = Shop(**SHOP)
    db.add(shop)
    db.flush()

    for name, variant, unit, price, aliases in ITEMS:
        db.add(Item(shop_id=shop.id, name=name, variant=variant, unit=unit, price=price, aliases=aliases))
    db.flush()
    seed_stock_if_missing(db, shop)

    parties: dict[str, Party] = {}
    for name, kind, phone, aliases in PARTIES:
        party = Party(shop_id=shop.id, name=name, kind=kind, phone=phone, aliases=aliases)
        db.add(party)
        parties[name] = party
    db.flush()

    today = datetime.now(settings.tz).date()
    for days_ago, hour, type_, party_name, amount, paid_now, mode, due_in, raw in HISTORY:
        day = today - timedelta(days=days_ago)
        db.add(
            Entry(
                shop_id=shop.id,
                type=type_,
                party_id=parties[party_name].id if party_name else None,
                amount=amount,
                paid_now=paid_now,
                mode=mode,
                due_date=day + timedelta(days=due_in) if due_in is not None else None,
                raw_text=raw,
                source="seed",
                created_at=datetime.combine(day, time(hour), tzinfo=settings.tz),
            )
        )

    db.commit()
    return shop


def seed_stock_if_missing(db: Session, shop: Shop | None = None) -> bool:
    """Give the demo shop opening stock, also for databases made before inventory existed."""
    shop = shop or db.scalar(select(Shop).order_by(Shop.id).limit(1))
    if shop is None or shop.name != SHOP["name"]:
        return False
    if db.scalar(select(StockMove.id).where(StockMove.shop_id == shop.id).limit(1)) is not None:
        return False
    items = list(db.scalars(select(Item).where(Item.shop_id == shop.id)))
    if any(i.stock for i in items):
        return False
    opening_at = datetime.combine(datetime.now(settings.tz).date() - timedelta(days=4), time(8), tzinfo=settings.tz)
    for item in items:
        stock, low_at = STOCK.get((item.name, item.variant), DEFAULT_STOCK)
        item.stock = 0
        item.low_stock_at = low_at
        # Demo cost: roughly what a kirana pays the distributor (about 82% of the selling price).
        move = record_move(db, shop.id, item, stock, "opening", max(1, round(item.price * 0.82)))
        move.created_at = opening_at
    db.commit()
    return True


def seed_if_empty(db: Session) -> bool:
    if db.scalar(select(Shop.id).limit(1)) is not None:
        return False
    seed(db)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Load the Galla demo shop.")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    args = parser.parse_args()

    if args.reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        print("Seeded demo shop." if seed_if_empty(db) else "Shop already exists; use --reset to reload.")


if __name__ == "__main__":
    main()
