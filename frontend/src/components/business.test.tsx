import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { itemLabel, stockLevel } from "@/lib/format";
import type { Accounts, DayCloseView, Item } from "@/lib/types";

import { AccountsCard } from "./AccountsCard";
import { AddItemSheet } from "./AddItemSheet";
import { BottomNav } from "./BottomNav";
import { DayCloseSheet } from "./DayCloseSheet";
import { InventoryCard } from "./InventoryCard";
import { Reveal } from "./Reveal";
import { StockPlanCard } from "./StockPlanCard";
import { PartySheet } from "./PartySheet";

type Handler = (url: string, init?: RequestInit) => unknown;

/** Route fetch calls to small handlers by URL prefix; records every call. */
function mockApi(routes: Record<string, Handler>) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes)
      .filter((k) => url.startsWith(k.split(" ").pop()!) && (!k.includes(" ") || k.startsWith(method)))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return Response.json({ detail: "not mocked" }, { status: 404 });
    const out = routes[key](url, init);
    return out instanceof Response ? out : Response.json(out);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const ITEMS: Item[] = [
  { id: 1, name: "Bread", variant: null, unit: "pc", price: 45, stock: 2, low_stock_at: 6, low: true, value: 90 },
  { id: 2, name: "Parle-G", variant: "chhota", unit: "pc", price: 10, stock: 120, low_stock_at: 30, low: false, value: 1200 },
];

describe("item helpers", () => {
  it("labels with the variant when there is one", () => {
    expect(itemLabel(ITEMS[1])).toBe("Parle-G · chhota");
    expect(itemLabel(ITEMS[0])).toBe("Bread");
  });

  it("fills the stock bar relative to 3x the alert level, clamped", () => {
    expect(stockLevel({ stock: 9, low_stock_at: 6 })).toBe(0.5);
    expect(stockLevel({ stock: 500, low_stock_at: 6 })).toBe(1);
    expect(stockLevel({ stock: 0, low_stock_at: 0 })).toBe(0);
  });
});

describe("InventoryCard", () => {
  it("lists low stock first with an alert, and totals the shelf value", async () => {
    mockApi({ "/api/items": () => ITEMS });
    render(<InventoryCard />);
    await screen.findByText("Bread");
    expect(screen.getByText(/1 item khatam hone wale hain/)).toBeInTheDocument();
    expect(screen.getByText("2 item · ₹1,290 ka maal")).toBeInTheDocument();
    const names = screen.getAllByText(/^(Bread|Parle-G · chhota)$/).map((n) => n.textContent);
    expect(names).toEqual(["Bread", "Parle-G · chhota"]);
  });

  it("+ adds one unit to stock through the API", async () => {
    const calls = mockApi({
      "/api/items": () => ITEMS,
      "POST /api/items/2/stock": () => ({ ...ITEMS[1], stock: 121, value: 1210 }),
    });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<InventoryCard onChanged={onChanged} />);
    await user.click(await screen.findByRole("button", { name: "Parle-G · chhota: Maal aaya 1" }));
    await waitFor(() => expect(screen.getByText("121")).toBeInTheDocument());
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/items/2/stock",
      body: { reason: "purchase", qty: 1 },
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("− sells one: records the money (cash) and lowers stock together", async () => {
    const saleEntry = {
      id: 77, type: "sale", party_id: null, party_name: null, amount: 10, paid_now: null, mode: "cash", due_date: null,
      raw_text: "1 pc Parle-G chhota", source: "manual", reversed: false, created_at: new Date().toISOString(),
    };
    const calls = mockApi({
      "/api/items": () => ITEMS,
      "POST /api/items/2/sell": () => ({ item: { ...ITEMS[1], stock: 119, value: 1190 }, entry: saleEntry }),
    });
    const onSold = vi.fn();
    const user = userEvent.setup();
    render(<InventoryCard onSold={onSold} />);
    await user.click(await screen.findByRole("button", { name: "Parle-G · chhota: Bika 1" }));
    await waitFor(() => expect(screen.getByText("119")).toBeInTheDocument());
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/api/items/2/sell", body: { qty: 1, mode: "cash" } });
    expect(onSold).toHaveBeenCalledWith(saleEntry);
  });

  it("rolls back and explains when the server refuses", async () => {
    mockApi({
      "/api/items": () => ITEMS,
      "POST /api/items/1/sell": () => Response.json({ detail: "Stock sirf 2 pc hai" }, { status: 422 }),
    });
    const user = userEvent.setup();
    render(<InventoryCard />);
    await user.click(await screen.findByRole("button", { name: "Bread: Bika 1" }));
    expect(await screen.findByText("Stock sirf 2 pc hai")).toBeInTheDocument();
    expect(screen.getByLabelText("2 bacha")).toBeInTheDocument();
  });

  it("filters to low stock and by search", async () => {
    mockApi({ "/api/items": () => ITEMS });
    const user = userEvent.setup();
    render(<InventoryCard />);
    await screen.findByText("Bread");
    await user.click(screen.getByRole("button", { name: /khatam hone wale/ }));
    expect(screen.queryByText("Parle-G · chhota")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /khatam hone wale/ }));
    await user.type(screen.getByLabelText("Item dhoondhiye"), "parle");
    expect(screen.queryByText("Bread")).not.toBeInTheDocument();
    expect(screen.getByText("Parle-G · chhota")).toBeInTheDocument();
  });
});

