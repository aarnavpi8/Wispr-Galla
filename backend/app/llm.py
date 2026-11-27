"""Optional LLM upgrade for extract() (D2 option A, D3). Provider: Google Gemini.

The LLM only reads the sentence: type, who, which items, amounts, mode, due date. Matching
to the shop's real customers/items (ids) and every confidence number come from our own
fuzzy matching, never from the model's self-reported certainty. Any error -> rules.
"""

import json
from datetime import date

import httpx

from app.config import settings
from app.extract import MATCH_OK, ShopContext, match_items, match_party
from app.schemas import ExtractedEntry, LineItem, PartyOption, PartyRef

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

TYPES = ["sale", "udhaar", "payment", "purchase", "expense", "owner_withdrawal"]

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "type": {"type": "STRING", "enum": TYPES},
        "party_name": {"type": "STRING", "nullable": True},
        "party_kind": {"type": "STRING", "enum": ["customer", "supplier"], "nullable": True},
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"name": {"type": "STRING"}, "qty": {"type": "NUMBER"}},
                "required": ["name", "qty"],
            },
        },
        "amount": {"type": "INTEGER", "nullable": True},
        "paid_now": {"type": "INTEGER", "nullable": True},
        "mode": {"type": "STRING", "enum": ["cash", "upi", "udhaar"], "nullable": True},
        "due_date": {"type": "STRING", "nullable": True, "description": "YYYY-MM-DD"},
    },
    "required": ["type", "items"],
}


def build_prompt(text: str, ctx: ShopContext) -> str:
    parties = ", ".join(f"{p.name} ({p.kind})" for p in ctx.parties[:150]) or "none yet"
    items = ", ".join(f"{i.name}{' ' + i.variant if i.variant else ''} ({i.unit})" for i in ctx.items[:200]) or "none yet"
    return f"""You turn one spoken sentence from an Indian shopkeeper into a ledger entry.
The sentence may mix Hindi, English, Marathi or other Indian languages, in any script.
Today is {ctx.today.isoformat()} ({ctx.today.strftime('%A')}). Shop: {ctx.shop.name} ({ctx.shop.kind}).

Types:
- sale: shop sold something (cash/UPI, or "udhaar" if not paid)
- udhaar: goods/money given on credit to a customer (they owe the shop)
- payment: a customer paid the shop back, or the shop paid a supplier
- purchase: stock bought from a supplier ("maal aaya"); paid_now = part paid immediately
- expense: shop expense (electricity, rent, salary, tea...)
- owner_withdrawal: owner took money home

Known people: {parties}
Known items: {items}

Rules: amounts are whole rupees. Convert spoken numbers ("dhai sau" = 250, "saade teen hazaar" =
3500). Item quantities are not amounts. Use the known spelling of a person/item when it is clearly
the same one; otherwise write the name as spoken. due_date only if a date/deadline is said
("15 tareekh tak", "parson", "agle hafte"), resolved against today. mode: upi for UPI/PhonePe/GPay/
Paytm/online, cash for cash, udhaar for credit. Leave anything not said as null.

Sentence: {text}"""


def call_gemini(prompt: str, client: httpx.Client | None = None) -> dict:
    own = client is None
    client = client or httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0))
    try:
        res = client.post(
            GEMINI_URL.format(model=settings.llm_model),
            headers={"x-goog-api-key": settings.llm_api_key},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0,
                    "responseMimeType": "application/json",
                    "responseSchema": SCHEMA,
                },
            },
        )
        res.raise_for_status()
        text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    finally:
        if own:
            client.close()


def extract_llm(text: str, ctx: ShopContext, fallback, client: httpx.Client | None = None) -> ExtractedEntry:
    if settings.llm_provider.lower() not in {"gemini", "google"}:
        return fallback(text, ctx)
    data = call_gemini(build_prompt(text, ctx), client)
    type_ = data.get("type")
    if type_ not in TYPES:
        return fallback(text, ctx)

    # People: our own fuzzy match decides the id and confidence.
    party_ref, party_conf, options = None, None, []
    name = (data.get("party_name") or "").strip()
    if name and type_ not in {"expense", "owner_withdrawal"}:
        match, score, alts = match_party(name, ctx.parties)
        if match is not None and score >= MATCH_OK:
            party_ref, party_conf = PartyRef(name=match.name, kind=match.kind, match_id=match.id), score
        else:
            kind = data.get("party_kind") or ("supplier" if type_ == "purchase" else "customer")
            party_ref, party_conf = PartyRef(name=name, kind=kind, match_id=None), 0.6
            options = [m for m in [match, *alts] if m is not None][:3]

    # Items: match each spoken item name to the price list.
    line_items: list[LineItem] = []
    item_conf: list[float] = []
    for it in data.get("items") or []:
        found = match_items(f"{it.get('qty') or 1} {it.get('name', '')}", ctx.items)
        if found:
            item, qty, conf = found[0]
            line_items.append(LineItem(name=item.name if not item.variant else f"{item.name} {item.variant}",
                                       item_id=item.id, qty=float(it.get("qty") or qty), unit=item.unit, price=item.price))
            item_conf.append(conf)

    amount = data.get("amount")
    amount_conf = 0.9 if amount is not None else 0.0
    if amount is None and line_items and all(li.price for li in line_items):
        amount = int(round(sum((li.price or 0) * li.qty for li in line_items)))
        amount_conf = 0.85

    due = None
    if data.get("due_date"):
        try:
            due = date.fromisoformat(data["due_date"])
        except ValueError:
            due = None

    mode = data.get("mode") or ("udhaar" if type_ == "udhaar" else "cash")
    missing = []
    if amount is None:
        missing.append("amount")
    if type_ in {"udhaar", "payment"} and party_ref is None:
        missing.append("party")
        options = [m for m in match_party(text, ctx.parties)[2]][:3]
    if type_ == "udhaar" and due is None:
        missing.append("due_date")

    confidence = {"type": 0.9, "amount": amount_conf}
    if party_ref:
        confidence["party"] = round(party_conf or 0, 2)
    if item_conf:
        confidence["items"] = min(item_conf)
    if due:
        confidence["due_date"] = 0.9

    return ExtractedEntry(
        type=type_,
        party=party_ref,
        items=line_items,
        amount=int(amount) if amount is not None else None,
        paid_now=data.get("paid_now") if type_ == "purchase" else None,
        mode=mode,
        due_date=due,
        confidence=confidence,
        missing=missing,
        raw_text=text.strip(),
        source="llm",
        party_options=[PartyOption(id=p.id, name=p.name, kind=p.kind) for p in options],
    )

