import { describe, expect, test } from "vitest";
import {
  DEFAULT_TEMPLATE,
  MAX_TEMPLATE_LENGTH,
  OPT_OUT_SUFFIX,
  renderMessage,
  validateTemplate,
} from "../lib/message";

const vars = {
  firstName: "Sarah",
  businessName: "Lockeford Garage",
  reviewLink: "https://g.page/r/abc123",
};

describe("renderMessage", () => {
  test("fills all placeholders", () => {
    const msg = renderMessage(
      "Hi {first_name}, {business_name} here: {review_link}",
      vars,
    );
    expect(msg).toContain("Sarah");
    expect(msg).toContain("Lockeford Garage");
    expect(msg).toContain("https://g.page/r/abc123");
    expect(msg).not.toContain("{");
  });

  test("appends opt-out suffix when template lacks STOP language", () => {
    const msg = renderMessage("Review us: {review_link}", vars);
    expect(msg.endsWith(OPT_OUT_SUFFIX)).toBe(true);
  });

  test("does not double-append when template already mentions STOP", () => {
    const msg = renderMessage(
      `Review us: {review_link} ${OPT_OUT_SUFFIX}`,
      vars,
    );
    expect(msg.match(/STOP/g)).toHaveLength(1);
  });

  test("default template renders with opt-out language", () => {
    const msg = renderMessage(DEFAULT_TEMPLATE, vars);
    expect(msg).toContain("Sarah");
    expect(msg).toContain(OPT_OUT_SUFFIX);
  });

  test("replaces repeated placeholders", () => {
    const msg = renderMessage("{first_name} {first_name} {review_link}", vars);
    expect(msg.match(/Sarah/g)).toHaveLength(2);
  });
});

describe("validateTemplate", () => {
  test("accepts the default template", () => {
    expect(validateTemplate(DEFAULT_TEMPLATE)).toEqual({ ok: true });
  });

  test("rejects empty template", () => {
    const res = validateTemplate("   ");
    expect(res.ok).toBe(false);
  });

  test("rejects template missing {review_link}", () => {
    const res = validateTemplate("Hi {first_name}, please review us!");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("{review_link}");
  });

  test("rejects template over the length limit", () => {
    const long = "x".repeat(MAX_TEMPLATE_LENGTH) + " {review_link}";
    const res = validateTemplate(long);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("too long");
  });

  test("accepts template exactly at the limit", () => {
    const link = "{review_link}";
    const filler = "x".repeat(MAX_TEMPLATE_LENGTH - link.length - 1);
    const res = validateTemplate(`${filler} ${link}`);
    expect(res).toEqual({ ok: true });
  });
});
