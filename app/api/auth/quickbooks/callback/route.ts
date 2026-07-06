import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, saveTokens } from "@/lib/quickbooks";
import { supabaseAdmin } from "@/lib/supabase";

async function fetchCompanyName(
  accessToken: string,
  realmId: string,
): Promise<string | null> {
  const base =
    process.env.QUICKBOOKS_ENV === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";
  const res = await fetch(
    `${base}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    CompanyInfo?: { CompanyName?: string };
  };
  return data?.CompanyInfo?.CompanyName ?? null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const returnedState = url.searchParams.get("state");
  const storedState = request.cookies.get("qb_oauth_state")?.value;

  // Clear the state cookie regardless of outcome
  const clearState = (res: NextResponse) => {
    res.cookies.set("qb_oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  };

  if (!storedState || !returnedState || returnedState !== storedState) {
    return clearState(
      NextResponse.redirect(new URL("/?error=qb_state_mismatch", request.url)),
    );
  }

  const oauthClient = getOAuthClient();

  try {
    const tokenResponse = await oauthClient.createToken(request.url);
    const tokenData = tokenResponse.getJson();
    await saveTokens(tokenData);

    const realmId = oauthClient.getToken().realmId;
    await supabaseAdmin
      .from("settings")
      .upsert({ key: "qb_realm_id", value: realmId }, { onConflict: "key" });

    try {
      const accessToken = oauthClient.getToken().access_token as string;
      const companyName = await fetchCompanyName(accessToken, realmId);
      if (companyName) {
        await supabaseAdmin
          .from("settings")
          .upsert(
            { key: "qb_company_name", value: companyName },
            { onConflict: "key" },
          );
      }
    } catch {
      // Company name is cosmetic — don't fail OAuth if fetch fails
    }

    return clearState(
      NextResponse.redirect(new URL("/?connected=true", request.url)),
    );
  } catch (err) {
    console.error("QuickBooks OAuth error:", err);
    return clearState(
      NextResponse.redirect(new URL("/?error=qb_auth_failed", request.url)),
    );
  }
}
