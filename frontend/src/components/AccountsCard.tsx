"use client";

import { useState } from "react";

import { useApi } from "@/lib/api";
import { formatINR, formatNumber } from "@/lib/format";
import type { Accounts } from "@/lib/types";

import { DayCloseSheet } from "./DayCloseSheet";
import { CountUp, Magnetic, Spotlight } from "./interactive";
import { useLang } from "./language";
import { HelpTip } from "./HelpTip";
import type { StringKey } from "@/lib/i18n";

/** Lena / dena, a cash-basis estimate, cash vs UPI books, and the close-the-day button. */
export type AccountsTarget = "receivable" | "payable" | "net" | "stock";

export function AccountsCard({
  refreshKey = 0,
  onChanged,
  onOpen,
}: {
  refreshKey?: number;
  onChanged?: () => void;
  /** Tapping a tile opens what it adds up: who owes, whom you owe, the profit detail, the stock. */
  onOpen?: (what: AccountsTarget) => void;
}) {
  const { t } = useLang();
  const [days, setDays] = useState<7 | 30>(7);
  const { data: a } = useApi<Accounts>(`/api/accounts?days=${days}&r=${refreshKey}`);
  const [closing, setClosing] = useState(false);

  return (
    <section aria-labelledby="accounts-title" className="rounded-[28px] border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="accounts-title" className="text-lg font-bold text-ink-950">
            {t("accountsTitle")}
          </h2>
          <p className="text-sm text-muted">{t("accountsSub", { n: days })}</p>
        </div>
        <div className="flex rounded-full bg-surface-2 p-1 text-sm font-semibold">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1 transition ${days === d ? "bg-brand-600 text-white" : "text-muted hover:text-ink-900"}`}
            >
              {formatNumber(d)}
            </button>
          ))}
        </div>
      </div>

      {!a ? (
        <div className="reveal-stagger mt-4 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="reveal-stagger mt-4 grid grid-cols-2 gap-2">
            <Tile label={t("receivable")} help={["receivable", "helpReceivable"]} sub={t("receivableSub")} value={a.receivable} tone="text-pending" bg="bg-amber-50" onClick={onOpen && (() => onOpen("receivable"))} />
            <Tile label={t("payable")} help={["payable", "helpPayable"]} sub={t("payableSub")} value={a.payable} tone="text-money-out" bg="bg-red-50" onClick={onOpen && (() => onOpen("payable"))} />
            <Tile
              label={t("net")}
              help={["net", "helpNet"]}
              sub={t("netSub")}
              value={a.net}
              tone={a.net >= 0 ? "text-money-in" : "text-money-out"}
              bg={a.net >= 0 ? "bg-iris-100" : "bg-red-50"}
              onClick={onOpen && (() => onOpen("net"))}
            />
            <Tile label={t("stockValue")} help={["stockValue", "helpStock"]} sub={t("itemsCount", { n: a.stock_items })} value={a.stock_value} tone="text-ink-900" bg="bg-surface-2" onClick={onOpen && (() => onOpen("stock"))} />
          </div>

          {/* Cash book vs UPI book: what came in and went out of each. */}
          <div className="mt-4 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              {t("cashBook")} / {t("upiBook")} <HelpTip title="cashBook" body="helpBooks" />
            </p>
            <Book label={t("cashBook")} inLabel={t("moneyIn")} outLabel={t("moneyOut")} inValue={a.cash_in} outValue={a.cash_out} />
            <Book label={t("upiBook")} inLabel={t("moneyIn")} outLabel={t("moneyOut")} inValue={a.upi_in} outValue={a.upi_out} />
          </div>

          <dl className="reveal-stagger mt-4 divide-y divide-line/70 rounded-2xl bg-background px-3 text-sm">
            <Row label={t("purchases")} value={a.purchases} />
            <Row label={t("expenses")} value={a.expenses} />
            <Row label={t("withdrawals")} value={a.withdrawals} />
          </dl>
        </>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-sm text-muted">
        <HelpTip title="closeDay" body="helpCloseDay" /> {t("closeDaySub")}
      </p>
      <Magnetic strength={0.1} className="mt-2 flex w-full">
        <Spotlight
          as="button"
          type="button"
          onClick={() => setClosing(true)}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-brand-600 px-4 text-left text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500 active:scale-[0.99] [--spot:rgb(215_240_138/0.18)]"
        >
          <span aria-hidden className="text-2xl">
            🔒
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t("closeDay")}</span>
            <span className="text-sm text-white/60">{t("closeDaySub")}</span>
          </span>
          <span aria-hidden>→</span>
        </Spotlight>
      </Magnetic>

      {closing && (
        <DayCloseSheet
          onClose={() => setClosing(false)}
          onSaved={() => onChanged?.()}
        />
      )}
    </section>
  );
}

function Tile({
  label,
  sub,
  value,
  tone,
  bg,
  help,
  onClick,
}: {
  label: string;
  sub: string;
  value: number;
  tone: string;
  bg: string;
  help?: [StringKey, StringKey];
  onClick?: () => void;
}) {
  // The "?" stays its own button; the rest of the tile opens the detail.
  return (
    <div className={`group relative rounded-2xl p-3 transition ${onClick ? "hover:-translate-y-0.5 hover:shadow-md" : ""} ${bg}`}>
      <p className="flex items-center justify-between gap-1 text-xs font-semibold text-muted">
        {onClick ? (
          <button type="button" onClick={onClick} className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {label}
          </button>
        ) : (
          label
        )}
        {help && (
          <span className="relative z-10">
            <HelpTip title={help[0]} body={help[1]} />
          </span>
        )}
      </p>
      <p className={`mt-1 text-xl font-extrabold ${tone}`}>
        <CountUp value={value} format={formatINR} />
      </p>
      <p className="mt-0.5 flex items-end justify-between gap-1 text-[11px] leading-snug text-muted">
        <span className="line-clamp-2">{sub}</span>
        {onClick && <span aria-hidden className="text-sm">›</span>}
      </p>
    </div>
  );
}

function Book({
  label,
  inLabel,
  outLabel,
  inValue,
  outValue,
}: {
  label: string;
  inLabel: string;
  outLabel: string;
  inValue: number;
  outValue: number;
}) {
  const max = Math.max(inValue, outValue, 1);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-ink-950">{label}</span>
        <span className="text-muted">
          <span className="text-money-in">+{formatINR(inValue)}</span>
          {outValue > 0 && <span className="text-money-out"> · −{formatINR(outValue)}</span>}
        </span>
      </div>
      <div className="mt-1.5 space-y-1" aria-hidden>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" title={inLabel}>
          <div className="h-full rounded-full bg-iris-500 transition-[width] duration-700" style={{ width: `${(inValue / max) * 100}%` }} />
        </div>
        {outValue > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" title={outLabel}>
            <div className="h-full rounded-full bg-rose-400 transition-[width] duration-700" style={{ width: `${(outValue / max) * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink-950">{formatINR(value)}</dd>
    </div>
  );
}
