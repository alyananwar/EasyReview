import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "crypto";

// Must be set before the module is imported so getSecret() doesn't throw.
beforeAll(() => {
  process.env.COOKIE_SECRET = "test-secret-abcdef1234567890abcdef1234567890";
});

// Dynamic import so the env var is set first
async function getAuth() {
  return import("../lib/auth");
}

describe("makeSignedSession / verifySignedSession", () => {
  it("round-trips: sign then verify succeeds", async () => {
    const { makeSignedSession, verifySignedSession } = await getAuth();
    const signed = makeSignedSession();
    expect(verifySignedSession(signed)).toBe(true);
  });

  it("rejects a cookie with a tampered signature", async () => {
    const { makeSignedSession, verifySignedSession } = await getAuth();
    const signed = makeSignedSession();
    const tampered = signed.slice(0, -4) + "0000";
    expect(verifySignedSession(tampered)).toBe(false);
  });

  it("rejects a cookie with a different value but valid-looking signature", async () => {
    const { verifySignedSession } = await getAuth();
    const secret = process.env.COOKIE_SECRET!;
    const badValue = "admin";
    const sig = createHmac("sha256", secret).update(badValue).digest("hex");
    expect(verifySignedSession(`${badValue}.${sig}`)).toBe(false);
  });

  it("rejects empty string", async () => {
    const { verifySignedSession } = await getAuth();
    expect(verifySignedSession("")).toBe(false);
  });

  it("rejects a cookie with no dot separator", async () => {
    const { verifySignedSession } = await getAuth();
    expect(verifySignedSession("nodothere")).toBe(false);
  });
});
