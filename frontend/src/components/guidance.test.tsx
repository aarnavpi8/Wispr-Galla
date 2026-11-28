import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";
import { en } from "@/lib/locales/en";
import { hi } from "@/lib/locales/hi";
import type { Item } from "@/lib/types";

import { BillScanSheet } from "./BillScanSheet";
import { ColorLegend, HelpTip } from "./HelpTip";
import { LanguageProvider } from "./language";
import { Tour, TOUR_KEY, TOUR_STEPS, tourSeen } from "./Tour";

function inLang(lang: string, ui: React.ReactNode) {
  localStorage.setItem("galla.lang", lang);
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

beforeEach(() => localStorage.clear());

describe("HelpTip", () => {
  it("explains a money word in plain language, in the chosen language", async () => {
    const user = userEvent.setup();
    inLang("hi", <HelpTip title="receivable" body="helpReceivable" />);
    await user.click(screen.getByRole("button", { name: `${hi.whatIsThis} ${hi.receivable}` }));
    expect(screen.getByRole("dialog", { name: hi.receivable })).toBeInTheDocument();
    expect(screen.getByText(translate("hi", "helpReceivable"))).toBeInTheDocument(); // ₹ amounts in Hindi digits
    await user.click(screen.getByRole("button", { name: hi.gotIt }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reads the explanation aloud in the chosen language", async () => {
    const speak = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn(), getVoices: () => [] });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        voice = null;
        constructor(public text: string) {}
      },
    );
    const user = userEvent.setup();
    inLang("en", <HelpTip title="payable" body="helpPayable" />);
    await user.click(screen.getByRole("button", { name: /What is this/ }));
    await user.click(screen.getByRole("button", { name: /Listen/ }));
    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0];
    expect(utterance.lang).toBe("en-IN");
    expect(utterance.text).toContain("Money you still have to give");
  });
});

describe("read-aloud stops when you move on", () => {
  function stubSpeech() {
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak, cancel, getVoices: () => [] });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        voice = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public text: string) {}
      },
    );
    return { cancel, speak };
  }

  it("closing a help card silences it", async () => {
    const { cancel, speak } = stubSpeech();
    const user = userEvent.setup();
    inLang("en", <HelpTip title="payable" body="helpPayable" />);
    await user.click(screen.getByRole("button", { name: /What is this/ }));
    await user.click(screen.getByRole("button", { name: /Listen/ }));
    expect(speak).toHaveBeenCalledOnce();
    cancel.mockClear();
    await user.click(screen.getByRole("button", { name: en.gotIt }));
    expect(cancel).toHaveBeenCalled();
  });

  it("the next tour step silences the previous one", async () => {
    const { cancel, speak } = stubSpeech();
    const user = userEvent.setup();
    inLang("en", <Tour onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Listen/ }));
    expect(speak).toHaveBeenCalledOnce();
    cancel.mockClear();
    await user.click(screen.getByRole("button", { name: `${en.tourNext} →` }));
    expect(cancel).toHaveBeenCalled();
  });

  it("tapping Listen again stops it", async () => {
    const { cancel } = stubSpeech();
    const user = userEvent.setup();
    inLang("en", <HelpTip title="payable" body="helpPayable" />);
    await user.click(screen.getByRole("button", { name: /What is this/ }));
    const listen = screen.getByRole("button", { name: /Listen/ });
    await user.click(listen);
    expect(listen).toHaveAttribute("aria-pressed", "true");
    cancel.mockClear();
    await user.click(listen);
    expect(cancel).toHaveBeenCalled();
    expect(listen).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ColorLegend", () => {
  it("names the three money colours", () => {
    inLang("en", <ColorLegend />);
    expect(screen.getByText(en.legendIn)).toBeInTheDocument();
    expect(screen.getByText(en.legendOut)).toBeInTheDocument();
    expect(screen.getByText(en.legendPending)).toBeInTheDocument();
  });
});

