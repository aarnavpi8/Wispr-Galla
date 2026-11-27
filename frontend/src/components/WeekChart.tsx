"use client";

import { useState } from "react";

import { formatINR, weekdayShort } from "@/lib/format";
import type { DayTotals } from "@/lib/types";

import { Spotlight } from "./interactive";
import { useLang } from "./language";

/** Stacked cash / UPI sales bars. Hover or tap a bar to see that day's numbers. */
export function WeekChart({ days }: { days: DayTotals[] }) {
  const { t } = useLang();
  const [active, setActive] = useState<number>(days.length - 1);
  const max = Math.max(1, ...days.map((d) => d.sales));
  const d = days[active];

  return (
    <Spotlight
      as="section"
      aria-label={t("weekSales")}
      className="animate-rise rounded-[28px] border border-line bg-surface p-4 shadow-sm [animation-delay:160ms]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-950">{t("weekSales")}</h2>
          <p className="text-sm text-muted">
            {weekdayShort(d.date, t)} · {formatINR(d.sales)}
            {d.sales > 0 && (
              <>
                {" "}
                <span className="text-forest-700">({formatINR(d.sales_cash)} {t("cashLabel")}</span>,{" "}
                <span className="text-leaf-500">{formatINR(d.sales_upi)} {t("upiLabel")})</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <i className="size-2.5 rounded-sm bg-forest-800" /> {t("cashLabel")}
          </span>
          <span className="flex items-center gap-1">
            <i className="size-2.5 rounded-sm bg-leaf-300" /> {t("upiLabel")}
          </span>
        </div>
      </div>

      <div className="mt-4 flex h-36 items-end gap-2" onPointerLeave={() => setActive(days.length - 1)}>
        {days.map((day, i) => {
          const h = (day.sales / max) * 100;
          const cashShare = day.sales ? (day.sales_cash / day.sales) * 100 : 0;
          const isActive = i === active;
          return (
            <button
              key={day.date}
              type="button"
              aria-label={`${weekdayShort(day.date, t)}: ${formatINR(day.sales)}`}
              aria-pressed={isActive}
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <div
                className={`flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-xl transition-all duration-500 ease-out ${
                  isActive ? "scale-x-110 shadow-lg shadow-forest-900/20" : "opacity-80 group-hover:opacity-100"
                }`}
                style={{ height: `${Math.max(h, 4)}%` }}
              >
                {day.sales === 0 ? (
                  <div className="h-full bg-line" />
                ) : (
                  <>
                    <div className="bg-forest-800" style={{ height: `${cashShare}%` }} />
                    <div className="flex-1 bg-leaf-300" />
                  </>
                )}
              </div>
              <span className={`text-xs ${isActive ? "font-bold text-forest-950" : "text-muted"}`}>
                {i === days.length - 1 ? t("today") : weekdayShort(day.date, t)}
              </span>
            </button>
          );
        })}
      </div>
    </Spotlight>
  );
}
