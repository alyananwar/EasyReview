import { after } from "next/server";
import { NextResponse } from "next/server";
import { createRun, processBatch, cleanStuckRuns } from "@/lib/batch";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  // Check automation is enabled before creating a run.
  const { data: autoRow } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "automation_enabled")
    .maybeSingle();
  if (autoRow?.value === "false") {
    return NextResponse.json(
      { error: "Automation is paused. Enable it in the dashboard first." },
      { status: 409 },
    );
  }

  try {
    await cleanStuckRuns();
    const runId = await createRun("manual");

    after(() =>
      processBatch(runId).catch((err) => {
        console.error("Background batch error:", err);
      }),
    );

    return NextResponse.json({ runId, status: "started" });
  } catch (err) {
    if (
      err instanceof Error &&
      (err as { code?: string }).code === "ACTIVE_RUN"
    ) {
      return NextResponse.json(
        { error: "A run is already in progress. Wait for it to finish." },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Send texts error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
