import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url));
  clearSessionCookie(res);
  return res;
}
