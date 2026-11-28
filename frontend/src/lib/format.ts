import type { Lang, StringKey } from "./i18n";
import type { EntryType, Item, Mode } from "./types";

/** Each language's own digits (Hindi १२३, Bengali ১২৩, Tamil ௧௨௩ ...). English and Hinglish keep 123. */
const DIGITS: Partial<Record<Lang, string>> = {
  hi: "deva",
  mr: "deva",
  gu: "gujr",
  pa: "guru",
  bn: "beng",
  or: "orya",
  ta: "tamldec",
  te: "telu",
  kn: "knda",
  ml: "mlym",
};

const formatters = new Map<Lang, Intl.NumberFormat>();
function numberFormat(lang: Lang): Intl.NumberFormat {
  let f = formatters.get(lang);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, numberingSystem: DIGITS[lang] ?? "latn" });
    formatters.set(lang, f);
  }
  return f;
}

// The app's language, set by the LanguageProvider, so every number on screen follows it.
let screenLang: Lang = "hinglish";
export function setNumberLanguage(lang: Lang) {
  screenLang = lang;
}

/** A count or quantity in the screen language's digits, Indian grouping: १,२५,००० / 2.5. */
export function formatNumber(n: number, lang: Lang = screenLang): string {
  return numberFormat(lang).format(n);
}

/** ₹1,25,000 (Indian grouping, the language's digits). Negative amounts keep the sign in front of ₹. */
export function formatINR(amount: number, lang: Lang = screenLang): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}₹${formatNumber(Math.abs(Math.round(amount)), lang)}`;
}

/** Whole calendar days from a to b (local time). */
/** Colour for the galla balance: red when it is below zero, green above, plain at ₹0. */
export function balanceTone(amount: number): string {
  return amount < 0 ? "text-money-out" : amount > 0 ? "text-balance-up" : "text-ink-950";
}

export function daysBetween(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

/** "just now", "5 min ago", "3 hr ago", "yesterday", "4 days ago" in the chosen language. */
export function timeAgo(iso: string, t: T, now: Date = new Date()): string {
  const then = new Date(iso);
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return t("minsAgo", { n: mins });
  const days = daysBetween(then, now);
  if (days === 0) return t("hoursAgo", { n: Math.floor(mins / 60) });
  if (days === 1) return t("yesterday");
  return t("daysAgo", { n: days });
}

/** Short weekday for chart labels, in the chosen language. */
export function weekdayShort(isoDate: string, t: T): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return t(`wd${new Date(y, m - 1, d).getDay()}` as StringKey);
}

export type Flow = "in" | "out" | "pending";

export interface EntryMeta {
  label: StringKey;
  icon: string;
  flow: Flow;
}

/** How each entry type is shown: label key, emoji icon, and money direction (colour). */
export function entryMeta(
  type: EntryType,
  mode: Mode | null,
  partyKind?: "customer" | "supplier",
): EntryMeta {
  switch (type) {
    case "sale":
      if (mode === "udhaar") return { label: "eSaleUdhaar", icon: "🧾", flow: "pending" };
      return { label: mode === "upi" ? "eSaleUpi" : "eSaleCash", icon: "🛒", flow: "in" };
    case "udhaar":
      return { label: "eUdhaar", icon: "📒", flow: "pending" };
    case "payment":
      if (partyKind === "supplier") return { label: "ePaidSupplier", icon: "🤝", flow: "out" };
      return { label: mode === "upi" ? "ePaidUpi" : "ePaidCash", icon: "💰", flow: "in" };
    case "purchase":
      return { label: "ePurchase", icon: "📦", flow: "out" };
    case "expense":
      return { label: "eExpense", icon: "💡", flow: "out" };
    case "owner_withdrawal":
      return { label: "eWithdrawal", icon: "🏠", flow: "out" };
    case "bill_item":
      return { label: "eBillItem", icon: "🧺", flow: "in" };
    default:
      return { label: "eCommand", icon: "⚡", flow: "pending" };
  }
}

export const FLOW_TEXT: Record<Flow, string> = {
  in: "text-money-in",
  out: "text-money-out",
  pending: "text-pending",
};

export const FLOW_SIGN: Record<Flow, string> = { in: "+", out: "−", pending: "" };

/** UPI payment link for the shop, with the amount filled in. */
export function upiLink(vpa: string, shopName: string, amount: number): string {
  return `upi://pay?pa=${vpa}&pn=${encodeURIComponent(shopName)}&am=${amount}&cu=INR`;
}

/** WhatsApp reminder draft. Opens WhatsApp; the shopkeeper reviews it and taps Send. */
export function reminderLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

/** Initials for avatars: "Sharma ji" -> "SJ", "Ramesh" -> "R". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** "Parle-G · chhota", or just the name when there is no variant. */
export function itemLabel(i: Pick<Item, "name" | "variant">): string {
  return i.variant ? `${i.name} · ${i.variant}` : i.name;
}

/** Stock fill relative to a comfortable level (3× the alert level). */
export function stockLevel(i: Pick<Item, "stock" | "low_stock_at">): number {
  const comfy = Math.max(i.low_stock_at * 3, 1);
  return Math.max(0, Math.min(1, i.stock / comfy));
}
