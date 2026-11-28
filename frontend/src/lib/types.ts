// The extraction contract. Mirrors backend/app/schemas.py (ExtractedEntry).

export type EntryType =
  | "sale"
  | "udhaar"
  | "payment"
  | "purchase"
  | "expense"
  | "owner_withdrawal"
  | "bill_item"
  | "command";

export type Mode = "cash" | "upi" | "udhaar";

export type Command =
  | "bill_start"
  | "bill_total"
  | "day_close"
  | "show_khata"
  | "send_reminder"
  // Voice control for the rest of the app (backend/app/commands.py)
  | "show_stock"
  | "scan_bill"
  | "add_item"
  | "show_accounts"
  | "show_entries"
  | "change_language"
  | "help"
  | "undo_last";

export interface PartyRef {
  name: string;
  kind: "customer" | "supplier";
  match_id: number | null;
}

export interface ItemOption {
  item_id: number;
  name: string;
  unit: string;
  price: number | null;
}

export interface LineItem {
  name: string;
  item_id: number | null;
  qty: number;
  unit: string;
  price: number | null;
  /** Several stock items fit what was said: the card asks "which one?" (mirrors schemas.ItemOption). */
  options?: ItemOption[];
  /** The words heard for this line; saved as the picked item's alias. */
  heard?: string | null;
}

export interface PartyOption {
  id: number;
  name: string;
  kind: "customer" | "supplier";
}

export interface ExtractedEntry {
  type: EntryType;
  party: PartyRef | null;
  items: LineItem[];
  amount: number | null; // integer rupees
  paid_now: number | null;
  mode: Mode | null;
  due_date: string | null; // ISO date
  command: Command | null;
  confidence: Record<string, number>;
  missing: string[];
  raw_text: string;
  source: "rules" | "llm";
  party_options: PartyOption[];
}

export interface ShopSummary {
  id: number;
  name: string;
  vpa: string;
  language: string;
  items: number;
  customers: number;
  suppliers: number;
  entries: number;
  llm_configured: boolean;
}

// Read-only API shapes (backend/app/schemas.py).

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface AppConfig {
  llm_configured: boolean;
  wispr_configured: boolean;
  firebase: FirebaseWebConfig | null; // null: Google login not set up
}

export interface EntryOut {
  id: number;
  type: EntryType;
  party_id: number | null;
  party_name: string | null;
  amount: number;
  paid_now: number | null;
  mode: Mode | null;
  due_date: string | null;
  raw_text: string;
  source: "rules" | "llm" | "seed";
  reversed: boolean;
  created_at: string;
}

export interface PartyBalance {
  id: number;
  name: string;
  kind: "customer" | "supplier";
  phone: string | null;
  balance: number;
  overdue_since: string | null;
  last_entry_at: string | null;
}

export interface DayTotals {
  date: string;
  sales: number;
  sales_cash: number;
  sales_upi: number;
  udhaar_given: number;
  collected: number;
  cash_in: number;
  upi_in: number;
  expenses: number;
  purchases_paid: number;
  purchases: number;
  withdrawals: number;
  cash_out: number;
  entries: number;
}

export interface Summary {
  today: DayTotals;
  days: DayTotals[];
  opening_cash: number;
  expected_cash_today: number;
  udhaar_outstanding: number;
  overdue_count: number;
}

// Inventory (D18): backend/app/inventory.py
export interface Item {
  id: number;
  name: string;
  variant: string | null;
  unit: string;
  price: number;
  stock: number;
  low_stock_at: number;
  low: boolean;
  value: number;
  cost_price?: number; // weighted-average cost per unit; 0 = not known
  margin?: number | null;
}

export type StockReason = "purchase" | "sale" | "wastage" | "count";

export interface StockMove {
  id: number;
  delta: number;
  reason: StockReason | "opening" | "undo";
  stock_after: number;
  created_at: string;
}

// Accounts and day close: backend/app/accounts.py
export interface Accounts {
  days: number;
  sales: number;
  sales_cash: number;
  sales_upi: number;
  purchases: number;
  expenses: number;
  withdrawals: number;
  net: number;
  receivable: number;
  payable: number;
  cash_in: number;
  cash_out: number;
  upi_in: number;
  stock_value: number;
  stock_items: number;
  low_stock: number;
}

export interface DayCloseOut {
  id: number;
  date: string;
  opening: number;
  expected: number;
  counted: number;
  difference: number;
}

export interface DayCloseView {
  date: string;
  opening: number;
  cash_in: number;
  cash_out: number;
  expected: number;
  entries: { id: number; type: EntryType; amount: number; raw_text: string; created_at: string }[];
  closed: DayCloseOut | null;
}

// Bill scan: backend/app/inventory.py (/api/items/scan)
export interface ScanLine {
  raw: string;
  qty: number;
  item_id: number | null;
  confidence: number;
  alternatives: number[];
  rate?: number | null;
}

// Selling from the stock screen: POST /api/items/{id}/sell (backend/app/entries_api.py)
export interface SellOut {
  item: Item;
  entry: EntryOut | null; // null when the item has no price yet (stock-only)
}

// Inventory as its own account: GET /api/inventory/account (backend/app/stockplan.py)
export interface InventoryAccount {
  days: number;
  opening: number;
  purchases: number;
  cogs: number;
  wastage: number;
  adjustments: number;
  closing: number;
  sales: number;
  gross_profit: number;
  margin_pct: number | null;
  turnover: number | null;
  no_cost_items: number;
}

export type PlanStatus = "out" | "order_now" | "ok" | "dead" | "no_sales";

// Reorder point, EOQ, ABC, dead stock: GET /api/inventory/insights
export interface ItemPlan {
  item_id: number;
  name: string;
  variant: string | null;
  unit: string;
  stock: number;
  low_stock_at: number;
  sold: number;
  per_day: number;
  days_left: number | null;
  reorder_point: number;
  order_qty: number;
  eoq: number | null;
  abc: "A" | "B" | "C";
  sales_value: number;
  stock_cost: number;
  status: PlanStatus;
}

export interface Insights {
  days: number;
  lead_days: number;
  items: ItemPlan[];
  order_now: number;
  dead_value: number;
  a_items: number;
}
