import OAuthClient from 'intuit-oauth'
import { supabaseAdmin } from './supabase'

export function getOAuthClient() {
  return new OAuthClient({
    clientId: process.env.QUICKBOOKS_CLIENT_ID!,
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET!,
    environment: process.env.QUICKBOOKS_ENV as 'sandbox' | 'production' || 'sandbox',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI!,
  })
}

export async function getStoredTokens() {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'qb_tokens')
    .single()
  if (!data?.value) return null
  try {
    return JSON.parse(data.value)
  } catch {
    return null
  }
}

export async function saveTokens(tokenData: Record<string, unknown>) {
  await supabaseAdmin
    .from('settings')
    .upsert({ key: 'qb_tokens', value: JSON.stringify(tokenData) }, { onConflict: 'key' })
}

export async function getRealmId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'qb_realm_id')
    .single()
  return data?.value || null
}

// Fetch customers who had invoices in the last N days
export async function getRecentCustomers(daysBack = 7) {
  const tokens = await getStoredTokens()
  const realmId = await getRealmId()

  if (!tokens || !realmId) {
    throw new Error('QuickBooks not connected')
  }

  const oauthClient = getOAuthClient()
  oauthClient.setToken(tokens)

  // Always refresh — access tokens expire after 1 hour
  try {
    const refreshed = await oauthClient.refresh()
    await saveTokens(refreshed.getJson())
    oauthClient.setToken(refreshed.getJson())
  } catch (err) {
    console.warn('Token refresh failed, trying with existing token:', err)
  }

  const since = new Date()
  since.setDate(since.getDate() - daysBack)
  const sinceStr = since.toISOString().split('T')[0]

  const baseUrl = process.env.QUICKBOOKS_ENV === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'

  const query = `SELECT * FROM Invoice WHERE TxnDate >= '${sinceStr}' MAXRESULTS 100`
  const url = `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`

  const token = oauthClient.getToken()
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`QuickBooks API error: ${response.status}`)
  }

  const data = await response.json()
  const invoices = data.QueryResponse?.Invoice || []

  // Extract unique customers with phone numbers
  const customerMap = new Map<string, { name: string; phone: string; qb_customer_id: string }>()

  for (const invoice of invoices) {
    const customerId = invoice.CustomerRef?.value
    const customerName = invoice.CustomerRef?.name || 'Customer'
    const phone = invoice.BillAddr?.Line1 || null // fallback — we'll fetch customer details

    if (customerId && !customerMap.has(customerId)) {
      // Fetch full customer record to get phone
      const customerData = await fetchCustomer(oauthClient, baseUrl, realmId, customerId)
      if (customerData?.PrimaryPhone?.FreeFormNumber) {
        customerMap.set(customerId, {
          name: customerName,
          phone: customerData.PrimaryPhone.FreeFormNumber,
          qb_customer_id: customerId,
        })
      }
    }
  }

  return Array.from(customerMap.values())
}

async function fetchCustomer(
  oauthClient: ReturnType<typeof getOAuthClient>,
  baseUrl: string,
  realmId: string,
  customerId: string
) {
  const token = oauthClient.getToken()
  const url = `${baseUrl}/v3/company/${realmId}/customer/${customerId}?minorversion=65`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/json',
    },
  })
  if (!response.ok) return null
  const data = await response.json()
  return data.Customer || null
}
