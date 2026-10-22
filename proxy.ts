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

// Reachable through Tailscale Funnel (the public internet): Intuit and A2P
// reviewers need the policy pages, Twilio needs the webhook.
const FUNNEL_PATHS = new Set(["/privacy", "/terms", "/api/twilio/webhook"]);
// Bearer-token protected; called over SSH as http://127.0.0.1:3000/...
const BEARER_PATHS = new Set(["/api/cron", "/api/health"]);

// Tailscale Serve adds Tailscale-User-Login to requests from your tailnet and
// strips spoofed copies; Funnel requests never carry it. With TAILNET_ONLY=true
// everything else (dashboard, login, QuickBooks connect) is tailnet-only.
function blockedByTailnetGuard(
  request: NextRequest,
  pathname: string,
): boolean {
  if (process.env.TAILNET_ONLY !== "true") return false;
  if (FUNNEL_PATHS.has(pathname) || BEARER_PATHS.has(pathname)) return false;
  if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon"))
    return false;
  return !request.headers.get("tailscale-user-login");
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (blockedByTailnetGuard(request, pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }

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