describe("AddItemSheet", () => {
  it("needs a name and price, then posts the new item", async () => {
    const calls = mockApi({ "POST /api/items": () => ({ ...ITEMS[0], id: 9, name: "Dettol" }) });
    const onAdded = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddItemSheet onAdded={onAdded} onClose={onClose} />);

    const save = screen.getByRole("button", { name: "Save karo" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Naam"), "Dettol");
    await user.type(screen.getByLabelText("Size / brand (optional)"), "125 ml");
    await user.type(screen.getByLabelText("Bechne ka daam (₹)"), "62");
    await user.type(screen.getByLabelText("Kharid ka daam (₹)"), "50");
    await user.type(screen.getByLabelText("Abhi kitna hai"), "12");
    await user.click(screen.getByRole("button", { name: "box" }));
    await user.click(save);

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(calls[0].body).toEqual({ name: "Dettol", variant: "125 ml", unit: "box", price: 62, cost_price: 50, shelf_life: null, stock: 12, low_stock_at: 5 });
    expect(onClose).toHaveBeenCalled();
  });
});

const ACCOUNTS: Accounts = {
  days: 7, sales: 4630, credit_sales: 1410, sales_cash: 2330, sales_upi: 2300, purchases: 4600, expenses: 850, withdrawals: 500,
  cogs: 3800, wastage: 0, net: -20, receivable: 1210, payable: 2200, cash_in: 2530, cash_out: 3750, upi_in: 2800, upi_out: 0,
  stock_value: 36627, stock_items: 25, low_stock: 3,
};

describe("AccountsCard", () => {
  it("shows lena, dena, the estimate and stock value", async () => {
    mockApi({ "/api/accounts": () => ACCOUNTS });
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("₹1,210")).toBeInTheDocument());
    expect(screen.getByText("₹2,200")).toBeInTheDocument();
    expect(screen.getByText("−₹20")).toHaveClass("tabular-nums");
    expect(screen.getByText("₹36,627")).toBeInTheDocument();
  });

  it("switches the period to 30 days", async () => {
    const calls = mockApi({ "/api/accounts": (url) => ({ ...ACCOUNTS, days: url.includes("days=30") ? 30 : 7 }) });
    const user = userEvent.setup();
    render(<AccountsCard />);
    await user.click(screen.getByRole("button", { name: "30" }));
    await waitFor(() => expect(screen.getByText("Pichhle 30 din")).toBeInTheDocument());
    expect(calls.some((c) => c.url.includes("days=30"))).toBe(true);
  });
});

const DAY: DayCloseView = {
  date: "2026-11-27", opening: 2000, cash_in: 1500, cash_out: 300, expected: 3200,
  entries: [{ id: 5, type: "expense", amount: 300, raw_text: "Chai wale ko 300", created_at: new Date().toISOString() }],
  closed: null,
};

describe("DayCloseSheet", () => {
  it("shows the expected cash and flags a shortfall with the entries to check", async () => {
    const calls = mockApi({
      "GET /api/day-close": () => DAY,
      "POST /api/day-close": () => ({ id: 1, date: DAY.date, opening: 2000, expected: 3200, counted: 3000, difference: -200 }),
    });
    const user = userEvent.setup();
    render(<DayCloseSheet onClose={() => {}} />);
    expect(await screen.findByText("₹3,200")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Galla mein kitna hai?"), "3,000");
    await user.click(screen.getByRole("button", { name: "Save karo" }));

    const status = await screen.findByRole("status");
    expect(within(status).getByText("₹200 kam hai")).toBeInTheDocument();
    expect(screen.getByText("“Chai wale ko 300”")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ counted: 3000 });
  });

  it("celebrates when it matches", async () => {
    mockApi({
      "GET /api/day-close": () => DAY,
      "POST /api/day-close": () => ({ id: 2, date: DAY.date, opening: 2000, expected: 3200, counted: 3200, difference: 0 }),
    });
    const user = userEvent.setup();
    render(<DayCloseSheet onClose={() => {}} />);
    await user.type(await screen.findByLabelText("Galla mein kitna hai?"), "3200{Enter}");
    expect(await screen.findByText(/Hisaab barabar/)).toBeInTheDocument();
  });
});

describe("Scroll helpers", () => {
  it("Reveal shows content when the browser has no IntersectionObserver", () => {
    render(
      <Reveal>
        <p>hello</p>
      </Reveal>,
    );
    expect(screen.getByText("hello").parentElement).toHaveClass("is-visible");
  });


  it("BottomNav jumps to sections, shows badges, and the mic button asks to speak", async () => {
    const onGo = vi.fn();
    const onSpeak = vi.fn();
    const user = userEvent.setup();
    render(<BottomNav onGo={onGo} onSpeak={onSpeak} lowStock={3} overdue={1} />);
    await user.click(screen.getByRole("button", { name: /Maal/ }));
    expect(onGo).toHaveBeenCalledWith("maal");
    expect(screen.getByText("3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bolo" }));
    expect(onSpeak).toHaveBeenCalled();
  });
});

