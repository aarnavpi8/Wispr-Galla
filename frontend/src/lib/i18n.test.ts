import { describe, expect, it } from "vitest";

import { LANGS, LOCALES, translate } from "./i18n";
import { en } from "./locales/en";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("every language is complete", () => {
  const keys = Object.keys(en) as (keyof typeof en)[];

  it("has a dictionary for every language in the picker", () => {
    expect(Object.keys(LOCALES).sort()).toEqual(LANGS.map((l) => l.code).sort());
  });

  it.each(Object.entries(LOCALES))("%s has every key, non-empty, with the same {placeholders}", (code, dict) => {
    for (const key of keys) {
      const value = dict[key];
      expect(value, `${code}.${key} missing`).toBeTruthy();
      expect(placeholders(value), `${code}.${key} placeholders`).toEqual(placeholders(en[key]));
    }
    expect(Object.keys(dict).sort(), `${code} has extra keys`).toEqual([...keys].sort());
  });

  it("non-English languages are actually translated (not English copied over)", () => {
    // A few words that must differ from English in every other language.
    const mustDiffer = ["start", "chooseLanguage", "receivable", "payable", "closeDay", "tourDone"] as const;
    for (const [code, dict] of Object.entries(LOCALES)) {
      if (code === "en") continue;
      for (const k of mustDiffer) expect(dict[k], `${code}.${k}`).not.toBe(en[k]);
    }
  });
});

describe("translate", () => {
  it("fills every occurrence of a variable", () => {
    expect(translate("en", "tourStep", { i: 2, n: 6 })).toBe("2 of 6");
    expect(translate("hi", "short", { x: "₹200" })).toBe("₹200 कम है");
  });
});
