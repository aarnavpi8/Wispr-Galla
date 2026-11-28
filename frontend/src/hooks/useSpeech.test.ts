import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { joinSpeech } from "@/lib/native";

import { useSpeech } from "./useSpeech";

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: { 0: { transcript: string }; isFinal: boolean }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

const sessions: Rec[] = [];
class FakeRecognition implements Rec {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: Rec["onresult"] = null;
  onend: Rec["onend"] = null;
  onerror: Rec["onerror"] = null;
  constructor() {
    sessions.push(this);
  }
  start() {}
  stop() {
    this.onend?.();
  }
}
const say = (r: Rec, text: string) => r.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: false }] });

afterEach(() => {
  sessions.length = 0;
  vi.unstubAllGlobals();
});

describe("mic for a slow speaker", () => {
  it("keeps listening through pauses and keeps every word until stop is tapped", () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const texts: string[] = [];
    const { result } = renderHook(() => useSpeech((t) => texts.push(t), "hi-IN"));
    expect(result.current.engine).toBe("browser");

    act(() => result.current.start());
    expect(sessions[0].continuous).toBe(true);
    act(() => say(sessions[0], "Ramesh ko do kilo"));
    act(() => sessions[0].onerror?.({ error: "no-speech" })); // a long pause: not an error
    act(() => sessions[0].onend?.()); // the browser ends the session after the pause
    expect(result.current.listening).toBe(true); // ...but we keep listening
    expect(sessions).toHaveLength(2);

    act(() => say(sessions[1], "cheeni udhaar"));
    expect(texts.at(-1)).toBe("Ramesh ko do kilo cheeni udhaar");

    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("joins stretches of speech with single spaces", () => {
    expect(joinSpeech("", "do kilo")).toBe("do kilo");
    expect(joinSpeech("do kilo ", " cheeni")).toBe("do kilo cheeni");
    expect(joinSpeech("do kilo", "")).toBe("do kilo");
  });
});
