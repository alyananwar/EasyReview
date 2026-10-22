import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// Recent runs for the history panel.
export async function GET() {
  const rows = getDb()
    .prepare(
      `SELECT id, status, source, started_at, finished_at, total, sent, skipped, failed, error
       FROM runs ORDER BY started_at DESC LIMIT 25`,
    )
    .all();
  return NextResponse.json(rows);
}
