"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades and lifts a whole section in as it scrolls into view. It plays again whenever the
 * section comes back from below, so scrolling down always feels alive; leaving upward keeps
 * it shown (no flicker when scrolling back up).
 * Without IntersectionObserver (old browsers, tests) the content is simply shown.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  id,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setSeen(true);
        else if (e.boundingClientRect.top > (e.rootBounds?.bottom ?? window.innerHeight)) setSeen(false);
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      className={`reveal scroll-mt-24 ${seen ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * One watcher for the whole app: every child of a `.reveal-stagger` container (tiles, rows,
 * chips, chart bars) rises in as it enters the screen, in a short wave, and replays when it
 * comes back from below. New rows (after a save, a filter) are picked up automatically.
 * Works the same in the browser and inside the Android app's WebView.
 */
export function ScrollMotion() {
  useEffect(() => {
    const showAll = () => document.querySelectorAll(".reveal-stagger > *").forEach((n) => n.classList.add("is-in"));
    if (typeof IntersectionObserver === "undefined" || reducedMotion()) {
      showAll();
      const mo = new MutationObserver(showAll);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }

    const io = new IntersectionObserver(
      (entries) => {
        let wave = 0;
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) {
            el.style.setProperty("--i", String(Math.min(wave++, 8)));
            el.classList.add("is-in");
          } else if (e.boundingClientRect.top > (e.rootBounds?.bottom ?? window.innerHeight)) {
            el.classList.remove("is-in"); // below the screen again: play once more on the way in
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 },
    );
    const watched = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll(".reveal-stagger > *").forEach((n) => {
        if (!watched.has(n)) {
          watched.add(n);
          io.observe(n);
        }
      });
    };
    scan();
    // New rows appear in bursts (a save, a filter); numbers counting up also touch the DOM every
    // frame. Look for new tiles at most every 200 ms instead of on every change.
    let pending = 0;
    const mo = new MutationObserver(() => {
      if (!pending) pending = window.setTimeout(() => {
        pending = 0;
        scan();
      }, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(pending);
      mo.disconnect();
      io.disconnect();
    };
  }, []);
  return null;
}
