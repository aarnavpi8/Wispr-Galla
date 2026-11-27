"use client";

// Cursor-reactive building blocks. All effects write CSS variables / transforms straight to
// the DOM (no React re-render per mouse move) and switch off for touch and reduced motion.

import {
  type ElementType,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

function finePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return (
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function setSpot(el: HTMLElement, e: PointerEvent) {
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
  return r;
}

type SpotlightProps = {
  as?: "div" | "section" | "button";
  rim?: boolean;
  children: ReactNode;
  type?: "button" | "submit";
} & HTMLAttributes<HTMLElement>;

/** A card with a soft light that follows the cursor (and an optional glowing rim). */
export function Spotlight({ as = "div", rim = true, className = "", children, ...rest }: SpotlightProps) {
  const Tag = as as ElementType;
  return (
    <Tag
      {...rest}
      className={`spotlight ${rim ? "spotlight-rim" : ""} ${className}`}
      onPointerMove={(e: PointerEvent<HTMLElement>) => setSpot(e.currentTarget, e)}
    >
      {children}
    </Tag>
  );
}

/** 3D tilt toward the cursor with a moving glare, like a physical card. */
export function TiltCard({
  className = "",
  children,
  max = 7,
}: {
  className?: string;
  children: ReactNode;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !finePointer()) return;
    const r = setSpot(el, e);
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateZ(0)`;
    });
  };
  const leave = () => {
    cancelAnimationFrame(frame.current);
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      className={`spotlight transition-transform duration-300 ease-out will-change-transform [--spot:rgb(215_240_138/0.22)] ${className}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
    </div>
  );
}

/** Wraps a button so it leans a few pixels toward the cursor. */
export function Magnetic({
  children,
  strength = 0.25,
  className = "inline-flex",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      className={`transition-transform duration-200 ease-out ${className}`}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || !finePointer()) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * strength;
        const dy = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }}
      onPointerLeave={() => {
        if (ref.current) ref.current.style.transform = "";
      }}
    >
      {children}
    </span>
  );
}

/** A soft green glow on the page background that trails the cursor. */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!finePointer()) return;
    let frame = 0;
    const onMove = (e: globalThis.PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        ref.current?.style.setProperty("--gx", `${e.clientX}px`);
        ref.current?.style.setProperty("--gy", `${e.clientY}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
  return <div ref={ref} aria-hidden className="page-glow pointer-events-none fixed inset-0 -z-10" />;
}

/** Animates a number from its previous value to the new one. */
export function CountUp({
  value,
  format,
  duration = 700,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let frame = 0;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      frame = requestAnimationFrame(() => setShown(value));
      from.current = value;
      return () => cancelAnimationFrame(frame);
    }
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const n = Math.round(a + (value - a) * eased);
      setShown(n);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className="tabular-nums">{format(shown)}</span>;
}
