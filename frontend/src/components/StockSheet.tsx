"use client";

import { useState } from "react";

import { patchJSON, postJSON, useApi } from "@/lib/api";
import { formatINR, itemLabel, stockLevel, timeAgo } from "@/lib/format";
import type { StringKey } from "@/lib/i18n";
import type { EntryOut, Item, Mode, PartyBalance, SellOut, StockMove, StockReason } from "@/lib/types";

import { SHELF_LIFE } from "./AddItemSheet";
import { useLang } from "./language";
import { Sheet } from "./Sheet";

const ACTIONS: { reason: StockReason; key: StringKey; style: string }[] = [
  { reason: "purchase", key: "stockIn", style: "bg-brand-600 text-white hover:bg-brand-500" },
  { reason: "sale", key: "stockSold", style: "bg-surface-2 text-ink-950 hover:bg-line" },
  { reason: "wastage", key: "stockWasted", style: "bg-red-50 text-money-out hover:bg-red-100" },
  { reason: "count", key: "stockCount", style: "bg-amber-50 text-pending hover:bg-amber-100" },
];

const REASON_KEY: Record<StockMove["reason"], StringKey> = {
  opening: "opening",
  purchase: "stockIn",
  sale: "stockSold",
  wastage: "stockWasted",
  count: "stockCount",
  undo: "undoMove",
};

