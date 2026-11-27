import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ExtractedEntry } from "@/lib/types";

import { EntryCard } from "./EntryCard";

const PURCHASE: ExtractedEntry = {
  type: "purchase",
  party: { name: "Gupta Traders", kind: "supplier", match_id: null },
  items: [{ name: "Cheeni", item_id: null, qty: 10, unit: "kg", price: null }],
  amount: 450,
  paid_now: null,
  mode: "udhaar",
  due_date: null,
  command: null,
  confidence: { type: 0.9, amount: 0.95, party: 0.9, items: 0.5 },
  missing: [],
  raw_text: "Gupta se 10 kilo cheeni udhaar pe kharidi 450",
  source: "rules",
  party_options: [],
};

const dialogs = () => screen.getAllByRole("dialog");

describe("New item sheet opened from the entry card", () => {
  it("takes focus, keeps Tab inside, and Escape closes only itself", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={PURCHASE} parties={[]} onClose={vi.fn()} onSaved={vi.fn()} />);
    const opener = screen.getByRole("button", { name: "Stock mein nahi · Jodiye" });
    await user.click(opener);
    const nested = dialogs().at(-1)!;
    expect(nested).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toBe(screen.getByLabelText("Naam"));
    for (let i = 0; i < 25; i++) {
      await user.tab();
      expect(nested).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    expect(dialogs()).toHaveLength(1);
    expect(document.activeElement).toBe(opener);
  });

  it("after saving the item, focus stays in the entry card", async () => {
    const created = { id: 9, name: "Cheeni", variant: null, unit: "kg", price: 45, stock: 0, low_stock_at: 5, low: true, value: 0 };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(created, { status: 201 })));
    const user = userEvent.setup();
    render(<EntryCard entry={PURCHASE} parties={[]} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Stock mein nahi · Jodiye" }));
    await user.type(screen.getByLabelText("Daam (₹)"), "45");
    await user.click(screen.getAllByRole("button", { name: "Save karo" }).at(-1)!);
    await waitFor(() => expect(dialogs()).toHaveLength(1));
    expect(dialogs()[0]).toContainElement(document.activeElement as HTMLElement);
  });
});
