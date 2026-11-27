"""The extraction contract (mirrors frontend/src/lib/types.ts) and API response shapes."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

EntryType = Literal[
    "sale", "udhaar", "payment", "purchase", "expense", "owner_withdrawal", "bill_item", "command"
]
PartyKind = Literal["customer", "supplier"]
Mode = Literal["cash", "upi", "udhaar"]
Command = Literal["bill_start", "bill_total", "day_close", "show_khata", "send_reminder"]


class PartyRef(BaseModel):
    name: str
    kind: PartyKind = "customer"
    match_id: int | None = None


class LineItem(BaseModel):
    name: str
    item_id: int | None = None
    qty: float = 1
    unit: str = "pc"
    price: int | None = None


class ExtractedEntry(BaseModel):
    """What extract(text, shop_context) returns. Amounts are integer rupees."""

    type: EntryType
    party: PartyRef | None = None
    items: list[LineItem] = Field(default_factory=list)
    amount: int | None = None
    paid_now: int | None = None
    mode: Mode | None = None
    due_date: date | None = None
    command: Command | None = None
    confidence: dict[str, float] = Field(default_factory=dict)
    missing: list[str] = Field(default_factory=list)
    raw_text: str = ""
    source: Literal["rules", "llm"] = "rules"


class ShopSummary(BaseModel):
    id: int
    name: str
    vpa: str
    language: str
    items: int
    customers: int
    suppliers: int
    entries: int
    llm_configured: bool
