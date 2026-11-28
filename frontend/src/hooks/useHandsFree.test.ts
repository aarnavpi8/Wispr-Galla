import { describe, expect, it } from "vitest";

import { afterWakeWord } from "./useHandsFree";

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
  });

  it("ignores talk without the wake word, and uses the last one when said twice", () => {
    expect(afterWakeWord("galla mein kitna hai")).toBeNull();
    expect(afterWakeWord("bolkhata ... nahi, BolKhata din band")).toBe("din band");
  });

  it("gives an empty string when only the wake word was said", () => {
    expect(afterWakeWord("BolKhata")).toBe("");
  });
});
