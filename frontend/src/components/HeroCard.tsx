"use client";

import { useState } from "react";

import { formatINR } from "@/lib/format";
import type { Summary } from "@/lib/types";

import { CountUp, TiltCard } from "./interactive";
import { useLang } from "./language";
import { HelpTip } from "./HelpTip";

type Range = "today" | "week";

/** Deep green money card: expected cash in the galla plus today's / this week's flow. */
export function HeroCard({ summary }: { summary: Summary }) {
  const { t } = useLang();
  // Seed history has nothing for today, so start on the week view to never show zeroes.
  const [range, setRange] = useState<Range>(summary.today.entries > 0 ? "today" : "week");

  const week = summary.days.reduce(
    (acc, d) => ({
      sales: acc.sales + d.sales,
      collected: acc.collected + d.collected,
      udhaar: acc.udhaar + d.udhaar_given,
      out: acc.out + d.cash_out,
    }),
    { sales: 0, collected: 0, udhaar: 0, out: 0 },
  );
  const td = summary.today;
  const stats =
    range === "today"
      ? { sales: td.sales, collected: td.collected, udhaar: td.udhaar_given, out: td.cash_out }
      : week;

  return (
    <TiltCard className="animate-rise overflow-hidden rounded-[28px] bg-gradient-to-br from-forest-800 via-forest-900 to-forest-950 p-5 text-white shadow-2xl shadow-forest-900/25">
      {/* Decorative coin rings */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full border-[28px] border-white/5" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-4 size-40 rounded-full bg-lime-300/10 blur-2xl" />

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium text-leaf-300">
          {t("expectedCash")} <HelpTip title="expectedCash" body="helpExpected" tone="dark" />
        </p>
        <div role="tablist" aria-label="Samay" className="flex rounded-full bg-white/10 p-1 text-sm">
          {(["today", "week"] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                range === r ? "bg-lime-300 text-forest-950 shadow" : "text-white/70 hover:text-white"
              }`}
            >
              {r === "today" ? t("today") : t("week")}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-5xl font-extrabold tracking-tight" style={{ transform: "translateZ(30px)" }}>
        <CountUp value={summary.expected_cash_today} format={formatINR} />
      </p>
      <p className="mt-1 text-sm text-white/60">
        {t("openingNote", { x: formatINR(summary.opening_cash) })}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-2" style={{ transform: "translateZ(20px)" }}>
        <Stat label={t("sales")} value={stats.sales} tone="text-lime-300" />
        <Stat label={t("collected")} value={stats.collected} tone="text-leaf-300" />
        <Stat label={t("udhaarGiven")} value={stats.udhaar} tone="text-amber-300" />
        <Stat label={t("cashOut")} value={stats.out} tone="text-rose-300" />
      </dl>
    </TiltCard>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10 transition hover:bg-white/[0.12]">
      <dt className="text-xs text-white/60">{label}</dt>
      <dd className={`text-lg font-bold ${tone}`}>
        <CountUp value={value} format={formatINR} />
      </dd>
    </div>
  );
}
