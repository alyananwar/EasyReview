import { NextRequest, NextResponse } from "next/server";
import { getDb, getSettings, setSetting } from "@/lib/db";
import { DEFAULT_TEMPLATE, validateTemplate } from "@/lib/message";
import { RUN_HOURS } from "@/lib/schedule";

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
  const s = getSettings(SETTINGS_KEYS);
  const lastRun = getDb()
    .prepare(
      "SELECT started_at FROM runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1",
    )
    .get() as { started_at: string } | undefined;

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
    runHours: RUN_HOURS,
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

  for (const { key, value } of updates) setSetting(key, value);

  return NextResponse.json({ ok: true });
}
