import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', ['message_template', 'qb_realm_id'])

  const settings: Record<string, string> = {}
  for (const row of data || []) {
    settings[row.key] = row.value
  }

  const isConnected = !!settings['qb_realm_id']
  return NextResponse.json({ isConnected, messageTemplate: settings['message_template'] || '' })
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (body.messageTemplate !== undefined) {
    await supabaseAdmin
      .from('settings')
      .upsert({ key: 'message_template', value: body.messageTemplate }, { onConflict: 'key' })
  }

  return NextResponse.json({ ok: true })
}
