import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "@/lib/locales/en";
import type { ExtractedEntry, Item, PartyBalance } from "@/lib/types";

import { LanguageProvider } from "./language";
import { VoiceSuggestions } from "./VoiceSuggestions";

const PARTIES: PartyBalance[] = [
  { id: 2, name: "Ramesh", kind: "customer", phone: "9876500002", balance: 150, overdue_since: "2026-11-23", last_entry_at: null },
];
const ITEMS: Item[] = [
  { id: 13, name: "Maggi", variant: null, unit: "pc", price: 15, stock: 3, low_stock_at: 24, low: true, value: 45 },
];

function entry(over: Partial<ExtractedEntry>): ExtractedEntry {
  return {
    type: "sale", party: null, items: [], amount: null, paid_now: null, mode: "cash", due_date: null, command: null,
    confidence: {}, missing: [], raw_text: "", source: "rules", party_options: [], ...over,
  };
}

function setup(text: string, reply?: ExtractedEntry) {
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return Response.json(reply);
    }),
  );
  const onCommand = vi.fn();
  localStorage.setItem("galla.lang", "en");
  render(
    <LanguageProvider>
      <VoiceSuggestions text={text} parties={PARTIES} items={ITEMS} onCommand={onCommand} />
    </LanguageProvider>,
  );
  return { onCommand, calls };
}

beforeEach(() => localStorage.clear());

describe("VoiceSuggestions", () => {
  it("empty box: 'Try saying' chips that also run the command", async () => {
    const { onCommand, calls } = setup("");
    expect(screen.getByText(en.trySaying)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: new RegExp(en.sayClose) }));
    expect(onCommand).toHaveBeenCalledWith("day_close");
    expect(calls).toHaveLength(0); // nothing sent to the server for an empty box
  });

  it("a spoken command gets a ▶ chip that runs it", async () => {
    const { onCommand, calls } = setup(
      "Ramesh ka hisaab",
      entry({ type: "command", command: "show_khata", party: { name: "Ramesh", kind: "customer", match_id: 2 }, raw_text: "Ramesh ka hisaab" }),
    );
    const chip = await screen.findByRole("button", { name: `▶ ${en.cKhata.replace("{name}", "Ramesh")}` });
    await userEvent.setup().click(chip);
    expect(onCommand).toHaveBeenCalledWith("show_khata", 2);
    expect(calls[0]).toEqual({ text: "Ramesh ka hisaab", preview: true }); // free rules, never the LLM
  });

  it("previews the entry and suggests a reminder for someone who owes money", async () => {
    const { onCommand } = setup(
      "Ramesh ko 2 maggi udhaar",
      entry({
        type: "udhaar", amount: 30, raw_text: "Ramesh ko 2 maggi udhaar",
        party: { name: "Ramesh", kind: "customer", match_id: 2 },
        items: [{ name: "Maggi", item_id: 13, qty: 2, unit: "pc", price: 15 }],
      }),
    );
    expect(await screen.findByText(en.tUdhaar)).toBeInTheDocument();
    expect(screen.getByText("· ₹30")).toBeInTheDocument();

    const remind = screen.getByRole("button", { name: "Ramesh owes ₹150 · send a reminder" });
    await userEvent.setup().click(remind);
    expect(onCommand).toHaveBeenCalledWith("send_reminder", 2);

    await userEvent.setup().click(screen.getByRole("button", { name: "Maggi is running low · add stock" }));
    expect(onCommand).toHaveBeenCalledWith("show_stock");
  });

  it("no reminder suggestion when they are paying", async () => {
    setup(
      "Ramesh ne 150 diye",
      entry({ type: "payment", amount: 150, raw_text: "Ramesh ne 150 diye", party: { name: "Ramesh", kind: "customer", match_id: 2 } }),
    );
    await waitFor(() => expect(screen.getByText(en.tPayment)).toBeInTheDocument());
    expect(screen.queryByText(/send a reminder/)).not.toBeInTheDocument();
  });
});
