"use client";

import { type FormEvent, useState } from "react";

import { postJSON } from "@/lib/api";
import type { Item } from "@/lib/types";

import { useLang } from "./language";
import { Sheet } from "./Sheet";

const UNITS = ["pc", "kg", "packet", "litre", "dozen", "tray", "box"];

const field =
  "mt-1 min-h-12 w-full rounded-2xl border-2 border-line bg-background px-4 text-base transition focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-leaf-500/15";

/** Add an item to the price list with its opening stock. Saves only on the button tap. */
export function AddItemSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (i: Item) => void }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [variant, setVariant] = useState("");
  const [unit, setUnit] = useState("pc");
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
        stock: Number(stock || 0),
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
        <label className="block text-sm font-semibold text-forest-950">
          {t("itemName")}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dettol" className={field} required />
        </label>
        <label className="block text-sm font-semibold text-forest-950">
          {t("itemVariant")}
          <input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="125 ml" className={field} />
        </label>

        <fieldset>
          <legend className="text-sm font-semibold text-forest-950">{t("unit")}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => setUnit(u)}
                className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                  unit === u ? "bg-forest-900 text-white" : "bg-surface-2 text-forest-900 hover:bg-mint-100"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-3 gap-2">
          <label className="block text-sm font-semibold text-forest-950">
            {t("price")}
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(digits(e.target.value))} className={field} required />
          </label>
          <label className="block text-sm font-semibold text-forest-950">
            {t("inStock")}
            <input inputMode="numeric" value={stock} onChange={(e) => setStock(digits(e.target.value))} placeholder="0" className={field} />
          </label>
          <label className="block text-sm font-semibold text-forest-950">
            {t("alertAt")}
            <input inputMode="numeric" value={lowAt} onChange={(e) => setLowAt(digits(e.target.value))} className={field} />
          </label>
        </div>

        {error && <p className="text-sm text-money-out">{error}</p>}
        <button
          type="submit"
          disabled={!ready || busy}
          className="min-h-14 w-full rounded-2xl bg-forest-900 text-lg font-semibold text-white shadow-lg transition hover:bg-forest-800 active:scale-[0.98] disabled:bg-line disabled:text-muted disabled:shadow-none"
        >
          {t("save")}
        </button>
      </form>
    </Sheet>
  );
}
