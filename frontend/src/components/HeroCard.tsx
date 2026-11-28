"use client";

import { useState } from "react";

import { balanceTone, formatINR } from "@/lib/format";
import type { Summary } from "@/lib/types";

import { CountUp, TiltCard } from "./interactive";
import { useLang } from "./language";
import { HelpTip } from "./HelpTip";

type Range = "today" | "week";

/** Indigo money card: expected cash in the galla plus today's / this week's flow. */
export type HeroTarget = "sales" | "collected" | "udhaar" | "out";

export function HeroCard({ summary, onOpen }: { summary: Summary; onOpen?: (what: HeroTarget) => void }) {
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
    <TiltCard className="animate-rise overflow-hidden rounded-[28px] bg-gradient-to-br from-iris-100 via-surface to-gold-100 p-5 text-ink-950 shadow-xl shadow-ink-950/5 ring-1 ring-line">
      {/* Decorative coin rings */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full border-[28px] border-iris-300/15" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-4 size-40 rounded-full bg-gold-300/20 blur-2xl" />

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
          {t("expectedCash")} <HelpTip title="expectedCash" body="helpExpected" />
        </p>
        <div role="tablist" aria-label="Samay" className="flex rounded-full bg-white/80 p-1 text-sm ring-1 ring-line">
          {(["today", "week"] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                range === r ? "bg-gold-300 text-ink-950 shadow" : "text-ink-700 hover:text-ink-950"
              }`}
            >
              {r === "today" ? t("today") : t("week")}
            </button>
          ))}
        </div>
      </div>

      <p
        className={`mt-2 text-5xl font-extrabold tracking-tight transition-colors ${balanceTone(summary.expected_cash_today)}`}
        style={{ transform: "translateZ(30px)" }}
      >
        <CountUp value={summary.expected_cash_today} format={formatINR} />
      </p>
      <p className="mt-1 text-sm text-muted">
        {t("openingNote", { x: formatINR(summary.opening_cash) })}
      </p>

      <dl className="reveal-stagger mt-5 grid grid-cols-2 gap-2" style={{ transform: "translateZ(20px)" }}>
        <Stat label={t("sales")} value={stats.sales} tone="text-ink-950" onClick={onOpen && (() => onOpen("sales"))} />
        <Stat label={t("collected")} value={stats.collected} tone="text-money-in" onClick={onOpen && (() => onOpen("collected"))} />
        <Stat label={t("udhaarGiven")} value={stats.udhaar} tone="text-pending" onClick={onOpen && (() => onOpen("udhaar"))} />
        <Stat label={t("cashOut")} value={stats.out} tone="text-money-out" onClick={onOpen && (() => onOpen("out"))} />
      </dl>
    </TiltCard>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: number; tone: string; onClick?: () => void }) {
  return (
    <div className="relative rounded-2xl bg-white/75 px-3 py-2.5 ring-1 ring-line transition hover:bg-white">
      <dt className="flex items-center justify-between text-xs text-muted">
        {onClick ? (
          <button type="button" onClick={onClick} className="text-left after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {label}
          </button>
        ) : (
          label
        )}
        {onClick && <span aria-hidden>›</span>}
      </dt>
      <dd className={`text-lg font-bold ${tone}`}>
        <CountUp value={value} format={formatINR} />
      </dd>
    </div>
  );
}
