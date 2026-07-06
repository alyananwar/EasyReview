import { NextResponse } from "next/server";
import { previewBatch } from "@/lib/preview";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await previewBatch();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
