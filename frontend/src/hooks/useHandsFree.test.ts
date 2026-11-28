import { describe, expect, it, vi } from "vitest";

import { afterWakeWord, wakeFeedback } from "./useHandsFree";

describe("afterWakeWord", () => {
  it("returns what was said after BolKhata, in Roman or Indian scripts", () => {
    expect(afterWakeWord("BolKhata Ramesh ko 200 udhaar")).toBe("Ramesh ko 200 udhaar");
    expect(afterWakeWord("bol khata, aaj kitna kamaya?")).toBe("aaj kitna kamaya?");
    expect(afterWakeWord("बोल खाता रमेश को २०० उधार")).toBe("रमेश को २०० उधार");
    expect(afterWakeWord("બોલ ખાતા દિવસ બંધ")).toBe("દિવસ બંધ");
  });

  it("catches common mishearings", () => {
    expect(afterWakeWord("ball khatta din band")).toBe("din band");
    expect(afterWakeWord("bol kata stock dikhao")).toBe("stock dikhao");
    expect(afterWakeWord("Bolo khaata 500 ki bikri")).toBe("500 ki bikri");
    expect(afterWakeWord("bol khatha din band")).toBe("din band");
    expect(afterWakeWord("Bowl Khata show stock")).toBe("show stock");
    expect(afterWakeWord("bulk hata help")).toBe("help");
    expect(afterWakeWord("बोलो खाता दिन बंद")).toBe("दिन बंद");
    expect(afterWakeWord("बोल ख़ाता स्टॉक दिखाओ")).toBe("स्टॉक दिखाओ");
    expect(afterWakeWord("Kolkata show stock")).toBe("show stock"); // how a Galaxy A55 heard it
    expect(afterWakeWord("Kalkata din band")).toBe("din band");
  });

  it("doesn't wake on words that only contain the sounds", () => {
    expect(afterWakeWord("symbol kit lao")).toBeNull();
    expect(afterWakeWord("bolta hai khata khol")).toBeNull();
  });

  it("ignores talk without the wake word, and uses the last one when said twice", () => {
    expect(afterWakeWord("galla mein kitna hai")).toBeNull();
    expect(afterWakeWord("bolkhata ... nahi, BolKhata din band")).toBe("din band");
  });

  it("gives an empty string when only the wake word was said", () => {
    expect(afterWakeWord("BolKhata")).toBe("");
  });
});

describe("wakeFeedback", () => {
  it("buzzes the phone so the shopkeeper knows BolKhata was heard (sound is best-effort)", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    expect(() => wakeFeedback()).not.toThrow(); // jsdom has no AudioContext: no sound, no crash
    expect(vibrate).toHaveBeenCalledWith(60);
  });
});