describe("StockPlanCard", () => {
  const ACC = {
    days: 30, opening: 1000, purchases: 2000, cogs: 500, wastage: 50, adjustments: 0, closing: 2450,
    sales: 700, gross_profit: 200, margin_pct: 28.6, turnover: 0.29, no_cost_items: 2,
  };
  const PLAN = {
    days: 3, lead_days: 3, order_now: 1, dead_value: 450, a_items: 1,
    items: [
      { item_id: 1, name: "Bread", variant: null, unit: "pc", stock: 2, low_stock_at: 6, sold: 9, per_day: 3, days_left: 0.7,
        reorder_point: 11, order_qty: 18, eoq: 15, abc: "A", sales_value: 405, stock_cost: 70, status: "order_now" },
      { item_id: 3, name: "Umbrella", variant: null, unit: "pc", stock: 3, low_stock_at: 1, sold: 0, per_day: 0, days_left: null,
        reorder_point: 0, order_qty: 0, eoq: null, abc: "C", sales_value: 0, stock_cost: 450, status: "dead" },
    ],
  };

  it("shows the stock account, profit, and what to order", async () => {
    mockApi({ "/api/inventory/account": () => ACC, "/api/inventory/insights": () => PLAN });
    render(<StockPlanCard />);
    expect(await screen.findByText("₹2,450")).toBeInTheDocument();
    expect(screen.getByText("₹200")).toBeInTheDocument();
    expect(screen.getByText("Margin 28.6%")).toBeInTheDocument();
    expect(await screen.findByText("Bread")).toBeInTheDocument();
    expect(screen.getByText("18 pc mangao")).toBeInTheDocument();
    expect(screen.getByText(/₹450 aise maal mein phansa/)).toBeInTheDocument();
  });

  it("sets alerts to reorder points", async () => {
    const calls = mockApi({
      "/api/inventory/account": () => ACC,
      "/api/inventory/insights": () => PLAN,
      "POST /api/inventory/apply-alerts": () => ({ updated: 1 }),
    });
    const user = userEvent.setup();
    render(<StockPlanCard />);
    await user.click(await screen.findByRole("button", { name: "Alert ko reorder point par set karo" }));
    expect(await screen.findByRole("status")).toHaveTextContent("1 alert badle");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ days: 30, lead_days: 3 });
  });
});

describe("Summary numbers open what they add up", () => {
  it("AccountsCard: To collect / To pay / Profit / Stock tiles call onOpen", async () => {
    mockApi({ "/api/accounts": () => ACCOUNTS });
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<AccountsCard onOpen={onOpen} />);
    await user.click(await screen.findByRole("button", { name: "Lena hai" }));
    await user.click(screen.getByRole("button", { name: "Dena hai" }));
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(["receivable", "payable"]);
  });


  it("InventoryCard reloads when stock changed elsewhere", async () => {
    let stock = 2;
    mockApi({ "/api/items": () => [{ ...ITEMS[0], stock }] });
    const { rerender } = render(<InventoryCard refreshKey={0} />);
    expect(await screen.findByLabelText("2 bacha")).toBeInTheDocument();
    stock = 12; // a purchase saved from the speak box
    rerender(<InventoryCard refreshKey={1} />);
    expect(await screen.findByLabelText("12 bacha")).toBeInTheDocument();
  });
});

describe("PartySheet: settle up", () => {
  const GUPTA = { id: 9, name: "Gupta Distributors", kind: "supplier" as const, phone: null, balance: 2200, overdue_since: null, last_entry_at: null };

  it("records a payment to a supplier, never more than owed", async () => {
    const calls = mockApi({
      "/api/entries?party_id": () => [],
      "POST /api/entries": () => Response.json({ id: 5, type: "payment", amount: 1000 }, { status: 201 }),
    });
    const onPaid = vi.fn();
    const user = userEvent.setup();
    render(<PartySheet party={GUPTA as never} shop={null} onClose={() => {}} onPaid={onPaid} />);
    const amount = screen.getByLabelText("Kitne");
    expect(amount).toHaveValue("2200");
    await user.clear(amount);
    await user.type(amount, "2500");
    expect(screen.getByRole("alert")).toHaveTextContent("Aapko Gupta Distributors ko sirf ₹2,200 dene hain");
    expect(screen.getByRole("button", { name: "₹2,500 diye" })).toBeDisabled();
    await user.clear(amount);
    await user.type(amount, "1000");
    await user.click(screen.getByRole("button", { name: "₹1,000 diye" }));
    await waitFor(() => expect(onPaid).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ type: "payment", amount: 1000, party_id: 9, mode: "cash" });
  });
});
