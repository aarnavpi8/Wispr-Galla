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
  | "send_reminder";

export interface PartyRef {
  name: string;
  kind: "customer" | "supplier";
  match_id: number | null;
}

export interface LineItem {
  name: string;
  item_id: number | null;
  qty: number;
  unit: string;
  price: number | null;
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
