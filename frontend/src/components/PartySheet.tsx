"use client";

import { useRef, useState } from "react";

import { useDialog } from "@/hooks/useDialog";

import { postJSON, useApi } from "@/lib/api";
import { formatINR, initials, reminderLink, upiLink } from "@/lib/format";
import type { EntryOut, Mode, PartyBalance, ShopSummary } from "@/lib/types";

import { EntryRow } from "./EntryList";
import { Magnetic } from "./interactive";
import { useLang } from "./language";
import { Portal } from "./Portal";

/** Bottom sheet with one party's khata. Reminder opens WhatsApp; the shopkeeper taps Send. */
export function PartySheet({
  party,
  shop,
  onClose,
  onPaid,
}: {
  party: PartyBalance;
  shop: ShopSummary | null;
  onClose: () => void;
  /** A payment was recorded here (they paid you, or you paid the supplier). */
  onPaid?: (entry: EntryOut) => void;
}) {
  const { t } = useLang();
  // Settle up: never more than what is owed (the server refuses more too).
  const owed = Math.max(party.balance, 0);
  const [pay, setPay] = useState(owed ? String(owed) : "");
  const [payMode, setPayMode] = useState<Mode>("cash");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const payNum = Number(pay);
  const tooMuch = payNum > owed;
  const record = async () => {
    if (!payNum || tooMuch) return;
    setPaying(true);
    setPayError(null);
    try {
      const entry = await postJSON<EntryOut>("/api/entries", {
        type: "payment",
        amount: payNum,
        party_id: party.id,
        party_kind: party.kind,
        mode: payMode,
        raw_text: `${party.kind === "customer" ? t("gotBtn", { x: formatINR(payNum) }) : t("paidBtn", { x: formatINR(payNum) })} · ${party.name}`,
        source: "manual",
      });
      onPaid?.(entry);
    } catch (e) {
      setPayError((e as Error).message);
    } finally {
      setPaying(false);
    }
  };
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

        {owed > 0 && (
          <div className="mt-4 rounded-3xl bg-surface-2 p-4">
            <p className="font-semibold text-ink-950">
              {party.kind === "customer" ? t("settleCustomer", { name: party.name }) : t("settleSupplier", { name: party.name })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl font-extrabold text-ink-900">₹</span>
              <input
                inputMode="numeric"
                value={pay}
                aria-label={t("fAmount")}
                aria-invalid={tooMuch}
                onChange={(e) => setPay(e.target.value.replace(/[^0-9]/g, ""))}
                className={`min-h-12 min-w-0 flex-1 rounded-2xl border-2 bg-surface px-3 text-xl font-bold tabular-nums focus:outline-none ${tooMuch ? "border-money-out" : "border-line focus:border-iris-500"}`}
              />
            </div>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label={t("fMode")}>
              {(["cash", "upi"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={payMode === m}
                  onClick={() => setPayMode(m)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${payMode === m ? "bg-brand-600 text-white" : "bg-surface text-ink-900 hover:bg-iris-100"}`}
                >
                  {t(m === "cash" ? "mCash" : "mUpi")}
                </button>
              ))}
            </div>
            {tooMuch && (
              <p role="alert" className="mt-2 text-sm font-semibold text-money-out">
                {party.kind === "customer"
                  ? t("overpayCustomer", { name: party.name, x: formatINR(owed) })
                  : t("overpaySupplier", { name: party.name, x: formatINR(owed) })}
              </p>
            )}
            {payError && <p className="mt-2 text-sm text-money-out">{payError}</p>}
            <button
              type="button"
              disabled={!payNum || tooMuch || paying}
              onClick={() => void record()}
              className="mt-3 min-h-12 w-full rounded-2xl bg-brand-600 font-semibold text-white transition hover:bg-brand-500 active:scale-[0.99] disabled:bg-line disabled:text-muted"
            >
              {party.kind === "customer" ? t("gotBtn", { x: formatINR(payNum || 0) }) : t("paidBtn", { x: formatINR(payNum || 0) })}
            </button>
          </div>
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
