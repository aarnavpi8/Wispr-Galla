"""Export / import BolKhata's translations as spreadsheets (CSV, UTF-8, opens in Excel/Sheets).

    python scripts/translations.py export     # -> translations/ui-words.csv, translations/voice-words.csv
    python scripts/translations.py import     # <- the same files, after translators fill them in

ui-words.csv     every word/sentence the app shows. Columns: key, section, english, notes, then one
                 column per language with the current draft. Translators overwrite their column.
voice-words.csv  what people SAY: command phrases ("close the day") and entry words ("credit",
                 "paid") per language, several phrases separated by " | ".

Import checks every {placeholder} is kept, writes frontend/src/lib/locales/<lang>.ts, and writes
backend/app/voice_words.json (merged into the speech rules at start).
"""

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALES = ROOT / "frontend" / "src" / "lib" / "locales"
OUT = ROOT / "translations"
VOICE_JSON = ROOT / "backend" / "app" / "voice_words.json"

LANGS = ["hinglish", "hi", "mr", "gu", "pa", "bn", "or", "ta", "te", "kn", "ml"]
LANG_NAMES = {
    "hinglish": "Hinglish (Roman script)", "hi": "Hindi", "mr": "Marathi", "gu": "Gujarati", "pa": "Punjabi",
    "bn": "Bengali", "or": "Odia", "ta": "Tamil", "te": "Telugu", "kn": "Kannada", "ml": "Malayalam",
}
REVIEWED = {"hinglish", "hi", "mr"}  # the rest were drafted by the team

LINE = re.compile(r'^(\s*)(\w+): ("(?:[^"\\]|\\.)*"),\s*$')
SECTION = re.compile(r"^\s*//\s*(.+)$")
PLACEHOLDER = re.compile(r"\{(\w+)\}")

# Short notes so a translator knows what a string is for.
NOTES = {
    "tagline": "Shown under the logo. BolKhata = app name, keep it in Latin letters.",
    "tourStep": "Progress label, e.g. '2 of 6'.",
    "reminderMsg": "WhatsApp message sent to a customer who owes money. Polite. {upi} is a payment link.",
    "ex1": "Example of what a shopkeeper says. Use a natural local name and sentence.",
    "ex2": "Example of what a shopkeeper says.",
    "ex3": "Example of what a shopkeeper says.",
    "ex4": "Example of what a shopkeeper says.",
    "sayClose": "A phrase the shopkeeper can SAY to close the day. Must also appear in voice-words.csv.",
    "sayStock": "A phrase to SAY to see stock. Must also appear in voice-words.csv.",
    "sayScan": "A phrase to SAY to scan a bill. Must also appear in voice-words.csv.",
    "sayHelp": "A phrase to SAY for help. Must also appear in voice-words.csv.",
    "wd0": "Short weekday name (Sunday), fits under a chart bar.",
}


def read_locale(code: str) -> tuple[list[tuple[str, str, str]], str]:
    """[(section, key, value)] in file order, plus the raw text."""
    text = (LOCALES / f"{code}.ts").read_text(encoding="utf-8")
    rows, section = [], ""
    for line in text.splitlines():
        if m := SECTION.match(line):
            section = m.group(1)
        elif m := LINE.match(line):
            rows.append((section, m.group(2), json.loads(m.group(3))))
    return rows, text


def voice_rows() -> list[dict]:
    """Command and entry phrases per language, from the backend's current rules."""
    sys.path.insert(0, str(ROOT / "backend"))
    from app.commands import COMMAND_WORDS, KHATA_WORDS  # noqa: E402
    from app.extract import KEYWORDS  # noqa: E402

    scripts = {
        "hi": r"[ऀ-ॿ]", "mr": r"[ऀ-ॿ]", "gu": r"[઀-૿]", "pa": r"[਀-੿]",
        "bn": r"[ঀ-৿]", "or": r"[଀-୿]", "ta": r"[஀-௿]", "te": r"[ఀ-౿]",
        "kn": r"[ಀ-೿]", "ml": r"[ഀ-ൿ]",
    }
    meaning = {
        "undo_last": "Undo the last entry (\"that was wrong\")",
        "send_reminder": "Remind someone to pay (said with their name)",
        "day_close": "Close the day / count the cash box",
        "scan_bill": "Scan a supplier's bill",
        "add_item": "Add a new item to the price list",
        "show_stock": "Show stock / what's on the shelf",
        "show_accounts": "Show accounts (to collect / to pay)",
        "show_entries": "Show today's entries",
        "change_language": "Change the language",
        "help": "Help / how to use",
        "show_khata": "Open someone's account (said after a name, like \"Ramesh's account\")",
        "entry:udhaar": "ENTRY WORD: credit / owes (udhaar)",
        "entry:payment": "ENTRY WORD: customer paid back / settled",
        "entry:purchase": "ENTRY WORD: stock/goods bought or arrived",
        "entry:expense": "ENTRY WORD: shop expense (electricity, rent, salary...)",
        "entry:owner_withdrawal": "ENTRY WORD: owner took money home",
        "entry:sale": "ENTRY WORD: sold",
    }
    groups = [(c, w) for c, w in COMMAND_WORDS] + [("show_khata", KHATA_WORDS)]
    groups += [(f"entry:{k}", v) for k, v in KEYWORDS.items()]
    rows = []
    for name, words in groups:
        row = {"id": name, "meaning": meaning.get(name, name)}
        latin = [w for w in words if not re.search(r"[ऀ-෿]", w)]
        row["english_and_hinglish"] = " | ".join(latin)
        for code, rx in scripts.items():
            native = [w for w in words if re.search(rx, w)]
            if code == "mr":  # Devanagari is shared with Hindi; leave Marathi to the translator
                native = [w for w in native if w in {"दिवस बंद", "गल्ला मोजा", "स्टॉक दाखवा", "माल दाखवा", "बिल स्कॅन",
                                                     "नवीन वस्तू", "आजच्या नोंदी", "भाषा बदला", "मदत", "चूक झाली",
                                                     "चुकलं", "आठवण करून द्या", "आठवण", "चा हिशोब", "चे खाते"}]
            elif code == "hi":
                native = [w for w in native if w not in {"दिवस बंद", "गल्ला मोजा", "स्टॉक दाखवा", "माल दाखवा",
                                                         "बिल स्कॅन", "नवीन वस्तू", "आजच्या नोंदी", "भाषा बदला",
                                                         "मदत", "चूक झाली", "चुकलं", "आठवण करून द्या", "आठवण",
                                                         "चा हिशोब", "चे खाते"}]
            row[code] = " | ".join(native)
        rows.append(row)
    return rows


