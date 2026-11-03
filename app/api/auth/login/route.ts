import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";

// Simple in-memory rate limiter: 5 failed attempts per IP per 15 minutes.
// Serverless instances don't share memory, so this is best-effort per
// instance — enough to blunt casual brute force on a single-tenant app.
const MAX_ATTEMPTS = 5;
// X-Forwarded-For is client-controlled, so a per-IP limit alone can be dodged
// by rotating the header. This cap counts every failure no matter the claimed IP.
const MAX_GLOBAL_ATTEMPTS = 20;
const GLOBAL_KEY = "*global*";
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();

function overLimit(key: string, max: number): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= max;
}

function isRateLimited(ip: string): boolean {
  return (
    overLimit(GLOBAL_KEY, MAX_GLOBAL_ATTEMPTS) || overLimit(ip, MAX_ATTEMPTS)
  );
}

function recordFailure(ip: string): void {
  bump(GLOBAL_KEY);
  bump(ip);
}

function bump(ip: string): void {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    failures.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count++;
  }
}

function passwordsMatch(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const dashPassword = process.env.DASHBOARD_PASSWORD;
  if (!dashPassword) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD is not configured" },
      { status: 500 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!body.password || !passwordsMatch(body.password, dashPassword)) {
    recordFailure(ip);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  failures.delete(ip);
  const res = NextResponse.json({ ok: true });
  attachSessionCookie(res);
  return res;
}
