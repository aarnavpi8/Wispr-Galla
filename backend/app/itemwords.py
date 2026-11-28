"""Everyday shop words in five languages, so an item is found whatever the shopkeeper calls it.

Each group is one thing in English, Hinglish (Roman), Hindi (देवनागरी), Marathi (देवनागरी + Roman)
and Gujarati (ગુજરાતી + Roman). An item whose name or alias is any word of a group also answers
to every other word of that group: "khand", "साखर", "ખાંડ" and "shakkar" all find the "Cheeni" item.

Matches found only through this list count slightly less than the item's own name or aliases,
so a word the shopkeeper taught us (an alias saved after a correction) wins over a generic one,
and a word that fits several items ("dal", "tel") makes the card ask which one.

Native-speaker check pending for Gujarati and Marathi spellings (see CLAUDE.md D15).
"""

GROUPS: list[list[str]] = [
    # Staples
    ["sugar", "cheeni", "chini", "shakkar", "shakar", "चीनी", "शक्कर", "साखर", "sakhar", "ખાંડ", "khand"],
    ["rice", "chawal", "chaval", "चावल", "तांदूळ", "tandul", "ચોખા", "chokha"],
    ["wheat flour", "atta", "aata", "flour", "आटा", "गव्हाचे पीठ", "kanik", "कणीक", "ઘઉંનો લોટ", "લોટ"],
    ["gram flour", "besan", "बेसन", "ચણાનો લોટ", "chana lot"],
    ["refined flour", "maida", "मैदा", "મેંદો", "mendo"],
    ["semolina", "sooji", "suji", "rava", "rawa", "सूजी", "रवा", "રવો", "ravo"],
    ["flattened rice", "poha", "pohe", "पोहा", "पोहे", "પૌંઆ", "pauva"],
    ["salt", "namak", "नमक", "मीठ", "meeth", "મીઠું", "mithu"],
    ["jaggery", "gud", "gur", "गुड़", "गुड", "गूळ", "gool", "ગોળ", "gol"],
    ["oil", "tel", "तेल", "તેલ", "cooking oil"],
    ["mustard oil", "sarson tel", "sarso tel", "सरसों तेल", "मोहरीचे तेल", "રાયનું તેલ"],
    ["ghee", "घी", "तूप", "toop", "ઘી"],
    ["lentils", "dal", "daal", "दाल", "डाळ", "દાળ"],
    ["pigeon pea", "toor dal", "tuvar dal", "arhar dal", "तूर दाल", "तूरडाळ", "તુવેર દાળ"],
    ["green gram", "moong dal", "mung dal", "मूंग दाल", "मूगडाळ", "મગની દાળ"],
    ["chickpeas", "chana", "chole", "चना", "हरभरा", "harbhara", "ચણા"],
    ["peanuts", "moongfali", "mungfali", "मूंगफली", "शेंगदाणे", "shengdane", "મગફળી", "magfali"],
    # Spices
    ["turmeric", "haldi", "हल्दी", "हळद", "halad", "હળદર", "haldar"],
    ["chilli powder", "mirchi", "lal mirch", "मिर्च", "मिरची", "તીખું", "marchu", "મરચું"],
    ["coriander", "dhaniya", "dhania", "धनिया", "कोथिंबीर", "kothimbir", "ધાણા", "dhana"],
    ["cumin", "jeera", "jira", "जीरा", "जिरे", "jire", "જીરું", "jiru"],
    ["tea", "chai patti", "chai", "chaipatti", "चाय पत्ती", "चाय", "चहा", "chaha", "ચા"],
    # Dairy and eggs
    ["milk", "doodh", "dudh", "दूध", "દૂધ"],
    ["curd", "dahi", "yogurt", "दही", "દહીં"],
    ["butter", "makhan", "मक्खन", "लोणी", "loni", "માખણ", "makhhan"],
    ["cottage cheese", "paneer", "पनीर", "પનીર"],
    ["eggs", "egg", "anda", "ande", "अंडा", "अंडे", "अंडी", "andi", "ઈંડા", "inda"],
    ["bread", "pav", "पाव", "ब्रेड", "બ્રેડ", "પાઉં"],
    # Vegetables
    ["onion", "pyaz", "pyaaz", "kanda", "प्याज", "कांदा", "ડુંગળી", "dungli"],
    ["potato", "aloo", "alu", "batata", "आलू", "बटाटा", "બટાકા", "bataka"],
    ["tomato", "tamatar", "टमाटर", "टोमॅटो", "ટામેટા", "tameta"],
    ["green chilli", "hari mirch", "हरी मिर्च", "हिरवी मिरची", "લીલું મરચું"],
    ["ginger", "adrak", "अदरक", "आले", "aale", "આદુ", "aadu"],
    ["garlic", "lehsun", "lahsun", "लहसुन", "लसूण", "lasun", "લસણ", "lasan"],
    # Household
    ["soap", "sabun", "साबुन", "साबण", "saban", "સાબુ", "sabu"],
    ["detergent", "washing powder", "surf", "कपड़े धोने का पाउडर", "ધોવાનો પાવડર"],
    ["matchbox", "machis", "maachis", "माचिस", "काडेपेटी", "kadepeti", "દીવાસળી", "divasali"],
    ["biscuit", "biscuits", "biskut", "बिस्कुट", "बिस्किट", "બિસ્કિટ"],
    ["water bottle", "paani bottle", "पानी की बोतल", "पाण्याची बाटली", "પાણીની બોટલ"],
]


def _norm(w: str) -> str:
    return " ".join(w.lower().replace("-", " ").split())


# word -> every word of its group(s)
_LOOKUP: dict[str, set[str]] = {}
for _g in GROUPS:
    words = {_norm(w) for w in _g}
    for _w in words:
        _LOOKUP.setdefault(_w, set()).update(words)


def synonyms(word: str) -> set[str]:
    """Other names for one word or phrase (empty if we know none)."""
    return _LOOKUP.get(_norm(word), set()) - {_norm(word)}


def expanded_names(names: list[str]) -> list[str]:
    """Extra names an item answers to, from its own name/aliases: the whole phrase and each word.

    "Toor dal" gives the toor-dal group and, through "dal", the general lentil words too.
    """
    own = {_norm(n) for n in names if n}
    extra: set[str] = set()
    for n in own:
        extra |= synonyms(n)
        for word in n.split():
            if len(word) >= 3 and word in _LOOKUP:
                extra |= synonyms(word) | {word}
    return sorted(extra - own)
