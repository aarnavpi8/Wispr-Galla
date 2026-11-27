"use client";

import { useEffect, useState } from "react";

import { CURRENCY_SCRIPTS, formatINRScript, GREETINGS, greetingKey } from "@/lib/i18n";

import { useLang } from "./language";

const STEP_MS = 330;
const HOLD_MS = 900; // how long the final, personal greeting stays
const DEMO_AMOUNT = 125000;

/**
 * Opening animation: "नमस्ते → Namaste → नमस्कार → Hello → …" with the same rupee amount
 * changing script underneath (₹१,२५,००० → ₹1,25,000 → …), then a time-of-day greeting
 * in the shopkeeper's own language. Tap anywhere to skip.
 */
export function Splash() {
  const { t, chosen, ready } = useLang();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  const total = GREETINGS.length; // step === total shows the final greeting

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const id = window.setTimeout(() => setGone(true), 600);
      return () => window.clearTimeout(id);
    }
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= total) {
          window.clearInterval(id);
          return s;
        }
        return s + 1;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [total]);

  useEffect(() => {
    if (step < total) return;
    const out = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const done = window.setTimeout(() => setGone(true), HOLD_MS + 500);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(done);
    };
  }, [step, total]);

  if (gone) return null;

  const final = step >= total;
  const g = GREETINGS[Math.min(step, total - 1)];
  // Before a language is chosen we don't know theirs, so greet in Hinglish.
  const finalText = ready ? `${t(greetingKey(new Date().getHours()))} 🙏` : "Namaste 🙏";

  return (
    <div
      role="presentation"
      onClick={() => {
        setLeaving(true);
        window.setTimeout(() => setGone(true), 450);
      }}
      className={`fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-forest-800 via-forest-900 to-forest-950 text-white ${
        leaving ? "splash-out" : ""
      }`}
    >
      <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full border-[40px] border-white/5" />
      <div aria-hidden className="absolute -bottom-32 -left-20 size-96 rounded-full bg-lime-300/10 blur-3xl" />

      <span className="mb-8 grid size-16 place-items-center rounded-3xl bg-lime-300 text-3xl font-black text-forest-950 shadow-2xl shadow-black/30">
        ₹
      </span>

      <div className="relative flex h-24 items-center justify-center px-6 text-center" aria-live="polite">
        <h1
          key={final ? "final" : step}
          lang={final ? undefined : g.lang}
          className="word-in text-5xl font-extrabold tracking-tight sm:text-6xl"
        >
          {final ? finalText : g.text}
        </h1>
      </div>

      <p
        key={`amt-${final ? "final" : step}`}
        className="word-in mt-2 font-mono text-2xl tabular-nums text-lime-300/90 [animation-delay:60ms]"
        aria-hidden
      >
        {formatINRScript(DEMO_AMOUNT, final ? "latn" : CURRENCY_SCRIPTS[step])}
      </p>

      <p className={`mt-10 text-sm text-white/60 transition-opacity duration-500 ${final ? "opacity-100" : "opacity-0"}`}>
        {chosen ? t("tagline") : "Galla · voice khata"}
      </p>

      <div className="absolute bottom-10 h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full origin-left rounded-full bg-lime-300"
          style={{ animation: `grow ${(total * STEP_MS + HOLD_MS) / 1000}s linear forwards` }}
        />
      </div>
    </div>
  );
}
