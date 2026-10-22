import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// Next 16: params is a Promise.
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const row = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as
    { results: string } | undefined;
  if (!row) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({ ...row, results: JSON.parse(row.results) });
}
