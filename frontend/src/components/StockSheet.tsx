"use client";

import { useState } from "react";

import { postJSON, useApi } from "@/lib/api";
import { formatINR, itemLabel, stockLevel, timeAgo } from "@/lib/format";
import type { StringKey } from "@/lib/i18n";
import type { Item, StockMove, StockReason } from "@/lib/types";

import { useLang } from "./language";
import { Sheet } from "./Sheet";

const ACTIONS: { reason: StockReason; key: StringKey; style: string }[] = [
  { reason: "purchase", key: "stockIn", style: "bg-forest-900 text-white hover:bg-forest-800" },
  { reason: "sale", key: "stockSold", style: "bg-surface-2 text-forest-950 hover:bg-line" },
  { reason: "wastage", key: "stockWasted", style: "bg-red-50 text-money-out hover:bg-red-100" },
  { reason: "count", key: "stockCount", style: "bg-amber-50 text-pending hover:bg-amber-100" },
];

const REASON_KEY: Record<StockMove["reason"], StringKey> = {
  opening: "opening",
  purchase: "stockIn",
  sale: "stockSold",
  wastage: "stockWasted",
  count: "stockCount",
};

/** One item: stock level, move stock in/out by any quantity, and its history. */
export function StockSheet({
  item,
  onClose,
  onUpdated,
}: {
  item: Item;
  onClose: () => void;
  onUpdated: (i: Item) => void;
}) {
  const { t } = useLang();
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { data: moves } = useApi<StockMove[]>(`/api/items/${item.id}/moves?r=${tick}`);

  const apply = async (reason: StockReason) => {
    const n = Number(qty);
    if (!qty || (reason !== "count" && n <= 0)) return;
    setBusy(true);
    setError(null);
    try {
      onUpdated(await postJSON<Item>(`/api/items/${item.id}/stock`, { reason, qty: n }));
      setQty("");
      setTick((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={itemLabel(item)}
      subtitle={`${formatINR(item.price)}/${item.unit} · ${t("stockValue")}: ${formatINR(item.value)}`}
      onClose={onClose}
      closeLabel={t("close")}
    >
      <div className={`rounded-3xl p-4 ${item.low ? "bg-amber-50" : "bg-mint-100"}`}>
        <p className="text-sm text-muted">{t("inStock")}</p>
        <p key={item.stock} className={`animate-pop text-4xl font-extrabold tabular-nums ${item.low ? "text-pending" : "text-forest-900"}`}>
          {item.stock} <span className="text-lg font-semibold">{item.unit}</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${item.low ? "bg-pending" : "bg-leaf-500"}`}
            style={{ width: `${stockLevel(item) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          {t("alertAt")}: {item.low_stock_at} {item.unit}
        </p>
      </div>

      <label htmlFor="qty" className="mt-4 block font-semibold text-forest-950">
        {t("quantity")}
      </label>
      <input
        id="qty"
        inputMode="numeric"
        autoComplete="off"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
        placeholder="0"
        className="mt-2 min-h-14 w-full rounded-2xl border-2 border-line bg-background px-4 text-2xl font-bold tabular-nums transition focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-leaf-500/15"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.reason}
            type="button"
            disabled={!qty || busy}
            onClick={() => void apply(a.reason)}
            className={`min-h-12 rounded-2xl font-semibold transition active:scale-95 disabled:opacity-40 ${a.style}`}
          >
            {t(a.key)}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-money-out">{error}</p>}

      <h3 className="mt-5 font-bold text-forest-950">{t("history")}</h3>
      {!moves ? (
        <div className="skeleton mt-2 h-24 rounded-2xl" />
      ) : (
        <ul className="mt-1 divide-y divide-line/60">
          {moves.map((m, i) => (
            <li key={m.id} className="animate-rise flex items-center gap-3 py-2.5" style={{ animationDelay: `${i * 30}ms` }}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-forest-950">{t(REASON_KEY[m.reason])}</span>
                <span className="text-xs text-muted">{timeAgo(m.created_at, t)}</span>
              </span>
              <span className={`font-bold tabular-nums ${m.delta >= 0 ? "text-money-in" : "text-money-out"}`}>
                {m.delta >= 0 ? "+" : "−"}
                {Math.abs(m.delta)}
              </span>
              <span className="w-14 text-right text-sm tabular-nums text-muted">→ {m.stock_after}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
