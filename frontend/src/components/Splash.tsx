"use client";

import { useCallback, useEffect, useState } from "react";

import { GREETINGS, greetingKey } from "@/lib/i18n";

import { useAuth } from "./auth";
import { useLang } from "./language";
import { LogoMark } from "./Logo";

const STEP_MS = 330;
const HOLD_MS = 1000; // how long the final, personal greeting stays

/**
 * Opening animation: "नमस्ते → Namaste → नमस्कार → Hello → …", then a time-of-day greeting
 * in the shopkeeper's own language (with their first name once signed in).
 * Plays on every app open and again right after signing in. Tap, Enter or Esc skips it.
 */
export function Splash({ name }: { name?: string }) {
  const { t, ready } = useLang();
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  const total = GREETINGS.length; // step === total shows the final greeting

  const skip = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => setGone(true), 450);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const id = window.setTimeout(() => setGone(true), 900);
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

  useEffect(() => {
    if (gone) return;
    const keys = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "Enter") && skip();
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [gone, skip]);

  if (gone) return null;

  const final = step >= total;
  const g = GREETINGS[Math.min(step, total - 1)];
  // Before a language is chosen we don't know theirs, so greet in Hinglish.
  const hello = ready ? t(greetingKey(new Date().getHours())) : "Namaste";
  const finalText = `${hello}${name ? `, ${name}` : ""} 🙏`;

  return (
    <div
      role="presentation"
      onClick={skip}
      className={`fixed inset-0 z-[90] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-forest-800 via-forest-900 to-forest-950 text-white ${
        leaving ? "splash-out" : ""
      }`}
    >
      <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full border-[40px] border-white/5 lg:size-[36rem] lg:border-[64px]" />
      <div aria-hidden className="absolute -bottom-32 -left-20 size-96 rounded-full bg-lime-300/10 blur-3xl lg:size-[40rem]" />

      <span aria-hidden className="mb-8 grid size-24 place-items-center rounded-[28px] bg-white/10 ring-1 ring-white/15 backdrop-blur lg:size-28">
        <LogoMark size={72} variant="bare" />
      </span>

      <div className="relative flex min-h-28 items-center justify-center px-6 text-center" aria-live="polite">
        <h1
          key={final ? "final" : step}
          lang={final ? undefined : g.lang}
          className="word-in text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl"
        >
          {final ? finalText : g.text}
        </h1>
      </div>

      <div aria-hidden className="absolute bottom-10 h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full origin-left rounded-full bg-lime-300"
          style={{ animation: `grow ${(total * STEP_MS + HOLD_MS) / 1000}s linear forwards` }}
        />
      </div>
    </div>
  );
}

/** Plays the splash on app open, and once more after every successful sign-in. */
export function SplashGate() {
  const { loginCount, user } = useAuth();
  return <Splash key={loginCount} name={loginCount > 0 ? user?.name.split(" ")[0] : undefined} />;
}
