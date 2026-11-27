"""Plain numbered English lists for pasting into Sarvam (or any translator), and back.

    python scripts/sarvam_list.py make                 # -> translations/sarvam/part-XX.txt (+ ALL-english.txt)
    python scripts/sarvam_list.py apply ta ta.txt      # numbered Tamil lines -> app (UI words + voice words)

Lines are "N. text". Paste each part into Sarvam, choose the language, and save the numbered
result as one text file per language (all parts together are fine). `apply` matches by number.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EN = ROOT / "frontend" / "src" / "lib" / "locales" / "en.ts"
LOCALES = ROOT / "frontend" / "src" / "lib" / "locales"
OUT = ROOT / "translations" / "sarvam"
VOICE_JSON = ROOT / "backend" / "app" / "voice_words.json"

LINE = re.compile(r'^\s*(\w+): ("(?:[^"\\]|\\.)*"),\s*$', re.M)
PLACEHOLDER = re.compile(r"\{(\w+)\}")
NUMBERED = re.compile(r"^\s*(\d+)\s*[.)।:-]\s*(.+?)\s*$")

# Things people SAY: Sarvam's natural phrasing becomes a voice command / entry word.
VOICE = [
    ("day_close", "Close the day"), ("day_close", "Close the shop for today"),
    ("show_stock", "Show the stock"), ("scan_bill", "Scan the bill"), ("add_item", "Add a new item"),
    ("show_accounts", "Show the accounts"), ("show_entries", "Show today's entries"),
    ("change_language", "Change the language"), ("help", "Help me"), ("undo_last", "That was wrong, undo it"),
    ("send_reminder", "Send a reminder"), ("show_khata", "Show the account"),
    ("entry:udhaar", "Gave goods on credit"), ("entry:payment", "Paid back the money"),
    ("entry:purchase", "Goods arrived from the supplier"), ("entry:expense", "Paid the electricity bill"),
    ("entry:owner_withdrawal", "Took money for home"), ("entry:sale", "Sold for cash"),
]


def ui_rows() -> list[tuple[str, str]]:
    return [(m.group(1), json.loads(m.group(2))) for m in LINE.finditer(EN.read_text(encoding="utf-8"))]


def make() -> None:
    rows = ui_rows()
    items = [("ui", k, t) for k, t in rows] + [("voice", k, t) for k, t in VOICE]
    lines = [f"{i}. {t}" for i, (_, _, t) in enumerate(items, 1)]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "key-map.json").write_text(json.dumps([[kind, key] for kind, key, _ in items], indent=0), encoding="utf-8")
    (OUT / "ALL-english.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    for old in OUT.glob("part-*.txt"):
        old.unlink()
    parts, cur = [], []
    for line in lines:
        if cur and len("\n".join([*cur, line])) > 1800:
            parts.append(cur)
            cur = []
        cur.append(line)
    parts.append(cur)
    for i, part in enumerate(parts, 1):
        (OUT / f"part-{i:02d}.txt").write_text("\n".join(part) + "\n", encoding="utf-8")
    print(f"{len(lines)} lines in {len(parts)} parts (each under 1800 characters) -> {OUT.relative_to(ROOT)}")


def apply(lang: str, path: str) -> None:
    key_map = json.loads((OUT / "key-map.json").read_text(encoding="utf-8"))
    en = dict(ui_rows())
    got: dict[int, str] = {}
    for line in Path(path).read_text(encoding="utf-8-sig").splitlines():
        if m := NUMBERED.match(line):
            got[int(m.group(1))] = m.group(2)
    target = LOCALES / f"{lang}.ts"
    text = target.read_text(encoding="utf-8")
    voice = json.loads(VOICE_JSON.read_text(encoding="utf-8")) if VOICE_JSON.exists() else {}
    changed, problems = 0, []
    for n, (kind, key) in enumerate(key_map, 1):
        if n not in got:
            continue
        value = got[n].strip().strip('"')
        if kind == "voice":
            voice.setdefault(key, [])
            if value and value not in voice[key]:
                voice[key].append(value)
            continue
        if sorted(PLACEHOLDER.findall(value)) != sorted(PLACEHOLDER.findall(en[key])):
            problems.append(f"{n}. {key}: needs {PLACEHOLDER.findall(en[key])}, got {PLACEHOLDER.findall(value)} -> kept old text")
            continue
        pattern = re.compile(rf'^(\s*){re.escape(key)}: "(?:[^"\\]|\\.)*",$', re.M)
        text, k = pattern.subn(lambda m: f"{m.group(1)}{key}: {json.dumps(value, ensure_ascii=False)},", text, count=1)
        changed += k
    target.write_text(text, encoding="utf-8")
    VOICE_JSON.write_text(json.dumps(voice, ensure_ascii=False, indent=1), encoding="utf-8")
    missing = [n for n in range(1, len(key_map) + 1) if n not in got]
    print(f"{lang}: {changed} UI strings updated, voice words saved. Lines found: {len(got)}/{len(key_map)}.")
    if missing:
        print(f"Missing numbers (kept old text): {missing[:40]}{' ...' if len(missing) > 40 else ''}")
    if problems:
        print("Placeholder problems:\n  " + "\n  ".join(problems))


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "make":
        make()
    elif len(sys.argv) == 4 and sys.argv[1] == "apply":
        apply(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
