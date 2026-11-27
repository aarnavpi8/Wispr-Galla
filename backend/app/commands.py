"""Voice commands: anything the shopkeeper can tap, they can also say, in any of the 12 languages.

    "Din band karo" / "દિવસ બંધ કરો" / "நாளை முடி"   -> day_close
    "Ramesh ka hisaab"                              -> show_khata (Ramesh)
    "Ramesh ko reminder bhejo"                      -> send_reminder (Ramesh)
    "Stock dikhao" / "স্টক দেখাও" / "ಸ್ಟಾಕ್ ತೋರಿಸಿ"   -> show_stock
    "Galat ho gaya" / "తప్పు అయింది"                 -> undo_last

Checked before entry extraction. A sentence with an amount in it is an entry, not a command
("Ramesh ko 200 udhaar"), except undo, which never carries an amount. With an LLM key, the
LLM gets a second chance at sentences the rules don't recognise (app/llm.py).

Matching: Latin words must be whole words. Indian-script words match anywhere, because
Tamil, Telugu, Kannada and Malayalam (and others) glue case endings onto words.
"""

import re

from app.models import Party

# Order matters: the first matching command wins (more specific ones first).
COMMAND_WORDS: list[tuple[str, list[str]]] = [
    ("undo_last", [
        "galat ho gaya", "galat hua", "galti ho gayi", "undo", "pichla hatao", "pichli entry hatao", "cancel last",
        "गलत हो गया", "गलती हो गई", "पिछला हटाओ", "चूक झाली", "चुकलं",
        "ભૂલ થઈ", "પાછું લો", "ਗਲਤੀ ਹੋ ਗਈ", "ਗਲਤ ਹੋ ਗਿਆ", "ਵਾਪਸ ਲਓ", "ভুল হয়ে গেছে", "ভুল হয়েছে", "ফিরিয়ে নাও",
        "ଭୁଲ ହୋଇଗଲା", "ଫେରାନ୍ତୁ", "தவறு", "திரும்பப் பெறு", "తప్పు అయింది", "తప్పైంది", "వెనక్కి తీసుకో",
        "ತಪ್ಪಾಯಿತು", "ಹಿಂಪಡೆ", "തെറ്റി", "തിരിച്ചെടുക്കുക",
    ]),
    ("send_reminder", [
        "reminder", "yaad dilao", "yaad dila do", "tagada", "remind", "याद दिलाओ", "याद दिला दो", "रिमाइंडर",
        "आठवण करून द्या", "आठवण", "યાદ અપાવો", "રિમાઇન્ડર", "ਯਾਦ ਕਰਵਾਓ", "ਰਿਮਾਈਂਡਰ", "মনে করিয়ে দাও", "রিমাইন্ডার",
        "ମନେ ପକାନ୍ତୁ", "ରିମାଇଣ୍ଡର", "நினைவூட்டு", "நினைவூட்டல்", "గుర్తుచేయి", "గుర్తు చేయి", "రిమైండర్",
        "ನೆನಪಿಸಿ", "ಜ್ಞಾಪನೆ", "ഓർമ്മിപ്പിക്കുക", "ഓർമ്മപ്പെടുത്തൽ",
    ]),
    ("day_close", [
        "din band", "dukaan band", "dukan band", "close the day", "close day", "end of day", "galla gin",
        "galla milao", "hisaab milao", "दिन बंद", "दुकान बंद", "गल्ला गिन", "दिवस बंद", "गल्ला मोजा",
        "દિવસ બંધ", "દુકાન બંધ", "ਦਿਨ ਬੰਦ", "ਦੁਕਾਨ ਬੰਦ", "দিন বন্ধ", "দোকান বন্ধ", "ଦିନ ବନ୍ଦ", "ଦୋକାନ ବନ୍ଦ",
        "நாளை முடி", "நாள் முடிவு", "கடையை மூடு", "கடை மூடு", "రోజు ముగించు", "రోజు ముగింపు", "దుకాణం మూసి",
        "ದಿನ ಮುಗಿಸಿ", "ಅಂಗಡಿ ಮುಚ್ಚು", "ദിവസം അവസാനിപ്പിക്കുക", "കട അടയ്ക്കുക",
    ]),
    ("scan_bill", [
        "bill scan", "scan bill", "bill padho", "bill ki photo", "scan karo", "बिल स्कैन", "बिल पढ़ो", "बिल स्कॅन",
        "બિલ સ્કેન", "ਬਿੱਲ ਸਕੈਨ", "বিল স্ক্যান", "ବିଲ ସ୍କାନ", "பில் ஸ்கேன்", "బిల్ స్కాన్", "ಬಿಲ್ ಸ್ಕ್ಯಾನ್", "ബിൽ സ്കാൻ",
    ]),
    ("add_item", [
        "naya item", "naya saman", "naya maal jodo", "new item", "add item", "item jodo", "नया आइटम", "नया सामान",
        "नवीन वस्तू", "નવી વસ્તુ", "ਨਵਾਂ ਆਈਟਮ", "ਨਵੀਂ ਚੀਜ਼", "নতুন জিনিস", "ନୂଆ ଜିନିଷ", "புதிய பொருள்",
        "కొత్త వస్తువు", "ಹೊಸ ವಸ್ತು", "പുതിയ ഇനം",
    ]),
    ("show_stock", [
        "stock dikhao", "stock batao", "maal dikhao", "maal kitna", "kitna maal", "inventory", "show stock",
        "स्टॉक दिखाओ", "माल दिखाओ", "स्टॉक दाखवा", "माल दाखवा", "સ્ટોક બતાવો", "માલ બતાવો", "ਸਟਾਕ ਵਿਖਾਓ",
        "ਸਟਾਕ ਦਿਖਾਓ", "স্টক দেখাও", "ଷ୍ଟକ ଦେଖାନ୍ତୁ", "ஸ்டாக்", "சரக்கு காட்டு", "స్టాక్", "సరుకు చూపించు",
        "ಸ್ಟಾಕ್", "ಸರಕು ತೋರಿಸಿ", "സ്റ്റോക്ക്", "സാധനം കാണിക്കുക",
    ]),
    ("show_accounts", [
        "hisaab kitaab", "hisab kitab", "lena dena", "kitna lena", "kitna dena", "accounts", "show accounts",
        "हिसाब-किताब", "हिसाब किताब", "लेना देना", "हिशोब", "હિસાબ-કિતાબ", "હિસાબ કિતાબ", "ਹਿਸਾਬ-ਕਿਤਾਬ",
        "ਹਿਸਾਬ ਕਿਤਾਬ", "হিসাব-নিকাশ", "হিসাব নিকাশ", "ହିସାବ-କିତାବ", "ହିସାବ କିତାବ", "வரவு-செலவு", "வரவு செலவு",
        "లెక్కాపత్రం", "ಲೆಕ್ಕಪತ್ರ", "വരവ്-ചെലവ്", "വരവ് ചെലവ്",
    ]),
    ("show_entries", [
        "aaj ki entries", "entries dikhao", "sab entries", "show entries", "aaj ka hisaab", "आज की एंट्री",
        "आजच्या नोंदी", "આજની એન્ટ્રી", "ਅੱਜ ਦੀਆਂ ਐਂਟਰੀਆਂ", "আজকের এন্ট্রি", "ଆଜିର ଏଣ୍ଟ୍ରି", "இன்றைய பதிவு",
        "ఈరోజు ఎంట్రీలు", "ಇಂದಿನ ನಮೂದು", "ഇന്നത്തെ എൻട്രി",
    ]),
    ("change_language", [
        "bhasha badlo", "bhasha badal", "language change", "change language", "भाषा बदलो", "भाषा बदला",
        "ભાષા બદલો", "ਭਾਸ਼ਾ ਬਦਲੋ", "ভাষা বদলাও", "ভাষা বদলান", "ଭାଷା ବଦଳାନ୍ତୁ", "மொழியை மாற்று", "மொழி மாற்று",
        "భాష మార్చు", "ಭಾಷೆ ಬದಲಿಸಿ", "ഭാഷ മാറ്റുക",
    ]),
    ("help", [
        "madad", "help", "kaise chalaye", "kaise chalayein", "kaise use", "how to use", "samjhao", "मदद",
        "कैसे चलाएं", "कैसे चलाएँ", "मदत", "મદદ", "ਮਦਦ", "সাহায্য", "ସାହାଯ୍ୟ", "உதவி", "సహాయం", "ಸಹಾಯ", "സഹായം",
    ]),
]
# "<name> ka hisaab / khata" opens that person's khata.
KHATA_WORDS = [
    "ka hisaab", "ka hisab", "ka khata", "ki khata", "ke hisaab", "ka account", "khata dikhao", "khata kholo",
    "का हिसाब", "का खाता", "चा हिशोब", "चे खाते", "નું ખાતું", "નો હિસાબ", "ਦਾ ਖਾਤਾ", "ਦਾ ਹਿਸਾਬ", "এর খাতা",
    "র খাতা", "এর হিসাব", "ଙ୍କ ଖାତା", "ର ଖାତା", "கணக்கேடு", "கணக்கு காட்டு", "ఖాతా", "లెక్క చూపించు",
    "ಖಾತೆ", "ಲೆಕ್ಕ ತೋರಿಸಿ", "ഖാത", "കണക്ക് കാണിക്കുക",
]

