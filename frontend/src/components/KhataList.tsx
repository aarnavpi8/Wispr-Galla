"use client";

import { useState } from "react";

import { daysBetween, formatINR, initials } from "@/lib/format";
import type { PartyBalance } from "@/lib/types";

import { Spotlight } from "./interactive";
import { useLang } from "./language";

type Filter = "customer" | "supplier";

export function KhataList({
  parties,
  onOpen,
  filter: shownKind,
  onFilter,
}: {
  parties: PartyBalance[];
  onOpen: (p: PartyBalance) => void;
  /** Controlled by the dashboard, so "To pay" can open the suppliers. */
  filter?: Filter;
  onFilter?: (f: Filter) => void;
}) {
  const { t } = useLang();
  const [own, setOwn] = useState<Filter>("customer");
  const filter = shownKind ?? own;
  const setFilter = onFilter ?? setOwn;
  const [query, setQuery] = useState("");
  // Who owes the most comes first (overdue before that), so "To collect" / "To pay" lead with them.
  const shown = parties
    .filter((p) => p.kind === filter && p.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(!!b.overdue_since) - Number(!!a.overdue_since) || b.balance - a.balance);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchName")}
          aria-label={t("searchName")}
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-background px-4 text-base transition focus:border-iris-500 focus:outline-none focus:ring-4 focus:ring-iris-500/15"
        />
        <div className="grid grid-cols-2 rounded-2xl bg-surface-2 p-1 text-sm font-semibold sm:flex">
          {(["customer", "supplier"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-10 rounded-xl px-3 transition ${
                filter === f ? "bg-surface text-ink-950 shadow-sm" : "text-muted hover:text-ink-900"
              }`}
            >
              {f === "customer" ? t("customers") : t("suppliers")}
            </button>
          ))}
        </div>
      </div>

      <ul className="reveal-stagger mt-3 grid gap-2">
        {shown.map((p, i) => {
          const overdueDays = p.overdue_since ? daysBetween(new Date(p.overdue_since), new Date()) : 0;
          const owes = p.balance > 0;
          return (
            <li key={p.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Spotlight
                as="button"
                type="button"
                onClick={() => onOpen(p)}
                className={`group flex w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${
                  p.overdue_since ? "border-amber-300" : "border-line"
                }`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-gold-300">
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-950">{p.name}</span>
                  {p.overdue_since ? (
                    <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-pending">
                      {t("overdueDays", { n: overdueDays })}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">
                      {p.balance === 0 ? t("settled") : p.balance < 0 ? t("advance") : t("due")}
                    </span>
                  )}
                </span>
                <span
                  className={`font-bold tabular-nums ${
                    owes ? (p.kind === "customer" ? "text-pending" : "text-money-out") : "text-money-in"
                  }`}
                >
                  {formatINR(Math.abs(p.balance))}
                </span>
                <span aria-hidden className="text-muted transition group-hover:translate-x-1">
                  ›
                </span>
              </Spotlight>
            </li>
          );
        })}
        {shown.length === 0 && <li className="p-6 text-center text-muted">{t("nobody")}</li>}
      </ul>
    </div>
  );
}
