import { afterEach, describe, expect, it } from "vitest";

import { deviceId, identityHeaders, setTokenSource } from "./identity";

afterEach(() => setTokenSource(null));

describe("identity headers", () => {
  it("each browser keeps one private device id", async () => {
    localStorage.removeItem("galla.device");
    const id = deviceId();
    expect(id).toMatch(/^[a-f0-9]{36}$/);
    expect(deviceId()).toBe(id);
    expect(await identityHeaders()).toEqual({ "X-Galla-Device": id });
  });

  it("adds the Google sign-in token when signed in, and drops it on sign-out", async () => {
    setTokenSource(async () => "id-token-123");
    expect((await identityHeaders()).Authorization).toBe("Bearer id-token-123");
    setTokenSource(null);
    expect((await identityHeaders()).Authorization).toBeUndefined();
  });
});
