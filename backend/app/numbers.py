"""Spoken numbers -> digits, for Hindi, Hinglish, Marathi and English.

    "dhai sau" -> 250, "saade teen hazaar" -> 3500, "do hazaar paanch sau" -> 2500,
    "paune do sau" -> 175, "डेढ़ सौ" -> 150, "३,२००" -> 3200, "two fifty" -> 250

`replace_number_words(text)` rewrites a sentence with every spoken number as digits, so the
extractor only ever has to deal with digits.
"""

import re

DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

UNITS: dict[str, float] = {
    # Hinglish / Hindi (Roman)
    "ek": 1, "do": 2, "teen": 3, "tin": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "chhe": 6,
    "chhah": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10, "dus": 10, "gyarah": 11, "barah": 12, "baara": 12,
    "terah": 13, "chaudah": 14, "pandrah": 15, "solah": 16, "satrah": 17, "atharah": 18, "unnis": 19,
    "bees": 20, "bis": 20, "pachees": 25, "pachis": 25, "tees": 30, "tis": 30, "chalis": 40, "chaalis": 40,
    "pachas": 50, "pachaas": 50, "saath_": 60, "sattar": 70, "assi": 80, "nabbe": 90,
    # Devanagari (Hindi / Marathi)
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "पाच": 5, "छह": 6, "सात": 7, "आठ": 8,
    "नौ": 9, "दस": 10, "बीस": 20, "पच्चीस": 25, "तीस": 30, "चालीस": 40, "पचास": 50, "सौ_": 100,
    "दोन": 2, "सहा": 6, "नऊ": 9, "वीस": 20, "पन्नास": 50,
    # English
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "twentyfive": 25, "thirty": 30,
    "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
# Whole fractional numbers.
FRACTIONS: dict[str, float] = {"dhai": 2.5, "dhaai": 2.5, "ढाई": 2.5, "dedh": 1.5, "derh": 1.5, "डेढ़": 1.5, "दीड": 1.5, "अडीच": 2.5}
# Modifiers on the next number: saade 3 = 3.5, paune 2 = 1.75, sava 2 = 2.25.
MODIFIERS: dict[str, float] = {"saade": 0.5, "sade": 0.5, "साढ़े": 0.5, "साडे": 0.5, "paune": -0.25, "पौने": -0.25, "sava": 0.25, "sawa": 0.25, "सवा": 0.25}
MULTIPLIERS: dict[str, int] = {
    "sau": 100, "so": 100, "सौ": 100, "शे": 100, "hundred": 100,
    "hazaar": 1000, "hazar": 1000, "hajar": 1000, "हज़ार": 1000, "हजार": 1000, "thousand": 1000, "k": 1000,
    "lakh": 100000, "lac": 100000, "लाख": 100000,
}

WORD = re.compile(r"[\wऀ-ॿ]+", re.UNICODE)


def _is_number_word(tok: str) -> bool:
    t = tok.lower()
    return t in UNITS or t in FRACTIONS or t in MODIFIERS or t in MULTIPLIERS or _digits(t) is not None


def _digits(tok: str) -> float | None:
    t = tok.translate(DEVANAGARI_DIGITS).replace(",", "")
    try:
        return float(t)
    except ValueError:
        return None


# Words after which an ambiguous "do" (2 / "give") is clearly the number.
UNIT_WORDS = {
    "kilo", "kg", "kilogram", "gram", "g", "litre", "liter", "ltr", "packet", "pkt", "packets", "piece",
    "pieces", "pc", "pcs", "darjan", "dozen", "bottle", "strip", "box", "tray", "bori", "bag", "kilo,",
    "किलो", "पैकेट", "लीटर", "दर्जन", "नग",
}


def words_to_number(tokens: list[str]) -> float | None:
    """Value of a run of number tokens, or None if it isn't a number."""
    low = [t.lower() for t in tokens]
    # Indian-English prices: "two fifty" = 250, "three twenty" = 320.
    if len(low) == 2 and all(t in UNITS for t in low) and UNITS[low[0]] < 10 and UNITS[low[1]] >= 10:
        return UNITS[low[0]] * 100 + UNITS[low[1]]
    total = 0.0
    current: float | None = None
    modifier = 0.0
    seen = False
    for raw in tokens:
        t = raw.lower()
        d = _digits(t)
        if d is not None:
            current = (current or 0) + d
            seen = True
        elif t in UNITS:
            current = (current or 0) + UNITS[t]
            seen = True
        elif t in FRACTIONS:
            current = (current or 0) + FRACTIONS[t]
            seen = True
        elif t in MODIFIERS:
            modifier = MODIFIERS[t]
        elif t in MULTIPLIERS:
            mult = MULTIPLIERS[t]
            base = (current if current is not None else 1) + modifier
            modifier = 0.0
            if mult >= 1000:
                total += base * mult
                current = None
            else:
                current = base * mult
            seen = True
        else:
            return None
    if not seen:
        return None
    if current is not None:
        total += current + modifier
    return total


def replace_number_words(text: str) -> str:
    """Rewrite spoken numbers as digits; leaves everything else untouched."""
    text = text.translate(DEVANAGARI_DIGITS)
    # "3,200" / "1,25,000" -> "3200" so digit runs stay one token.
    text = re.sub(r"(?<=\d),(?=\d{2,3}\b)", "", text)
    text = re.sub(r"(?<=\d),(?=\d{2,3}\b)", "", text)
    # "2.5k" / "3k" -> thousands
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*k\b", lambda m: _fmt(float(m.group(1)) * 1000), text, flags=re.I)

    tokens = list(WORD.finditer(text))
    out: list[str] = []
    last = 0
    i = 0
    while i < len(tokens):
        j = i
        while j < len(tokens) and _is_number_word(tokens[j].group()) and _gap_ok(text, tokens, i, j):
            j += 1
        # Try the longest run that parses; single bare words like "do" (also "give") only count
        # when followed by a multiplier or a unit-ish word is handled by the caller.
        value = None
        end = j
        while end > i:
            run = [t.group() for t in tokens[i:end]]
            ambiguous = len(run) == 1 and run[0].lower() in {"do", "so", "k", "tin", "bis", "tis"}
            next_word = tokens[end].group().lower() if end < len(tokens) else ""
            if not ambiguous or next_word in UNIT_WORDS:
                value = words_to_number(run)
            if value is not None:
                break
            end -= 1
        if value is not None:
            out.append(text[last : tokens[i].start()])
            out.append(_fmt(value))
            last = tokens[end - 1].end()
            i = end
        else:
            i += 1
    out.append(text[last:])
    return "".join(out)


def _gap_ok(text: str, tokens: list[re.Match], i: int, j: int) -> bool:
    """Number words must be separated by spaces only (not commas or other words)."""
    if j == i:
        return True
    between = text[tokens[j - 1].end() : tokens[j].start()]
    return between.strip() == ""


def _fmt(v: float) -> str:
    return str(int(v)) if abs(v - round(v)) < 1e-9 else str(round(v, 2))
