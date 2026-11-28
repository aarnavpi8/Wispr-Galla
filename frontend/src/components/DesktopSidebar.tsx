"use client";

import { balanceTone, formatINR, formatNumber } from "@/lib/format";
import { LANGS } from "@/lib/i18n";

import { AccountMenu } from "./AccountMenu";
import { type NavId, NAV_ITEMS, useActiveSection } from "./BottomNav";
import { useLang } from "./language";
import { LogoMark } from "./Logo";

/**
 * Desktop (≥1024px) navigation: replaces the phone's bottom bar and compact summary bar.
 * Shop, sections, a big speak button, the three numbers that matter, language and profile.
 */
export function DesktopSidebar({
  shopName,
  expected,
  receivable,
  lowStock,
  overdue,
  onGo,
  onSpeak,
  onLanguage,
  onShowTour,
}: {
  shopName: string;
  expected: number;
  receivable: number;
  lowStock: number;
  overdue: number;
  onGo: (id: NavId) => void;
  onSpeak: () => void;
  onLanguage: () => void;
  onShowTour: () => void;
}) {
  const { t, lang } = useLang();
  const active = useActiveSection();
  const badge: Partial<Record<NavId, number>> = { maal: lowStock, khata: overdue };

  return (
    <aside
      aria-label={shopName || "BolKhata"}
      className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface/80 px-5 py-6 backdrop-blur lg:flex"
    >
      <div className="flex items-center gap-3">
        <LogoMark size={44} className="shrink-0 drop-shadow-md" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-iris-500">BolKhata</p>
          <p className="truncate font-bold text-ink-950">{shopName}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onSpeak}
        className="group flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand-500 to-brand-700 text-lg font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="size-6 transition group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        {t("speak")}
      </button>

      <nav aria-label={t("navHome")}>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const on = active === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onGo(item.id)}
                  aria-current={on ? "true" : undefined}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-semibold transition ${
                    on ? "bg-iris-100 text-ink-900" : "text-muted hover:bg-surface-2 hover:text-ink-900"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {item.icon}
                  </svg>
                  <span className="flex-1">{t(item.key)}</span>
                  {!!badge[item.id] && (
                    <span className="grid min-w-6 place-items-center rounded-full bg-pending px-1.5 text-xs font-bold leading-6 text-white">
                      {formatNumber(badge[item.id] ?? 0)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <dl className="space-y-2">
        <div className="rounded-2xl bg-iris-100 p-4 ring-1 ring-line">
          <dt className="text-xs text-ink-700">{t("expectedCash")}</dt>
          <dd className={`text-2xl font-extrabold tabular-nums ${balanceTone(expected)}`}>{formatINR(expected)}</dd>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onGo("khata")} className="rounded-2xl bg-amber-50 p-3 text-left transition hover:bg-amber-100">
            <dt className="text-xs font-semibold text-muted">{t("receivable")}</dt>
            <dd className="font-bold tabular-nums text-pending">{formatINR(receivable)}</dd>
          </button>
          <button type="button" onClick={() => onGo("maal")} className="rounded-2xl bg-surface-2 p-3 text-left transition hover:bg-line">
            <dt className="text-xs font-semibold text-muted">{t("lowStock")}</dt>
            <dd className={`font-bold tabular-nums ${lowStock ? "text-pending" : "text-ink-900"}`}>{formatNumber(lowStock)}</dd>
          </button>
        </div>
      </dl>

      <div className="mt-auto flex items-center gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={onLanguage}
          className="flex min-h-12 flex-1 items-center gap-2 rounded-2xl px-3 text-sm font-semibold text-ink-900 transition hover:bg-surface-2"
        >
          <span aria-hidden>अ/A</span>
          {LANGS.find((l) => l.code === lang)?.name}
        </button>
        <AccountMenu onShowTour={onShowTour} onLanguage={onLanguage} />
      </div>
    </aside>
  );
}
