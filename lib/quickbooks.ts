import OAuthClient from "intuit-oauth";
import { supabaseAdmin } from "./supabase";

export interface QbCustomer {
  name: string;
  phone: string;
  qb_customer_id: string;
}

export function getOAuthClient() {
  return new OAuthClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
    environment:
      (process.env.QUICKBOOKS_ENV as "sandbox" | "production") || "sandbox",
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI!,
  });
}

export async function getStoredTokens() {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "qb_tokens")
    .maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value);
  } catch {
    return null;
  }
}

export async function saveTokens(tokenData: Record<string, unknown>) {
  await supabaseAdmin
    .from("settings")
    .upsert(
      { key: "qb_tokens", value: JSON.stringify(tokenData) },
      { onConflict: "key" },
    );
}

export async function getRealmId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "qb_realm_id")
    .maybeSingle();
  return data?.value || null;
}

function qbBaseUrl(): string {
  return process.env.QUICKBOOKS_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function qbQuery<T = unknown>(
  oauthClient: ReturnType<typeof getOAuthClient>,
  realmId: string,
  query: string,
): Promise<T> {
  const token = oauthClient.getToken();
  const url = `${qbBaseUrl()}/v3/company/${realmId}/query?query=${encodeURIComponent(
    query,
  )}&minorversion=65`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`QuickBooks API error: ${response.status} ${body}`);
  }
  return response.json();
}

// Fetch customers who had invoices in the last N days.
// Batches the customer detail lookup into a single IN (...) query instead of
// N sequential fetches.
export async function getRecentCustomers(daysBack = 7): Promise<QbCustomer[]> {
  const tokens = await getStoredTokens();
  const realmId = await getRealmId();

  if (!tokens || !realmId) {
    throw new Error("QuickBooks not connected");
  }

  const oauthClient = getOAuthClient();
  oauthClient.setToken(tokens);

  // Access tokens expire hourly — always refresh.
  try {
    const refreshed = await oauthClient.refresh();
    await saveTokens(refreshed.getJson());
    oauthClient.setToken(refreshed.getJson());
  } catch (err) {
    console.warn("Token refresh failed, trying with existing token:", err);
  }

  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split("T")[0];

  const invoiceQuery = `SELECT Id, CustomerRef FROM Invoice WHERE TxnDate >= '${sinceStr}' MAXRESULTS 100`;
  type InvoiceResp = {
    QueryResponse?: {
      Invoice?: Array<{ CustomerRef?: { value?: string; name?: string } }>;
    };
  };
  const invoiceData = await qbQuery<InvoiceResp>(
    oauthClient,
    realmId,
    invoiceQuery,
  );
  const invoices = invoiceData.QueryResponse?.Invoice ?? [];

  // Collect unique customer IDs with their names from the invoice refs
  const uniqueIds = new Map<string, string>();
  for (const inv of invoices) {
    const id = inv.CustomerRef?.value;
    if (!id || uniqueIds.has(id)) continue;
    uniqueIds.set(id, inv.CustomerRef?.name || "Customer");
  }

  if (uniqueIds.size === 0) return [];

  // Batch fetch customer details with one IN (...) query
  const idList = Array.from(uniqueIds.keys())
    .map((id) => `'${id}'`)
    .join(",");
  const customerQuery = `SELECT Id, DisplayName, PrimaryPhone FROM Customer WHERE Id IN (${idList}) MAXRESULTS 100`;
  type CustResp = {
    QueryResponse?: {
      Customer?: Array<{
        Id?: string;
        DisplayName?: string;
        PrimaryPhone?: { FreeFormNumber?: string };
      }>;
    };
  };
  const custData = await qbQuery<CustResp>(oauthClient, realmId, customerQuery);
  const customers = custData.QueryResponse?.Customer ?? [];

  const result: QbCustomer[] = [];
  for (const c of customers) {
    const phone = c.PrimaryPhone?.FreeFormNumber;
    const id = c.Id;
    if (!id || !phone) continue;
    result.push({
      qb_customer_id: id,
      name: c.DisplayName || uniqueIds.get(id) || "Customer",
      phone,
    });
  }
  return result;
}
