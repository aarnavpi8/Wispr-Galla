"use client";

import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { type Lang, LANGS, MONEY_WORDS, translate } from "@/lib/i18n";
import { revealFrom } from "@/lib/transition";

import { Magnetic } from "./interactive";
import { useLang } from "./language";
import { Logo } from "./Logo";

/** "पैसा → Money → पैसे → ਪੈਸਾ → …", rolling top to bottom like a split-flap sign. */
function MoneyRoll() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((n) => n + 1), 750);
    return () => window.clearInterval(id);
  }, []);
  const word = (n: number) => MONEY_WORDS[((n % MONEY_WORDS.length) + MONEY_WORDS.length) % MONEY_WORDS.length];
  const cls =
    "absolute inset-0 flex items-center justify-center bg-gradient-to-b from-forest-700 to-leaf-500 bg-clip-text text-5xl font-black tracking-tight text-transparent";
  return (
    <p aria-hidden className="relative h-16 overflow-hidden [mask-image:linear-gradient(transparent,#000_25%,#000_75%,transparent)]">
      {i > 0 && (
        <span key={`out-${i}`} lang={word(i - 1).lang} className={`roll-out ${cls}`}>
          {word(i - 1).text}
        </span>
      )}
      <span key={`in-${i}`} lang={word(i).lang} className={`${i > 0 ? "roll-in" : ""} ${cls}`}>
        {word(i).text}
      </span>
    </p>
  );
}

const STEP = 360 / LANGS.length;
// The ring is a turntable seen from the front and a little above: a wide, flat ellipse.
const RADIUS_X = 150; // px, half the ring's width
const RADIUS_Y = 70; // px, half its depth after the camera tilt

/** Shortest signed distance between two ring positions (in items). */
export function wrapDelta(d: number, n: number): number {
  return ((((d + n / 2) % n) + n) % n) - n / 2;
}

function wrap(pos: number, n: number): number {
  return ((Math.round(pos) % n) + n) % n;
}

/**
 * Language ring, seen from above. No visible dial: the languages sit around a circle and
 * the one at 12 o'clock is the pick. Turn it with the mouse scroll wheel, a swipe or drag,
 * arrow keys, or tap a language to bring it to the top.
 */