def export() -> None:
    OUT.mkdir(exist_ok=True)
    en_rows, _ = read_locale("en")
    langs = {code: dict((k, v) for _, k, v in read_locale(code)[0]) for code in LANGS}
    path = OUT / "ui-words.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["key", "section", "english", "notes", *[f"{LANG_NAMES[c]} [{c}]" for c in LANGS]])
        for section, key, en in en_rows:
            ph = PLACEHOLDER.findall(en)
            note = NOTES.get(key, "")
            if ph:
                note = (note + " " if note else "") + "Keep " + ", ".join("{" + p + "}" for p in ph) + " unchanged."
            w.writerow([key, section, en, note, *[langs[c].get(key, "") for c in LANGS]])
    vpath = OUT / "voice-words.csv"
    rows = voice_rows()
    with vpath.open("w", encoding="utf-8-sig", newline="") as f:
        cols = ["id", "meaning", "english_and_hinglish", "hi", "mr", "gu", "pa", "bn", "or", "ta", "te", "kn", "ml"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})
    print(f"wrote {path} ({len(en_rows)} rows) and {vpath} ({len(rows)} rows)")
    print("Drafts needing a native check:", ", ".join(LANG_NAMES[c] for c in LANGS if c not in REVIEWED))


def import_() -> None:
    path = OUT / "ui-words.csv"
    with path.open(encoding="utf-8-sig", newline="") as f:
        table = list(csv.DictReader(f))
    en = {k: v for _, k, v in read_locale("en")[0]}
    problems, changed = [], 0
    for code in LANGS:
        col = next(c for c in table[0] if c.endswith(f"[{code}]"))
        values = {r["key"]: r[col].strip() for r in table}
        rows, text = read_locale(code)
        for _, key, old in rows:
            new = values.get(key, "")
            if not new or new == old:
                continue
            if sorted(PLACEHOLDER.findall(new)) != sorted(PLACEHOLDER.findall(en[key])):
                problems.append(f"{code}.{key}: placeholders must be {PLACEHOLDER.findall(en[key])}, got {PLACEHOLDER.findall(new)}")
                continue
            pattern = re.compile(rf'^(\s*){re.escape(key)}: "(?:[^"\\]|\\.)*",$', re.M)
            text, n = pattern.subn(lambda m: f"{m.group(1)}{key}: {json.dumps(new, ensure_ascii=False)},", text, count=1)
            changed += n
        (LOCALES / f"{code}.ts").write_text(text, encoding="utf-8")

    vpath = OUT / "voice-words.csv"
    voice: dict[str, list[str]] = {}
    with vpath.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            phrases = []
            for col in ["english_and_hinglish", "hi", "mr", "gu", "pa", "bn", "or", "ta", "te", "kn", "ml"]:
                phrases += [p.strip().lower() if not re.search(r"[ऀ-෿]", p) else p.strip()
                            for p in (r.get(col) or "").split("|") if p.strip()]
            voice[r["id"]] = sorted(set(phrases))
    VOICE_JSON.write_text(json.dumps(voice, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"updated {changed} UI strings; wrote {VOICE_JSON.relative_to(ROOT)}")
    if problems:
        print("\nNOT imported (fix these rows and run import again):")
        print("\n".join("  " + p for p in problems))
        sys.exit(1)


if __name__ == "__main__":
    {"export": export, "import": import_}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
