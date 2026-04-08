import { chromium } from 'playwright'

const GV_EMAIL = process.env.GOOGLE_VOICE_EMAIL!
const GV_PASSWORD = process.env.GOOGLE_VOICE_PASSWORD!

export async function sendGoogleVoiceText(toPhone: string, message: string): Promise<boolean> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Go to Google Voice
    await page.goto('https://voice.google.com', { waitUntil: 'networkidle' })

    // Handle Google login if needed
    const url = page.url()
    if (url.includes('accounts.google.com')) {
      // Enter email
      await page.fill('input[type="email"]', GV_EMAIL)
      await page.click('#identifierNext')
      await page.waitForTimeout(2000)

      // Enter password
      await page.fill('input[type="password"]', GV_PASSWORD)
      await page.click('#passwordNext')
      await page.waitForTimeout(4000)

      // Handle potential 2FA prompt — if it appears, we can't proceed headlessly
      const currentUrl = page.url()
      if (currentUrl.includes('accounts.google.com')) {
        throw new Error('Google account requires additional verification (2FA). Please log in manually first.')
      }
    }

    // Wait for Google Voice to load
    await page.waitForSelector('[data-view-type="1"]', { timeout: 15000 }).catch(() => null)

    // Click the New Conversation / compose button
    await page.click('gv-icon-button[data-e2eid="new-conversation-button"]').catch(async () => {
      // Try alternate selector
      await page.click('[aria-label="New conversation"]')
    })

    await page.waitForTimeout(1000)

    // Type the phone number
    await page.fill('input[placeholder="Type a name or phone number"]', toPhone)
    await page.waitForTimeout(1000)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)

    // Type the message
    await page.fill('textarea[aria-label="Type a message"]', message)
    await page.waitForTimeout(500)

    // Send
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)

    console.log(`Text sent to ${toPhone}`)
    return true
  } catch (err) {
    console.error('Google Voice send error:', err)
    throw err
  } finally {
    await browser.close()
  }
}
