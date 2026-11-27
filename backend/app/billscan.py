"""Turn OCR text from a supplier's bill into (item, quantity) lines.

Deterministic and keyless: the browser does the OCR (Tesseract.js), this matches each line
to the shop's items by spelling (name, variant and aliases) and picks out the quantity.
Every result is shown to the shopkeeper to confirm before stock changes.
"""

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from app.models import Item

MATCH_OK = 0.8  # same bar as the robustness rules: below this the line is highlighted
MATCH_MIN = 0.55  # below this we don't guess at all

# Lines on a bill that are never items.
SKIP = re.compile(
    r"\b(total|sub ?total|grand|gst|cgst|sgst|igst|tax|invoice|bill|date|phone|mob|gstin|"
    r"thank|amount|balance|cash|upi|paid|discount|round|qty|rate|party|inv|wholesale|distributors?)\b",
    re.I,
)
NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
DOZEN = re.compile(r"(\d+(?:\.\d+)?)\s*(?:dozen|dzn|doz|darjan|दर्जन)", re.I)
UNIT_QTY = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:x\b|pcs?\b|nos?\b|pkts?\b|packets?\b|kg\b|kgs\b|ltrs?\b|litres?\b|boxes\b|box\b|tray\b|पैकेट|किलो)",
    re.I,
)


def normalise(s: str) -> str:
    s = s.lower().replace("-", " ")
    s = re.sub(r"[^\w\s]", " ", s)  # keeps Devanagari letters
    s = re.sub(r"\d+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    # Whole-string ratio, plus credit when one name sits inside the other ("parle g" in "parle g biscuit").
    ratio = SequenceMatcher(None, a, b).ratio()
    if len(b) >= 4 and b in a or len(a) >= 4 and a in b:
        ratio = max(ratio, 0.9)
    return ratio


def candidates(item: Item) -> list[str]:
    names = [item.name, f"{item.name} {item.variant or ''}", *(item.aliases or [])]
    return [n for n in (normalise(x) for x in names) if n]


def qty_rate_amount(line: str) -> int | None:
    """Qty from the classic three columns, when qty x rate = amount checks out."""
    found = _triple(line)
    return max(1, round(found[0])) if found else None


def unit_rate(line: str) -> int | None:
    """The rate column (what one unit cost), when qty x rate = amount checks out."""
    found = _triple(line)
    return round(found[1]) if found and found[1] >= 1 else None


def _triple(line: str) -> tuple[float, float, float] | None:
    nums = [float(n.replace(",", "")) for n in NUMBER.findall(line)]
    for i in range(len(nums) - 2):
        a, b, c = nums[i], nums[i + 1], nums[i + 2]
        if a and b and abs(a * b - c) <= max(1, 0.02 * c):
            return a, b, c
    return None


def quantity(line: str) -> int:
    """Best guess at how many units a bill line is for. Defaults to 1.

    The qty x rate = amount columns are checked first, so a pack size in the item name
    ("Surf Excel 1kg  6  128  768") is not mistaken for the quantity.
    """
    if (q := qty_rate_amount(line)) is not None:
        return q
    if m := DOZEN.search(line):
        return max(1, round(float(m.group(1)) * 12))
    if m := UNIT_QTY.search(line):
        return max(1, round(float(m.group(1))))
    nums = [float(n.replace(",", "")) for n in NUMBER.findall(line)]
    if nums:
        return max(1, round(nums[0])) if nums[0] <= 1000 else 1
    return 1


@dataclass
class ScanLine:
    raw: str
    qty: int
    item_id: int | None
    confidence: float
    alternatives: list[int]  # other likely item ids, best first
    rate: int | None = None  # cost per unit from the bill, only when it is per the same unit as qty


def match_line(text: str, items: list[Item]) -> tuple[Item | None, float, list[Item]]:
    words = normalise(text)
    if len(words) < 2:
        return None, 0.0, []
    scored = sorted(
        ((max(similarity(words, c) for c in candidates(i)), i) for i in items),
        key=lambda s: s[0],
        reverse=True,
    )
    best_score, best = scored[0] if scored else (0.0, None)
    alts = [i for s, i in scored[1:4] if s >= MATCH_MIN]
    if best_score < MATCH_MIN:
        return None, best_score, [i for s, i in scored[:3] if s >= 0.4]
    return best, best_score, alts


def parse_bill(text: str, items: list[Item]) -> list[ScanLine]:
    out: list[ScanLine] = []
    for raw in text.splitlines():
        line = raw.strip()
        if len(line) < 3 or SKIP.search(line) or not re.search(r"[^\W\d_]", line):
            continue
        item, score, alts = match_line(line, items)
        # Unknown lines are kept (for the shopkeeper to pick an item) only when they look like
        # an item row: qty x rate = amount. Headers, addresses and footers are dropped.
        if item is None and qty_rate_amount(line) is None:
            continue
        qty = quantity(line)
        out.append(
            ScanLine(
                raw=line,
                qty=qty,
                item_id=item.id if item else None,
                confidence=round(score, 2),
                alternatives=[a.id for a in alts],
                rate=unit_rate(line) if qty == qty_rate_amount(line) else None,
            )
        )
    return out if any(line.item_id for line in out) else out[:0]
