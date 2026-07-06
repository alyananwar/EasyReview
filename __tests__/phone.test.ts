import { describe, it, expect } from "vitest";
import { normalizePhone } from "../lib/phone";

describe("normalizePhone", () => {
  it("accepts a plain 10-digit number", () => {
    const r = normalizePhone("2095551234");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tenDigit).toBe("2095551234");
      expect(r.e164).toBe("+12095551234");
    }
  });

  it("accepts formatted US numbers", () => {
    const cases = [
      "(209) 555-1234",
      "209-555-1234",
      "209.555.1234",
      "+1 (209) 555-1234",
      "1-209-555-1234",
    ];
    for (const c of cases) {
      const r = normalizePhone(c);
      expect(r.ok, `failed on ${c}`).toBe(true);
      if (r.ok) expect(r.tenDigit).toBe("2095551234");
    }
  });

  it("strips a leading 1 from 11-digit numbers", () => {
    const r = normalizePhone("12095551234");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenDigit).toBe("2095551234");
  });

  it("rejects empty input", () => {
    expect(normalizePhone("")).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone(null)).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone(undefined)).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone("   abc  ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects too-short numbers", () => {
    expect(normalizePhone("555-1234")).toEqual({
      ok: false,
      reason: "too_short",
    });
  });

  it("rejects too-long numbers", () => {
    expect(normalizePhone("442095551234")).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("rejects invalid area codes (start with 0 or 1)", () => {
    expect(normalizePhone("0095551234")).toEqual({
      ok: false,
      reason: "invalid_area_code",
    });
    expect(normalizePhone("1005551234")).toEqual({
      ok: false,
      reason: "invalid_area_code",
    });
  });
});
