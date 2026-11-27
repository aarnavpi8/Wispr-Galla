"""extract(text, shop) -> ExtractedEntry. The core of flow 1 (D2 option A).

Rules first, always available, no key: numbers are normalised (app/numbers.py), the entry
type and payment mode come from keywords, parties and items are matched by spelling against
the shop's own names and aliases. If an LLM key is set (D3), the LLM is tried first and the
rules are the fallback; party/item confidence always comes from our own matching.

    "Sharma ji ne 500 UPI se diye"          -> payment, Sharma ji, 500, upi
    "Ramesh ko 2 kilo cheeni udhaar, 15 tareekh tak" -> udhaar, Ramesh, 2 kg Cheeni, 90, due 15th
    "Gupta distributor ka maal aaya 3,200 ka, 1,000 cash diye" -> purchase, 3200, paid 1000
    "Bijli bill 850 bhara"                   -> expense, 850, cash
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.billscan import similarity
from app.config import settings
from app.models import Item, Party, Shop
from app.numbers import replace_number_words
from app.schemas import ExtractedEntry, LineItem, PartyOption, PartyRef

MATCH_OK = 0.8

# --- Keyword tables (Hinglish, Hindi, Marathi, English). Lowercased substring/word matches. ---
KEYWORDS: dict[str, list[str]] = {
    "owner_withdrawal": ["ghar ke liye", "ghar kharch", "nikale", "nikala", "personal", "घर के लिए", "निकाले", "घरासाठी"],
    "udhaar": ["udhaar", "udhar", "udhari", "उधार", "उधारी", "credit", "khate mein", "khaate mein", "likh do", "likh lo"],
    "purchase": ["maal aaya", "maal liya", "maal", "kharida", "kharidi", "purchase", "stock aaya", "माल", "खरीदा", "खरेदी"],
    "expense": ["bill bhara", "bijli", "kiraya", "kiraaya", "rent", "salary", "tankhwah", "kharcha", "kharch",
                "expense", "petrol", "diesel", "chai", "bhada", "बिजली", "किराया", "खर्च", "पगार", "वीज"],
    "payment": ["ne diye", "ne diya", "ne de diye", "de gaye", "de gaya", "jama", "wapas", "vapas", "chukaya",
                "chuka diya", "paid", "payment", "bheje", "bheja", "ने दिए", "ने दिया", "जमा", "वापस", "दिले", "परत"],
    "sale": ["becha", "bechi", "bika", "biki", "bikri", "sale", "sold", "बेचा", "बिक्री", "विक्री", "विकले"],
}
UPI_WORDS = ["upi", "phonepe", "phone pe", "gpay", "google pay", "paytm", "online", "qr", "यूपीआई", "ऑनलाइन"]
CASH_WORDS = ["cash", "nakad", "naqad", "nagad", "कैश", "नकद", "रोख"]
SUPPLIER_HINTS = ["distributor", "supplier", "wholesale", "agency", "dairy", "traders", "डिस्ट्रीब्यूटर"]
UNIT_ALIASES = {
    "kilo": "kg", "kg": "kg", "kilogram": "kg", "किलो": "kg", "packet": "packet", "pkt": "packet",
    "packets": "packet", "पैकेट": "packet", "litre": "litre", "liter": "litre", "ltr": "litre", "लीटर": "litre",
    "dozen": "dozen", "darjan": "dozen", "दर्जन": "dozen", "piece": "pc", "pieces": "pc", "pc": "pc", "pcs": "pc",
    "bottle": "bottle", "strip": "strip", "tray": "tray", "box": "box",
}
# Words that are never a person's or item's name.
STOP = {
    "ne", "ko", "ka", "ki", "ke", "se", "me", "mein", "aur", "ji", "bhai", "rs", "rupaye", "rupay", "rupees", "ka,",
    "diye", "diya", "de", "do", "le", "liya", "liye", "tak", "tareekh", "tarikh", "tarik", "kal", "parson", "aaj",
    "agle", "hafte", "mahine", "upi", "cash", "udhaar", "udhar", "maal", "aaya", "bill", "bhara", "becha",
    "bikri", "sale", "jama", "wapas", "paise", "paisa", "the", "to", "for", "paid", "gave", "baaki", "baki",
    "ने", "को", "का", "की", "के", "से", "में", "और", "जी", "दिए", "दिया", "तक", "तारीख", "उधार", "रुपये",
}
WEEKDAYS = {
    "somvar": 0, "monday": 0, "सोमवार": 0, "mangalvar": 1, "tuesday": 1, "मंगलवार": 1, "budhvar": 2,
    "wednesday": 2, "बुधवार": 2, "guruvar": 3, "thursday": 3, "गुरुवार": 3, "shukravar": 4, "friday": 4,
    "शुक्रवार": 4, "shanivar": 5, "saturday": 5, "शनिवार": 5, "ravivar": 6, "sunday": 6, "रविवार": 6,
}

TOKEN = re.compile(r"[\wऀ-ॿ.]+", re.UNICODE)


@dataclass
class ShopContext:
    shop: Shop
    parties: list[Party]
    items: list[Item]
    today: date


def _has(text: str, words: list[str]) -> bool:
    return any(re.search(rf"(?<![\wऀ-ॿ]){re.escape(w)}(?![\wऀ-ॿ])", text) for w in words)


def detect_type(text: str, has_party: bool, has_items: bool) -> tuple[str, float]:
    t = text.lower()
    for kind in ("owner_withdrawal", "udhaar", "purchase", "expense", "payment", "sale"):
        if _has(t, KEYWORDS[kind]):
            # "X ne ... diye" with a party is a payment even if "maal" appears elsewhere
            if kind == "purchase" and not _has(t, ["maal", "kharida", "kharidi", "purchase", "stock aaya", "माल", "खरीदा", "खरेदी"]):
                continue
            return kind, 0.9
    if has_party and re.search(r"\b(ne|ने)\b", t):
        return "payment", 0.7
    if has_items:
        return "sale", 0.7
    return "sale", 0.5


def detect_mode(text: str, type_: str) -> str | None:
    t = text.lower()
    if type_ == "udhaar":
        return "udhaar"
    if _has(t, UPI_WORDS):
        return "upi"
    if _has(t, CASH_WORDS):
        return "cash"
    if _has(t, KEYWORDS["udhaar"]):
        return "udhaar"
    return "cash" if type_ in {"sale", "expense", "owner_withdrawal", "purchase", "payment"} else None


def _ngrams(words: list[str], n_max: int = 3) -> list[str]:
    out = []
    for n in range(n_max, 0, -1):
        for i in range(len(words) - n + 1):
            out.append(" ".join(words[i : i + n]))
    return out


def _clean_words(text: str) -> list[str]:
    return [w for w in (m.group().lower().strip(".") for m in TOKEN.finditer(text)) if w and not w.replace(".", "").isdigit()]


def match_party(text: str, parties: list[Party], skip: set[str] | None = None) -> tuple[Party | None, float, list[Party]]:
    skip = skip or set()
    words = [w for w in _clean_words(text) if (w not in STOP or w in {"ji", "bhai"}) and w not in skip]
    # "ji"/"bhai" alone never identify anyone.
    if not [w for w in words if w not in {"ji", "bhai"}]:
        return None, 0.0, []
    grams = _ngrams(words)
    scored: list[tuple[float, Party]] = []
    for p in parties:
        names = [p.name.lower(), p.name.lower().replace(" ji", "").replace(" bhai", ""), *(a.lower() for a in (p.aliases or []))]
        best = max((similarity(g, n) for g in grams for n in names), default=0.0)
        scored.append((best, p))
    scored.sort(key=lambda s: s[0], reverse=True)
    if not scored or scored[0][0] < 0.72:
        return None, 0.0, [p for s, p in scored[:3] if s >= 0.45]
    best_score, best = scored[0]
    alts = [p for s, p in scored[1:4] if s >= 0.5]
    return best, round(best_score, 2), alts


def guess_new_party(text: str) -> str | None:
    """A name we don't know yet: the words before ne/ko/se/ka, e.g. 'Verma ji ne 300 diye'."""
    m = re.search(r"^\s*([A-Za-zऀ-ॿ][\wऀ-ॿ]*(?:\s+[A-Za-zऀ-ॿ][\wऀ-ॿ]*){0,2}?)\s+(ne|ko|se|ka|ki|ने|को|से|का)\b", text)
    if not m:
        return None
    name_words = [w for w in m.group(1).split() if w.lower() not in STOP - {"ji", "bhai"}]
    if not name_words or name_words[0].lower() in KEYWORDS["udhaar"] + ["bijli", "maal", "ghar", "aaj", "kal"]:
        return None
    return " ".join(w if w.lower() in {"ji", "bhai", "didi", "kaka", "tai"} else w[:1].upper() + w[1:] for w in name_words)


