/**
 * Run on the shop PC before going live to verify credentials are wired correctly.
 * Usage: npm run verify
 */

import twilio from "twilio";

const REQUIRED_VARS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "PUBLIC_URL",
  "QUICKBOOKS_CLIENT_ID",
  "QUICKBOOKS_CLIENT_SECRET",
  "QUICKBOOKS_REDIRECT_URI",
  "CRON_SECRET",
  "REVIEW_LINK",
  "DASHBOARD_PASSWORD",
  "COOKIE_SECRET",
];

type Check = { label: string; ok: boolean; detail: string };
const results: Check[] = [];

function pass(label: string, detail = "") {
  results.push({ label, ok: true, detail });
}
function fail(label: string, detail = "") {
  results.push({ label, ok: false, detail });
}

// ── 1. Required env vars ───────────────────────────────────────────────────
for (const v of REQUIRED_VARS) {
  if (process.env[v]) {
    pass(`env:${v}`);
  } else {
    fail(`env:${v}`, "missing from .env.local");
  }
}

// ── 2. REVIEW_LINK is not placeholder ─────────────────────────────────────
const reviewLink = process.env.REVIEW_LINK ?? "";
if (reviewLink.includes("YOUR_REVIEW_LINK")) {
  fail("review_link_not_placeholder", "still set to the example value");
} else {
  pass("review_link_not_placeholder");
}

// ── 3. QuickBooks redirect lives on the public HTTPS URL ──────────────────
// Intuit production apps only accept https redirect URIs (no localhost, no IPs).
{
  const pub = (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");
  const redirect = process.env.QUICKBOOKS_REDIRECT_URI ?? "";
  const expected = `${pub}/api/auth/quickbooks/callback`;
  if (!pub.startsWith("https://")) {
    fail(
      "public_url_https",
      "PUBLIC_URL must be the https://<pc>.<tailnet>.ts.net address",
    );
  } else if (redirect !== expected) {
    fail(
      "qb_redirect_uri",
      `expected ${expected}, got ${redirect || "(empty)"}`,
    );
  } else {
    pass("qb_redirect_uri", redirect);
  }
}

// ── 4. Twilio credentials valid ────────────────────────────────────────────
async function checkTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return fail("twilio_credentials", "missing env vars");

  try {
    const client = twilio(sid, token);
    await client.api.accounts(sid).fetch();
    pass("twilio_credentials");
  } catch (e) {
    fail(
      "twilio_credentials",
      e instanceof Error ? e.message : "invalid credentials",
    );
  }
}

// ── 5. Twilio from-number exists on account ────────────────────────────────
async function checkTwilioNumber() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !fromNumber)
    return fail("twilio_from_number", "missing env vars");

  try {
    const client = twilio(sid, token);
    const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
    const found = numbers.some((n) => n.phoneNumber === fromNumber);
    if (found) {
      pass("twilio_from_number", fromNumber);
    } else {
      fail(
        "twilio_from_number",
        `${fromNumber} not found on this Twilio account`,
      );
    }
  } catch (e) {
    fail(
      "twilio_from_number",
      e instanceof Error ? e.message : "could not list numbers",
    );
  }
}

async function main() {
  console.log("\nEasyReview Setup Verification\n" + "─".repeat(40));

  await checkTwilio();
  await checkTwilioNumber();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log();
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    const detail = r.detail ? `  (${r.detail})` : "";
    console.log(`  ${icon} ${r.label}${detail}`);
  }

  console.log(`\n${passed}/${results.length} checks passed`);

  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const r of failed) {
      console.log(`  • ${r.label}: ${r.detail}`);
    }
    process.exit(1);
  } else {
    console.log("\nAll checks passed.");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Verification script crashed:", e);
  process.exit(1);
});
