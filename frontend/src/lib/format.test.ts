import { describe, expect, it } from "vitest";

import {
  daysBetween,
  entryMeta,
  formatINR,
  initials,
  reminderLink,
  timeAgo,
  upiLink,
  weekdayShort,
} from "./format";
import { type StringKey, translate } from "./i18n";

const tHinglish = (k: StringKey, v?: Record<string, string | number>) => translate("hinglish", k, v);
const tEn = (k: StringKey, v?: Record<string, string | number>) => translate("en", k, v);
const tHi = (k: StringKey, v?: Record<string, string | number>) => translate("hi", k, v);

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(125000)).toBe("₹1,25,000");
    expect(formatINR(1234567)).toBe("₹12,34,567");
    expect(formatINR(850)).toBe("₹850");
    expect(formatINR(0)).toBe("₹0");
  });

  it("puts the minus sign before the rupee symbol", () => {
    expect(formatINR(-500)).toBe("−₹500");
  });

  it("rounds to whole rupees", () => {
    expect(formatINR(99.6)).toBe("₹100");
  });
});

describe("timeAgo", () => {
  const now = new Date(2026, 10, 27, 18, 0);
  it.each([
    [new Date(2026, 10, 27, 17, 59, 40), "abhi"],
    [new Date(2026, 10, 27, 17, 30), "30 min pehle"],
    [new Date(2026, 10, 27, 9, 0), "9 ghante pehle"],
    [new Date(2026, 10, 26, 22, 0), "kal"],
    [new Date(2026, 10, 23, 12, 0), "4 din pehle"],
  ])("%s -> %s", (then, expected) => {
    expect(timeAgo(then.toISOString(), tHinglish, now)).toBe(expected);
  });

  it("speaks the chosen language", () => {
    const then = new Date(2026, 10, 23, 12, 0).toISOString();
    const now = new Date(2026, 10, 27, 18, 0);
    expect(timeAgo(then, tEn, now)).toBe("4 days ago");
    expect(timeAgo(then, tHi, now)).toBe("4 दिन पहले");
  });
});

describe("daysBetween", () => {
  it("counts calendar days, not 24h blocks", () => {
    expect(daysBetween(new Date(2026, 10, 26, 23, 59), new Date(2026, 10, 27, 0, 1))).toBe(1);
    expect(daysBetween(new Date(2026, 10, 27, 1), new Date(2026, 10, 27, 23))).toBe(0);
  });
});

describe("weekdayShort", () => {
  it("names the weekday in the chosen language", () => {
    expect(weekdayShort("2026-11-27", tHinglish)).toBe("Shukra");
    expect(weekdayShort("2026-11-29", tHinglish)).toBe("Ravi");
    expect(weekdayShort("2026-11-27", tEn)).toBe("Fri");
    expect(weekdayShort("2026-11-27", tHi)).toBe("शुक्र");
  });
});

describe("entryMeta", () => {
  it("colours money in, out and pending", () => {
    expect(entryMeta("sale", "cash").flow).toBe("in");
    expect(entryMeta("sale", "udhaar").flow).toBe("pending");
    expect(entryMeta("udhaar", null).flow).toBe("pending");
    expect(entryMeta("expense", "cash").flow).toBe("out");
    expect(entryMeta("owner_withdrawal", "cash").flow).toBe("out");
    expect(entryMeta("purchase", "cash").flow).toBe("out");
  });

  it("treats a payment to a supplier as money out", () => {
    expect(entryMeta("payment", "cash", "customer").flow).toBe("in");
    expect(entryMeta("payment", "cash", "supplier").flow).toBe("out");
  });

  it("returns a dictionary key, so labels follow the language", () => {
    expect(tEn(entryMeta("sale", "upi").label)).toBe("Sale · UPI");
    expect(tHinglish(entryMeta("payment", "cash").label)).toBe("Paise aaye · Cash");
    expect(tHi(entryMeta("expense", "cash").label)).toBe("खर्च");
  });
});

describe("reminderLink", () => {
  const upi = upiLink("shreeganesh.kirana@upi", "Shree Ganesh Kirana", 150);
  const message = tHinglish("reminderMsg", { name: "Ramesh", shop: "Shree Ganesh Kirana", x: formatINR(150), upi });
  const link = reminderLink("98765 00002", message);

  it("opens WhatsApp for the Indian number", () => {
    expect(link.startsWith("https://wa.me/919876500002?text=")).toBe(true);
  });

  it("includes the amount and a UPI link in the message", () => {
    const text = decodeURIComponent(link.split("text=")[1]);
    expect(text).toContain("Ramesh");
    expect(text).toContain("₹150");
    expect(text).toContain("upi://pay?pa=shreeganesh.kirana@upi");
    expect(text).toContain("am=150");
  });

  it("writes the reminder in the shopkeeper's language", () => {
    const hi = tHi("reminderMsg", { name: "रमेश", shop: "Shree Ganesh Kirana", x: "₹150", upi });
    expect(hi).toContain("बाकी है");
  });
});

describe("initials", () => {
  it("takes up to two initials", () => {
    expect(initials("Sharma ji")).toBe("SJ");
    expect(initials("Ramesh")).toBe("R");
    expect(initials("Gupta Distributors Pvt Ltd")).toBe("GD");
  });
});
