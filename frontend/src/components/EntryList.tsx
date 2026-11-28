"use client";

import { entryMeta, FLOW_SIGN, FLOW_TEXT, formatINR, timeAgo } from "@/lib/format";
import type { EntryOut } from "@/lib/types";
import { useLang } from "./language";

const FLOW_BG = { in: "bg-iris-100", out: "bg-red-50", pending: "bg-amber-50" } as const;

export function EntryRow({
  entry,
  partyKind,
  index = 0,
  now,
}: {
  entry: EntryOut;
  partyKind?: "customer" | "supplier";
  index?: number;
  now?: Date;
}) {
  const { t } = useLang();
  const meta = entryMeta(entry.type, entry.mode, partyKind);
  return (
    <li
      className="animate-rise group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-surface-2 hover:pl-3"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <span
        aria-hidden
        className={`grid size-11 shrink-0 place-items-center rounded-2xl text-xl transition group-hover:scale-110 group-hover:-rotate-6 ${FLOW_BG[meta.flow]}`}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-950">
          {entry.party_name ?? t(meta.label)}
          {entry.party_name && <span className="font-normal text-muted"> · {t(meta.label)}</span>}
        </p>
        <p className="truncate text-sm text-muted">“{entry.raw_text}”</p>
      </div>
      <div className="text-right">
        <p className={`font-bold tabular-nums ${FLOW_TEXT[meta.flow]} ${entry.reversed ? "line-through opacity-50" : ""}`}>
          {FLOW_SIGN[meta.flow]}
          {formatINR(entry.amount)}
        </p>
        <p className="text-xs text-muted">{timeAgo(entry.created_at, t, now)}</p>
      </div>
    </li>
  );
}

export function EntryList({ entries }: { entries: EntryOut[] }) {
  const { t } = useLang();
  if (entries.length === 0) {
    return <p className="p-6 text-center text-muted">{t("noEntries")}</p>;
  }
  return (
    <ul className="reveal-stagger divide-y divide-line/60">
      {entries.map((e, i) => (
        <EntryRow key={e.id} entry={e} index={i} />
      ))}
    </ul>
  );
}
