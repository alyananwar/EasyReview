import { NextResponse } from 'next/server'
import OAuthClient from 'intuit-oauth'
import { getOAuthClient } from '@/lib/quickbooks'

export async function GET() {
  const oauthClient = getOAuthClient()
  const authUri = oauthClient.authorizeUri({
    scope: [
      OAuthClient.scopes.Accounting,
      OAuthClient.scopes.OpenId,
      OAuthClient.scopes.Profile,
    ],
    state: 'easyreview',
  })
  return NextResponse.redirect(authUri)
}
