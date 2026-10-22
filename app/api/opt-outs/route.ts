import { NextRequest, NextResponse } from "next/server";
import { addOptOut, getDb } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export async function GET() {
  const rows = getDb()
    .prepare(
      "SELECT id, phone, reason, created_at FROM opt_outs ORDER BY created_at DESC",
    )
    .all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const normalized = normalizePhone(body.phone);
  if (!normalized.ok) {
    return NextResponse.json(
      { error: `Invalid phone: ${normalized.reason}` },
      { status: 400 },
    );
  }
  addOptOut(normalized.tenDigit, "manual");
  return NextResponse.json({ ok: true, phone: normalized.tenDigit });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const normalized = normalizePhone(body.phone);
  if (!normalized.ok) {
    return NextResponse.json(
      { error: `Invalid phone: ${normalized.reason}` },
      { status: 400 },
    );
  }
  getDb()
    .prepare("DELETE FROM opt_outs WHERE phone = ?")
    .run(normalized.tenDigit);
  return NextResponse.json({ ok: true });
}
