// Phone number normalization and validation for US numbers.
// Stored and matched as 10-digit US numbers; sent to Twilio as +1XXXXXXXXXX.

export type PhoneResult =
  | { ok: true; e164: string; tenDigit: string }
  | {
      ok: false;
      reason: "empty" | "too_short" | "too_long" | "invalid_area_code";
    };

export function normalizePhone(raw: string | null | undefined): PhoneResult {
  if (!raw) return { ok: false, reason: "empty" };

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return { ok: false, reason: "empty" };

  // Drop leading 1 (US country code) if 11 digits
  const tenDigit =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (tenDigit.length < 10) return { ok: false, reason: "too_short" };
  if (tenDigit.length > 10) return { ok: false, reason: "too_long" };

  // US area codes can't start with 0 or 1
  const areaCode = tenDigit.slice(0, 3);
  if (areaCode[0] === "0" || areaCode[0] === "1") {
    return { ok: false, reason: "invalid_area_code" };
  }

  return { ok: true, e164: `+1${tenDigit}`, tenDigit };
}
