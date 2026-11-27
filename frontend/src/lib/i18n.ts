import { bn } from "./locales/bn";
import { en, type Locale, type StringKey } from "./locales/en";
import { gu } from "./locales/gu";
import { hi } from "./locales/hi";
import { hinglish } from "./locales/hinglish";
import { kn } from "./locales/kn";
import { ml } from "./locales/ml";
import { mr } from "./locales/mr";
import { or } from "./locales/or";
import { pa } from "./locales/pa";
import { ta } from "./locales/ta";
import { te } from "./locales/te";


// UI language. Shopkeepers pick it on first open; it is saved on the phone (localStorage).
// Entries themselves can be spoken in any language; this only changes the app's own words.
// The words themselves live in ./locales/<code>.ts, one file per language.
// Languages other than Hindi, Hinglish, English and Marathi need a native-speaker review.

export type Lang = "hi" | "hinglish" | "en" | "mr" | "gu" | "pa" | "bn" | "ta" | "te" | "kn" | "ml" | "or";

export const LANGS: { code: Lang; name: string; english: string; speech: string }[] = [
  { code: "hi", name: "हिंदी", english: "Hindi", speech: "hi-IN" },
  { code: "hinglish", name: "Hinglish", english: "Hindi in English letters", speech: "hi-IN" },
  { code: "en", name: "English", english: "English", speech: "en-IN" },
  { code: "mr", name: "मराठी", english: "Marathi", speech: "mr-IN" },
  { code: "gu", name: "ગુજરાતી", english: "Gujarati", speech: "gu-IN" },
  { code: "pa", name: "ਪੰਜਾਬੀ", english: "Punjabi", speech: "pa-IN" },
  { code: "bn", name: "বাংলা", english: "Bengali", speech: "bn-IN" },
  { code: "or", name: "ଓଡ଼ିଆ", english: "Odia", speech: "or-IN" },
  { code: "ta", name: "தமிழ்", english: "Tamil", speech: "ta-IN" },
  { code: "te", name: "తెలుగు", english: "Telugu", speech: "te-IN" },
  { code: "kn", name: "ಕನ್ನಡ", english: "Kannada", speech: "kn-IN" },
  { code: "ml", name: "മലയാളം", english: "Malayalam", speech: "ml-IN" },
];

/** Greeting words for the opening animation, cycled Google-style. */
export const GREETINGS: { text: string; lang: string }[] = [
  { text: "नमस्ते", lang: "hi" },
  { text: "Namaste", lang: "en" },
  { text: "नमस्कार", lang: "mr" },
  { text: "Hello", lang: "en" },
  { text: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", lang: "pa" },
  { text: "નમસ્તે", lang: "gu" },
  { text: "வணக்கம்", lang: "ta" },
  { text: "নমস্কার", lang: "bn" },
];

/** "Money" in many Indian languages, flickered above the language picker. */
export const MONEY_WORDS: { text: string; lang: string }[] = [
  { text: "पैसा", lang: "hi" },
  { text: "Money", lang: "en" },
  { text: "पैसे", lang: "mr" },
  { text: "Paisa", lang: "en" },
  { text: "ਪੈਸਾ", lang: "pa" },
  { text: "પૈસા", lang: "gu" },
  { text: "பணம்", lang: "ta" },
  { text: "টাকা", lang: "bn" },
  { text: "డబ్బు", lang: "te" },
  { text: "ಹಣ", lang: "kn" },
  { text: "പണം", lang: "ml" },
  { text: "ଟଙ୍କା", lang: "or" },
];

export type { StringKey };

/** Every language has every key; the `Locale` type makes a missing word a type error. */
export const LOCALES: Record<Lang, Locale> = { en, hinglish, hi, mr, gu, pa, bn, or, ta, te, kn, ml };

export function translate(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  let s = LOCALES[lang]?.[key] ?? en[key];
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** BCP-47 code for speech recognition / read-aloud in this language. */
export function speechCode(lang: Lang): string {
  return LANGS.find((l) => l.code === lang)?.speech ?? "hi-IN";
}

export function greetingKey(hour: number): StringKey {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