def _bad_gram(words: list[str]) -> bool:
    edge = {words[0], words[-1]}
    return any(w.replace(".", "").isdigit() or w in UNIT_ALIASES for w in words) or bool(edge & STOP)


def match_items(text: str, items: list[Item]) -> list[tuple[Item, float, float]]:
    """(item, qty, confidence) for items mentioned, with the quantity spoken before them."""
    tokens = [m.group().lower().strip(".") for m in TOKEN.finditer(text)]
    found: list[tuple[Item, float, float]] = []
    used: set[int] = set()
    i = 0
    while i < len(tokens):
        matched = 0
        for n in (3, 2, 1):
            if i + n > len(tokens):
                continue
            words = tokens[i : i + n]
            gram = " ".join(words)
            if _bad_gram(words) or len(gram) < 3:
                continue
            best, score = None, 0.0
            for it in items:
                if it.id in used:
                    continue
                names = [it.name.lower(), f"{it.name} {it.variant or ''}".lower().strip(), *(a.lower() for a in (it.aliases or []))]
                sc = max(similarity(gram, nm) for nm in names)
                if sc > score:
                    best, score = it, sc
            if best is not None and score >= 0.8:
                qty = 1.0
                j = i - 1
                unit_word = None
                if j >= 0 and tokens[j] in UNIT_ALIASES:
                    unit_word = tokens[j]
                    j -= 1
                if j >= 0:
                    try:
                        qty = float(tokens[j])
                    except ValueError:
                        pass
                if unit_word in ("dozen", "darjan", "दर्जन") and best.unit != "dozen":
                    qty *= 12
                found.append((best, qty, round(score, 2)))
                used.add(best.id)
                matched = n
                break
        i += matched or 1
    return found


