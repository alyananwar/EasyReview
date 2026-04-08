import { NextRequest, NextResponse } from 'next/server'

// This endpoint is called by Vercel Cron on a schedule
// Protected by a secret so only the cron job can trigger it
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Call the send-texts endpoint internally
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const response = await fetch(`${baseUrl}/api/send-texts`, { method: 'POST' })
  const result = await response.json()

  return NextResponse.json(result)
}
