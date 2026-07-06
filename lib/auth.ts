import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "er_session";
const SESSION_VALUE = "ok";

function getSecret(): string {
  const s = process.env.COOKIE_SECRET;
  if (!s) throw new Error("COOKIE_SECRET env var is not set");
  return s;
}

export function makeSignedSession(): string {
  const secret = getSecret();
  const sig = createHmac("sha256", secret).update(SESSION_VALUE).digest("hex");
  return `${SESSION_VALUE}.${sig}`;
}

export function verifySignedSession(cookie: string): boolean {
  try {
    const secret = getSecret();
    const dot = cookie.lastIndexOf(".");
    if (dot === -1) return false;
    const value = cookie.slice(0, dot);
    const sig = cookie.slice(dot + 1);
    if (value !== SESSION_VALUE) return false;
    const expected = createHmac("sha256", secret).update(value).digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isAuthenticated(request: NextRequest): boolean {
  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) return false;
  return verifySignedSession(cookie.value);
}

export function attachSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, makeSignedSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
