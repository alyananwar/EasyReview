import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_TEMPLATE, validateTemplate } from "@/lib/message";

const SETTINGS_KEYS = [
  "message_template",
  "qb_realm_id",
  "qb_company_name",
  "automation_enabled",
  "business_timezone",
  "quiet_hours_start",
  "quiet_hours_end",
] as const;

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("key, value")
    .in("key", [...SETTINGS_KEYS]);

  const s: Record<string, string> = {};
  for (const row of data ?? []) s[row.key] = row.value;

  const { data: lastRun } = await supabaseAdmin
    .from("runs")
    .select("started_at, status")
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reviewLink = process.env.REVIEW_LINK ?? "";

  return NextResponse.json({
    isConnected: !!s["qb_realm_id"],
    qbCompanyName: s["qb_company_name"] ?? null,
    messageTemplate: s["message_template"]?.trim() || DEFAULT_TEMPLATE,
    defaultTemplate: DEFAULT_TEMPLATE,
    automationEnabled: s["automation_enabled"] !== "false", // default true when key absent
    businessTimezone: s["business_timezone"] ?? "America/Los_Angeles",
    quietHoursStart: s["quiet_hours_start"] ?? "20:00",
    quietHoursEnd: s["quiet_hours_end"] ?? "08:00",
    lastRunAt: lastRun?.started_at ?? null,
    // Server-side env status for the Setup panel (never exposes secrets).
    reviewLinkOk: !!reviewLink && !reviewLink.includes("YOUR_REVIEW_LINK"),
    smsNumber: process.env.TWILIO_FROM_NUMBER ?? null,
    businessName: process.env.BUSINESS_NAME ?? null,
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const updates: Array<{ key: string; value: string }> = [];

  if (body.messageTemplate !== undefined) {
    const template = String(body.messageTemplate);
    const check = validateTemplate(template);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    updates.push({ key: "message_template", value: template.trim() });
  }
  if (body.automationEnabled !== undefined) {
    updates.push({
      key: "automation_enabled",
      value: body.automationEnabled ? "true" : "false",
    });
  }
  if (body.businessTimezone !== undefined) {
    const tz = String(body.businessTimezone);
    if (!isValidTimezone(tz)) {
      return NextResponse.json(
        { error: `Invalid timezone: ${tz}` },
        { status: 400 },
      );
    }
    updates.push({ key: "business_timezone", value: tz });
  }
  if (body.quietHoursStart !== undefined) {
    const v = String(body.quietHoursStart);
    if (!HHMM_RE.test(v)) {
      return NextResponse.json(
        { error: "quietHoursStart must be HH:MM (24-hour)" },
        { status: 400 },
      );
    }
    updates.push({ key: "quiet_hours_start", value: v });
  }
  if (body.quietHoursEnd !== undefined) {
    const v = String(body.quietHoursEnd);
    if (!HHMM_RE.test(v)) {
      return NextResponse.json(
        { error: "quietHoursEnd must be HH:MM (24-hour)" },
        { status: 400 },
      );
    }
    updates.push({ key: "quiet_hours_end", value: v });
  }

  for (const { key, value } of updates) {
    const { error } = await supabaseAdmin
      .from("settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
