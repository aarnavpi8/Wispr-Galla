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
  confidence: { type: 0.9, amount: 0.95, party: 0.6, items: 0.5 },
  missing: [],
  raw_text: "Gupta se 10 kilo cheeni udhaar pe kharidi 450",
  source: "rules",
  party_options: [],
};

describe("EntryCard: buying from a supplier", () => {
  it("offers credit for a purchase and saves it as owed", async () => {
    const posted: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body)));
        return Response.json({ id: 1, type: "purchase", amount: 450, mode: "udhaar", raw_text: "", reversed: false, created_at: "" }, { status: 201 });
      }),
    );
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<EntryCard entry={PURCHASE} parties={[]} onClose={() => {}} onSaved={onSaved} />);
    expect(screen.getAllByRole("radio", { name: "Udhaar" }).at(-1)).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Save karo ✓" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(posted[0]).toMatchObject({ type: "purchase", mode: "udhaar", paid_now: null, party_kind: "supplier" });
  });

  it("an item not in stock can be added from the card, with its spoken name and unit", async () => {
    const created = { id: 9, name: "Cheeni", variant: null, unit: "kg", price: 45, stock: 0, low_stock_at: 5, low: true, value: 0 };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(created, { status: 201 })));
    const onItemAdded = vi.fn();
    const user = userEvent.setup();
    render(<EntryCard entry={PURCHASE} parties={[]} onClose={() => {}} onSaved={() => {}} onItemAdded={onItemAdded} />);
    await user.click(screen.getByRole("button", { name: "Stock mein nahi · Jodiye" }));
    expect(screen.getByLabelText("Naam")).toHaveValue("Cheeni");
    await user.type(screen.getByLabelText("Daam (₹)"), "45");
    await user.click(screen.getAllByRole("button", { name: "Save karo" }).at(-1)!);
    await waitFor(() => expect(onItemAdded).toHaveBeenCalledWith(created));
    expect(screen.queryByRole("button", { name: "Stock mein nahi · Jodiye" })).not.toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument(); // keeps the spoken quantity
  });

  it("a bought item added from the card gets its stock from the purchase, not twice", async () => {
    const posted: Record<string, unknown>[] = [];
    const created = { id: 9, name: "Cheeni", variant: null, unit: "kg", price: 45, stock: 0, low_stock_at: 5, low: true, value: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body)));
        return Response.json(created, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    render(<EntryCard entry={PURCHASE} parties={[]} onClose={() => {}} onSaved={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Stock mein nahi · Jodiye" }));
    expect(screen.queryByLabelText("Abhi kitna hai")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Daam (₹)"), "45");
    await user.click(screen.getAllByRole("button", { name: "Save karo" }).at(-1)!);
    await waitFor(() => expect(posted[0]).toMatchObject({ name: "Cheeni", stock: 0 }));
  });

  it("won't save when more was paid now than the bill", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={{ ...PURCHASE, mode: "cash" }} parties={[]} onClose={() => {}} onSaved={() => {}} />);
    await user.type(screen.getByLabelText("Abhi diye"), "900");
    expect(screen.getByRole("button", { name: "Save karo ✓" })).toBeDisabled();
  });
});

describe("EntryCard: a sale says what was sold", () => {
  const SALE: ExtractedEntry = { ...PURCHASE, type: "sale", party: null, items: [], amount: 60, mode: "cash", raw_text: "60 ki bikri" };
  const KURKURE = { id: 4, name: "Kurkure", variant: null, unit: "pc", price: 20, stock: 10, low_stock_at: 5, low: false, value: 200 };

  it("won't save until a stock item with a quantity is added", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={SALE} parties={[]} stock={[KURKURE] as never} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getAllByText("Kya becha? Item aur kitna, jodiye.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save karo ✓" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox"), String(KURKURE.id));
    expect(screen.getByRole("button", { name: "Save karo ✓" })).toBeEnabled();
  });

  it("a spoken item that isn't in stock must be added first", () => {
    const entry = { ...SALE, items: [{ name: "Kesar", item_id: null, qty: 1, unit: "pc", price: null }] };
    render(<EntryCard entry={entry} parties={[]} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByRole("button", { name: "Save karo ✓" })).toBeDisabled();
  });
});

describe("EntryCard: a word that fits several items", () => {
  it("asks which one, and the pick is saved with the heard word", async () => {
    const posted: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body)));
        return Response.json({ id: 1, type: "sale", amount: 130, mode: "cash", raw_text: "", reversed: false, created_at: "" }, { status: 201 });
      }),
    );
    const entry: ExtractedEntry = {
      ...PURCHASE,
      type: "sale",
      party: null,
      mode: "cash",
      amount: null,
      raw_text: "1 kilo daal becha",
      items: [
        {
          name: "Toor dal",
          item_id: 8,
          qty: 1,
          unit: "kg",
          price: 160,
          heard: "daal",
          options: [
            { item_id: 8, name: "Toor dal", unit: "kg", price: 160 },
            { item_id: 9, name: "Moong dal", unit: "kg", price: 130 },
          ],
        },
      ],
    };
    const user = userEvent.setup();
    render(<EntryCard entry={entry} parties={[]} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Kaunsa?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Moong dal/ }));
    expect(screen.queryByText("Kaunsa?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save karo ✓" }));
    await waitFor(() => expect(posted[0]).toBeTruthy());
    expect(posted[0]).toMatchObject({ amount: 130, items: [{ item_id: 9, name: "Moong dal", heard: "daal" }] });
  });
});
