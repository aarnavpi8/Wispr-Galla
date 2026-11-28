"use client";

import { useState } from "react";

import { postJSON, useApi } from "@/lib/api";
import { balanceTone, entryMeta, FLOW_SIGN, FLOW_TEXT, formatINR, timeAgo } from "@/lib/format";
import type { DayCloseOut, DayCloseView } from "@/lib/types";

import { useLang } from "./language";
import { Sheet } from "./Sheet";

/** Flow 3: expected cash vs counted cash, the gap, and the cash entries that could explain it. */
export function DayCloseSheet({ onClose, onSaved }: { onClose: () => void; onSaved?: (c: DayCloseOut) => void }) {
  const { t } = useLang();
  const { data: view } = useApi<DayCloseView>("/api/day-close");
  const [counted, setCounted] = useState("");
  const [result, setResult] = useState<DayCloseOut | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = result ?? view?.closed ?? null;
  const amount = Number(counted.replace(/[^\d]/g, ""));

  const save = async () => {
    if (!counted) return;
    setSaving(true);
    setError(null);
    try {
      const out = await postJSON<DayCloseOut>("/api/day-close", { counted: amount });
      setResult(out);
      onSaved?.(out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={t("closeDay")} subtitle={t("closeDaySub")} onClose={onClose} closeLabel={t("close")}>
      {!view ? (
        <div className="skeleton h-40 rounded-3xl" />
      ) : (
        <>
          <div className="rounded-3xl bg-gradient-to-br from-iris-100 to-gold-100 p-4 text-ink-950 ring-1 ring-line">
            <p className="text-sm text-ink-700">{t("expected")}</p>
            <p className={`text-4xl font-extrabold tabular-nums ${balanceTone(view.expected)}`}>{formatINR(view.expected)}</p>
            <p className="mt-1 text-xs text-muted">
              {formatINR(view.opening)} + {formatINR(view.cash_in)} − {formatINR(view.cash_out)}
            </p>
          </div>

          <label htmlFor="counted" className="mt-4 block font-semibold text-ink-950">
            {t("howMuch")}
          </label>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted">₹</span>
              <input
                id="counted"
                inputMode="numeric"
                autoComplete="off"
                value={counted}
                onChange={(e) => setCounted(e.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && void save()}
                placeholder={String(view.expected)}
                className="min-h-14 w-full rounded-2xl border-2 border-line bg-background pl-10 pr-4 text-2xl font-bold tabular-nums transition focus:border-iris-500 focus:outline-none focus:ring-4 focus:ring-iris-500/15"
              />
            </div>
            <button
              type="button"
              disabled={!counted || saving}
              onClick={() => void save()}
              className="min-h-14 rounded-2xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-500 active:scale-95 disabled:bg-line disabled:text-muted"
            >
              {t("save")}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-money-out">{error}</p>}

          {shown && (
            <div
              key={shown.id}
              role="status"
              className={`animate-pop mt-4 rounded-3xl p-4 ${
                shown.difference === 0 ? "bg-iris-100" : shown.difference < 0 ? "bg-red-50" : "bg-amber-50"
              }`}
            >
              <p className="text-sm text-muted">{t("lastClose", { x: formatINR(shown.counted) })}</p>
              <p
                className={`text-2xl font-extrabold ${
                  shown.difference === 0 ? "text-money-in" : shown.difference < 0 ? "text-money-out" : "text-pending"
                }`}
              >
                {shown.difference === 0
                  ? t("matched")
                  : shown.difference < 0
                    ? t("short", { x: formatINR(-shown.difference) })
                    : t("extra", { x: formatINR(shown.difference) })}
              </p>
            </div>
          )}

          {shown && shown.difference !== 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-ink-950">{t("gapHint")}</p>
              {view.entries.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("noCashToday")}</p>
              ) : (
                <ul className="mt-2 divide-y divide-line/60">
                  {view.entries.map((e) => {
                    const m = entryMeta(e.type, "cash");
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2">
                        <span aria-hidden className="text-xl">
                          {m.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm" title={t(m.label)}>“{e.raw_text}”</span>
                        <span className={`text-sm font-bold ${FLOW_TEXT[m.flow]}`}>
                          {FLOW_SIGN[m.flow]}
                          {formatINR(e.amount)}
                        </span>
                        <span className="text-xs text-muted">{timeAgo(e.created_at, t)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
