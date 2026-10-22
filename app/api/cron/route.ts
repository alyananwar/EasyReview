import { NextRequest, NextResponse } from "next/server";
import { startAutomaticRun } from "@/lib/schedule";

export const runtime = "nodejs";

// Manual trigger for the automatic run (same rules: pause switch + quiet hours).
// The in-process scheduler (instrumentation.ts) normally fires this on its own;
// this endpoint is for kicking it off over SSH:
//   curl.exe -X GET -H "Authorization: Bearer <CRON_SECRET>" http://127.0.0.1:3000/api/cron
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  // Reject when the secret is unset, otherwise "Bearer undefined" would match.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await startAutomaticRun();
    if (result.status === "skipped") {
      return NextResponse.json({ skipped: result.reason });
    }
    return NextResponse.json({ runId: result.runId, status: "started" });
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
