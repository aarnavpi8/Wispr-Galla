"""First-run shop setup. A new install has no shop: the app asks a few questions and creates
it here, optionally with common items for the shop type. Judges can load the demo instead.

Starter items get price 0 and no alert level: we don't guess prices. The shopkeeper sets
them in the item sheet (PATCH /api/items/{id}) or through a bill scan.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_db
from app.deps import current_owner, shop_of
from app.seed import seed

router = APIRouter(prefix="/api/setup", tags=["setup"])

ShopKind = Literal["kirana", "sabzi", "medical", "other"]

# (name, unit, aliases). Aliases help voice and bill-scan matching; keep them short.
STARTER_ITEMS: dict[str, list[tuple[str, str, list[str]]]] = {
    "kirana": [
        ("Atta", "kg", ["aata", "flour", "आटा"]),
        ("Chawal", "kg", ["rice", "चावल"]),
        ("Cheeni", "kg", ["chini", "sugar", "चीनी", "साखर"]),
        ("Dal", "kg", ["daal", "दाल"]),
        ("Tel", "litre", ["oil", "तेल"]),
        ("Namak", "packet", ["salt", "नमक"]),
        ("Chai patti", "packet", ["tea", "चाय"]),
        ("Doodh", "packet", ["milk", "दूध"]),
        ("Biscuit", "pc", ["biskut", "बिस्कुट"]),
        ("Sabun", "pc", ["soap", "साबुन"]),
    ],
    "sabzi": [
        ("Aloo", "kg", ["potato", "आलू"]),
        ("Pyaz", "kg", ["onion", "pyaaz", "प्याज़", "कांदा"]),
        ("Tamatar", "kg", ["tomato", "टमाटर"]),
        ("Hari mirch", "kg", ["green chilli", "मिर्च"]),
        ("Adrak", "kg", ["ginger", "अदरक"]),
        ("Lahsun", "kg", ["garlic", "लहसुन"]),
        ("Dhaniya", "bunch", ["coriander", "धनिया"]),
        ("Kela", "dozen", ["banana", "केला"]),
        ("Seb", "kg", ["apple", "सेब"]),
        ("Nimbu", "pc", ["lemon", "नींबू"]),
    ],
    "medical": [
        ("Paracetamol 500", "strip", ["crocin", "dolo", "paracetamol"]),
        ("ORS", "packet", ["electral", "o r s"]),
        ("Antacid", "strip", ["gelusil", "digene"]),
        ("Cough syrup", "bottle", ["khansi ki dawai", "syrup"]),
        ("Bandage", "pc", ["patti", "band aid"]),
        ("Antiseptic liquid", "bottle", ["dettol", "savlon"]),
        ("Vitamin C", "strip", ["vitamin"]),
        ("Thermometer", "pc", ["thermameter"]),
        ("Mask", "pc", ["face mask"]),
        ("Sanitizer", "bottle", ["hand sanitizer"]),
    ],
    "other": [],
}


class SetupStatus(BaseModel):
    has_shop: bool


class SetupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: ShopKind = "kirana"
    vpa: str = Field(default="", max_length=120)
    language: str = Field(default="hi", max_length=10)
    opening_cash: int = Field(default=0, ge=0, le=1_00_00_000)
    starter_items: bool = True


class SetupOut(BaseModel):
    id: int
    name: str
    kind: str
    items: int


def has_shop(db: Session, owner: str | None) -> bool:
    return shop_of(db, owner) is not None


def create_shop(db: Session, body: SetupIn, owner: str | None = None) -> SetupOut:
    shop = models.Shop(
        owner=owner,
        name=body.name.strip(),
        kind=body.kind,
        vpa=body.vpa.strip(),
        language=body.language,
        opening_cash=body.opening_cash,
    )
    db.add(shop)
    db.flush()
    starters = STARTER_ITEMS[body.kind] if body.starter_items else []
    for name, unit, aliases in starters:
        db.add(models.Item(shop_id=shop.id, name=name, variant=None, unit=unit, price=0, aliases=aliases,
                           stock=0, low_stock_at=0))
    db.commit()
    return SetupOut(id=shop.id, name=shop.name, kind=shop.kind, items=len(starters))


@router.get("", response_model=SetupStatus)
def status(db: Session = Depends(get_db), owner: str | None = Depends(current_owner)) -> SetupStatus:
    return SetupStatus(has_shop=has_shop(db, owner))


@router.post("", response_model=SetupOut, status_code=201)
def setup(body: SetupIn, db: Session = Depends(get_db), owner: str | None = Depends(current_owner)) -> SetupOut:
    if has_shop(db, owner):
        raise HTTPException(409, "Your shop is already set up.")
    return create_shop(db, body, owner)


@router.post("/demo", response_model=SetupOut, status_code=201)
def demo(db: Session = Depends(get_db), owner: str | None = Depends(current_owner)) -> SetupOut:
    """Load the sample shop (for judges and first looks), as this account's / browser's own copy."""
    if has_shop(db, owner):
        raise HTTPException(409, "Your shop is already set up.")
    shop = seed(db, owner)
    n = len(list(db.scalars(select(models.Item.id).where(models.Item.shop_id == shop.id))))
    return SetupOut(id=shop.id, name=shop.name, kind=shop.kind, items=n)