def item_words(text: str, items: list[tuple[Item, float, float]]) -> set[str]:
    """Words that belong to matched item names, so they can't also be a person's name."""
    words: set[str] = set()
    for it, _, _ in items:
        for nm in [it.name, it.variant or "", *(it.aliases or [])]:
            words.update(w.lower() for w in TOKEN.findall(nm.replace("-", " ")))
    return words


def find_due_date(text: str, today: date) -> date | None:
    t = text.lower()
    m = re.search(r"(\d{1,2})\s*(tareekh|tarikh|tarik|तारीख|तारखेपर्यंत|तारीख़|th|st|nd|rd)\b", t)
    if m:
        day = int(m.group(1))
        if 1 <= day <= 31:
            for add in (0, 1, 2):
                y, mo = today.year + (today.month - 1 + add) // 12, (today.month - 1 + add) % 12 + 1
                try:
                    d = date(y, mo, day)
                except ValueError:
                    continue
                if d >= today:
                    return d
    if _has(t, ["parson", "परसों", "परवा"]):
        return today + timedelta(days=2)
    if _has(t, ["kal tak", "kal", "कल", "उद्या"]) and _has(t, ["tak", "तक", "pe", "ko", "पर्यंत"]):
        return today + timedelta(days=1)
    if _has(t, ["agle hafte", "next week", "अगले हफ्ते", "पुढच्या आठवड्यात"]):
        return today + timedelta(days=7)
    if _has(t, ["agle mahine", "next month", "अगले महीने", "पुढच्या महिन्यात"]):
        return today + timedelta(days=30)
    for word, wd in WEEKDAYS.items():
        if _has(t, [word]):
            return today + timedelta(days=(wd - today.weekday()) % 7 or 7)
    return None


def find_amounts(text: str) -> list[float]:
    """Money numbers: everything except quantities (before a unit/item) and dates."""
    t = text.lower()
    out: list[float] = []
    for m in re.finditer(r"(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])", t):
        after = t[m.end() : m.end() + 14].strip()
        if re.match(r"(tareekh|tarikh|tarik|तारीख|th\b|st\b|nd\b|rd\b)", after):
            continue
        if re.match(r"(kilo|kg|kilogram|gram|g\b|litre|liter|ltr|packet|pkt|piece|pc|darjan|dozen|bottle|strip|box|tray|किलो|पैकेट|लीटर|दर्जन)", after):
            continue
        out.append(float(m.group(1)))
    return out


