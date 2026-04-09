import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const SESSION_PATH = path.join(process.cwd(), '.gv-session.json')

export async function sendGoogleVoiceText(toPhone: string, message: string): Promise<boolean> {
  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error(
      'Google Voice session not found. Run: npx ts-node scripts/setup-google-voice.ts'
    )
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    storageState: SESSION_PATH,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  const page = await context.newPage()

  try {
    await page.goto('https://voice.google.com/u/0/messages', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForTimeout(4000)

    if (page.url().includes('accounts.google.com')) {
      fs.unlinkSync(SESSION_PATH)
      throw new Error('Google Voice session expired. Run setup-google-voice.ts again.')
    }

    // Click the compose / new message button
    const composeSelectors = [
      'text="Send new message"',
      '[aria-label="Send new message"]',
      '[aria-label="New conversation"]',
      'gv-icon-button[data-e2eid="new-conversation-button"]',
      '[data-e2eid="new-conversation-button"]',
    ]

    let clicked = false
    for (const selector of composeSelectors) {
      try {
        await page.click(selector, { timeout: 3000 })
        clicked = true
        break
      } catch { /* try next */ }
    }
    if (!clicked) throw new Error('Could not find compose button.')

    await page.waitForTimeout(2000)

    // Type phone number
    const phoneInputSelectors = [
      'input[placeholder="Type a name or phone number"]',
      'input[aria-label*="phone" i]',
      'input[aria-label*="name" i]',
      'gv-recipient-picker input',
    ]

    let typedPhone = false
    for (const selector of phoneInputSelectors) {
      try {
        await page.fill(selector, toPhone, { timeout: 3000 })
        typedPhone = true
        break
      } catch { /* try next */ }
    }
    if (!typedPhone) throw new Error('Could not find phone number input.')

    await page.waitForTimeout(1500)

    // Click the "Send to" dropdown suggestion
    try {
      await page.locator('li, [role="option"], [role="listitem"]').filter({ hasText: 'Send to' }).first().click({ timeout: 5000 })
    } catch {
      try {
        await page.getByText('Send to', { exact: false }).first().click({ timeout: 3000 })
      } catch {
        await page.keyboard.press('Enter')
      }
    }

    // Dismiss suggestions dropdown and focus message area
    await page.waitForTimeout(1000)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1000)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(1000)

    // Type the message
    const messageInputSelectors = [
      'textarea[aria-label="Type a message"]',
      'textarea[placeholder*="message" i]',
      'gv-message-input textarea',
      'div[aria-label*="message" i][contenteditable="true"]',
    ]

    let typedMessage = false
    for (const selector of messageInputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 })
        await page.click(selector)
        await page.waitForTimeout(500)
        await page.keyboard.type(message, { delay: 20 })
        typedMessage = true
        break
      } catch { /* try next */ }
    }
    if (!typedMessage) throw new Error('Could not find message input.')

    await page.waitForTimeout(500)

    // Click send button
    const sentViaJS = await page.evaluate(() => {
      const byE2E = document.querySelector('[data-e2eid="send-sms-button"]') as HTMLElement
      if (byE2E) { byE2E.click(); return true }

      const sendBtn = Array.from(document.querySelectorAll('button')).find(b =>
        b.getAttribute('aria-label')?.toLowerCase().includes('send')
      ) as HTMLElement | undefined
      if (sendBtn) { sendBtn.click(); return true }

      const msgArea = document.querySelector('gv-message-input, [class*="message-input"]')
      if (msgArea) {
        const btns = msgArea.querySelectorAll('button')
        const last = btns[btns.length - 1] as HTMLElement
        if (last) { last.click(); return true }
      }
      return false
    })

    if (!sentViaJS) await page.keyboard.press('Enter')

    await page.waitForTimeout(2000)
    await context.storageState({ path: SESSION_PATH })
    console.log(`Text sent to ${toPhone}`)
    return true
  } catch (err) {
    console.error('Google Voice error:', err)
    throw err
  } finally {
    await browser.close()
  }
}
