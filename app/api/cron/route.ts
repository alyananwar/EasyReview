import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { createRun, processBatch, cleanStuckRuns } from "@/lib/batch";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

function isInQuietHours(
  timezone: string,
  startHHMM: string,
  endHHMM: string,
): boolean {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
    const cur = h * 60 + m;
    const [sh, sm] = startHHMM.split(":").map(Number);
    const [eh, em] = endHHMM.split(":").map(Number);
    const start = (sh || 0) * 60 + (sm || 0);
    const end = (eh || 0) * 60 + (em || 0);
    // Handles overnight ranges (e.g. 20:00 → 08:00)
    return start > end ? cur >= start || cur < end : cur >= start && cur < end;
  } catch {
    return false;
  }
}

// Called by Vercel Cron (vercel.json). Protected by a shared secret.
// Returns immediately; batch executes via after() with Vercel waitUntil.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  // Reject when the secret is unset — otherwise "Bearer undefined" would match.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check automation and quiet hours from settings
  const { data: settingsRows } = await supabaseAdmin
    .from("settings")
    .select("key, value")
    .in("key", [
      "automation_enabled",
      "business_timezone",
      "quiet_hours_start",
      "quiet_hours_end",
    ]);

  const s: Record<string, string> = {};
  for (const row of settingsRows ?? []) s[row.key] = row.value;

  if (s["automation_enabled"] === "false") {
    return NextResponse.json({ skipped: "automation_paused" });
  }

  const timezone = s["business_timezone"] ?? "America/Los_Angeles";
  const quietStart = s["quiet_hours_start"] ?? "20:00";
  const quietEnd = s["quiet_hours_end"] ?? "08:00";

  if (isInQuietHours(timezone, quietStart, quietEnd)) {
    return NextResponse.json({ skipped: "quiet_hours" });
  }

  try {
    await cleanStuckRuns();
    const runId = await createRun("cron");

    after(() =>
      processBatch(runId).catch((err) => {
        console.error("Cron batch error:", err);
      }),
    );

    return NextResponse.json({ runId, status: "started" });
  } catch (err) {
    if (
      err instanceof Error &&
      (err as { code?: string }).code === "ACTIVE_RUN"
    ) {
      return NextResponse.json(
        { error: "A run is already in progress" },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Cron error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
