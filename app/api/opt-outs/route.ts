import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("opt_outs")
    .select("id, phone, reason, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
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
  const { error } = await supabaseAdmin
    .from("opt_outs")
    .upsert(
      { phone: normalized.tenDigit, reason: body.reason ?? "manual" },
      { onConflict: "phone" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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
  const { error } = await supabaseAdmin
    .from("opt_outs")
    .delete()
    .eq("phone", normalized.tenDigit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
