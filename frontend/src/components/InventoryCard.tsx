"use client";

import { useState } from "react";

import { postJSON, useApi } from "@/lib/api";
import { formatINR, itemLabel, stockLevel } from "@/lib/format";
import type { EntryOut, Item, PartyBalance, SellOut, StockReason } from "@/lib/types";

import { AddItemSheet } from "./AddItemSheet";
import { BillScanSheet } from "./BillScanSheet";
import { Spotlight } from "./interactive";
import { useLang } from "./language";
import { StockSheet } from "./StockSheet";
import { HelpTip } from "./HelpTip";

const PREVIEW = 6;

/** Inventory: what's on the shelf, what's running low, quick in/out, and new items. */
export function InventoryCard({
  onChanged,
  onSold,
  parties = [],
}: {
  onChanged?: () => void;
  /** A sale was recorded from the stock screen (show "Saved ₹x · Undo"). */
  onSold?: (entry: EntryOut) => void;
  parties?: PartyBalance[];
}) {
  const { t } = useLang();
  const { data: items, setData, reload } = useApi<Item[]>("/api/items");
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replace = (updated: Item) => {
    setData((list) => list?.map((i) => (i.id === updated.id ? updated : i)) ?? list);
    onChanged?.();
  };

  // One tap = one unit in or out. Optimistic, rolled back if the server says no.
  const step = async (item: Item, reason: StockReason) => {
    setError(null);
    const delta = reason === "purchase" ? 1 : -1;
    if (item.stock + delta < 0) return;
    const guess = { ...item, stock: item.stock + delta, value: (item.stock + delta) * item.price, low: item.stock + delta <= item.low_stock_at };
    setData((list) => list?.map((i) => (i.id === item.id ? guess : i)) ?? list);
    try {
      if (reason === "sale") {
        // Sold one: money in and stock down together (a cash sale at the item's price).
        const out = await postJSON<SellOut>(`/api/items/${item.id}/sell`, { qty: 1, mode: "cash" });
        replace(out.item);
        if (out.entry) onSold?.(out.entry);
        else setError(t("noPriceSale"));
      } else {
        replace(await postJSON<Item>(`/api/items/${item.id}/stock`, { reason, qty: 1 }));
      }
    } catch (e) {
      setData((list) => list?.map((i) => (i.id === item.id ? item : i)) ?? list);
      setError((e as Error).message);
    }
  };

  const lowCount = items?.filter((i) => i.low).length ?? 0;
  const total = items?.reduce((s, i) => s + i.value, 0) ?? 0;
  const q = query.trim().toLowerCase();
  const filtered = (items ?? [])
    .filter((i) => (!lowOnly || i.low) && itemLabel(i).toLowerCase().includes(q))
    // Low stock first, then by name.
    .sort((a, b) => Number(b.low) - Number(a.low) || itemLabel(a).localeCompare(itemLabel(b)));
  const visible = showAll || q || lowOnly ? filtered : filtered.slice(0, PREVIEW);

  return (
    <section aria-labelledby="stock-title" className="rounded-[28px] border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="stock-title" className="flex items-center gap-2 text-lg font-bold text-forest-950">
            {t("stockTitle")} <HelpTip title="stockTitle" body="helpStock" />
          </h2>
          <p className="text-sm text-muted">
            {items ? t("stockSub", { n: items.length, x: formatINR(total) }) : "…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-forest-900 px-4 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-forest-800 active:scale-95"
        >
          <span aria-hidden className="text-lg leading-none">
            +
          </span>
          {t("addItem")}
        </button>
      </div>

      {/* The easy way to add stock: photograph the supplier's bill. */}
      <button
        type="button"
        onClick={() => setScanning(true)}
        disabled={!items}
        className="group mt-3 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-forest-800 to-forest-700 p-3 text-left text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] disabled:opacity-60"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime-300 text-forest-950 transition group-hover:rotate-[-6deg] group-hover:scale-105">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
            <circle cx="12" cy="12.5" r="3.5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-bold">{t("scanBill")}</span>
          <span className="block truncate text-xs text-white/70">{t("scanSub")}</span>
        </span>
        <span aria-hidden className="transition group-hover:translate-x-1">
          →
        </span>
      </button>

      {lowCount > 0 && (
        <button
          type="button"
          onClick={() => setLowOnly((v) => !v)}
          aria-pressed={lowOnly}
          className={`mt-3 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition ${
            lowOnly ? "bg-pending text-white" : "bg-amber-50 text-pending ring-1 ring-amber-200 hover:bg-amber-100"
          }`}
        >
          <span aria-hidden>⚠️</span>
          <span className="flex-1">{t("lowStockAlert", { n: lowCount })}</span>
          <span className="text-xs opacity-80">{lowOnly ? t("allItems") : t("lowStock")}</span>
        </button>
      )}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchItems")}
        aria-label={t("searchItems")}
        className="mt-3 min-h-12 w-full rounded-2xl border border-line bg-background px-4 text-base transition focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-leaf-500/15"
      />
      {error && <p className="mt-2 text-sm text-money-out">{error}</p>}

      {!items ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {visible.map((item, idx) => (
            <li key={item.id} className="animate-rise" style={{ animationDelay: `${Math.min(idx, 8) * 35}ms` }}>
              <Spotlight
                rim={false}
                className={`flex items-center gap-3 rounded-2xl border bg-surface p-2.5 transition hover:shadow-md ${
                  item.low ? "border-amber-200" : "border-line"
                }`}
              >
                <button type="button" onClick={() => setOpen(item)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-semibold text-forest-950">{itemLabel(item)}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {formatINR(item.price)}/{item.unit}
                    {item.low && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-pending">{t("lowStock")}</span>
                    )}
                  </span>
                  <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <span
                      className={`block h-full rounded-full transition-[width] duration-500 ${item.low ? "bg-pending" : "bg-leaf-500"}`}
                      style={{ width: `${stockLevel(item) * 100}%` }}
                    />
                  </span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${itemLabel(item)}: ${t("stockSold")} 1`}
                    disabled={item.stock === 0}
                    onClick={() => void step(item, "sale")}
                    className="grid size-10 place-items-center rounded-xl bg-surface-2 text-xl font-bold text-forest-900 transition hover:bg-red-50 hover:text-money-out active:scale-90 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span
                    key={item.stock}
                    className={`animate-pop w-12 text-center font-bold tabular-nums ${item.low ? "text-pending" : "text-forest-950"}`}
                    aria-label={t("left", { n: item.stock })}
                  >
                    {item.stock}
                    <span className="block text-[10px] font-normal text-muted">{item.unit}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${itemLabel(item)}: ${t("stockIn")} 1`}
                    onClick={() => void step(item, "purchase")}
                    className="grid size-10 place-items-center rounded-xl bg-mint-100 text-xl font-bold text-forest-900 transition hover:bg-leaf-300 active:scale-90"
                  >
                    +
                  </button>
                </div>
              </Spotlight>
            </li>
          ))}
        </ul>
      )}

      {items && !showAll && !q && !lowOnly && filtered.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 min-h-11 w-full rounded-2xl text-sm font-semibold text-forest-800 transition hover:bg-mint-100"
        >
          {t("allItems")} ({filtered.length}) ↓
        </button>
      )}

      {open && (
        <StockSheet
          item={items?.find((i) => i.id === open.id) ?? open}
          onClose={() => setOpen(null)}
          onUpdated={replace}
          onSold={(entry) => onSold?.(entry)}
          parties={parties}
        />
      )}
      {scanning && items && (
        <BillScanSheet
          items={items}
          onClose={() => setScanning(false)}
          onDone={(updated) => {
            const byId = new Map(updated.map((u) => [u.id, u]));
            setData((list) => list?.map((i) => byId.get(i.id) ?? i) ?? list);
            onChanged?.();
          }}
        />
      )}
      {adding && (
        <AddItemSheet
          onClose={() => setAdding(false)}
          onAdded={() => {
            reload();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}
