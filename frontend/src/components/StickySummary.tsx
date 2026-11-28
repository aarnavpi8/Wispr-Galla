"use client";

import type { ReactNode } from "react";

import { formatINR } from "@/lib/format";

import { useLang } from "./language";

/**
 * Compact bar that slides down once the big money card scrolls away, so the numbers a
 * shopkeeper keeps glancing at (cash in galla, udhaar to collect, low stock) never leave.
 */
export function StickySummary({
  visible,
  shopName,
  expected,
  receivable,
  lowStock,
  onTap,
  onLowStock,
  account,
}: {
  visible: boolean;
  shopName: string;
  expected: number;
  receivable: number;
  lowStock: number;
  onTap: () => void;
  onLowStock: () => void;
  /** Profile button, so Logout stays one tap away while scrolled down. */
  account?: ReactNode;
}) {
  const { t } = useLang();
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 top-0 z-30 flex justify-center px-3 pt-2 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
      }`}
    >
      <div className="flex w-full max-w-md items-center gap-2 rounded-2xl bg-surface/95 px-3 py-2 text-ink-950 shadow-xl shadow-ink-950/20 ring-1 ring-line backdrop-blur-md">
        <button type="button" onClick={onTap} tabIndex={visible ? 0 : -1} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[11px] text-muted">
            {shopName} · {t("expectedCash")}
          </span>
          <span className="block text-lg font-extrabold leading-tight tabular-nums">{formatINR(expected)}</span>
        </button>
        <span className="rounded-xl bg-surface-2 px-2.5 py-1 text-right">
          <span className="block text-[10px] text-muted">{t("receivable")}</span>
          <span className="block text-sm font-bold tabular-nums text-pending">{formatINR(receivable)}</span>
        </span>
        {lowStock > 0 && (
          <button
            type="button"
            onClick={onLowStock}
            tabIndex={visible ? 0 : -1}
            className="rounded-xl bg-gold-100 px-2.5 py-1 text-right text-ink-950 ring-1 ring-gold-300 transition hover:bg-gold-300"
          >
            <span className="block text-[10px] font-semibold">{t("lowStock")}</span>
            <span className="block text-sm font-extrabold">{lowStock}</span>
          </button>
        )}
        {visible && account}
      </div>
    </div>
  );
}
