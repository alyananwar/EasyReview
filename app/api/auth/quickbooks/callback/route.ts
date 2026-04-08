import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient, saveTokens } from '@/lib/quickbooks'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const url = request.url
  const oauthClient = getOAuthClient()

  try {
    const tokenResponse = await oauthClient.createToken(url)
    const tokenData = tokenResponse.getJson()

    // Save tokens
    await saveTokens(tokenData)

    // Save the realmId (company ID) from the token
    const realmId = oauthClient.getToken().realmId
    await supabaseAdmin
      .from('settings')
      .upsert({ key: 'qb_realm_id', value: realmId }, { onConflict: 'key' })

    return NextResponse.redirect(new URL('/?connected=true', request.url))
  } catch (err) {
    console.error('QuickBooks OAuth error:', err)
    return NextResponse.redirect(new URL('/?error=qb_auth_failed', request.url))
  }
}
