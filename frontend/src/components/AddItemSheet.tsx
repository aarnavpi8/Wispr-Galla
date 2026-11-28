"use client";

import { type FormEvent, useState } from "react";

import { postJSON } from "@/lib/api";
import type { Item } from "@/lib/types";

import { useLang } from "./language";
import { Sheet } from "./Sheet";

const UNITS = ["pc", "kg", "packet", "litre", "dozen", "tray", "box"];

const field =
  "mt-1 min-h-12 w-full rounded-2xl border-2 border-line bg-background px-4 text-base transition focus:border-iris-500 focus:outline-none focus:ring-4 focus:ring-iris-500/15";

/** Add an item to the price list with its opening stock. Saves only on the button tap. */
export function AddItemSheet({
  onClose,
  onAdded,
  initialName = "",
  initialUnit = "pc",
  stockFromEntry = false,
}: {
  onClose: () => void;
  onAdded: (i: Item) => void;
  initialName?: string;
  initialUnit?: string;
  /** Opened from a purchase card: that entry brings the stock in, so no opening stock here (it would count twice). */
  stockFromEntry?: boolean;
}) {
  const { t } = useLang();
  const [name, setName] = useState(initialName);
  const [variant, setVariant] = useState("");
  // A spoken unit we don't list ("bottle") stays a choice instead of turning into "pc".
  const units = initialUnit && !UNITS.includes(initialUnit) ? [...UNITS, initialUnit] : UNITS;
  const [unit, setUnit] = useState(initialUnit || "pc");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [lowAt, setLowAt] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = (v: string) => v.replace(/[^\d]/g, "");
  const ready = name.trim() && price;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const item = await postJSON<Item>("/api/items", {
        name: name.trim(),
        variant: variant.trim() || null,
        unit,
        price: Number(price),
        stock: stockFromEntry ? 0 : Number(stock || 0),
        low_stock_at: Number(lowAt || 0),
      });
      onAdded(item);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={t("addItem")} onClose={onClose} closeLabel={t("close")}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-semibold text-ink-950">
          {t("itemName")}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dettol" className={field} required />
        </label>
        <label className="block text-sm font-semibold text-ink-950">
          {t("itemVariant")}
          <input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="125 ml" className={field} />
        </label>

        <fieldset>
          <legend className="text-sm font-semibold text-ink-950">{t("unit")}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {units.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => setUnit(u)}
                className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                  unit === u ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-900 hover:bg-iris-100"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </fieldset>

        <div className={`grid gap-2 ${stockFromEntry ? "grid-cols-2" : "grid-cols-3"}`}>
          <label className="block text-sm font-semibold text-ink-950">
            {t("price")}
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(digits(e.target.value))} className={field} required />
          </label>
          {!stockFromEntry && (
            <label className="block text-sm font-semibold text-ink-950">
              {t("inStock")}
              <input
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(digits(e.target.value))}
                placeholder="0"
                className={field}
              />
            </label>
          )}
          <label className="block text-sm font-semibold text-ink-950">
            {t("alertAt")}
            <input inputMode="numeric" value={lowAt} onChange={(e) => setLowAt(digits(e.target.value))} className={field} />
          </label>
        </div>

        {error && <p className="text-sm text-money-out">{error}</p>}
        <button
          type="submit"
          disabled={!ready || busy}
          className="min-h-14 w-full rounded-2xl bg-brand-600 text-lg font-semibold text-white shadow-lg transition hover:bg-brand-500 active:scale-[0.98] disabled:bg-line disabled:text-muted disabled:shadow-none"
        >
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
