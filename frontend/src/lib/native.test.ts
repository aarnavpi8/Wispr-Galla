import { afterEach, describe, expect, it, vi } from "vitest";

// The phone's recognizer: start/stop/listeners, where stop() never answers (as Android does when
// tapped between two stretches of speech) — the bug that kept the mic stuck on "Stop".
const listeners: Record<string, (d: unknown) => void> = {};
const plugin = {
  available: vi.fn(async () => ({ available: true })),
  checkPermissions: vi.fn(async () => ({ speechRecognition: "granted" })),
  requestPermissions: vi.fn(async () => ({ speechRecognition: "granted" })),
  removeAllListeners: vi.fn(async () => {}),
  addListener: vi.fn(async (name: string, fn: (d: unknown) => void) => {
    listeners[name] = fn;
  }),
  start: vi.fn(async () => {}),
  stop: vi.fn(() => new Promise<void>(() => {})), // never resolves
};
vi.mock("@capacitor-community/speech-recognition", () => ({ SpeechRecognition: plugin }));

const { nativeListen } = await import("./native");

afterEach(() => vi.useRealTimers());

describe("native mic", () => {
  it("stop ends the turn at once, even when the phone never answers stop()", async () => {
    const handle = await nativeListen("hi-IN", () => {});
    expect(handle.ok).toBe(true);
    if (!handle.ok) return;
    await handle.stop();
    const ended = await Promise.race([handle.done.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);
    expect(ended).toBe(true);
    expect(plugin.stop).toHaveBeenCalled();
  });

  it("a pause doesn't end the turn: words are kept and listening starts again", async () => {
    vi.useFakeTimers();
    const heard: string[] = [];
    const handle = await nativeListen("hi-IN", (t) => heard.push(t));
    if (!handle.ok) throw new Error("not ok");
    const starts = plugin.start.mock.calls.length;
    listeners.partialResults({ matches: ["do kilo"] });
    listeners.listeningState({ status: "stopped" }); // Android stops after a silence
    listeners.partialResults({ matches: ["do kilo"] }); // ...then sends the same words again, late
    await vi.advanceTimersByTimeAsync(700);
    expect(plugin.start.mock.calls.length).toBe(starts + 1);
    listeners.partialResults({ matches: ["cheeni"] });
    expect(heard.at(-1)).toBe("do kilo cheeni"); // not "do kilo do kilo cheeni"
    await handle.stop();
  });

  it("never doubles text when a recognizer repeats earlier words", async () => {
    const { joinSpeech } = await import("./native");
    expect(joinSpeech("do kilo", "do kilo cheeni")).toBe("do kilo cheeni");
    expect(joinSpeech("do kilo cheeni", "cheeni")).toBe("do kilo cheeni");
    expect(joinSpeech("Do kilo", "do kilo cheeni")).toBe("do kilo cheeni");
  });
});
