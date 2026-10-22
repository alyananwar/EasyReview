import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStoredTokens } from "@/lib/quickbooks";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";

// Returns a health summary for this shop's deployment.
// Useful for verifying a new setup or diagnosing silent failures.
// GET /api/health
// Accessible with a dashboard session or `Authorization: Bearer <CRON_SECRET>`
// (for external uptime monitors).
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk =
    !!cronSecret &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!bearerOk && !isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const checks: Record<string, { ok: boolean; detail?: string }> = {
    twilio_config: {
      ok: !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
      ),
    },
    review_link: {
      ok:
        !!process.env.REVIEW_LINK &&
        !process.env.REVIEW_LINK.includes("YOUR_REVIEW_LINK"),
    },
    cron_secret: { ok: !!process.env.CRON_SECRET },
    database: { ok: false },
    quickbooks_connected: { ok: false },
    last_run: { ok: true },
  };

  // Database opens and answers
  try {
    getDb().prepare("SELECT 1").get();
    checks.database = { ok: true };
  } catch (e) {
    checks.database = {
      ok: false,
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  // QuickBooks token presence
  if (checks.database.ok) {
    try {
      const tokens = await getStoredTokens();
      checks.quickbooks_connected = {
        ok: !!tokens,
        detail: tokens ? "tokens present" : "not connected",
      };
    } catch (e) {
      checks.quickbooks_connected = {
        ok: false,
        detail: e instanceof Error ? e.message : "unknown",
      };
    }
  }

  // Last successful run recency (warn if >36h with no completed run)
  if (checks.database.ok) {
    try {
      const data = getDb()
        .prepare(
          "SELECT started_at FROM runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1",
        )
        .get() as { started_at: string } | undefined;

      if (!data) {
        checks.last_run = { ok: true, detail: "no runs yet" };
      } else {
        const hoursSince =
          (Date.now() - new Date(data.started_at).getTime()) / 3_600_000;
        checks.last_run = {
          ok: hoursSince < 36,
          detail: `last completed run ${Math.round(hoursSince)}h ago`,
        };
      }
    } catch {
      checks.last_run = { ok: false, detail: "could not query runs" };
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok: allOk, checks },
    { status: allOk ? 200 : 503 },
  );
}