function LanguageWheel({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  const n = LANGS.length;
  const ring = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  // Continuous rotation in "items" (not wrapped) so turning always takes the short way.
  const startAt = Math.max(0, LANGS.findIndex((l) => l.code === value));
  const target = useRef(startAt);
  const current = useRef(startAt);
  const frame = useRef(0);
  const wheelAcc = useRef(0);
  const drag = useRef<{ x: number; y: number; start: number; moved: boolean } | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const paint = useCallback(() => {
    // Narrow phones get a narrower ring so the side words stay on screen.
    const width = ring.current?.clientWidth || 2 * (RADIUS_X + 50);
    const rx = Math.min(RADIUS_X, width / 2 - 50);
    items.current.forEach((item, i) => {
      if (!item) return;
      // Raw ring angle, wrapped to -π..π, then warped so the front opens up (neighbours
      // stand clear of the picked word) and the far side bunches together.
      const raw = (wrapDelta(i - current.current, LANGS.length) * STEP * Math.PI) / 180;
      const angle = Math.sign(raw) * Math.PI * Math.pow(Math.abs(raw) / Math.PI, 0.55); // 0 = front
      const front = (1 + Math.cos(angle)) / 2; // 1 at the front, 0 at the far end
      const x = Math.sin(angle) * rx;
      const y = Math.cos(angle) * RADIUS_Y; // front sits lower (closer), back sits higher
      // Cards stay upright but turn slightly with the ring, and shrink with distance.
      const turn = -Math.sin(angle) * 25;
      item.style.transform =
        `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ` +
        `perspective(600px) rotateY(${turn.toFixed(1)}deg) scale(${(0.5 + front * 0.55).toFixed(3)})`;
      item.style.opacity = (0.12 + Math.pow(front, 1.5) * 0.88).toFixed(2);
      item.style.filter = `blur(${((1 - front) * 2).toFixed(2)}px)`;
      item.style.zIndex = String(Math.round(front * 10));
    });
  }, []);

  const animate = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const tick = () => {
      const diff = target.current - current.current;
      current.current += diff * 0.18;
      if (Math.abs(diff) < 0.002) current.current = target.current;
      paint();
      if (current.current !== target.current) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [paint]);

  const turnTo = useCallback(
    (pos: number) => {
      target.current = pos;
      onChangeRef.current(LANGS[wrap(pos, n)].code);
      animate();
    },
    [animate, n],
  );

  const turnBy = useCallback((steps: number) => turnTo(Math.round(target.current) + steps), [turnTo]);

  // First paint, and follow the value if it changes from outside.
  useEffect(() => {
    const idx = LANGS.findIndex((l) => l.code === value);
    const here = wrap(target.current, n);
    if (idx >= 0 && idx !== here) {
      target.current = Math.round(target.current) + wrapDelta(idx - here, n);
      animate();
    } else {
      paint();
    }
  }, [value, n, animate, paint]);

  // Scroll wheel turns the ring. Native listener so the page doesn't scroll meanwhile.
  useEffect(() => {
    const el = ring.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAcc.current += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(wheelAcc.current) >= 60) {
        turnBy(Math.sign(wheelAcc.current));
        wheelAcc.current = 0;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [turnBy]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onKey = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (step) {
      e.preventDefault();
      turnBy(step);
    }
  };

  const release = () => {
    if (drag.current?.moved) turnTo(Math.round(target.current));
    // Let the click handler see whether this was a drag, then forget it.
    window.setTimeout(() => (drag.current = null), 0);
  };

  return (
    <div
      ref={ring}
      role="radiogroup"
      aria-label="Language"
      tabIndex={0}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, start: target.current, moved: false };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        if (Math.abs(d) > 6) drag.current.moved = true;
        if (!drag.current.moved) return;
        // Drag along the ring: 90px of travel turns one language.
        target.current = drag.current.start - d / 90;
        current.current = target.current;
        paint();
      }}
      onPointerUp={release}
      onPointerLeave={() => drag.current?.moved && release()}
      onPointerCancel={release}
      className="relative mx-auto h-64 w-full max-w-[24rem] overflow-hidden touch-none cursor-grab select-none rounded-[40px] outline-none active:cursor-grabbing focus-visible:ring-4 focus-visible:ring-leaf-500/20"
    >
      {/* The turntable's floor: a soft elliptical shadow, no visible dial. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-[20rem] -translate-x-1/2 -translate-y-[25%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(27_106_72/0.14),rgb(63_165_107/0.05)_60%,transparent)]"
      />

      {LANGS.map((l, i) => {
        const selected = l.code === value;
        return (
          <button
            key={l.code}
            ref={(el) => {
              items.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={l.name}
            tabIndex={-1}
            onClick={() => {
              if (drag.current?.moved) return;
              const here = Math.round(target.current);
              turnTo(here + wrapDelta(i - wrap(here, n), n));
            }}
            className="group absolute left-1/2 top-1/2 whitespace-nowrap px-2 py-1"
          >
            {/* Just the word. It lifts on hover; the button's own transform belongs to the ring. */}
            <span
              className={`flex flex-col items-center transition-[transform,color] duration-300 ease-out group-hover:-translate-y-2 ${
                selected ? "text-forest-900" : "text-forest-950/70 group-hover:text-leaf-500"
              }`}
            >
              <span className={`font-extrabold leading-tight tracking-tight ${selected ? "text-3xl" : "text-xl"}`}>
                {l.name}
              </span>
              <span
                className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] transition-opacity ${
                  selected ? "text-leaf-500 opacity-100" : "opacity-0 group-hover:opacity-70"
                }`}
              >
                {l.code === "hinglish" ? "Roman Hindi" : l.english}
              </span>
              <span
                aria-hidden
                className={`mt-1.5 h-1 rounded-full bg-lime-300 transition-all duration-300 ${selected ? "w-8" : "w-0"}`}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** First-run screen (and the header's language switcher). */
export function LanguagePicker({ onDone }: { onDone?: () => void }) {
  const { chosen, setLang } = useLang();
  const [pick, setPick] = useState<Lang>(chosen ?? "hinglish");
  // Preview the screen's own words in the language at the top of the ring.
  const t = (k: Parameters<typeof translate>[1]) => translate(pick, k);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-5 py-6">
      <div className="animate-rise flex items-center gap-2 text-forest-900">
        <Logo size={40} />
      </div>

      <MoneyRoll />

      <header className="animate-rise text-center [animation-delay:60ms]">
        <h1 key={pick} className="word-in text-3xl font-extrabold tracking-tight text-forest-950">
          {t("chooseLanguage")}
        </h1>
        <p key={`s-${pick}`} className="word-in mt-2 text-muted">
          {t("chooseLanguageSub")}
        </p>
      </header>

      <div className="animate-rise [animation-delay:120ms]">
        <LanguageWheel value={pick} onChange={setPick} />
      </div>
      <p key={`h-${pick}`} className="word-in -mt-4 text-center text-xs text-muted">
        {t("spinHint")}
      </p>

      <div className="mt-auto pt-2">
        <Magnetic strength={0.12} className="flex w-full">
          <button
            type="button"
            onClick={(e) => {
              // Keyboard "clicks" have no pointer position: grow from the button's centre.
              const r = e.currentTarget.getBoundingClientRect();
              const x = e.clientX || r.left + r.width / 2;
              const y = e.clientY || r.top + r.height / 2;
              revealFrom(x, y, () => {
                setLang(pick);
                onDone?.();
              });
            }}
            className="group min-h-14 w-full rounded-2xl bg-forest-900 text-lg font-semibold text-white shadow-lg shadow-forest-900/20 transition hover:bg-forest-800 active:scale-[0.98]"
          >
            <span key={pick} className="word-in inline-block">
              {t("start")}
            </span>{" "}
            <span className="inline-block transition group-hover:translate-x-1">→</span>
          </button>
        </Magnetic>
      </div>
    </main>
  );
}
