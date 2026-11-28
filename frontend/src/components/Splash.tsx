"use client";

import { useCallback, useEffect, useState } from "react";

import { GREETINGS, greetingKey } from "@/lib/i18n";

import { useAuth } from "./auth";
import { useLang } from "./language";

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
  const finalText = `${hello}${name ? `, ${name}` : ""}`;

  return (
    <div
      role="presentation"
      onClick={skip}
      className={`fixed inset-0 z-[90] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-iris-100 via-background to-gold-100 text-ink-950 ${
        leaving ? "splash-out" : ""
      }`}
    >
      <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full border-[40px] border-iris-300/20 lg:size-[36rem] lg:border-[64px]" />
      <div aria-hidden className="absolute -bottom-32 -left-20 size-96 rounded-full bg-gold-300/25 blur-3xl lg:size-[40rem]" />

      {/* A voice, softly speaking: five bars rising and falling (BolKhata = "speak the khata"). */}
      <span aria-hidden className="mb-10 flex h-12 items-center gap-1.5">
        {[0.45, 0.75, 1, 0.7, 0.4].map((h, i) => (
          <span
            key={i}
            className={`voice-bar w-2 rounded-full ${i === 2 ? "bg-gold-300" : "bg-brand-500/70"}`}
            style={{ height: `${h * 100}%`, animationDelay: `${i * 0.12}s` }}
          />
        ))}
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

      <div aria-hidden className="absolute bottom-10 h-1 w-40 overflow-hidden rounded-full bg-ink-950/10">
        <div
          className="h-full origin-left rounded-full bg-gold-300"
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
