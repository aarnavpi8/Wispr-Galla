"use client";

import { useRef } from "react";

import { useDialog } from "@/hooks/useDialog";

import { useApi } from "@/lib/api";
import { formatINR, initials, reminderLink, upiLink } from "@/lib/format";
import type { EntryOut, PartyBalance, ShopSummary } from "@/lib/types";

import { EntryRow } from "./EntryList";
import { Magnetic } from "./interactive";
import { useLang } from "./language";
import { Portal } from "./Portal";

/** Bottom sheet with one party's khata. Reminder opens WhatsApp; the shopkeeper taps Send. */
export function PartySheet({
  party,
  shop,
  onClose,
}: {
  party: PartyBalance;
  shop: ShopSummary | null;
  onClose: () => void;
}) {
  const { t } = useLang();
  const { data: entries } = useApi<EntryOut[]>(`/api/entries?party_id=${party.id}&limit=50`);

  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, onClose);

  const canRemind = party.kind === "customer" && party.balance > 0 && party.phone && shop;

  return (
    <Portal>
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal aria-label={party.name}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("close")}
        onClick={onClose}
        className="animate-[rise_0.2s_both] absolute inset-0 bg-ink-950/25 backdrop-blur-[3px]"
      />
      <div ref={panel} className="animate-sheet sm:animate-pop relative max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[32px] bg-surface p-5 pb-8 shadow-2xl sm:max-w-lg sm:rounded-[32px] sm:p-7">
        <div aria-hidden className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line sm:hidden" />
        <div className="flex items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full bg-brand-600 text-lg font-bold text-gold-300">
            {initials(party.name)}
          </span>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-ink-950">{party.name}</h2>
            <p className="text-sm text-muted">
              {party.kind === "customer" ? t("customer") : t("supplier")}
              {party.phone && ` · ${party.phone}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-11 place-items-center rounded-full bg-surface-2 text-xl text-muted transition hover:rotate-90 hover:bg-line"
          >
            ×
          </button>
        </div>

        <div
          className={`mt-4 rounded-3xl p-4 ${party.overdue_since ? "bg-amber-50 ring-1 ring-amber-200" : "bg-iris-100"}`}
        >
          <p className="text-sm text-muted">
            {party.kind === "customer"
              ? party.balance >= 0
                ? t("theyOwe")
                : t("theirAdvance")
              : t("youOwe")}
          </p>
          <p
            className={`text-3xl font-extrabold tabular-nums ${
              party.balance > 0 ? (party.kind === "customer" ? "text-pending" : "text-money-out") : "text-money-in"
            }`}
          >
            {formatINR(Math.abs(party.balance))}
          </p>
          {party.overdue_since && (
            <p className="mt-1 text-sm font-semibold text-pending">{t("dueOver", { d: party.overdue_since })}</p>
          )}
        </div>

        {canRemind && (
          <Magnetic strength={0.1} className="mt-3 flex w-full">
            <a
              href={reminderLink(
                party.phone!,
                t("reminderMsg", {
                  name: party.name,
                  shop: shop!.name,
                  x: formatINR(party.balance),
                  upi: upiLink(shop!.vpa, shop!.name, party.balance),
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-lg font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:brightness-110 active:scale-[0.98]"
            >
              {t("makeReminder")}
            </a>
          </Magnetic>
        )}
        {canRemind && (
          <p className="mt-2 text-center text-xs text-muted">{t("reminderNote")}</p>
        )}

        <h3 className="mt-5 font-bold text-ink-950">{t("history")}</h3>
        {entries ? (
          <ul className="mt-1 divide-y divide-line/60">
            {entries.map((e, i) => (
              <EntryRow key={e.id} entry={e} partyKind={party.kind} index={i} />
            ))}
            {entries.length === 0 && <li className="p-4 text-center text-muted">{t("noPartyEntries")}</li>}
          </ul>
        ) : (
          <div className="mt-2 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-14 rounded-2xl" />
            ))}
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}
