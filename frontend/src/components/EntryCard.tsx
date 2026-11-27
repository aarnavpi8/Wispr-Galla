"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { postJSON } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { speechCode, type StringKey } from "@/lib/i18n";
import { readAloud } from "@/lib/speak";
import type { EntryOut, EntryType, ExtractedEntry, Mode, PartyBalance } from "@/lib/types";

import { ListenButton } from "./HelpTip";
import { useLang } from "./language";
import { Sheet } from "./Sheet";

type SaveType = Exclude<EntryType, "bill_item" | "command">;

const TYPES: { type: SaveType; key: StringKey; icon: string }[] = [
  { type: "sale", key: "tSale", icon: "🛒" },
  { type: "udhaar", key: "tUdhaar", icon: "📒" },
  { type: "payment", key: "tPayment", icon: "💰" },
  { type: "purchase", key: "tPurchase", icon: "📦" },
  { type: "expense", key: "tExpense", icon: "💡" },
  { type: "owner_withdrawal", key: "tWithdrawal", icon: "🏠" },
];
const MODES: { mode: Mode; key: StringKey }[] = [
  { mode: "cash", key: "mCash" },
  { mode: "upi", key: "mUpi" },
  { mode: "udhaar", key: "mUdhaar" },
];
const NEEDS_PARTY: SaveType[] = ["udhaar", "payment"];
const NO_PARTY: SaveType[] = ["expense", "owner_withdrawal"];

const LOW = 0.8;

/**
 * Engine step 3-4: the understood entry, big and editable, in the shopkeeper's language.
 * Unsure fields are amber with up to 3 tap-to-pick choices; a missing amount or name asks one
 * short question (on screen and spoken). Nothing saves until "Save" is tapped.
 */
