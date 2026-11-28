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
from app.commands import _has as has_words
from app.commands import detect_command
from app.itemwords import expanded_names
from app.numbers import replace_number_words
from app.schemas import ExtractedEntry, ItemOption, LineItem, PartyOption, PartyRef

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

TOKEN = re.compile(r"[\wऀ-෿.]+", re.UNICODE)  # all Indian scripts (Devanagari … Malayalam), with vowel signs


@dataclass
class ShopContext:
    shop: Shop
    parties: list[Party]
    items: list[Item]
    today: date


def _has(text: str, words: list[str]) -> bool:
    # Same rule as commands: Latin whole words; Indian scripts anywhere (endings glue on).
    return has_words(text, words)


def _merge_translated_entry_words() -> None:
    """Entry words added by translators (scripts/translations.py import -> voice_words.json)."""
    import json
    from pathlib import Path

    path = Path(__file__).with_name("voice_words.json")
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    for kind, words in KEYWORDS.items():
        words.extend(w for w in data.get(f"entry:{kind}", []) if w and w not in words)


_merge_translated_entry_words()


# The shop buying stock (strong enough to beat "udhaar": "Gupta se udhaar pe cheeni kharidi" is a purchase).
BUYING = re.compile(
    r"\b(i|we|maine|humne)\s+(bought|purchased|kharid\w*)\b|\bbought\b.*\bfrom\b|\bpurchased?\b"
    r"|\bfrom (the |my )?(vendor|supplier|distributor|wholesaler|mandi)\b|\bse\s+(\w+\s+){0,7}kharid\w*\b"
    r"|\bkharid\w*\b.*\bse\b|से\s+(\S+\s+){0,7}खरीद|माल आया|खरेदी केली|\bstock (aaya|aayi|liya)\b|\bmaal (aaya|liya|mangaya)\b"
)
# Bought now, paid later.
LATER = ["udhaar", "udhar", "उधार", "उधारी", "credit", "baaki", "baki", "बाकी", "baad mein", "बाद में", "later", "pay later",
         "nahi diya", "nahi diye", "nahin diya", "nahin diye", "नहीं दिया", "नहीं दिए", "abhi nahi", "not paid", "unpaid"]
# Money handed over now ("1,000 cash diye", "500 de diye").
PAID_NOW_WORDS = ["diye", "diya", "de diye", "paid", "gave", "दिए", "दिया", "दिले"]
NOT_PAID = ["nahi diya", "nahi diye", "nahin diya", "nahin diye", "नहीं दिया", "नहीं दिए", "not paid", "unpaid"]
# Goods coming in ("maal aaya", "liya"): with a supplier, "udhaar" means we bought on credit.
GOODS_IN = ["aaya", "aayi", "aaye", "liya", "liye", "mangaya", "kharid", "maal", "आया", "लिया", "माल", "आला"]


def detect_type(text: str, has_party: bool, has_items: bool) -> tuple[str, float]:
    t = text.lower()
    if not _has(t, KEYWORDS["owner_withdrawal"]) and BUYING.search(t):
        return "purchase", 0.9
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
    if type_ == "purchase" and _has(t, LATER) and not _has(t, UPI_WORDS + CASH_WORDS):
        return "udhaar"  # bought on credit from the supplier
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


ENGLISH_PARTY = re.compile(
    r"\b(?:[Ff]rom|[Gg]ave|[Tt]o|[Pp]aid)\s+((?:[A-Z][\w.]*)(?:\s+(?:[A-Z][\w.]*|ji|bhai|traders|dairy|stores?|agency|distributors?)){0,2})"
)


