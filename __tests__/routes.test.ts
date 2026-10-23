// Security-critical request paths: the proxy's tailnet guard and auth
// redirect, Twilio webhook signature + STOP handling, cron bearer auth, and
// the login rate limiter. These are what the public internet can reach.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import twilio from "twilio";
import { resetDb } from "./db-helpers";

vi.mock("../lib/schedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/schedule")>();
  return {
    ...actual,
    startAutomaticRun: vi.fn(async () => ({
      status: "started",
      runId: "run-1",
    })),
  };
});

import { proxy } from "../proxy";
import { makeSignedSession } from "../lib/auth";
import { optedOutPhones } from "../lib/db";
import { POST as webhook } from "../app/api/twilio/webhook/route";
import { GET as cron } from "../app/api/cron/route";
import { POST as login } from "../app/api/auth/login/route";

const BASE = "http://127.0.0.1:3000";

function req(
  path: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
) {
  return new NextRequest(new URL(path, BASE), init);
}

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("redirects unauthenticated dashboard requests to /login", () => {
    const res = proxy(req("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("lets a signed session through", () => {
    const res = proxy(
      req("/", { headers: { cookie: `er_session=${makeSignedSession()}` } }),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects a forged session cookie", () => {
    const res = proxy(
      req("/", { headers: { cookie: "er_session=ok.deadbeef" } }),
    );
    expect(res.status).toBe(307);
  });

  describe("TAILNET_ONLY=true", () => {
    beforeEach(() => vi.stubEnv("TAILNET_ONLY", "true"));

    it("404s the dashboard and login for Funnel (non-tailnet) traffic", () => {
      expect(proxy(req("/")).status).toBe(404);
      expect(proxy(req("/login")).status).toBe(404);
      expect(proxy(req("/api/auth/quickbooks")).status).toBe(404);
    });

    it("404s even with a valid session cookie if not from the tailnet", () => {
      const res = proxy(
        req("/", { headers: { cookie: `er_session=${makeSignedSession()}` } }),
      );
      expect(res.status).toBe(404);
    });

    it("allows tailnet requests through to normal auth", () => {
      const res = proxy(
        req("/login", {
          headers: { "tailscale-user-login": "me@example.com" },
        }),
      );
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });

    it("keeps Funnel paths public", () => {
      for (const p of ["/privacy", "/terms", "/api/twilio/webhook"]) {
        expect(proxy(req(p)).headers.get("x-middleware-next")).toBe("1");
      }
    });
  });
});

describe("twilio webhook", () => {
  const TOKEN = "test-twilio-token";
  const PUBLIC_URL = "https://shop.tail1234.ts.net";
  const signedUrl = `${PUBLIC_URL}/api/twilio/webhook`;

  beforeEach(() => {
    resetDb();
    vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
    vi.stubEnv("PUBLIC_URL", `${PUBLIC_URL}/`);
  });

  function twilioPost(params: Record<string, string>, signature?: string) {
    const sig =
      signature ?? twilio.getExpectedTwilioSignature(TOKEN, signedUrl, params);
    return req("/api/twilio/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": sig,
      },
      body: new URLSearchParams(params).toString(),
    });
  }

  it("rejects a bad signature without touching the DB", async () => {
    const res = await webhook(
      twilioPost({ From: "+12095551234", Body: "STOP" }, "forged"),
    );
    expect(res.status).toBe(403);
    expect(optedOutPhones(["2095551234"]).size).toBe(0);
  });

  it("records a STOP reply signed against PUBLIC_URL", async () => {
    const res = await webhook(
      twilioPost({ From: "+12095551234", Body: " stop " }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<Response></Response>");
    expect(optedOutPhones(["2095551234"]).has("2095551234")).toBe(true);
  });

  it("ignores non-STOP replies", async () => {
    await webhook(twilioPost({ From: "+12095551234", Body: "thanks!" }));
    expect(optedOutPhones(["2095551234"]).size).toBe(0);
  });
});

describe("cron endpoint", () => {
  it("401s when CRON_SECRET is unset, even for 'Bearer undefined'", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await cron(
      req("/api/cron", { headers: { authorization: "Bearer undefined" } }),
    );
    expect(res.status).toBe(401);
  });

  it("401s a wrong token", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await cron(
      req("/api/cron", { headers: { authorization: "Bearer nope" } }),
    );
    expect(res.status).toBe(401);
  });

  it("starts a run with the right token", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await cron(
      req("/api/cron", { headers: { authorization: "Bearer s3cret" } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runId: "run-1", status: "started" });
  });
});

describe("login", () => {
  beforeEach(() => vi.stubEnv("DASHBOARD_PASSWORD", "correct horse"));

  function attempt(password: string, ip: string) {
    return login(
      req("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ password }),
      }),
    );
  }

  it("sets a session cookie on the right password", async () => {
    const res = await attempt("correct horse", "10.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/er_session=ok\./);
  });

  it("locks an IP out after 5 failures, even for the right password", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await attempt("wrong", "10.0.0.2")).status).toBe(401);
    }
    expect((await attempt("correct horse", "10.0.0.2")).status).toBe(429);
    // Other IPs unaffected
    expect((await attempt("correct horse", "10.0.0.3")).status).toBe(200);
  });

  it("500s if DASHBOARD_PASSWORD is not configured", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    expect((await attempt("anything", "10.0.0.4")).status).toBe(500);
  });
});
