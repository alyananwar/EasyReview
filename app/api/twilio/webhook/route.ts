import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { addOptOut } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";

const STOP_WORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);

// Twilio sends a POST here when an incoming SMS is received on our number.
// Configure this URL in the Twilio console under Phone Numbers > Messaging.
// URL: <PUBLIC_URL>/api/twilio/webhook (the Tailscale Funnel address)
export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const twilioSignature = request.headers.get("x-twilio-signature") ?? "";

  // Parse the URL-encoded form body Twilio sends.
  const text = await request.text();
  const params: Record<string, string> = Object.fromEntries(
    new URLSearchParams(text),
  );

  // Validate the request came from Twilio. Twilio signs the public URL it
  // called, which is not what the app sees behind the Tailscale proxy.
  const publicUrl = process.env.PUBLIC_URL
    ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}${request.nextUrl.pathname}`
    : request.url;
  const valid = twilio.validateRequest(
    authToken,
    twilioSignature,
    publicUrl,
    params,
  );
  if (!valid) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const body = (params["Body"] ?? "").trim().toUpperCase();
  const from = params["From"] ?? "";

  if (STOP_WORDS.has(body)) {
    const phone = normalizePhone(from);
    if (phone.ok) {
      addOptOut(phone.tenDigit, "stop_reply");
    }
  }

  // Empty TwiML response — Twilio still handles opt-out at carrier level.
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } },
  );
}