def guess_new_party(text: str) -> str | None:
    """A name we don't know yet: the words before ne/ko/se/ka, e.g. 'Verma ji ne 300 diye',
    or after from/gave/to in English: 'from Gupta Traders', 'Gave Ramesh'."""
    e = ENGLISH_PARTY.search(text)
    if e and e.group(1).split()[0].lower() not in STOP | {"the", "my", "i", "upi", "cash"}:
        words = e.group(1).split()
        return " ".join(w if w.lower() in {"ji", "bhai"} else w[:1].upper() + w[1:] for w in words)
    m = re.search(r"^\s*([A-Za-zऀ-ॿ][\wऀ-ॿ]*(?:\s+[A-Za-zऀ-ॿ][\wऀ-ॿ]*){0,2}?)\s+(ne|ko|se|ka|ki|ने|को|से|का)\b", text)
    if not m:
        return None
    name_words = [w for w in m.group(1).split() if w.lower() not in STOP - {"ji", "bhai"}]
    if not name_words or name_words[0].lower() in KEYWORDS["udhaar"] + ["bijli", "maal", "ghar", "aaj", "kal"]:
        return None
    return " ".join(w if w.lower() in {"ji", "bhai", "didi", "kaka", "tai"} else w[:1].upper() + w[1:] for w in name_words)


NOT_ITEM = STOP | set(UNIT_ALIASES) | {
    "on", "of", "from", "at", "in", "and", "by", "with", "till", "until", "credit", "rupees", "rupee", "worth",
    "for", "a", "an", "my", "i", "we", "bought", "purchased", "sold", "liye", "kharida", "kharidi", "kharide",
    "aaya", "aayi", "mangaya", "becha", "bechi", "diya", "di", "wala", "wali", "ka", "ki", "ke", "se", "pe", "par",
}


def guess_new_items(text: str, known_words: set[str]) -> list[tuple[str, float, str]]:
    """Items we don't stock yet, spoken with a unit: "10 kilo cheeni", "3 dozen eggs", "40 packet doodh".
    -> (name, qty, unit). The shopkeeper can add them to stock from the card."""
    tokens = [m.group().strip(".") for m in TOKEN.finditer(text)]
    out: list[tuple[str, float, str]] = []
    for i in range(len(tokens) - 2):
        unit = UNIT_ALIASES.get(tokens[i + 1].lower())
        if unit is None:
            continue
        try:
            qty = float(tokens[i])
        except ValueError:
            continue
        words: list[str] = []
        for w in tokens[i + 2 : i + 4]:
            lw = w.lower()
            if lw in NOT_ITEM or lw in KEYWORDS["udhaar"] or not re.search(r"[^\W\d_]", w) or w.replace(".", "").isdigit():
                break
            words.append(w)
        if not words or any(w.lower() in known_words for w in words):
            continue
        name = " ".join(words)
        out.append((name[:1].upper() + name[1:], qty, unit))
    return out


def _bad_gram(words: list[str]) -> bool:
    edge = {words[0], words[-1]}
    return any(w.replace(".", "").isdigit() or w in UNIT_ALIASES for w in words) or bool(edge & STOP)


# A match through the five-language word list (itemwords.py) counts a little less than the
# item's own name or a learned alias, so a word the shopkeeper taught us wins.
SYNONYM_WEIGHT = 0.95
# Two items closer than this for the same spoken word: ask which one.
AMBIGUOUS_GAP = 0.05


def _item_names(it: Item) -> tuple[list[str], list[str]]:
    own = [it.name.lower(), f"{it.name} {it.variant or ''}".lower().strip(), *(a.lower() for a in (it.aliases or []))]
    return own, expanded_names(own)


def match_items(
    text: str, items: list[Item], details: dict[int, tuple[list[Item], str]] | None = None
) -> list[tuple[Item, float, float]]:
    """(item, qty, confidence) for items mentioned, with the quantity spoken before them.

    Names are matched by spelling against the item's name, aliases and its everyday words in five
    languages. When a spoken word fits several items about equally ("dal", "tel"), the best one is
    kept with low confidence and details[item.id] gets (up to 3 options, the words heard), so the
    card can ask "which one?".
    """
    tokens = [m.group().lower().strip(".") for m in TOKEN.finditer(text)]
    names = {it.id: _item_names(it) for it in items}
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
            scored: list[tuple[float, Item]] = []
            for it in items:
                if it.id in used:
                    continue
                own, extra = names[it.id]
                sc = max(similarity(gram, nm) for nm in own)
                if extra:
                    sc = max(sc, SYNONYM_WEIGHT * max(similarity(gram, nm) for nm in extra))
                if sc >= 0.8:
                    scored.append((sc, it))
            if scored:
                scored.sort(key=lambda x: -x[0])
                score, best = scored[0]
                close = [it for sc, it in scored if score - sc < AMBIGUOUS_GAP - 1e-9]
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
                conf = round(score, 2)
                if len(close) > 1:
                    conf = min(conf, 0.6)  # several fit: ask
                    if details is not None:
                        details[best.id] = (close[:3], gram)
                found.append((best, qty, conf))
                used.add(best.id)
                matched = n
                break
        i += matched or 1
    return found


