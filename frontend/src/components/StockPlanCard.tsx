"use client";

import { useState } from "react";

import { postJSON, useApi } from "@/lib/api";
import { formatINR, formatNumber } from "@/lib/format";
import type { StringKey } from "@/lib/i18n";
import type { InventoryAccount, Insights, ItemPlan, PlanStatus } from "@/lib/types";

import { HelpTip } from "./HelpTip";
import { useLang } from "./language";

const STATUS: Record<PlanStatus, { key: StringKey; style: string }> = {
  out: { key: "planOut", style: "bg-red-50 text-money-out" },
  order_now: { key: "planOrderNow", style: "bg-amber-50 text-pending" },
  dead: { key: "planDead", style: "bg-surface-2 text-muted" },
  ok: { key: "planOk", style: "bg-iris-100 text-ink-900" },
  no_sales: { key: "planDead", style: "bg-surface-2 text-muted" },
};

/**
 * Stock as its own account (opening + bought − sold at cost − wasted = now, and the gross profit),
 * plus the reorder maths: reorder point, order size (EOQ), days left, ABC and dead stock.
 */
export function StockPlanCard({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const { t } = useLang();
  const [days, setDays] = useState<7 | 30>(30);
  const [lead, setLead] = useState(3);
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const r = `${refreshKey}-${tick}`;
  const { data: acc } = useApi<InventoryAccount>(`/api/inventory/account?days=${days}&r=${r}`);
  const { data: plan } = useApi<Insights>(`/api/inventory/insights?days=${days}&lead_days=${lead}&r=${r}`);

  const apply = async () => {
    setNote(null);
    try {
      const out = await postJSON<{ updated: number }>("/api/inventory/apply-alerts", { days, lead_days: lead });
      setNote(t("planApplied", { n: out.updated }));
      setTick((x) => x + 1);
      onChanged?.();
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  const watch = plan?.items.filter((p) => p.status !== "no_sales") ?? [];
  const shown = all ? watch : watch.slice(0, 6);

  return (
    <section aria-labelledby="stockplan-title" className="rounded-[28px] border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="stockplan-title" className="flex items-center gap-1.5 text-lg font-bold text-ink-950">
            {t("invTitle")} <HelpTip title="invTitle" body="helpInvAccount" />
          </h2>
          <p className="text-sm text-muted">{t("invSub", { n: days })}</p>
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

      {!acc ? (
        <div className="skeleton mt-4 h-40 rounded-2xl" />
      ) : (
        <>
          <dl className="reveal-stagger mt-4 divide-y divide-line/70 rounded-2xl bg-background px-3 text-sm">
            <Line label={t("invOpening")} value={acc.opening} />
            <Line label={t("invPurchases")} value={acc.purchases} sign="+" tone="text-money-in" />
            <Line label={t("invCogs")} value={acc.cogs} sign="−" tone="text-money-out" />
            <Line label={t("invWastage")} value={acc.wastage} sign="−" tone="text-money-out" />
            {acc.adjustments !== 0 && (
              <Line label={t("invAdjust")} value={Math.abs(acc.adjustments)} sign={acc.adjustments > 0 ? "+" : "−"} />
            )}
            <Line label={t("invClosing")} value={acc.closing} strong />
          </dl>

          <div className="reveal-stagger mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface-2 p-3">
              <p className="text-xs text-muted">{t("invSales")}</p>
              <p className="text-xl font-extrabold tabular-nums text-ink-950">{formatINR(acc.sales)}</p>
            </div>
            <div className={`rounded-2xl p-3 ${acc.gross_profit >= 0 ? "bg-iris-100" : "bg-red-50"}`}>
              <p className="flex items-center gap-1 text-xs text-muted">
                {t("invProfit")} <HelpTip title="invProfit" body="helpProfit" />
              </p>
              <p className={`text-xl font-extrabold tabular-nums ${acc.gross_profit >= 0 ? "text-money-in" : "text-money-out"}`}>
                {acc.gross_profit < 0 ? "−" : ""}
                {formatINR(Math.abs(acc.gross_profit))}
              </p>
              {acc.margin_pct !== null && <p className="text-xs text-muted">{t("invMargin", { x: acc.margin_pct })}</p>}
            </div>
          </div>
          {acc.no_cost_items > 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-pending">{t("invNoCost", { n: acc.no_cost_items })}</p>
          )}
          {/* Spoilage: the stock version of depreciation, estimated from how long each item stays good. */}
          {(acc.expected_spoilage ?? 0) > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 text-ink-800">
                {t("spoilage")} <HelpTip title="spoilage" body="helpSpoilage" />
              </span>
              <span className="font-bold tabular-nums text-money-out">−{formatINR(acc.expected_spoilage)}</span>
            </div>
          )}
          {(acc.to_check?.length ?? 0) > 0 && (
            <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
              <p className="text-sm font-semibold text-pending">{t("spoilTitle")}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-800">
                {acc.to_check!.map((c) => (
                  <li key={c.item_id}>{t("spoilCheck", { item: c.name, days: c.days })}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Smart reorder */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 font-bold text-ink-950">
            {t("planTitle")} <HelpTip title="planTitle" body="helpPlan" />
          </h3>
          <p className="text-sm text-muted">{t("planSub", { n: plan?.days ?? days, d: lead })}</p>
        </div>
        <label className="flex items-center gap-1 text-xs font-semibold text-muted">
          {t("planLead")}
          <select
            value={lead}
            onChange={(e) => setLead(Number(e.target.value))}
            className="min-h-9 rounded-lg border border-line bg-surface px-1.5 text-sm text-ink-950"
          >
            {[1, 2, 3, 5, 7, 14].map((d) => (
              <option key={d} value={d}>
                {formatNumber(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!plan ? (
        <div className="skeleton mt-3 h-32 rounded-2xl" />
      ) : watch.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-surface-2 p-3 text-sm text-muted">{t("planEmpty")}</p>
      ) : (
        <>
          {plan.dead_value > 0 && (
            <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-950">
              {t("planDeadMoney", { x: formatINR(plan.dead_value) })}
            </p>
          )}
          <ul className="reveal-stagger mt-2 divide-y divide-line/60">
            {shown.map((p) => (
              <PlanRow key={p.item_id} p={p} />
            ))}
          </ul>
          {watch.length > 6 && (
            <button type="button" onClick={() => setAll((x) => !x)} className="mt-1 min-h-10 text-sm font-semibold text-ink-800 hover:underline">
              {all ? t("showLess") : t("showAll", { n: watch.length })}
            </button>
          )}
          <button
            type="button"
            onClick={() => void apply()}
            className="mt-3 min-h-12 w-full rounded-2xl bg-brand-600 px-4 font-semibold text-white transition hover:bg-brand-500 active:scale-[0.99]"
          >
            {t("planApply")}
          </button>
          {note && (
            <p role="status" className="mt-2 text-sm text-ink-800">
              {note}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function PlanRow({ p }: { p: ItemPlan }) {
  const { t } = useLang();
  const s = STATUS[p.status];
  const name = p.variant ? `${p.name} · ${p.variant}` : p.name;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        aria-label={p.abc === "A" ? t("abcA") : undefined}
        title={p.abc === "A" ? t("abcA") : undefined}
        className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
          p.abc === "A" ? "bg-gold-300 text-ink-950" : p.abc === "B" ? "bg-iris-100 text-ink-900" : "bg-surface-2 text-muted"
        }`}
      >
        {p.abc}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink-950">{name}</span>
        <span className="text-xs text-muted">
          {p.sold > 0 ? t("planPerDay", { x: p.per_day, u: p.unit }) : t("planNoSale")}
          {p.days_left !== null && ` · ${t("planDaysLeft", { d: Math.floor(p.days_left) })}`}
          {p.sold > 0 && ` · ${t("planReorderAt", { q: p.reorder_point })}`}
        </span>
      </span>
      <span className="text-right">
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${s.style}`}>{t(s.key)}</span>
        {p.order_qty > 0 && (
          <span className="mt-0.5 block text-xs font-semibold tabular-nums text-ink-950">
            {t("planOrder", { q: p.order_qty, u: p.unit })}
          </span>
        )}
      </span>
    </li>
  );
}

function Line({ label, value, sign, tone = "text-ink-950", strong }: { label: string; value: number; sign?: string; tone?: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${strong ? "font-bold" : ""}`}>
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-ink-950" : tone}`}>
        {sign && value ? `${sign} ` : ""}
        {formatINR(value)}
      </dd>
    </div>
  );
}