describe("Tour", () => {
  it("walks through every step and remembers it was seen", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    expect(tourSeen()).toBe(false);
    inLang("en", <Tour onClose={onClose} />);

    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      expect(screen.getByText(`${i + 1} of ${TOUR_STEPS.length}`)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: `${en.tourNext} →` }));
    }
    expect(screen.getByText(en.tour6Title)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: en.tourDone }));
    expect(onClose).toHaveBeenCalled();
    expect(localStorage.getItem(TOUR_KEY)).toBe("done");
  });

  it("can be skipped and goes back", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    inLang("hi", <Tour onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: `${hi.tourNext} →` }));
    expect(screen.getByText(hi.tour2Title)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: hi.tourBack }));
    expect(screen.getByText(hi.tour1Title)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: hi.tourSkip }));
    expect(onClose).toHaveBeenCalled();
    expect(tourSeen()).toBe(true);
  });
});

const ITEMS: Item[] = [
  { id: 1, name: "Maggi", variant: null, unit: "pc", price: 15, stock: 60, low_stock_at: 24, low: false, value: 900 },
  { id: 2, name: "Kurkure", variant: null, unit: "pc", price: 20, stock: 40, low_stock_at: 12, low: false, value: 800 },
  { id: 3, name: "Cheeni", variant: null, unit: "kg", price: 45, stock: 48, low_stock_at: 10, low: false, value: 2160 },
];

describe("BillScanSheet", () => {
  it("photo -> read -> tick -> one tap adds everything to stock", async () => {
    const posted: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        posted.push({ url, body: JSON.parse(String(init?.body)) });
        if (url === "/api/items/scan") {
          return Response.json([
            { raw: "Maggi 2 dozen", qty: 24, item_id: 1, confidence: 1, alternatives: [] },
            { raw: "Kurkre 10 x 20 200", qty: 10, item_id: 2, confidence: 0.7, alternatives: [3] },
            { raw: "Thank you", qty: 1, item_id: null, confidence: 0.2, alternatives: [] },
          ]);
        }
        return Response.json([
          { ...ITEMS[0], stock: 84 },
          { ...ITEMS[1], stock: 50 },
        ]);
      }),
    );
    const readBill = vi.fn(async (_f: Blob, progress: (p: number) => void) => {
      progress(0.5);
      return "Maggi 2 dozen\nKurkre 10 x 20 200\nThank you";
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    inLang("en", <BillScanSheet items={ITEMS} onClose={() => {}} onDone={onDone} readBill={readBill} />);

    const photo = new File(["x"], "bill.jpg", { type: "image/jpeg" });
    URL.createObjectURL = vi.fn(() => "blob:bill");
    URL.revokeObjectURL = vi.fn();
    await act(async () => {
      await user.upload(screen.getByLabelText(en.takePhoto), photo);
    });

    // Two matched lines ticked, the unknown one not; the unsure one is highlighted with a chip.
    await screen.findByText(en.checkLines);
    const save = screen.getByRole("button", { name: "Add 2 items to stock" });
    expect(screen.getByRole("button", { name: "Cheeni" })).toBeInTheDocument();

    await user.click(save);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(posted.at(-1)).toEqual({
      url: "/api/items/stock-batch",
      body: { lines: [{ item_id: 1, qty: 24, unit_cost: null }, { item_id: 2, qty: 10, unit_cost: null }] },
    });
    expect(screen.getByText("Stock updated for 2 items")).toBeInTheDocument();
    expect(readBill).toHaveBeenCalledOnce();
  });

  it("asks for a clearer photo when nothing is recognised", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    URL.createObjectURL = vi.fn(() => "blob:bill");
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    inLang("en", <BillScanSheet items={ITEMS} onClose={() => {}} onDone={() => {}} readBill={async () => "%%%"} />);
    await act(async () => {
      await user.upload(screen.getByLabelText(en.takePhoto), new File(["x"], "b.jpg", { type: "image/jpeg" }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(en.scanEmpty);
  });
});
