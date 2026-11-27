"use client";

import { type ReactNode, useEffect, useState } from "react";

import type { StringKey } from "@/lib/i18n";

import { useLang } from "./language";

export type NavId = "aaj" | "hisaab" | "maal" | "khata";

export const NAV_ITEMS: { id: NavId; key: StringKey; icon: ReactNode }[] = [
  {
    id: "aaj",
    key: "navHome",
    icon: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />,
  },
  {
    id: "hisaab",
    key: "navAccounts",
    icon: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  },
  {
    id: "maal",
    key: "navStock",
    icon: <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16zM3.5 8 12 12.5 20.5 8M12 12.5v8" />,
  },
  {
    id: "khata",
    key: "navKhata",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.5 3 5.2" />
      </>
    ),
  },
];

/** Which section is in the middle of the screen right now (scroll spy). */
export function useActiveSection(): NavId {
  const [active, setActive] = useState<NavId>("aaj");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id as NavId);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5] },
    );
    NAV_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    const top = () => window.scrollY < 120 && setActive("aaj");
    window.addEventListener("scroll", top, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", top);
    };
  }, []);
  return active;
}

/** Always-visible bottom bar: jump between sections, plus a raised mic button in the middle. */
export function BottomNav({
  onGo,
  onSpeak,
  lowStock,
  overdue,
}: {
  onGo: (id: NavId) => void;
  onSpeak: () => void;
  lowStock: number;
  overdue: number;
}) {
  const { t } = useLang();
  const active = useActiveSection();
  const badge: Partial<Record<NavId, number>> = { maal: lowStock, khata: overdue };

  const button = (item: (typeof NAV_ITEMS)[number]) => {
    const on = active === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onGo(item.id)}
        aria-current={on ? "true" : undefined}
        className={`group relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-xs font-semibold transition ${
          on ? "text-forest-900" : "text-muted hover:text-forest-800"
        }`}
      >
        <span
          className={`relative grid h-8 w-12 place-items-center rounded-full transition-all duration-300 ${
            on ? "bg-mint-100" : "group-hover:bg-surface-2"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className={`size-5 transition-transform duration-300 ${on ? "scale-110" : "group-hover:-translate-y-0.5"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {item.icon}
          </svg>
          {!!badge[item.id] && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-pending px-1 text-[10px] font-bold leading-4 text-white">
              {badge[item.id]}
            </span>
          )}
        </span>
        {t(item.key)}
      </button>
    );
  };

  return (
    <nav
      id="tour-nav"
      aria-label={t("navHome")}
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="relative flex w-full max-w-md items-end gap-1 rounded-[26px] border border-line bg-surface/90 px-2 pb-1.5 pt-1.5 shadow-[0_-8px_30px_-12px_rgb(16_58_41/0.25)] backdrop-blur-md">
        {NAV_ITEMS.slice(0, 2).map(button)}
        <div className="relative flex flex-1 justify-center">
          {/* Slow "breathing" ring: a visual cue that this is the main button. */}
          <span aria-hidden className="pointer-events-none absolute -top-7 size-16 animate-[ring_2.8s_ease-out_infinite] rounded-full bg-leaf-500/40" />
          <button
            type="button"
            onClick={onSpeak}
            aria-label={t("speak")}
            className="group relative -mt-7 grid size-16 place-items-center rounded-full bg-gradient-to-b from-forest-700 to-forest-950 text-white shadow-xl shadow-forest-900/40 ring-4 ring-background transition hover:-translate-y-1 hover:shadow-2xl active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="size-7 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        </div>
        {NAV_ITEMS.slice(2).map(button)}
      </div>
    </nav>
  );
}
