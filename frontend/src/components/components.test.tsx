import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DayTotals, EntryOut, PartyBalance, Summary } from "@/lib/types";

import { AccountMenu } from "./AccountMenu";
import { AuthProvider } from "./auth";
import { hinglish } from "@/lib/locales/hinglish";

import { CaptureCard } from "./CaptureCard";
import { EntryList } from "./EntryList";
import { HeroCard } from "./HeroCard";
import { KhataList } from "./KhataList";
import { WeekChart } from "./WeekChart";

function day(date: string, cash = 0, upi = 0): DayTotals {
  return {
    date,
    sales: cash + upi,
    sales_cash: cash,
    sales_upi: upi,
    udhaar_given: 0,
    collected: 0,
    cash_in: cash,
    upi_in: upi,
    expenses: 0,
    purchases_paid: 0,
    purchases: 0,
    withdrawals: 0,
    cash_out: 0,
    entries: cash || upi ? 1 : 0,
  };
}

const DAYS = [
  day("2026-11-21"),
  day("2026-11-22"),
  day("2026-11-23"),
  day("2026-11-24", 640, 1200),
  day("2026-11-25", 930),
  day("2026-11-26", 760, 1100),
  day("2026-11-27"),
];

const SUMMARY: Summary = {
  today: DAYS[6],
  days: DAYS,
  opening_cash: 2000,
  expected_cash_today: 2000,
  udhaar_outstanding: 1210,
  overdue_count: 1,
};

describe("CaptureCard", () => {
  it("keeps Aage disabled until there is text, then submits it", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CaptureCard onSubmit={onSubmit} />);

    const aage = screen.getByRole("button", { name: /aage/i });
    expect(aage).toBeDisabled();

    await user.type(screen.getByRole("textbox"), "Bijli bill 850 bhara");
    expect(aage).toBeEnabled();
    await user.click(aage);
    expect(onSubmit).toHaveBeenCalledWith("Bijli bill 850 bhara");
  });

  it("submits on Enter", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CaptureCard onSubmit={onSubmit} />);
    await user.type(screen.getByRole("textbox"), "Ramesh ko 200 udhaar{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("Ramesh ko 200 udhaar");
  });

  it("types an example sentence in when its chip is tapped", async () => {
    vi.useFakeTimers();
    render(<CaptureCard onSubmit={() => {}} />);
    act(() => screen.getByRole("button", { name: hinglish.ex1 }).click());
    await act(async () => {
      vi.advanceTimersByTime(hinglish.ex1.length * 20 + 50);
    });
    expect(screen.getByRole("textbox")).toHaveValue(hinglish.ex1);

  });

  it("hides the mic when the browser has no speech recognition", () => {
    render(<CaptureCard onSubmit={() => {}} />);
    expect(screen.queryByRole("button", { name: /dabake boliye/i })).not.toBeInTheDocument();
  });

  it("shows the mic when speech recognition exists", () => {
    vi.stubGlobal("webkitSpeechRecognition", class {});
    render(<CaptureCard onSubmit={() => {}} />);
    expect(screen.getByRole("button", { name: /dabake boliye/i })).toBeInTheDocument();
  });
});

describe("HeroCard", () => {
  it("opens on the week view when today has no entries", async () => {
    render(<HeroCard summary={SUMMARY} />);
    expect(screen.getByRole("tab", { name: "7 din" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByText("₹4,630")).toBeInTheDocument());
  });

  it("switches to today's numbers", async () => {
    const user = userEvent.setup();
    render(<HeroCard summary={SUMMARY} />);
    await user.click(screen.getByRole("tab", { name: "Aaj" }));
    expect(screen.getByRole("tab", { name: "Aaj" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getAllByText("₹0").length).toBeGreaterThanOrEqual(4));
  });
});

describe("WeekChart", () => {
  it("draws one bar per day and shows the hovered day's split", async () => {
    const user = userEvent.setup();
    render(<WeekChart days={DAYS} />);
    const bars = screen.getAllByRole("button");
    expect(bars).toHaveLength(7);

    await user.hover(bars[3]);
    expect(screen.getByText(/₹1,840/)).toBeInTheDocument();
    expect(screen.getByText(/₹640 Cash/)).toBeInTheDocument();
  });

  it("labels the last bar as today", () => {
    render(<WeekChart days={DAYS} />);
    expect(screen.getByText("Aaj")).toBeInTheDocument();
  });
});

const PARTIES: PartyBalance[] = [
  { id: 1, name: "Ramesh", kind: "customer", phone: "9876500002", balance: 150, overdue_since: "2026-11-23", last_entry_at: null },
  { id: 2, name: "Sharma ji", kind: "customer", phone: "9876500001", balance: 820, overdue_since: null, last_entry_at: null },
  { id: 3, name: "Gupta Distributors", kind: "supplier", phone: null, balance: 2200, overdue_since: null, last_entry_at: null },
];

describe("KhataList", () => {
  it("shows customers first and flags overdue ones", () => {
    render(<KhataList parties={PARTIES} onOpen={() => {}} />);
    expect(screen.getByText("Ramesh")).toBeInTheDocument();
    expect(screen.getByText(/din se baaki/)).toBeInTheDocument();
    expect(screen.queryByText("Gupta Distributors")).not.toBeInTheDocument();
  });

  it("filters by search and switches to suppliers", async () => {
    const user = userEvent.setup();
    render(<KhataList parties={PARTIES} onOpen={() => {}} />);
    await user.type(screen.getByLabelText("Naam dhoondhiye"), "shar");
    expect(screen.queryByText("Ramesh")).not.toBeInTheDocument();
    expect(screen.getByText("Sharma ji")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Naam dhoondhiye"));
    await user.click(screen.getByRole("button", { name: "Supplier" }));
    expect(screen.getByText("Gupta Distributors")).toBeInTheDocument();
  });

  it("opens a party on tap", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<KhataList parties={PARTIES} onOpen={onOpen} />);
    await user.click(screen.getByText("Sharma ji"));
    expect(onOpen).toHaveBeenCalledWith(PARTIES[1]);
  });
});

describe("EntryList", () => {
  const entry: EntryOut = {
    id: 1,
    type: "expense",
    party_id: null,
    party_name: null,
    amount: 850,
    paid_now: null,
    mode: "cash",
    due_date: null,
    raw_text: "Bijli bill 850 bhara",
    source: "seed",
    reversed: false,
    created_at: new Date().toISOString(),
  };

  it("shows the spoken text and a signed, coloured amount", () => {
    render(<EntryList entries={[entry]} />);
    expect(screen.getByText("“Bijli bill 850 bhara”")).toBeInTheDocument();
    const amount = screen.getByText("−₹850");
    expect(amount).toHaveClass("text-money-out");
  });

  it("has a friendly empty state", () => {
    render(<EntryList entries={[]} />);
    expect(screen.getByText(/koi entry nahi/i)).toBeInTheDocument();
  });
});

describe("Google login without keys", () => {
  it("tells the user login is not set up and keeps the app open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ llm_configured: false, firebase: null })),
    );
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <AccountMenu />
      </AuthProvider>,
    );
    await user.click(screen.getByRole("button", { name: /account/i }));
    await waitFor(() => expect(screen.getByText(/Firebase keys missing/)).toBeInTheDocument());
    expect(screen.queryByText(/Google se login/)).not.toBeInTheDocument();
  });
});