def _label(it: Item) -> str:
    return it.name if not it.variant else f"{it.name} {it.variant}"


def line_for(it: Item, qty: float, choice: tuple[list[Item], str] | None = None) -> LineItem:
    """A card line for a matched item; with the other close matches when we need to ask."""
    options = [_option(o) for o in choice[0]] if choice else []
    return LineItem(name=_label(it), item_id=it.id, qty=qty, unit=it.unit, price=it.price,
                    options=options, heard=choice[1] if choice else None, in_stock=it.stock)


def _option(o: Item) -> ItemOption:
    return ItemOption(item_id=o.id, name=_label(o), unit=o.unit, price=o.price, in_stock=o.stock)


def closest_items(name: str, items: list[Item], k: int = 3, floor: float = 0.6) -> list[Item]:
    """Stock items that sound like a name we couldn't match outright ("Kesar" -> "Kesari dal"),
    so the card can offer the shopkeeper's own items before "add it as new"."""
    gram = name.lower().strip()
    scored = []
    for it in items:
        own, extra = _item_names(it)
        sc = max([similarity(gram, n) for n in own] + [SYNONYM_WEIGHT * similarity(gram, n) for n in extra] or [0.0])
        if sc >= floor:
            scored.append((sc, it))
    scored.sort(key=lambda x: -x[0])
    return [it for _, it in scored[:k]]


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

    choices: dict[int, tuple[list[Item], str]] = {}
    items = match_items(clean, ctx.items, choices)
    matched = [it for it, _, _ in items]
    # A unit + name we don't stock; skip names that are just another spelling of a matched item (eggs = Anda).
    new_items = [n for n in guess_new_items(clean, item_words(clean, items)) if not match_items(n[0], matched)]
    # Item names can look like person names (Parle / Patil): match people on the other words.
    party, party_conf, alts = match_party(
        clean, ctx.parties, skip=item_words(clean, items) | {w.lower() for n, _, _ in new_items for w in n.split()}
    )
    guessed = guess_new_party(clean)
    type_, type_conf = detect_type(clean, party is not None or guessed is not None, bool(items or new_items))
    if party is None and guessed and _has(t, SUPPLIER_HINTS) and type_ == "sale" and type_conf < 0.9:
        type_, type_conf = "purchase", 0.8  # "Raju Dairy se 40 packet doodh aaya"
    if party is not None and party.kind == "supplier" and type_conf < 0.9 and type_ in {"sale", "payment"}:
        type_ = "purchase" if type_ == "sale" or _has(t, ["aaya", "aayi", "आया", "आला"]) else type_
        type_conf = 0.8
    if type_ == "purchase" and party is not None and party.kind == "customer":
        # Buying from someone: look among suppliers only ("Sharma Wholesale" is not customer "Sharma ji").
        party, party_conf, alts = match_party(
            clean, [p for p in ctx.parties if p.kind == "supplier"], skip=item_words(clean, items)
        )
    if type_ == "udhaar" and (
        (party is not None and party.kind == "supplier")
        or (party is None and _has(t, SUPPLIER_HINTS))
    ) and (_has(t, GOODS_IN) or items or new_items):
        # "Gupta se 20 packet Maggi aaya, udhaar pe": the shop bought on credit; we owe the supplier.
        type_, type_conf = "purchase", 0.85
    if type_ in {"expense", "owner_withdrawal"}:
        party, party_conf, alts = None, 0.0, []

    amounts = find_amounts(clean)
    # Quantities spoken before an item ("5 maggi") are not money: take each one out once.
    money = list(amounts)
    for q in [q for _, q, _ in items] + [q for _, q, _ in new_items]:
        if q in money:
            money.remove(q)
    amount = int(round(money[0])) if money else None
    amount_conf = 0.95 if money else 0.0
    paid_now = None
    if type_ == "purchase" and len(money) >= 2:
        amount, paid_now = int(round(max(money[0], money[1]))), int(round(min(money[0], money[1])))
    priced_total = int(round(sum(it.price * q for it, q, _ in items))) if items and all(it.price for it, _, _ in items) and not new_items else 0
    if type_ == "purchase" and len(money) == 1 and _has(t, PAID_NOW_WORDS) and _has(t, LATER) and not _has(t, NOT_PAID):
        # "40 packet doodh aaya, 500 diye, baaki baad mein": the one number is what was paid now.
        paid_now = amount
        if priced_total > paid_now:
            amount, amount_conf = priced_total, 0.85
        else:
            amount, amount_conf = None, 0.0  # bill total not said: ask
    if amount is None and paid_now is None and items and all(it.price for it, _, _ in items):
        amount = int(round(sum(it.price * q for it, q, _ in items)))
        amount_conf = 0.85

    mode = detect_mode(clean, type_)
    if type_ == "purchase" and paid_now and mode == "udhaar":
        mode = "cash"  # part paid in cash now, the rest owed (paid_now says how much)
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
    if new_items:
        confidence["items"] = min(confidence.get("items", 1.0), 0.5)  # not in stock yet: ask
    if due:
        confidence["due_date"] = 0.85

    return ExtractedEntry(
        type=type_,
        party=party_ref,
        items=[line_for(it, q, choices.get(it.id)) for it, q, _ in items]
        + [LineItem(name=n, item_id=None, qty=q, unit=u, heard=n.lower(),
                    options=[_option(o) for o in closest_items(n, ctx.items)]) for n, q, u in new_items],
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


# "How much do I have?" in five languages: with an item named, the app answers with its stock.
STOCK_QUESTION = [
    "how much", "how many", "kitna hai", "kitni hai", "kitne hai", "kitna bacha", "kitni bachi", "kitne bache",
    "stock me kitna", "stock mein kitna", "kitna stock", "kitni stock", "kitna pada", "kitni padi",
    "कितना", "कितनी", "कितने", "बचा है", "बची है", "किती", "शिल्लक", "કેટલું", "કેટલી", "કેટલા", "બાકી છે",
]


def stock_question(text: str, ctx: ShopContext) -> ExtractedEntry | None:
    t = text.lower()
    if not _has(t, STOCK_QUESTION) or re.search(r"₹|rs|rupay|rupee|रुपये", t):
        return None
    choices: dict[int, tuple[list[Item], str]] = {}
    found = match_items(text, ctx.items, choices)
    if not found:
        return None
    return ExtractedEntry(
        type="command",
        command="item_stock",
        items=[line_for(it, 0, choices.get(it.id)) for it, _, _ in found],
        confidence={"type": 0.9, "items": min(c for _, _, c in found)},
        raw_text=text.strip(),
        source="rules",
    )


def as_command(text: str, ctx: ShopContext) -> ExtractedEntry | None:
    asked = stock_question(replace_number_words(text.strip()), ctx)
    if asked is not None:
        return asked
    found = detect_command(replace_number_words(text.strip()), ctx.parties, match_party)
    if found is None:
        return None
    cmd, party, conf = found
    return ExtractedEntry(
        type="command",
        command=cmd,
        party=PartyRef(name=party.name, kind=party.kind, match_id=party.id) if party else None,
        confidence={"type": 0.9, **({"party": round(conf, 2)} if party else {})},
        raw_text=text.strip(),
        source="rules",
    )


def extract(text: str, ctx: ShopContext, preview: bool = False) -> ExtractedEntry:
    """Commands first. Then the LLM when configured (rules as the safety net), else rules.
    `preview` (live suggestions while typing/speaking) always uses the free rules."""
    command = as_command(text, ctx)
    if command is not None:
        return command
    if settings.llm_configured and not preview:
        from app import llm  # local import: only needed with a key

        try:
            return llm.extract_llm(text, ctx, fallback=extract_rules)
        except Exception:  # noqa: BLE001 - any LLM failure falls back to rules
            pass
    return extract_rules(text, ctx)


def today_in_shop() -> date:
    return datetime.now(settings.tz).date()
