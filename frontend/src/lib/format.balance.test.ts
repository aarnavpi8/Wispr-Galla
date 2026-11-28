import { describe, expect, it } from "vitest";

import { balanceTone } from "./format";

describe("galla balance colour", () => {
  it("is red below zero, green above, plain at zero", () => {
    expect(balanceTone(-500)).toBe("text-money-out");
    expect(balanceTone(1200)).toBe("text-balance-up");
    expect(balanceTone(0)).toBe("text-ink-950");
  });
});