def extract_rules(text: str, ctx: ShopContext) -> ExtractedEntry:
    clean = replace_number_words(text.strip())
    t = clean.lower()

    items = match_items(clean, ctx.items)
    # Item names can look like person names (Parle / Patil): match people on the other words.
    party, party_conf, alts = match_party(clean, ctx.parties, skip=item_words(clean, items))
    type_, type_conf = detect_type(clean, party is not None, bool(items))
    if party is not None and party.kind == "supplier" and type_conf < 0.9 and type_ in {"sale", "payment"}:
        type_ = "purchase" if type_ == "sale" or _has(t, ["aaya", "aayi", "आया", "आला"]) else type_
        type_conf = 0.8
    if type_ in {"expense", "owner_withdrawal"}:
        party, party_conf, alts = None, 0.0, []

    amounts = find_amounts(clean)
    # Quantities spoken before an item ("5 maggi") are not money: take each one out once.
    money = list(amounts)
    for _, q, _ in items:
        if q in money:
            money.remove(q)
    amount = int(round(money[0])) if money else None
    amount_conf = 0.95 if money else 0.0
    paid_now = None
    if type_ == "purchase" and len(money) >= 2:
        amount, paid_now = int(round(max(money[0], money[1]))), int(round(min(money[0], money[1])))
    if amount is None and items and all(it.price for it, _, _ in items):
        amount = int(round(sum(it.price * q for it, q, _ in items)))
        amount_conf = 0.85

    mode = detect_mode(clean, type_)
    due = find_due_date(clean, ctx.today) if type_ in {"udhaar", "purchase"} or (type_ == "sale" and mode == "udhaar") else None

    party_ref: PartyRef | None = None
    new_name = guess_new_party(clean) if type_ not in {"expense", "owner_withdrawal"} else None
    if party is not None and party_conf < MATCH_OK and new_name and similarity(new_name.lower(), party.name.lower()) < 0.9:
        # Unsure, and the shopkeeper said a different name: default to the new name, offer the
        # close matches as chips ("Verma ji" vs "Sharma ji").
        alts = [party, *alts]
        party = None
    if party is not None:
        party_ref = PartyRef(name=party.name, kind=party.kind, match_id=party.id)
    else:
        if new_name and type_ not in {"expense", "owner_withdrawal"}:
            kind = "supplier" if type_ == "purchase" or _has(t, SUPPLIER_HINTS) else "customer"
            party_ref = PartyRef(name=new_name, kind=kind, match_id=None)
            party_conf = 0.6
    if party_ref and party_ref.match_id is None and type_ == "purchase":
        party_ref.kind = "supplier"

    missing: list[str] = []
    if amount is None:
        missing.append("amount")
    if type_ in {"udhaar", "payment"} and party_ref is None:
        missing.append("party")
    if type_ == "udhaar" and due is None:
        missing.append("due_date")

    confidence = {"type": type_conf, "amount": amount_conf}
    if party_ref:
        confidence["party"] = party_conf
    if items:
        confidence["items"] = min(c for _, _, c in items)
    if due:
        confidence["due_date"] = 0.85

    return ExtractedEntry(
        type=type_,
        party=party_ref,
        items=[LineItem(name=it.name if not it.variant else f"{it.name} {it.variant}", item_id=it.id, qty=q, unit=it.unit, price=it.price)
               for it, q, _ in items],
        amount=amount,
        paid_now=paid_now,
        mode=mode,
        due_date=due,
        confidence=confidence,
        missing=missing,
        raw_text=text.strip(),
        source="rules",
        party_options=[PartyOption(id=p.id, name=p.name, kind=p.kind) for p in alts][:3]
        if (party_ref is not None and confidence.get("party", 1) < MATCH_OK) or "party" in missing else [],
    )


def extract(text: str, ctx: ShopContext) -> ExtractedEntry:
    """LLM when configured (with rules as the safety net), rules otherwise."""
    if settings.llm_configured:
        from app import llm  # local import: only needed with a key

        try:
            return llm.extract_llm(text, ctx, fallback=extract_rules)
        except Exception:  # noqa: BLE001 - any LLM failure falls back to rules
            pass
    return extract_rules(text, ctx)


def today_in_shop() -> date:
    return datetime.now(settings.tz).date()
