"use client";

import { useEffect, useState } from "react";

import { type StringKey, speechCode } from "@/lib/i18n";
import { canSpeak, readAloud, stopSpeaking } from "@/lib/speak";

import { useLang } from "./language";
import { Portal } from "./Portal";

/** 🔊 button that reads a text aloud in the chosen language. */
export function ListenButton({ text, className = "" }: { text: string; className?: string }) {
  const { t, lang } = useLang();
  const [on, setOn] = useState(false);
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOn(true);
        readAloud(text, speechCode(lang));
        window.setTimeout(() => setOn(false), Math.min(12000, 1500 + text.length * 60));
      }}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full bg-mint-100 px-4 font-semibold text-forest-900 transition hover:bg-leaf-300 active:scale-95 ${className}`}
    >
      <span aria-hidden className={on ? "animate-pulse" : ""}>
        🔊
      </span>
      {t("listen")}
    </button>
  );
}

/**
 * A small "?" next to a money word. Tapping it explains the word in plain language, with an
 * example, and can read it aloud. Made for people who have never used an accounts app.
 */
export function HelpTip({
  title,
  body,
  tone = "light",
}: {
  title: StringKey;
  body: StringKey;
  tone?: "light" | "dark";
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("keydown", esc);
      stopSpeaking();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={`${t("whatIsThis")} ${t(title)}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition hover:scale-110 active:scale-95 ${
          tone === "dark"
            ? "bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25"
            : "bg-forest-900/8 text-forest-800 ring-1 ring-forest-800/20 hover:bg-mint-100"
        }`}
      >
        ?
      </button>
      {open && (
        <Portal>
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal aria-label={t(title)}>
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-forest-950/40 backdrop-blur-[2px]"
          />
          <div className="animate-pop relative w-full max-w-sm rounded-[28px] bg-surface p-5 text-left text-forest-950 shadow-2xl">
            <div className="flex items-center gap-2">
              <span aria-hidden className="grid size-9 place-items-center rounded-full bg-lime-300 text-lg">
                💡
              </span>
              <h3 className="text-lg font-bold">{t(title)}</h3>
            </div>
            <p className="mt-3 text-base leading-relaxed text-forest-950/85">{t(body)}</p>
            <div className="mt-4 flex gap-2">
              <ListenButton text={`${t(title)}. ${t(body)}`} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 flex-1 rounded-full bg-forest-900 font-semibold text-white transition hover:bg-forest-800 active:scale-95"
              >
                {t("gotIt")}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}

/** Colour key used across the app: green = in, red = out, amber = still pending. */
export function ColorLegend({ className = "" }: { className?: string }) {
  const { t } = useLang();
  const items = [
    { cls: "bg-mint-100 text-money-in", icon: "↓", label: t("legendIn") },
    { cls: "bg-red-50 text-money-out", icon: "↑", label: t("legendOut") },
    { cls: "bg-amber-50 text-pending", icon: "⏳", label: t("legendPending") },
  ];
  return (
    <ul className={`flex flex-wrap gap-1.5 text-xs font-semibold ${className}`} aria-label="Colours">
      {items.map((i) => (
        <li key={i.label} className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${i.cls}`}>
          <span aria-hidden>{i.icon}</span>
          {i.label}
        </li>
      ))}
    </ul>
  );
}
