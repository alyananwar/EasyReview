import { NextResponse } from "next/server";
import OAuthClient from "intuit-oauth";
import { getOAuthClient } from "@/lib/quickbooks";
import { randomUUID } from "crypto";

export async function GET() {
  const state = randomUUID();
  const oauthClient = getOAuthClient();
  const authUri = oauthClient.authorizeUri({
    scope: [
      OAuthClient.scopes.Accounting,
      OAuthClient.scopes.OpenId,
      OAuthClient.scopes.Profile,
    ],
    state,
  });
  const res = NextResponse.redirect(authUri);
  res.cookies.set("qb_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — plenty of time to complete OAuth
    path: "/",
  });
  return res;
}
