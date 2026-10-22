import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const rows = getDb()
    .prepare("SELECT * FROM customers ORDER BY created_at DESC LIMIT 100")
    .all();
  return NextResponse.json(rows);
}
