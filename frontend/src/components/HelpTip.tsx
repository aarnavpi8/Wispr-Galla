"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useDialog } from "@/hooks/useDialog";

import { type StringKey, speechCode } from "@/lib/i18n";
import { canSpeak, isSpeaking, readAloud, stopSpeaking } from "@/lib/speak";

import { useLang } from "./language";
import { Portal } from "./Portal";

/**
 * 🔊 button that reads a text aloud in the chosen language. Tap again to stop. Its speech
 * stops by itself when the button goes away (card closed, next tour step, next help card).
 */
export function ListenButton({ text, className = "" }: { text: string; className?: string }) {
  const { t, lang } = useLang();
  const [on, setOn] = useState(false);
  const token = useRef(0);

  // Leaving the screen (or the text changing) silences this button's speech.
  useEffect(() => {
    return () => {
      stopSpeaking(token.current);
      token.current = 0;
    };
  }, [text]);

  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        if (on && isSpeaking(token.current)) {
          stopSpeaking(token.current);
          return;
        }
        setOn(true);
        token.current = readAloud(text, speechCode(lang), () => setOn(false));
      }}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-semibold transition active:scale-95 ${
        on ? "bg-brand-600 text-white" : "bg-iris-100 text-ink-900 hover:bg-iris-300"
      } ${className}`}
    >
      <span aria-hidden className={on ? "animate-pulse" : ""}>
        {on ? "■" : "🔊"}
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

  return (
    <>
      <button
        type="button"
        aria-label={`${t("whatIsThis")} ${t(title)}`}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        // 24px to look at, 44px to tap (the invisible ::before ring).
        className={`relative inline-grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition before:absolute before:-inset-2.5 before:content-[''] hover:scale-110 active:scale-95 ${
          tone === "dark"
            ? "bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25"
            : "bg-ink-900/8 text-ink-800 ring-1 ring-brand-600/20 hover:bg-iris-100"
        }`}
      >
        ?
      </button>
      {open && <HelpDialog title={title} body={body} onClose={() => setOpen(false)} />}
    </>
  );
}

function HelpDialog({ title, body, onClose }: { title: StringKey; body: StringKey; onClose: () => void }) {
  const { t } = useLang();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(panel, onClose);
  // Closing (or opening another card) silences this one.
  useEffect(() => () => stopSpeaking(), []);

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal aria-labelledby={titleId}>
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("close")}
          onClick={onClose}
          className="absolute inset-0 bg-ink-950/25 backdrop-blur-[3px]"
        />
        <div ref={panel} className="animate-pop relative w-full max-w-sm rounded-[28px] bg-surface p-5 text-left text-ink-950 shadow-2xl sm:max-w-md sm:p-6">
          <div className="flex items-center gap-2">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-gold-300 text-lg">
              💡
            </span>
            <h3 id={titleId} className="text-lg font-bold">
              {t(title)}
            </h3>
          </div>
          <p className="mt-3 text-base leading-relaxed text-ink-950/85">{t(body)}</p>
          <div className="mt-4 flex gap-2">
            <ListenButton text={`${t(title)}. ${t(body)}`} />
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className="min-h-11 flex-1 rounded-full bg-brand-600 font-semibold text-white transition hover:bg-brand-500 active:scale-95"
            >
              {t("gotIt")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Colour key used across the app: blue = in, red = out, amber = still pending. */
export function ColorLegend({ className = "" }: { className?: string }) {
  const { t } = useLang();
  const items = [
    { cls: "bg-iris-100 text-money-in", icon: "↓", label: t("legendIn") },
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
