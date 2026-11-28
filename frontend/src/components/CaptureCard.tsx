"use client";

import { useEffect, useRef, useState } from "react";

import { useSpeech } from "@/hooks/useSpeech";

import { LANGS as APP_LANGS } from "@/lib/i18n";
import type { Command, Item, PartyBalance } from "@/lib/types";

import { Magnetic, Spotlight } from "./interactive";
import { useLang } from "./language";
import { useAppConfig } from "./auth";
import { VoiceSuggestions } from "./VoiceSuggestions";
import { HelpTip } from "./HelpTip";

// Example sentences come from the chosen language (ex1..ex4).
export const EXAMPLE_KEYS = ["ex1", "ex2", "ex3", "ex4"] as const;

const LANGS = [
  { code: "hi-IN", label: "हिं" },
  { code: "en-IN", label: "EN" },
  { code: "mr-IN", label: "मरा" },
  { code: "gu-IN", label: "ગુ" },
];

/**
 * The capture box (engine step 1). Wispr Flow types into it; the mic uses browser speech.
 * `onSubmit` receives the text; understanding it is flow 1's job.
 */
export function CaptureCard({
  onSubmit,
  onCommand,
  parties = [],
  items = [],
}: {
  onSubmit: (text: string) => void;
  /** Run a voice command directly (from a suggestion or "Try saying" chip). */
  onCommand?: (command: Command, partyId?: number | null) => void;
  parties?: PartyBalance[];
  items?: Item[];
}) {
  const { t, lang: appLang } = useLang();
  const config = useAppConfig();
  const [text, setText] = useState("");
  // Mic language starts from the app language; the chips below can switch it per entry.
  const [lang, setLang] = useState(APP_LANGS.find((l) => l.code === appLang)?.speech ?? "hi-IN");
  const typing = useRef<number | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech(setText, lang, !!config?.wispr_configured);

  // When the mic stops (and Wispr has finished writing), open the entry card by itself.
  const busy = speech.listening || speech.transcribing;
  const wasBusy = useRef(false);
  const latest = useRef({ text, onSubmit });
  useEffect(() => {
    latest.current = { text, onSubmit };
  });
  useEffect(() => {
    if (wasBusy.current && !busy && latest.current.text.trim() && !speech.error) {
      latest.current.onSubmit(latest.current.text.trim());
    }
    wasBusy.current = busy;
  }, [busy, speech.error]);

  // Tapping an example "types" it in, so it feels like dictation.
  const typeIn = (sample: string) => {
    if (typing.current) window.clearInterval(typing.current);
    let i = 0;
    setText("");
    typing.current = window.setInterval(() => {
      i += 1;
      setText(sample.slice(0, i));
      if (i >= sample.length && typing.current) {
        window.clearInterval(typing.current);
        typing.current = null;
        area.current?.focus();
      }
    }, 18);
  };

  const submit = () => {
    const t = text.trim();
    if (t) onSubmit(t);
  };

  return (
    <Spotlight
      as="section"
      aria-labelledby="capture-label"
      className="animate-rise rounded-[28px] border border-line bg-surface p-4 shadow-sm [animation-delay:80ms]"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <label id="capture-label" htmlFor="capture" className="text-lg font-bold text-ink-950">
            {t("speakOrType")}
          </label>
          <HelpTip title="speakOrType" body="helpCapture" />
        </span>
        <div className="flex rounded-full bg-surface-2 p-0.5 text-xs font-semibold" aria-label="Bhasha">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={lang === l.code}
              onClick={() => setLang(l.code)}
              className={`rounded-full px-2.5 py-1 transition ${
                lang === l.code ? "bg-brand-600 text-white" : "text-muted hover:text-ink-900"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-3">
        <textarea
          ref={area}
          id="capture"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder={t("ex1")}
          className="w-full resize-none rounded-2xl border-2 border-line bg-background p-4 pr-10 text-xl text-ink-950 placeholder:text-muted/60 transition focus:border-iris-500 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-iris-500/15"
        />
        {text && (
          <button
            type="button"
            aria-label={t("clear")}
            onClick={() => setText("")}
            className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-surface-2 text-muted transition hover:bg-line hover:text-ink-950"
          >
            ×
          </button>
        )}
      </div>

      <div className="reveal-stagger mt-2 flex flex-wrap gap-2">
        {EXAMPLE_KEYS.map((k) => t(k)).map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => typeIn(ex)}
            className="max-w-full rounded-2xl border border-line bg-background px-3 py-2 text-left text-sm text-ink-800 transition hover:-translate-y-0.5 hover:border-iris-500 hover:bg-iris-100 active:translate-y-0"
          >
            {ex}
          </button>
        ))}
      </div>

      {onCommand && <VoiceSuggestions text={text} parties={parties} items={items} onCommand={onCommand} />}

      <div className="mt-3 flex items-center gap-3">
        {speech.supported && (
          <Magnetic>
            <button
              type="button"
              aria-label={speech.listening ? t("stopListening") : t("holdToSpeak")}
              aria-pressed={speech.listening}
              onClick={speech.listening ? speech.stop : speech.start}
              disabled={speech.transcribing}
              className={`relative grid size-14 place-items-center rounded-full text-2xl transition active:scale-95 ${
                speech.listening
                  ? "bg-money-out text-white"
                  : "bg-iris-100 text-ink-900 hover:bg-iris-300"
              }`}
            >
              {speech.listening && (
                <span aria-hidden className="animate-ring absolute inset-0 rounded-full bg-money-out" />
              )}
              <span className="relative">{speech.listening ? <StopIcon /> : <MicIcon />}</span>
            </button>
          </Magnetic>
        )}
        <Magnetic strength={0.15} className="flex flex-1">
          <button
            type="button"
            disabled={!text.trim()}
            onClick={submit}
            className="group min-h-14 w-full rounded-2xl bg-brand-600 text-lg font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500 hover:shadow-xl active:scale-[0.98] disabled:bg-line disabled:text-muted disabled:shadow-none"
          >
            {t("next")} <span className="inline-block transition group-hover:translate-x-1 group-disabled:translate-x-0">→</span>
          </button>
        </Magnetic>
      </div>
      {speech.error && <p className="mt-2 text-sm text-pending">{t(speech.error)}</p>}
      {speech.listening && <p className="mt-2 text-sm text-ink-700">{t("listening")}</p>}
      {speech.transcribing && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-ink-700">
          <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-iris-500 border-t-transparent" />
          {t("transcribing")}
        </p>
      )}
      {speech.engine === "wispr" && !speech.listening && !speech.transcribing && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-iris-500">
          <span aria-hidden className="size-1.5 rounded-full bg-iris-500" /> {t("wisprOn")}
        </p>
      )}
    </Spotlight>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}
