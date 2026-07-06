import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Recent runs for the history panel.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("runs")
    .select(
      "id, status, source, started_at, finished_at, total, sent, skipped, failed, error",
    )
    .order("started_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