INDIC = re.compile(r"[ऀ-෿]")


def _has(text: str, words: list[str]) -> bool:
    for w in words:
        if INDIC.search(w):
            if w in text:  # Indian scripts: anywhere (case endings are glued on)
                return True
        elif re.search(rf"(?<![\wऀ-෿]){re.escape(w)}(?![\wऀ-෿])", text):
            return True
    return False


def detect_command(text: str, parties: list[Party], match_party) -> tuple[str, Party | None, float] | None:
    """(command, party or None, party confidence) when the sentence is a command, else None."""
    t = text.lower().strip()
    has_amount = bool(re.search(r"\d", t))  # \d also covers Gujarati, Tamil, Bengali... digits
    for cmd, words in COMMAND_WORDS:
        if _has(t, words) and (cmd == "undo_last" or not has_amount):
            party, conf = None, 0.0
            if cmd == "send_reminder":
                party, conf, _ = match_party(text, parties)
            return cmd, party, conf
    if not has_amount and _has(t, KHATA_WORDS):
        party, conf, _ = match_party(text, parties)
        return "show_khata", party, conf
    return None


COMMANDS = [c for c, _ in COMMAND_WORDS] + ["show_khata"]


def _merge_translated_words() -> None:
    """Phrases added by translators (scripts/translations.py import -> voice_words.json)."""
    import json
    from pathlib import Path

    path = Path(__file__).with_name("voice_words.json")
    if not path.exists():
        return
    data: dict[str, list[str]] = json.loads(path.read_text(encoding="utf-8"))
    for cmd, words in COMMAND_WORDS:
        words.extend(w for w in data.get(cmd, []) if w and w not in words)
    KHATA_WORDS.extend(w for w in data.get("show_khata", []) if w and w not in KHATA_WORDS)


_merge_translated_words()
