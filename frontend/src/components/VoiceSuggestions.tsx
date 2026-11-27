"use client";

import { useEffect, useState } from "react";

import { postJSON } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { StringKey } from "@/lib/i18n";
import type { Command, ExtractedEntry, Item, PartyBalance } from "@/lib/types";

import { useLang } from "./language";

const TYPE_LABEL: Record<string, { key: StringKey; icon: string }> = {
  sale: { key: "tSale", icon: "🛒" },
  udhaar: { key: "tUdhaar", icon: "📒" },
  payment: { key: "tPayment", icon: "💰" },
  purchase: { key: "tPurchase", icon: "📦" },
  expense: { key: "tExpense", icon: "💡" },
  owner_withdrawal: { key: "tWithdrawal", icon: "🏠" },
};

/** What each command is called on its chip. */
export function commandLabel(t: (k: StringKey, v?: Record<string, string | number>) => string, c: Command, name?: string): string {
  switch (c) {
    case "day_close":
      return t("closeDay");
    case "show_khata":
      return name ? t("cKhata", { name }) : t("tabKhata");
    case "send_reminder":
      return name ? t("cReminder", { name }) : t("makeReminder");
    case "show_stock":
      return t("stockTitle");
    case "scan_bill":
      return t("scanBill");
    case "add_item":
      return t("addItem");
    case "show_accounts":
      return t("accountsTitle");
    case "show_entries":
      return t("tabEntries");
    case "change_language":
      return t("language");
    case "help":
      return t("howToUse");
    case "undo_last":
      return t("cUndo");
    default:
      return c;
  }
}

const TRY: { key: StringKey; command: Command; icon: string }[] = [
  { key: "sayClose", command: "day_close", icon: "🔒" },
  { key: "sayStock", command: "show_stock", icon: "📦" },
  { key: "sayScan", command: "scan_bill", icon: "📷" },
  { key: "sayHelp", command: "help", icon: "🧭" },
];

/**
 * Under the speak box, live while the shopkeeper speaks or types:
 *  - empty box: "Try saying …" chips (they also run the command when tapped)
 *  - otherwise: a preview of what will happen, plus smart suggestions from the sentence
 *    (this person owes money → remind; this item is running low → add stock).
 * The preview uses the free rules engine (never the paid LLM), debounced.
 */
export function VoiceSuggestions({
  text,
  parties,
  items,
  onCommand,
}: {
  text: string;
  parties: PartyBalance[];
  items: Item[];
  onCommand: (command: Command, partyId?: number | null) => void;
}) {
  const { t } = useLang();
  const [preview, setPreview] = useState<ExtractedEntry | null>(null);
  const trimmed = text.trim();

  useEffect(() => {
    if (trimmed.length < 3) return;
    let live = true;
    const id = window.setTimeout(() => {
      postJSON<ExtractedEntry>("/api/extract", { text: trimmed, preview: true })
        .then((p) => live && setPreview(p))
        .catch(() => live && setPreview(null));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [trimmed]);

  const chip =
    "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition active:scale-95";

  if (trimmed.length < 3) {
    return (
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("trySaying")}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {TRY.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => onCommand(x.command)}
              className={`${chip} bg-mint-100 text-forest-900 hover:bg-leaf-300`}
            >
              <span aria-hidden>{x.icon}</span>“{t(x.key)}”
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (!preview || preview.raw_text !== trimmed) return null;

  const suggestions: { label: string; run: () => void; tone: string }[] = [];
  if (preview.type === "command" && preview.command) {
    const name = preview.party?.name;
    suggestions.push({
      label: `▶ ${commandLabel(t, preview.command, name)}`,
      run: () => onCommand(preview.command!, preview.party?.match_id ?? null),
      tone: "bg-forest-900 text-white hover:bg-forest-800",
    });
  } else {
    const party = preview.party?.match_id ? parties.find((p) => p.id === preview.party!.match_id) : undefined;
    if (party && party.kind === "customer" && party.balance > 0 && preview.type !== "payment") {
      suggestions.push({
        label: t("sugOwes", { name: party.name, x: formatINR(party.balance) }),
        run: () => onCommand("send_reminder", party.id),
        tone: "bg-amber-50 text-pending ring-1 ring-amber-200 hover:bg-amber-100",
      });
    }
    for (const li of preview.items) {
      const item = items.find((i) => i.id === li.item_id);
      if (item?.low) {
        suggestions.push({
          label: t("sugLow", { item: item.variant ? `${item.name} ${item.variant}` : item.name }),
          run: () => onCommand("show_stock"),
          tone: "bg-amber-50 text-pending ring-1 ring-amber-200 hover:bg-amber-100",
        });
      }
    }
  }

  const meta = TYPE_LABEL[preview.type];
  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      {meta && (
        <p className="flex flex-wrap items-center gap-x-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm text-forest-950">
          <span aria-hidden>{meta.icon}</span>
          <span className="font-semibold">{t(meta.key)}</span>
          {preview.party && <span>· {preview.party.name}</span>}
          {preview.amount ? <span className="font-bold tabular-nums">· {formatINR(preview.amount)}</span> : null}
          {preview.items.length > 0 && (
            <span className="text-muted">· {preview.items.map((i) => `${i.qty} ${i.name}`).join(", ")}</span>
          )}
        </p>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s.label} type="button" onClick={s.run} className={`${chip} ${s.tone}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
