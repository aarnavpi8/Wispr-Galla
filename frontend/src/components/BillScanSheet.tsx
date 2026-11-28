"use client";

import { useEffect, useState } from "react";

import { postJSON } from "@/lib/api";
import { itemLabel } from "@/lib/format";
import type { Item, ScanLine } from "@/lib/types";

import { useLang } from "./language";
import { Sheet } from "./Sheet";
import { ListenButton } from "./HelpTip";

type Step = "pick" | "reading" | "review" | "done";

interface Row {
  key: number;
  raw: string;
  itemId: number | null;
  qty: number;
  on: boolean;
  confidence: number;
  alternatives: number[];
  rate: number | null;
}

/**
 * Bill scan, as simple as it gets: photo -> read on the phone (Tesseract.js) -> matched
 * lines to tick -> one tap adds them all to stock. Nothing changes until that tap.
 */
export function BillScanSheet({
  items,
  onClose,
  onDone,
  readBill,
}: {
  items: Item[];
  onClose: () => void;
  onDone: (updated: Item[]) => void;
  /** Injected for tests; defaults to the real OCR. */
  readBill?: (file: Blob, onProgress: (p: number) => void) => Promise<string>;
}) {
  const { t } = useLang();
  const [step, setStep] = useState<Step>("pick");
  const [progress, setProgress] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo)), [photo]);

  const byId = new Map(items.map((i) => [i.id, i]));

  const start = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPhoto(URL.createObjectURL(file));
    setProgress(0);
    setStep("reading");
    try {
      const read = readBill ?? (await import("@/lib/ocr")).readBill;
      const text = await read(file, setProgress);
      const lines = await postJSON<ScanLine[]>("/api/items/scan", { text });
      if (!lines.some((l) => l.item_id)) {
        setError(t("scanEmpty"));
        setStep("pick");
        return;
      }
      setRows(
        lines.map((l, key) => ({
          key,
          raw: l.raw,
          itemId: l.item_id,
          qty: l.qty,
          on: l.item_id !== null,
          confidence: l.confidence,
          alternatives: l.alternatives,
          rate: l.rate ?? null,
        })),
      );
      setStep("review");
    } catch {
      setError(t("scanFailed"));
      setStep("pick");
    }
  };

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const chosen = rows.filter((r) => r.on && r.itemId && r.qty > 0);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await postJSON<Item[]>("/api/items/stock-batch", {
        lines: chosen.map((r) => ({ item_id: r.itemId, qty: r.qty, unit_cost: r.rate })),
      });
      setDoneCount(updated.length);
      setStep("done");
      onDone(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={t("scanBill")} subtitle={t("scanSub")} onClose={onClose} closeLabel={t("close")}>
      {step === "pick" && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
            <ol className="flex-1 space-y-1 text-sm text-ink-950/85">
              <li>① {t("takePhoto")}</li>
              <li>② {t("checkLines")}</li>
              <li>③ {t("stockIn")} ✓</li>
            </ol>
            <ListenButton text={t("helpScan")} className="shrink-0" />
          </div>
          {error && (
            <p role="alert" className="rounded-2xl bg-amber-50 p-3 text-sm text-pending">
              {error}
            </p>
          )}
          <label className="group flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-iris-500/50 bg-iris-100/60 text-ink-900 transition hover:border-iris-500 hover:bg-iris-100">
            <span className="grid size-16 place-items-center rounded-full bg-brand-600 text-white shadow-lg transition group-hover:scale-105">
              <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
                <circle cx="12" cy="12.5" r="3.5" />
              </svg>
            </span>
            <span className="text-lg font-bold">{t("takePhoto")}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={t("takePhoto")}
              onChange={(e) => void start(e.target.files?.[0])}
            />
          </label>
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl text-sm font-semibold text-ink-800 transition hover:bg-iris-100">
            {t("fromGallery")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={t("fromGallery")}
              onChange={(e) => void start(e.target.files?.[0])}
            />
          </label>
        </div>
      )}

      {step === "reading" && (
        <div className="flex flex-col items-center gap-4 py-2" role="status">
          {photo && (
            <div className="relative h-48 w-full overflow-hidden rounded-3xl bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="" className="size-full object-cover opacity-80" />
              {/* Scanner line sweeping the photo */}
              <div className="animate-[scan_1.6s_ease-in-out_infinite_alternate] absolute inset-x-0 h-1 bg-gold-300 shadow-[0_0_20px_4px_rgb(215_240_138/0.7)]" />
            </div>
          )}
          <p className="font-semibold text-ink-950">{t("reading")}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-iris-500 transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-xs text-muted">{t("readingFirst")}</p>
        </div>
      )}

      {step === "review" && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-950">{t("checkLines")}</p>
          <ul className="space-y-2">
            {rows.map((r) => {
              const sure = r.itemId !== null && r.confidence >= 0.8;
              return (
                <li
                  key={r.key}
                  className={`animate-rise rounded-2xl border p-3 transition ${
                    !r.on ? "border-line opacity-55" : sure ? "border-line bg-surface" : "border-amber-300 bg-amber-50"
                  }`}
                  style={{ animationDelay: `${r.key * 40}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={r.on}
                      disabled={!r.itemId}
                      onChange={(e) => update(r.key, { on: e.target.checked })}
                      aria-label={r.raw}
                      className="size-6 shrink-0 accent-[var(--ink-800)]"
                    />
                    <div className="min-w-0 flex-1">
                      <select
                        value={r.itemId ?? ""}
                        onChange={(e) => {
                          const id = Number(e.target.value) || null;
                          update(r.key, { itemId: id, on: !!id, confidence: id ? 1 : 0 });
                        }}
                        aria-label={`${t("pickItem")}: ${r.raw}`}
                        className="w-full truncate rounded-xl border border-line bg-background px-2 py-1.5 font-semibold text-ink-950"
                      >
                        <option value="">{t("notRecognised")}</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {itemLabel(i)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 truncate text-xs text-muted">“{r.raw}”</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="−1"
                        onClick={() => update(r.key, { qty: Math.max(1, r.qty - 1) })}
                        className="grid size-9 place-items-center rounded-xl bg-surface-2 font-bold active:scale-90"
                      >
                        −
                      </button>
                      <input
                        inputMode="numeric"
                        value={r.qty}
                        onChange={(e) => update(r.key, { qty: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
                        aria-label={`${t("quantity")}: ${r.raw}`}
                        className="w-12 rounded-lg bg-transparent text-center font-bold tabular-nums"
                      />
                      <button
                        type="button"
                        aria-label="+1"
                        onClick={() => update(r.key, { qty: r.qty + 1 })}
                        className="grid size-9 place-items-center rounded-xl bg-iris-100 font-bold active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {/* Low confidence: up to 3 tap-to-pick alternatives (robustness rule). */}
                  {r.on && !sure && r.alternatives.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.alternatives.slice(0, 3).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => update(r.key, { itemId: id, confidence: 1 })}
                          className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink-800 ring-1 ring-amber-300 transition hover:bg-iris-100"
                        >
                          {byId.get(id) ? itemLabel(byId.get(id)!) : id}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {error && <p className="mt-2 text-sm text-money-out">{error}</p>}
          <div className="sticky bottom-0 -mx-5 mt-4 bg-gradient-to-t from-surface via-surface to-transparent px-5 pt-4">
            <button
              type="button"
              disabled={!chosen.length || saving}
              onClick={() => void save()}
              className="min-h-14 w-full rounded-2xl bg-brand-600 text-lg font-semibold text-white shadow-lg transition hover:bg-brand-500 active:scale-[0.98] disabled:bg-line disabled:text-muted"
            >
              {t("addToStock", { n: chosen.length })}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
          <span className="animate-pop grid size-20 place-items-center rounded-full bg-iris-500 text-4xl text-white shadow-xl shadow-iris-500/30">
            ✓
          </span>
          <p className="text-xl font-bold text-ink-950">{t("scanDone", { n: doneCount })}</p>
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => {
                setRows([]);
                setStep("pick");
              }}
              className="min-h-12 flex-1 rounded-2xl bg-surface-2 font-semibold text-ink-900 transition hover:bg-iris-100"
            >
              {t("scanAgain")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 flex-1 rounded-2xl bg-brand-600 font-semibold text-white transition hover:bg-brand-500"
            >
              {t("close")}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
