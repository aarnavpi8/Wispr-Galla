import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GREETINGS, greetingKey, LANGS, translate } from "@/lib/i18n";

import { LanguagePicker, wrapDelta } from "./LanguagePicker";
import { LanguageProvider, useLang } from "./language";
import { Splash, STEP_MS } from "./Splash";

describe("translate", () => {
  it("has every string in every language", () => {
    for (const { code } of LANGS) {
      expect(translate(code, "speakOrType")).not.toBe("");
    }
    expect(translate("en", "speakOrType")).toBe("Speak or type");
    expect(translate("mr", "speakOrType")).toBe("बोला किंवा लिहा");
  });

  it("fills in variables", () => {
    expect(translate("en", "overdue", { n: 2 })).toBe("2 customer(s) past their due date");
  });

  it("picks the greeting by hour", () => {
    expect(greetingKey(8)).toBe("morning");
    expect(greetingKey(14)).toBe("afternoon");
    expect(greetingKey(20)).toBe("evening");
  });
});

function ShowLang() {
  const { chosen, t } = useLang();
  return (
    <p>
      chosen={chosen ?? "none"} · {t("next")}
    </p>
  );
}

describe("LanguagePicker", () => {
  beforeEach(() => localStorage.clear());

  it("starts unchosen, previews the picked language, and saves it", async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <ShowLang />
        <LanguagePicker />
      </LanguageProvider>,
    );
    expect(screen.getByText(/chosen=none/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "English" }));
    expect(screen.getByRole("heading", { name: "Choose your language" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Get started/ }));
    expect(localStorage.getItem("galla.lang")).toBe("en");
    expect(screen.getByText(/chosen=en · Next/)).toBeInTheDocument();
  });

  it("turns the ring with the scroll wheel", () => {
    render(
      <LanguageProvider>
        <LanguagePicker />
      </LanguageProvider>,
    );
    // Starts on Hinglish (2nd); one wheel notch down moves to English, up twice to Hindi.
    expect(screen.getByRole("radio", { name: "Hinglish" })).toHaveAttribute("aria-checked", "true");
    const ring = screen.getByRole("radiogroup");
    act(() => {
      ring.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    });
    expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    act(() => {
      ring.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
      ring.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
    });
    expect(screen.getByRole("radio", { name: "हिंदी" })).toHaveAttribute("aria-checked", "true");
  });

  it("wraps around the ring the short way", () => {
    expect(wrapDelta(3, 4)).toBe(-1); // last -> first is one step back, not three forward
    expect(wrapDelta(-3, 4)).toBe(1);
    expect(wrapDelta(1, 4)).toBe(1);
  });

  it("remembers the choice on the next open", () => {
    localStorage.setItem("galla.lang", "mr");
    render(
      <LanguageProvider>
        <ShowLang />
      </LanguageProvider>,
    );
    expect(screen.getByText(/chosen=mr · पुढे/)).toBeInTheDocument();
  });
});

describe("Splash", () => {
  it("cycles greetings then gets out of the way", () => {
    // Full animation path, not the reduced-motion shortcut.
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    vi.useFakeTimers();
    render(<Splash />);
    expect(screen.getByRole("heading")).toHaveTextContent(GREETINGS[0].text);

    act(() => vi.advanceTimersByTime(STEP_MS + 10));
    expect(screen.getByRole("heading")).toHaveTextContent(GREETINGS[1].text);

    act(() => vi.advanceTimersByTime(GREETINGS.length * (STEP_MS + 10))); // through every greeting
    // Personal greeting: no longer one of the cycling hellos, and no emoji.
    expect(screen.getByRole("heading")).not.toHaveTextContent(GREETINGS[GREETINGS.length - 1].text);
    expect(screen.getByRole("heading").textContent).not.toContain("🙏");
    act(() => vi.advanceTimersByTime(2_000)); // hold, then fade out
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("can be skipped with a tap", () => {
    vi.useFakeTimers();
    render(<Splash />);
    act(() => screen.getByRole("presentation").click());
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });
});
