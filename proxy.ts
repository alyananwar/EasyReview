import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

// Paths that don't require authentication
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/twilio/webhook",
  "/api/cron",
  "/api/health",
  "/privacy",
  "/terms",
]);

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (!isAuthenticated(request)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