/** One item: stock level, move stock in/out by any quantity, and its history. */
export function StockSheet({
  item,
  onClose,
  onUpdated,
  onSold,
  parties = [],
}: {
  item: Item;
  onClose: () => void;
  onUpdated: (i: Item) => void;
  onSold?: (entry: EntryOut) => void;
  parties?: PartyBalance[];
}) {
  const { t } = useLang();
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [price, setPrice] = useState(String(item.price));
  const [cost, setCost] = useState(item.cost_price ? String(item.cost_price) : "");
  const [costIn, setCostIn] = useState("");
  const [saleMode, setSaleMode] = useState<Mode>("cash");
  const [buyer, setBuyer] = useState<number | null>(null);

  const savePrice = async () => {
    const n = Number(price);
    if (price === "" || n === item.price) return;
    setError(null);
    try {
      onUpdated(await patchJSON<Item>(`/api/items/${item.id}`, { price: n }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const saveCost = async () => {
    const n = Number(cost);
    if (cost === "" || n === (item.cost_price ?? 0)) return;
    setError(null);
    try {
      onUpdated(await patchJSON<Item>(`/api/items/${item.id}`, { cost_price: n }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const { data: moves } = useApi<StockMove[]>(`/api/items/${item.id}/moves?r=${tick}`);

  const apply = async (reason: StockReason) => {
    const n = Number(qty);
    if (!qty || (reason !== "count" && n <= 0)) return;
    setBusy(true);
    setError(null);
    try {
      if (reason === "sale") {
        // Sold: record the money and take it off the shelf in one go.
        const out = await postJSON<SellOut>(`/api/items/${item.id}/sell`, {
          qty: n,
          mode: saleMode,
          party_id: saleMode === "udhaar" ? buyer : null,
        });
        onUpdated(out.item);
        if (out.entry) onSold?.(out.entry);
        else setError(t("noPriceSale"));
      } else {
        if (reason === "purchase" && !costIn && !item.cost_price) {
          // Stock can't come in without what it cost: ask, in the shopkeeper's words.
          setError(t("askCost", { item: item.name, unit: item.unit }));
          return;
        }
        const after = await postJSON<Item>(`/api/items/${item.id}/stock`, {
          reason,
          qty: n,
          unit_cost: reason === "purchase" && costIn ? Number(costIn) : null,
        });
        onUpdated(after);
        if (reason === "purchase" && after.cost_price) setCost(String(after.cost_price));
        setCostIn("");
      }
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
      <div className={`rounded-3xl p-4 ${item.low ? "bg-amber-50" : "bg-iris-100"}`}>
        <p className="text-sm text-muted">{t("inStock")}</p>
        <p key={item.stock} className={`animate-pop text-4xl font-extrabold tabular-nums ${item.low ? "text-pending" : "text-ink-900"}`}>
          {item.stock} <span className="text-lg font-semibold">{item.unit}</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${item.low ? "bg-pending" : "bg-iris-500"}`}
            style={{ width: `${stockLevel(item) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          {t("alertAt")}: {item.low_stock_at} {item.unit}
        </p>
      </div>

      {/* Price: starter items come in at ₹0, so make setting it obvious. */}
      <div className={`mt-4 flex items-end gap-2 rounded-2xl p-3 ${item.price === 0 ? "bg-amber-50 ring-1 ring-amber-200" : "bg-surface-2"}`}>
        <label className="flex-1 text-sm font-semibold text-ink-950">
          {t("price")} / {item.unit}
          <input
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && void savePrice()}
            className="mt-1 min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3 text-xl font-bold tabular-nums focus:border-iris-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => void savePrice()}
          disabled={price === "" || Number(price) === item.price}
          className="min-h-12 rounded-xl bg-brand-600 px-4 font-semibold text-white transition hover:bg-brand-500 active:scale-95 disabled:opacity-40"
        >
          {t("setPrice")}
        </button>
      </div>

      {/* Cost: what one unit cost to buy (weighted average after each stock-in). */}
      <div className={`mt-2 flex items-end gap-2 rounded-2xl p-3 ${item.cost_price ? "bg-surface-2" : "bg-amber-50 ring-1 ring-amber-200"}`}>
        <label className="flex-1 text-sm font-semibold text-ink-950">
          {t("costPrice")} / {item.unit}
          <input
            inputMode="numeric"
            value={cost}
            placeholder="0"
            onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && void saveCost()}
            className="mt-1 min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3 text-xl font-bold tabular-nums focus:border-iris-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => void saveCost()}
          disabled={cost === "" || Number(cost) === (item.cost_price ?? 0)}
          className="min-h-12 rounded-xl bg-brand-600 px-4 font-semibold text-white transition hover:bg-brand-500 active:scale-95 disabled:opacity-40"
        >
          {t("setCost")}
        </button>
      </div>
      {/* How long it stays good: guessed from the name until the shopkeeper picks (spoilage estimate). */}
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold text-ink-950">{t("shelfLife")}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {SHELF_LIFE.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={item.shelf_life === s.value}
              onClick={() => void patchJSON<Item>(`/api/items/${item.id}`, { shelf_life: s.value }).then(onUpdated)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                item.shelf_life === s.value ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-900 hover:bg-iris-100"
              }`}
            >
              {t(s.key)}
            </button>
          ))}
        </div>
      </fieldset>
      {item.cost_price && item.margin != null ? (
        <p className={`mt-1 text-sm font-semibold ${item.margin >= 0 ? "text-money-in" : "text-money-out"}`}>
          {t("marginEach", { x: formatINR(item.margin), u: item.unit })}
        </p>
      ) : null}

      <label htmlFor="qty" className="mt-4 block font-semibold text-ink-950">
        {t("quantity")}
      </label>
      <input
        id="qty"
        inputMode="numeric"
        autoComplete="off"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
        placeholder="0"
        className="mt-2 min-h-14 w-full rounded-2xl border-2 border-line bg-background px-4 text-2xl font-bold tabular-nums transition focus:border-iris-500 focus:outline-none focus:ring-4 focus:ring-iris-500/15"
      />
      {/* Selling: how the money came, and what it adds to sales. */}
      <div className="mt-3 rounded-2xl bg-surface-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("stockSold")} · {t("fMode")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label={t("fMode")}>
          {(["cash", "upi", "udhaar"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={saleMode === m}
              onClick={() => setSaleMode(m)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${
                saleMode === m ? "bg-brand-600 text-white" : "bg-surface text-ink-900 hover:bg-iris-100"
              }`}
            >
              {t(m === "cash" ? "mCash" : m === "upi" ? "mUpi" : "mUdhaar")}
            </button>
          ))}
        </div>
        {saleMode === "udhaar" && (
          <label className="mt-2 block text-sm font-semibold text-ink-950">
            {t("fWho")}
            <select
              value={buyer ?? ""}
              onChange={(e) => setBuyer(Number(e.target.value) || null)}
              className="mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-base"
            >
              <option value="">{t("askWho")}</option>
              {parties
                .filter((p) => p.kind === "customer")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {Number(qty) > 0 && (
          <p className="mt-2 text-sm font-semibold text-money-in">
            {item.price > 0
              ? t("saleWorth", { q: qty, p: formatINR(item.price), x: formatINR(item.price * Number(qty)) })
              : t("noPriceSale")}
          </p>
        )}
      </div>

      {Number(qty) > 0 && (
        <label className="mt-3 block text-sm font-semibold text-ink-950">
          {t("stockIn")} · {t("youPay")} / {item.unit}
          {item.cost_price ? ` (${t("optional")})` : ""}
          <input
            inputMode="numeric"
            value={costIn}
            placeholder={item.cost_price ? String(item.cost_price) : "0"}
            onChange={(e) => setCostIn(e.target.value.replace(/[^\d]/g, ""))}
            className="mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-base tabular-nums focus:border-iris-500 focus:outline-none"
          />
        </label>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.reason}
            type="button"
            disabled={!qty || busy || (a.reason === "sale" && saleMode === "udhaar" && !buyer)}
            onClick={() => void apply(a.reason)}
            className={`min-h-12 rounded-2xl font-semibold transition active:scale-95 disabled:opacity-40 ${a.style}`}
          >
            {t(a.key)}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-money-out">{error}</p>}

      <h3 className="mt-5 font-bold text-ink-950">{t("history")}</h3>
      {!moves ? (
        <div className="skeleton mt-2 h-24 rounded-2xl" />
      ) : (
        <ul className="mt-1 divide-y divide-line/60">
          {moves.map((m, i) => (
            <li key={m.id} className="animate-rise flex items-center gap-3 py-2.5" style={{ animationDelay: `${i * 30}ms` }}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-950">{t(REASON_KEY[m.reason])}</span>
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