export function EntryCard({
  entry,
  parties,
  onClose,
  onSaved,
}: {
  entry: ExtractedEntry;
  parties: PartyBalance[];
  onClose: () => void;
  onSaved: (saved: EntryOut) => void;
}) {
  const { t, lang } = useLang();
  const initialType: SaveType = entry.type === "bill_item" || entry.type === "command" ? "sale" : entry.type;
  const [type, setType] = useState<SaveType>(initialType);
  const [amount, setAmount] = useState(entry.amount ? String(entry.amount) : "");
  const [paidNow, setPaidNow] = useState(entry.paid_now ? String(entry.paid_now) : "");
  const [mode, setMode] = useState<Mode | null>(entry.mode);
  const [due, setDue] = useState(entry.due_date ?? "");
  const [partyId, setPartyId] = useState<number | null>(entry.party?.match_id ?? null);
  const [partyName, setPartyName] = useState(entry.party?.name ?? "");
  const [partyKind, setPartyKind] = useState<"customer" | "supplier">(entry.party?.kind ?? "customer");
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupAsk, setDupAsk] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    setEdited(true);
    set(v);
  };

  const partyConf = entry.confidence.party ?? 1;
  const partyUnsure = !!entry.party && partyConf < LOW && !edited;
  const needsParty = NEEDS_PARTY.includes(type);
  const showParty = !NO_PARTY.includes(type);
  const amountNum = Number(amount);
  const missingAmount = !amountNum;
  const missingParty = needsParty && !partyName.trim();
  const effectiveMode: Mode | null = type === "udhaar" ? "udhaar" : mode;

  // Tap-to-pick names: the extractor's close matches first, then names that fit what's typed.
  const chips = useMemo(() => {
    const q = partyName.trim().toLowerCase();
    const pool = [
      ...entry.party_options.map((o) => ({ id: o.id, name: o.name, kind: o.kind })),
      ...parties
        .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
        .filter((p) => (type === "purchase" ? p.kind === "supplier" : p.kind === "customer"))
        .map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
    ];
    const seen = new Set<number>();
    return pool.filter((p) => p.id !== partyId && !seen.has(p.id) && seen.add(p.id)).slice(0, partyUnsure || missingParty ? 3 : 0);
  }, [entry.party_options, parties, partyName, partyId, type, partyUnsure, missingParty]);

  // One short question, spoken, when something required is missing.
  const question = missingAmount ? t("askAmount") : missingParty ? t("askWho") : null;
  const asked = useRef(false);
  useEffect(() => {
    if (question && !asked.current) {
      asked.current = true;
      readAloud(question, speechCode(lang));
      if (missingAmount) amountRef.current?.focus();
    }
  }, [question, lang, missingAmount]);

  const summary = [
    t(TYPES.find((x) => x.type === type)!.key),
    showParty && partyName ? partyName : null,
    amountNum ? formatINR(amountNum) : null,
    effectiveMode ? t(MODES.find((m) => m.mode === effectiveMode)!.key) : null,
  ]
    .filter(Boolean)
    .join(", ");

  const save = async (force = false) => {
    if (missingAmount || missingParty) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await postJSON<EntryOut>("/api/entries", {
        type,
        amount: Math.round(amountNum),
        paid_now: type === "purchase" && paidNow ? Number(paidNow) : null,
        mode: effectiveMode,
        due_date: (type === "udhaar" || effectiveMode === "udhaar") && due ? due : null,
        party_id: showParty ? partyId : null,
        party_name: showParty && partyId === null && partyName.trim() ? partyName.trim() : null,
        party_kind: type === "purchase" ? "supplier" : partyKind,
        heard_as: showParty && partyId !== null && entry.party && entry.party.match_id !== partyId ? entry.party.name : null,
        items: entry.items,
        raw_text: entry.raw_text,
        source: entry.source,
        edited,
        confidence: entry.confidence,
        force,
      });
      onSaved(saved);
    } catch (e) {
      const msg = (e as Error).message;
      if (/same entry|duplicate/i.test(msg)) setDupAsk(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `min-h-11 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${
      on ? "bg-forest-900 text-white shadow" : "bg-surface-2 text-forest-900 hover:bg-mint-100"
    }`;

  return (
    <Sheet title={t("cardTitle")} subtitle={`“${entry.raw_text}”`} onClose={onClose} closeLabel={t("cancel")}>
      {/* What kind of entry */}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label={t("cardTitle")}>
        {TYPES.map((x) => (
          <button
            key={x.type}
            type="button"
            role="radio"
            aria-checked={type === x.type}
            onClick={() => change(setType)(x.type)}
            className={`shrink-0 ${chip(type === x.type)}`}
          >
            <span aria-hidden>{x.icon}</span> {t(x.key)}
          </button>
        ))}
      </div>

      {/* Amount */}
      <label
        className={`mt-4 block rounded-3xl p-4 transition ${
          missingAmount ? "bg-amber-50 ring-2 ring-amber-300" : (entry.confidence.amount ?? 1) < LOW ? "bg-amber-50" : "bg-mint-100"
        }`}
      >
        <span className="text-sm font-semibold text-muted">{missingAmount ? t("askAmount") : t("fAmount")}</span>
        <span className="mt-1 flex items-center gap-1">
          <span className="text-3xl font-extrabold text-forest-900">₹</span>
          <input
            ref={amountRef}
            inputMode="numeric"
            value={amount}
            onChange={(e) => change(setAmount)(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            aria-label={t("fAmount")}
            className="w-full bg-transparent text-4xl font-extrabold tabular-nums text-forest-950 outline-none placeholder:text-forest-900/30"
          />
        </span>
        {entry.items.length > 0 && (
          <span className="mt-2 block text-sm text-muted">
            {t("fItems")}: {entry.items.map((i) => `${i.qty} ${i.unit} ${i.name}`).join(", ")}
          </span>
        )}
      </label>

      {/* Who */}
      {showParty && (
        <div className={`mt-3 rounded-3xl p-4 ${partyUnsure || missingParty ? "bg-amber-50 ring-2 ring-amber-300" : "bg-surface-2"}`}>
          <label className="block text-sm font-semibold text-muted">
            {missingParty ? t("askWho") : t("fWho")}
            <input
              value={partyName}
              onChange={(e) => {
                setEdited(true);
                setPartyName(e.target.value);
                setPartyId(null);
              }}
              aria-label={t("fWho")}
              className="mt-1 w-full bg-transparent text-2xl font-bold text-forest-950 outline-none"
            />
          </label>
          {partyName.trim() && partyId === null && (
            <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-leaf-500">
              {t("newPerson", { name: partyName.trim() })}
            </span>
          )}
          {chips.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-pending">{t("didYouMean")}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setEdited(true);
                      setPartyId(c.id);
                      setPartyName(c.name);
                      setPartyKind(c.kind);
                    }}
                    className="min-h-10 rounded-full bg-white px-3 text-sm font-semibold text-forest-900 ring-1 ring-amber-300 transition hover:bg-mint-100 active:scale-95"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paid how */}
      {type !== "udhaar" && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-muted">{t("fMode")}</p>
          <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label={t("fMode")}>
            {MODES.filter((m) => m.mode !== "udhaar" || type === "sale").map((m) => (
              <button
                key={m.mode}
                type="button"
                role="radio"
                aria-checked={mode === m.mode}
                onClick={() => change(setMode)(m.mode)}
                className={chip(mode === m.mode)}
              >
                {t(m.key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === "purchase" && (
        <label className="mt-3 block text-sm font-semibold text-muted">
          {t("fPaidNow")}
          <input
            inputMode="numeric"
            value={paidNow}
            onChange={(e) => change(setPaidNow)(e.target.value.replace(/[^\d]/g, ""))}
            placeholder={amount || "0"}
            className="mt-1 min-h-12 w-full rounded-2xl border-2 border-line bg-surface px-4 text-xl font-bold tabular-nums focus:border-leaf-500 focus:outline-none"
          />
        </label>
      )}

      {(type === "udhaar" || effectiveMode === "udhaar") && (
        <label className="mt-3 block text-sm font-semibold text-muted">
          {t("fDue")} <span className="font-normal">({t("optional")})</span>
          <input
            type="date"
            value={due}
            onChange={(e) => change(setDue)(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-2xl border-2 border-line bg-surface px-4 text-lg focus:border-leaf-500 focus:outline-none"
          />
        </label>
      )}

      {error && <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-money-out">{error}</p>}

      {dupAsk ? (
        <div role="alertdialog" className="animate-pop mt-4 rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-300">
          <p className="font-semibold text-pending">{t("dupAsk")}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-2xl bg-surface-2 font-semibold text-forest-900">
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
              className="min-h-12 flex-1 rounded-2xl bg-forest-900 font-semibold text-white disabled:opacity-60"
            >
              {t("saveAgain")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2">
          <ListenButton text={summary} />
          <button
            type="button"
            onClick={onClose}
            className="min-h-14 rounded-2xl bg-surface-2 px-4 font-semibold text-forest-900 transition hover:bg-line"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={busy || missingAmount || missingParty}
            onClick={() => void save()}
            className="min-h-14 flex-1 rounded-2xl bg-forest-900 text-lg font-semibold text-white shadow-lg shadow-forest-900/20 transition hover:bg-forest-800 active:scale-[0.98] disabled:bg-line disabled:text-muted disabled:shadow-none"
          >
            {t("saveEntry")} ✓
          </button>
        </div>
      )}
    </Sheet>
  );
}
