"""The extraction contract (mirrors frontend/src/lib/types.ts) and API response shapes."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

EntryType = Literal[
    "sale", "udhaar", "payment", "purchase", "expense", "owner_withdrawal", "bill_item", "command"
]
PartyKind = Literal["customer", "supplier"]
Mode = Literal["cash", "upi", "udhaar"]
Command = Literal[
    "bill_start", "bill_total", "day_close", "show_khata", "send_reminder",
    # Voice control for the rest of the app (app/commands.py)
    "show_stock", "scan_bill", "add_item", "show_accounts", "show_entries", "change_language", "help", "undo_last",
    # "Cheeni kitni bachi hai?": answer with the stock of the items named
    "item_stock",
]


class PartyRef(BaseModel):
    name: str
    kind: PartyKind = "customer"
    match_id: int | None = None


class ItemOption(BaseModel):
    """Another stock item the spoken word could mean (the card asks "which one?")."""

    item_id: int
    name: str
    unit: str = "pc"
    price: int | None = None
    in_stock: int | None = None


class LineItem(BaseModel):
    name: str
    item_id: int | None = None
    qty: float = 1
    unit: str = "pc"
    price: int | None = None
    # Several stock items fit what was said: up to 3 to pick from (empty when sure).
    options: list[ItemOption] = []
    # The words heard for this line, so a pick can be remembered as an alias.
    heard: str | None = None
    # How much of this item is on the shelf now (None when it isn't a stock item).
    in_stock: int | None = None


class PartyOption(BaseModel):
    id: int
    name: str
    kind: PartyKind


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
    # Up to 3 tap-to-pick alternatives when the party match is below 0.8 (robustness rules).
    party_options: list[PartyOption] = Field(default_factory=list)


class ShopSummary(BaseModel):
    id: int
    name: str
    vpa: str
    language: str
    kind: str = "kirana"
    items: int
    customers: int
    suppliers: int
    entries: int
    llm_configured: bool


class FirebaseWebConfig(BaseModel):
    """Public Firebase web config. Not a secret: it is shipped to every browser."""

    apiKey: str
    authDomain: str
    projectId: str
    appId: str


class AppConfig(BaseModel):
    llm_configured: bool
    wispr_configured: bool = False
    firebase: FirebaseWebConfig | None  # None means Google login is not set up


class EntryOut(BaseModel):
    id: int
    type: str
    party_id: int | None
    party_name: str | None
    amount: int
    paid_now: int | None
    mode: str | None
    due_date: date | None
    raw_text: str
    source: str
    reversed: bool
    created_at: str


class PartyBalance(BaseModel):
    id: int
    name: str
    kind: PartyKind
    phone: str | None
    balance: int
    overdue_since: date | None
    last_entry_at: str | None


class Summary(BaseModel):
    today: dict
    days: list[dict]
    opening_cash: int
    expected_cash_today: int
    udhaar_outstanding: int
    overdue_count: int
