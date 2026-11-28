"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { postJSON } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { speechCode, type StringKey } from "@/lib/i18n";
import { readAloud, stopSpeaking } from "@/lib/speak";
import type { EntryOut, EntryType, ExtractedEntry, Item, LineItem, Mode, PartyBalance } from "@/lib/types";

import { AddItemSheet } from "./AddItemSheet";
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
  stock = [],
  onClose,
  onSaved,
  onItemAdded,
}: {
  entry: ExtractedEntry;
  parties: PartyBalance[];
  /** The shop's items, to attach to a sale / udhaar / purchase (stock moves with the money). */
  stock?: Item[];
  onClose: () => void;
  onSaved: (saved: EntryOut) => void;
  /** A new item was created from the card (so the stock list can refresh). */
  onItemAdded?: (item: Item) => void;
}) {
  const { t, lang } = useLang();
  const initialType: SaveType = entry.type === "bill_item" || entry.type === "command" ? "sale" : entry.type;
  const [type, setType] = useState<SaveType>(initialType);
  const [amount, setAmount] = useState(entry.amount ? String(entry.amount) : "");
  // Buying: start each line's cost from what we know (the item's cost, or a single line's
  // spoken total ÷ qty: "10 kilo cheeni 400 ka" -> ₹40/kg), so it's usually one tap to confirm.
  const [lines, setLines] = useState<LineItem[]>(() =>
    entry.items.map((li) => {
      if (entry.type !== "purchase" || li.unit_cost) return li;
      const known = stock.find((s) => s.id === li.item_id)?.cost_price;
      const fromTotal = entry.items.length === 1 && entry.amount && li.qty ? Math.round(entry.amount / li.qty) : null;
      return { ...li, unit_cost: known || fromTotal || null };
    }),
  );
  // Adding an item to stock from the card: a new one, or a spoken one we don't stock yet (its line index).
  const [addingItem, setAddingItem] = useState<false | "new" | number>(false);
  // Once the shopkeeper types an amount, items stop changing it.
  const [amountTouched, setAmountTouched] = useState(!!entry.amount && entry.confidence.amount !== 0.85);

  const setItems = (next: LineItem[]) => {
    setEdited(true);
    setLines(next);
    if (!amountTouched) {
      const total = lineTotal(next);
      setAmount(total ? String(Math.round(total)) : "");
    }
  };
  // What the lines add up to: cost when buying, selling price otherwise.
  const unitPrice = (li: LineItem) => (type === "purchase" ? li.unit_cost : li.price) ?? 0;
  const lineTotal = (ls: LineItem[]) => ls.reduce((sum, li) => sum + unitPrice(li) * li.qty, 0);
  const setLine = (idx: number, patch: Partial<LineItem>) => setItems(lines.map((x, j) => (j === idx ? { ...x, ...patch } : x)));
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

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
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
  // A sale must say what left the shelf and how much: a stock item with its quantity.
  const missingItems = type === "sale" && (lines.length === 0 || lines.some((li) => li.item_id === null));
  // What's on the shelf now (fresh stock list first, else what the extractor saw).
  const onShelf = (li: LineItem): number | null =>
    li.item_id === null ? null : (stock.find((s) => s.id === li.item_id)?.stock ?? li.in_stock ?? null);
  const takesStock = type === "sale" || type === "udhaar";
  // Every stock line carries the prices the books need (the server checks the same rules).
  const itemPrice = (li: LineItem) => stock.find((s) => s.id === li.item_id)?.price ?? 0;
  const needsSellPrice = (li: LineItem) => li.item_id !== null && !itemPrice(li) && (type === "purchase" || takesStock);
  const sellValue = (li: LineItem) => (type === "purchase" ? li.sell_price : li.price) ?? null;
  const priceGaps = (type === "purchase" || takesStock ? lines : []).flatMap((li) =>
    li.item_id === null
      ? []
      : [
          ...(type === "purchase" && !li.unit_cost ? [{ kind: "cost" as const, li }] : []),
          ...(needsSellPrice(li) && !sellValue(li) ? [{ kind: "price" as const, li }] : []),
          ...(takesStock && !needsSellPrice(li) && !li.price && !itemPrice(li) ? [{ kind: "price" as const, li }] : []),
        ],
  );
  const firstMissing = priceGaps[0] ?? null;
  const missingPrices = priceGaps.length > 0;
  const itemsTotal = Math.round(lineTotal(lines));
  // Numbers must add up before Save: the amount equals the items' total (the server checks the same).
  const totalMismatch = amountTouched && itemsTotal > 0 && Math.abs(itemsTotal - amountNum) >= 1 && !missingPrices;
  const shortLines = takesStock ? lines.filter((li) => li.item_id !== null && onShelf(li) !== null && li.qty > (onShelf(li) ?? 0)) : [];
  const paidTooMuch = type === "purchase" && !!paidNow && Number(paidNow) > amountNum;
  // A payment settles what is owed: never more than the khata shows.
  const payee = partyId !== null ? parties.find((p) => p.id === partyId) : undefined;
  const owed = Math.max(payee?.balance ?? 0, 0);
  const overpay = type === "payment" && amountNum > 0 && !!partyName.trim() && amountNum > owed;
  // Everything that must be fixed before saving, in one plain sentence each.
  const problems: string[] = [
    ...(totalMismatch ? [t("totalMustMatch", { x: formatINR(itemsTotal), y: formatINR(amountNum) })] : []),
    ...shortLines.map((li) => `${li.name}: ${t("onlyInStock", { qty: `${onShelf(li)} ${li.unit}` })}. ${t("shortStockBlock")}`),
    ...(overpay
      ? [
          owed === 0
            ? t("owesNothing", { name: payee?.name ?? partyName.trim() })
            : t(payee?.kind === "supplier" ? "overpaySupplier" : "overpayCustomer", { name: payee?.name ?? partyName.trim(), x: formatINR(owed) }),
        ]
      : []),
  ];
  const blocked = missingAmount || missingParty || missingItems || missingPrices || paidTooMuch || problems.length > 0;
  const effectiveMode: Mode | null = type === "udhaar" ? "udhaar" : mode;

  // Tap-to-pick names: the extractor's close matches first, then names that fit what's typed.
  const chips = useMemo(() => {
    const q = partyName.trim().toLowerCase();
    const pool = [
      ...entry.party_options.map((o) => ({
        id: o.id,
        name: o.name,
        kind: o.kind,
      })),
      ...parties
        .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
        .filter((p) => (type === "purchase" ? p.kind === "supplier" : p.kind === "customer"))
        .map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
    ];
    const seen = new Set<number>();
    return pool.filter((p) => p.id !== partyId && !seen.has(p.id) && seen.add(p.id)).slice(0, partyUnsure || missingParty ? 3 : 0);
  }, [entry.party_options, parties, partyName, partyId, type, partyUnsure, missingParty]);

  // One short question, spoken, when something required is missing.
  const question = missingItems
    ? t("askWhatSold")
    : firstMissing
      ? firstMissing.kind === "cost"
        ? t("askCost", { item: firstMissing.li.name, unit: firstMissing.li.unit })
        : t("askSellPrice", { item: firstMissing.li.name, unit: firstMissing.li.unit })
      : missingAmount
      ? t("askAmount")
      : missingParty
        ? t("askWho")
        : null;
  const asked = useRef(false);
  const spoken = useRef(0);
  useEffect(() => {
    if (question && !asked.current) {
      asked.current = true;
      spoken.current = readAloud(question, speechCode(lang));
      if (missingAmount && !missingItems) amountRef.current?.focus();
    }
  }, [question, lang, missingAmount, missingItems]);
  // Closing the card silences its question.
  useEffect(() => () => stopSpeaking(spoken.current), []);

  const summary = [
    t(TYPES.find((x) => x.type === type)!.key),
    showParty && partyName ? partyName : null,
    amountNum ? formatINR(amountNum) : null,
    effectiveMode ? t(MODES.find((m) => m.mode === effectiveMode)!.key) : null,
  ]
    .filter(Boolean)
    .join(", ");

  const save = async (force = false) => {
    if (blocked) return;
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
        items: type === "sale" || type === "udhaar" || type === "purchase" ? lines : [],
        raw_text: entry.raw_text,
        source: entry.source,
        edited,
        confidence: entry.confidence,
        force,
      });
      onSaved(saved);
    } catch (e) {
      const msg = (e as Error).message;
      const code = (e as Error & { code?: string }).code;
      if (code === "duplicate" || /same entry|duplicate/i.test(msg)) setDupAsk(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `min-h-11 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${
      on ? "bg-brand-600 text-white shadow" : "bg-surface-2 text-ink-900 hover:bg-iris-100"
    }`;

  return (
    <Sheet title={t("cardTitle")} subtitle={`“${entry.raw_text}”`} onClose={onClose} closeLabel={t("cancel")}>
      {/* What kind of entry */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("cardTitle")}>
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
          missingAmount ? "bg-amber-50 ring-2 ring-amber-300" : (entry.confidence.amount ?? 1) < LOW ? "bg-amber-50" : "bg-iris-100"
        }`}
      >
        <span className="text-sm font-semibold text-muted">{missingAmount ? t("askAmount") : t("fAmount")}</span>
        <span className="mt-1 flex items-center gap-1">
          <span className="text-3xl font-extrabold text-ink-900">₹</span>
          <input
            ref={amountRef}
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              setAmountTouched(true);
              change(setAmount)(e.target.value.replace(/[^\d]/g, ""));
            }}
            placeholder="0"
            aria-label={t("fAmount")}
            className="w-full bg-transparent text-4xl font-extrabold tabular-nums text-ink-950 outline-none placeholder:text-ink-900/30"
          />
        </span>
      </label>

      {/* Sanity check: the amount said vs what the lines add up to. Discounts happen, so it only offers. */}
      {totalMismatch && (
        <button
          type="button"
          onClick={() => {
            setAmountTouched(true);
            setAmount(String(itemsTotal));
          }}
          className="mt-2 min-h-10 w-full rounded-2xl bg-amber-50 px-3 text-left text-sm font-semibold text-pending ring-1 ring-amber-200 transition hover:bg-amber-100"
        >
          {t("useItemsTotal", { x: formatINR(itemsTotal) })}
        </button>
      )}

      {/* Items: what left (or came onto) the shelf with this money. */}
      {(type === "sale" || type === "udhaar" || type === "purchase") && (
        <div className={`mt-3 rounded-3xl p-3 ${missingItems ? "bg-amber-50 ring-2 ring-amber-300" : "bg-surface-2"}`}>
          <p className={`text-sm font-semibold ${missingItems ? "text-pending" : "text-muted"}`}>{missingItems ? t("askWhatSold") : t("fItems")}</p>
          {lines.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {lines.map((li, idx) => (
                <li key={`${li.item_id}-${idx}`} className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2">
                  <span className="min-w-0 flex-1 font-semibold text-ink-950">
                    <span className="block truncate">
                      {li.name}
                      {li.price ? (
                        <span className="font-normal text-muted">
                          {" "}
                          · {formatINR(li.price)}/{li.unit}
                        </span>
                      ) : null}
                      {li.item_id === null && <span className="font-normal text-muted"> · {li.unit}</span>}
                    </span>
                    {li.item_id !== null && onShelf(li) !== null && (
                      <span
                        className={`block text-xs font-semibold ${
                          takesStock && li.qty > (onShelf(li) ?? 0) ? "text-money-out" : "text-muted"
                        }`}
                      >
                        {takesStock && li.qty > (onShelf(li) ?? 0)
                          ? t("onlyInStock", { qty: `${onShelf(li)} ${li.unit}` })
                          : t("inStockQty", { qty: `${onShelf(li)} ${li.unit}` })}
                      </span>
                    )}
                    {(li.options?.length ?? 0) > (li.item_id === null ? 0 : 1) && (
                      <span className="mt-1 block">
                        <span className="text-xs font-semibold text-pending">{li.item_id === null ? t("didYouMean") : t("whichItem")}</span>
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {li.options!.map((o) => (
                            <button
                              key={o.item_id}
                              type="button"
                              aria-pressed={o.item_id === li.item_id}
                              onClick={() =>
                                setItems(
                                  lines.map((x, j) =>
                                    j === idx
                                      ? { ...x, item_id: o.item_id, name: o.name, unit: o.unit, price: o.price, in_stock: o.in_stock, options: [] }
                                      : x,
                                  ),
                                )
                              }
                              className={`min-h-9 rounded-full px-3 text-xs font-semibold ring-1 transition active:scale-95 ${
                                o.item_id === li.item_id ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-ink-900 ring-amber-300 hover:bg-iris-100"
                              }`}
                            >
                              {o.name}
                              {o.price ? ` · ${formatINR(o.price)}` : ""}
                              {o.in_stock != null ? ` · ${o.in_stock} ${o.unit}` : ""}
                            </button>
                          ))}
                        </span>
                      </span>
                    )}
                    {li.item_id === null && (
                      <button
                        type="button"
                        onClick={() => setAddingItem(idx)}
                        className="mt-1 min-h-9 rounded-lg bg-amber-50 px-2.5 text-xs font-semibold text-pending ring-1 ring-amber-200 hover:bg-amber-100"
                      >
                        {t("notInStockAdd")}
                      </button>
                    )}
                    {li.item_id !== null && type === "purchase" && (
                      <label className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${li.unit_cost ? "text-muted" : "text-pending"}`}>
                        {t("youPay")} / {li.unit}
                        <input
                          inputMode="numeric"
                          value={li.unit_cost ?? ""}
                          onChange={(e) => setLine(idx, { unit_cost: Number(e.target.value.replace(/[^\d]/g, "")) || null })}
                          aria-label={`${li.name}: ${t("youPay")}`}
                          className={`h-9 w-20 rounded-lg border-2 bg-white px-2 text-sm font-bold tabular-nums text-ink-950 focus:border-iris-500 focus:outline-none ${li.unit_cost ? "border-line" : "border-amber-300"}`}
                        />
                      </label>
                    )}
                    {li.item_id !== null && needsSellPrice(li) && (
                      <label className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${sellValue(li) ? "text-muted" : "text-pending"}`}>
                        {t("sellsFor")} / {li.unit}
                        <input
                          inputMode="numeric"
                          value={sellValue(li) ?? ""}
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(/[^\d]/g, "")) || null;
                            setLine(idx, type === "purchase" ? { sell_price: n } : { price: n });
                          }}
                          aria-label={`${li.name}: ${t("sellsFor")}`}
                          className={`h-9 w-20 rounded-lg border-2 bg-white px-2 text-sm font-bold tabular-nums text-ink-950 focus:border-iris-500 focus:outline-none ${sellValue(li) ? "border-line" : "border-amber-300"}`}
                        />
                      </label>
                    )}
                  </span>
                  <button
                    type="button"
                    aria-label={`${li.name} −1`}
                    onClick={() => setItems(lines.map((x, j) => (j === idx ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}
                    className="grid size-9 place-items-center rounded-xl bg-surface-2 font-bold active:scale-90"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-bold tabular-nums">{li.qty}</span>
                  <button
                    type="button"
                    aria-label={`${li.name} +1`}
                    onClick={() => setItems(lines.map((x, j) => (j === idx ? { ...x, qty: x.qty + 1 } : x)))}
                    className="grid size-9 place-items-center rounded-xl bg-iris-100 font-bold active:scale-90"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("cancel")}: ${li.name}`}
                    onClick={() => setItems(lines.filter((_, j) => j !== idx))}
                    className="grid size-9 place-items-center rounded-xl text-muted hover:bg-red-50 hover:text-money-out"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {stock.length > 0 && (
            <select
              value=""
              aria-label={t("attachItem")}
              onChange={(e) => {
                const it = stock.find((x) => x.id === Number(e.target.value));
                if (!it) return;
                const existing = lines.findIndex((x) => x.item_id === it.id);
                if (existing >= 0) setItems(lines.map((x, j) => (j === existing ? { ...x, qty: x.qty + 1 } : x)));
                else
                  setItems([
                    ...lines,
                    {
                      item_id: it.id,
                      name: it.variant ? `${it.name} ${it.variant}` : it.name,
                      qty: 1,
                      unit: it.unit,
                      price: it.price,
                    },
                  ]);
              }}
              className="mt-2 min-h-11 w-full rounded-xl border-2 border-dashed border-line bg-surface px-3 text-sm font-semibold text-ink-800"
            >
              <option value="">{t("attachItem")}</option>
              {stock.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.variant ? `${it.name} ${it.variant}` : it.name} ({it.stock} {it.unit})
                </option>
              ))}
            </select>
          )}
          {stock.length === 0 && lines.length === 0 && <p className="mt-1 text-sm text-muted">{t("noStockYet")}</p>}
          <button
            type="button"
            onClick={() => setAddingItem("new")}
            className="mt-2 min-h-11 w-full rounded-xl bg-surface px-3 text-sm font-semibold text-ink-800 ring-1 ring-line transition hover:bg-iris-100 active:scale-[0.99]"
          >
            {t("newItem")}
          </button>
        </div>
      )}
      {addingItem !== false && (
        <AddItemSheet
          initialName={typeof addingItem === "number" ? lines[addingItem]?.name : ""}
          initialUnit={typeof addingItem === "number" ? lines[addingItem]?.unit : "pc"}
          stockFromEntry={type === "purchase"}
          initialCost={typeof addingItem === "number" ? lines[addingItem]?.unit_cost : null}
          onClose={() => setAddingItem(false)}
          onAdded={(it) => {
            const line = {
              item_id: it.id,
              name: it.variant ? `${it.name} ${it.variant}` : it.name,
              unit: it.unit,
              price: it.price,
              unit_cost: it.cost_price || null,
              in_stock: it.stock,
            };
            // A spoken item we just added keeps its spoken quantity; a new one starts at 1.
            if (typeof addingItem === "number") setItems(lines.map((x, j) => (j === addingItem ? { ...line, qty: x.qty } : x)));
            else setItems([...lines, { ...line, qty: 1 }]);
            onItemAdded?.(it);
          }}
        />
      )}

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
              className="mt-1 w-full bg-transparent text-2xl font-bold text-ink-950 outline-none"
            />
          </label>
          {partyName.trim() && partyId === null && (
            <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-iris-500">
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
                    className="min-h-10 rounded-full bg-white px-3 text-sm font-semibold text-ink-900 ring-1 ring-amber-300 transition hover:bg-iris-100 active:scale-95"
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
            {MODES.filter((m) => m.mode !== "udhaar" || type === "sale" || type === "purchase").map((m) => (
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
            placeholder={mode === "udhaar" ? "0" : amount || "0"}
            aria-invalid={paidTooMuch}
            className={`mt-1 min-h-12 w-full rounded-2xl border-2 ${paidTooMuch ? "border-money-out" : "border-line"} bg-surface px-4 text-xl font-bold tabular-nums focus:border-iris-500 focus:outline-none`}
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
            className="mt-1 min-h-12 w-full rounded-2xl border-2 border-line bg-surface px-4 text-lg focus:border-iris-500 focus:outline-none"
          />
        </label>
      )}

      {error && <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-money-out">{error}</p>}

      {problems.length > 0 && (
        <div role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-money-out ring-1 ring-red-200">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}

      {dupAsk ? (
        <div role="alertdialog" className="animate-pop mt-4 rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-300">
          <p className="font-semibold text-pending">{t("dupAsk")}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-2xl bg-surface-2 font-semibold text-ink-900">
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
              className="min-h-12 flex-1 rounded-2xl bg-brand-600 font-semibold text-white disabled:opacity-60"
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
            className="min-h-14 rounded-2xl bg-surface-2 px-4 font-semibold text-ink-900 transition hover:bg-line"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={busy || blocked}
            onClick={() => void save()}
            className="min-h-14 flex-1 rounded-2xl bg-brand-600 text-lg font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500 active:scale-[0.98] disabled:bg-line disabled:text-muted disabled:shadow-none"
          >
            {t("saveEntry")} ✓
          </button>
        </div>
      )}
    </Sheet>
  );
}
