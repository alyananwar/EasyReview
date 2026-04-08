import { NextResponse } from 'next/server'
import { getRecentCustomers } from '@/lib/quickbooks'
import { sendGoogleVoiceText } from '@/lib/google-voice'
import { supabaseAdmin } from '@/lib/supabase'

const REVIEW_LINK = process.env.REVIEW_LINK || 'https://g.page/r/YOUR_REVIEW_LINK'

function buildMessage(firstName: string) {
  return `Hi ${firstName}! This is Lockeford Garage. We hope your visit went well! We'd really appreciate it if you could leave us a quick review — it helps us out a lot. ${REVIEW_LINK} Thanks!`
}

export async function POST() {
  try {
    // Pull recent customers from QuickBooks
    const recentCustomers = await getRecentCustomers(7)

    if (recentCustomers.length === 0) {
      return NextResponse.json({ message: 'No new customers found in the last 7 days', sent: 0 })
    }

    let sent = 0
    const results = []

    for (const customer of recentCustomers) {
      // Check if already texted
      const { data: existing } = await supabaseAdmin
        .from('customers')
        .select('id, texted_at')
        .eq('qb_customer_id', customer.qb_customer_id)
        .single()

      if (existing?.texted_at) {
        results.push({ name: customer.name, status: 'already_texted' })
        continue
      }

      // Clean up phone number
      const phone = customer.phone.replace(/\D/g, '')
      if (phone.length < 10) {
        results.push({ name: customer.name, status: 'invalid_phone' })
        continue
      }

      const firstName = customer.name.split(' ')[0]
      const message = buildMessage(firstName)

      try {
        await sendGoogleVoiceText(phone, message)

        // Upsert customer record and mark as texted
        await supabaseAdmin.from('customers').upsert(
          {
            qb_customer_id: customer.qb_customer_id,
            name: customer.name,
            phone: customer.phone,
            texted_at: new Date().toISOString(),
          },
          { onConflict: 'qb_customer_id' }
        )

        results.push({ name: customer.name, status: 'sent' })
        sent++

        // Small delay between messages
        await new Promise(r => setTimeout(r, 3000))
      } catch (err) {
        results.push({ name: customer.name, status: 'error', error: String(err) })
      }
    }

    return NextResponse.json({ sent, total: recentCustomers.length, results })
  } catch (err) {
    console.error('Send texts error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
