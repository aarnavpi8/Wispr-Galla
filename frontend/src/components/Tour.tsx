"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import type { StringKey } from "@/lib/i18n";
import { stopSpeaking } from "@/lib/speak";

import { ListenButton } from "./HelpTip";
import { useLang } from "./language";

export const TOUR_KEY = "galla.tour";

/** Each step points at an element by id and explains it in one or two plain sentences. */
export const TOUR_STEPS: { target: string; title: StringKey; body: StringKey }[] = [
  { target: "tour-hero", title: "tour1Title", body: "tour1Body" },
  { target: "tour-capture", title: "tour2Title", body: "tour2Body" },
  { target: "hisaab", title: "tour3Title", body: "tour3Body" },
  { target: "maal", title: "tour4Title", body: "tour4Body" },
  { target: "khata", title: "tour5Title", body: "tour5Body" },
  { target: "tour-nav", title: "tour6Title", body: "tour6Body" },
];

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "done";
  } catch {
    return true; // storage blocked: don't nag on every load
  }
}

function markSeen() {
  try {
    localStorage.setItem(TOUR_KEY, "done");
  } catch {
    // Storage blocked; the tour will just offer itself again next time.
  }
}

type Box = { top: number; left: number; width: number; height: number };

/**
 * Guided first-run tour: dims the screen, cuts a glowing hole around one part of the app,
 * and explains it in a card with Back / Next / Skip and read-aloud.
 */
export function Tour({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [finePointer] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  const measure = useCallback(() => {
    const el = document.getElementById(step.target);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    const pad = 8;
    setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  }, [step.target]);

  // Bring the part into view, then frame it once scrolling has settled.
  useLayoutEffect(() => {
    const el = document.getElementById(step.target);
    if (!el) return;
    const fixed = getComputedStyle(el).position === "fixed" || el.closest("nav") !== null;
    // Park the part near the top so the explanation card fits underneath it.
    // On phones this also slides sideways to the part's page ("center" lines the page up exactly).
    // Phones jump straight there: a smooth glide under the dimmed overlay was the remaining lag.
    if (!fixed) el.scrollIntoView?.({ block: "start", inline: "center", behavior: finePointer ? "smooth" : "auto" });
    const id = window.setTimeout(measure, fixed ? 0 : finePointer ? 450 : 60);
    return () => window.clearTimeout(id);
  }, [step.target, measure, finePointer]);

  // Re-frame at most once per screen frame while the page scrolls (measuring on every scroll
  // event re-rendered the tour dozens of times per glide and made phones stutter).
  useEffect(() => {
    let frame = 0;
    const onMove = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener("resize", onMove);
    // Capture: the swipeable pages scroll by themselves, and their scroll events don't bubble.
    window.addEventListener("scroll", onMove, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, { capture: true });
    };
  }, [measure]);

  const finish = () => {
    stopSpeaking();
    markSeen();
    onClose();
  };

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, TOUR_STEPS.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  });

  // Card goes on whichever side of the highlighted part has more room; if neither fits,
  // it sits at the bottom of the screen (over the part's lower edge).
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const CARD = 250;
  const spaceBelow = box ? vh - (box.top + box.height) : vh;
  const spaceAbove = box ? box.top : 0;
  // The card never leaves the screen: if the part has scrolled out of view, the card waits at
  // the bottom (it once sat above the top edge with its Skip button, leaving the page blocked).
  const onScreen = !!box && box.top + box.height > 0 && box.top < vh;
  const cardStyle =
    onScreen && box && spaceBelow >= CARD + 20
      ? { top: Math.min(box.top + box.height + 14, vh - CARD - 12) }
      : onScreen && box && spaceAbove >= CARD + 20
        ? { bottom: Math.min(vh - box.top + 14, vh - CARD - 12) }
        : { bottom: 16 };

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal aria-label={t("howToUse")}>
      {/* Dim everything except a rounded window around the current part. */}
      {box ? (
        <div
          aria-hidden
          // Phones: the frame jumps to its place (animating size + a screen-sized shadow every frame
          // was the lag); a mouse device glides it. Glow only where there's power to spare.
          className="pointer-events-none absolute rounded-[30px] ring-4 ring-gold-300 [@media(pointer:fine)]:transition-all [@media(pointer:fine)]:duration-500 [@media(pointer:fine)]:ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            // Moved with a GPU transform: the screen-sized dimming shadow is painted once per step
            // and then only slides while the page scrolls (top/left repainted it every frame).
            top: 0,
            left: 0,
            width: box.width,
            height: box.height,
            transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
            willChange: "transform",
            boxShadow: finePointer
              ? "0 0 0 9999px rgb(31 42 61 / 0.5), 0 0 40px 8px rgb(243 194 98 / 0.45)"
              : "0 0 0 9999px rgb(31 42 61 / 0.5)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-ink-950/45" />
      )}
      {/* Clicks outside the card do nothing (no accidental taps on the app underneath). */}
      <div className="absolute inset-0" />

      <div
        key={i}
        className="animate-pop absolute inset-x-3 mx-auto max-w-sm rounded-[28px] bg-surface p-5 text-ink-950 shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-iris-100 px-2.5 py-1 text-xs font-bold text-ink-800">
            {t("tourStep", { i: i + 1, n: TOUR_STEPS.length })}
          </span>
          <button type="button" onClick={finish} className="min-h-10 rounded-full px-3 text-sm font-semibold text-muted hover:text-ink-900">
            {t("tourSkip")}
          </button>
        </div>
        <h2 className="mt-2 text-xl font-extrabold">{t(step.title)}</h2>
        <p className="mt-1.5 text-base leading-relaxed text-ink-950/85">{t(step.body)}</p>

        {/* Progress dots */}
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {TOUR_STEPS.map((s, n) => (
            <span key={s.target} className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-brand-500" : n < i ? "w-1.5 bg-iris-500" : "w-1.5 bg-line"}`} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ListenButton text={`${t(step.title)}. ${t(step.body)}`} />
          <div className="ml-auto flex gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI(i - 1)}
                className="min-h-11 rounded-full bg-surface-2 px-4 font-semibold text-ink-900 transition hover:bg-line"
              >
                {t("tourBack")}
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setI(i + 1))}
              className="min-h-11 rounded-full bg-brand-600 px-5 font-semibold text-white shadow-lg transition hover:bg-brand-500 active:scale-95"
            >
              {last ? t("tourDone") : `${t("tourNext")} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
