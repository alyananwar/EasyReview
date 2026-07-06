/**
 * Run before first deploy to verify all credentials are wired correctly.
 * Usage: npx ts-node scripts/verify-setup.ts
 */

import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

const REQUIRED_VARS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
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

// ── 3. Supabase connectivity ───────────────────────────────────────────────
async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail("supabase_connectivity", "missing env vars");

  const client = createClient(url, key);
  const { error } = await client.from("settings").select("key").limit(1);
  if (error) {
    fail("supabase_connectivity", error.message);
  } else {
    pass("supabase_connectivity");
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

  await checkSupabase();
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
    console.log("\nAll checks passed. Ready to deploy.");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Verification script crashed:", e);
  process.exit(1);
});
