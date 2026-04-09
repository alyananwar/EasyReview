/**
 * Run this once to log into Google Voice manually and save the session.
 * After this, the app will never need to log in again.
 *
 * Run with: npx ts-node scripts/setup-google-voice.ts
 */

import { chromium } from 'playwright'
import path from 'path'

const SESSION_PATH = path.join(process.cwd(), '.gv-session.json')

async function setup() {
  console.log('Opening browser — log into Google Voice manually...')

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  const page = await context.newPage()
  await page.goto('https://voice.google.com', { waitUntil: 'domcontentloaded' })

  console.log('')
  console.log('===========================================')
  console.log('Log into Google Voice in the browser window.')
  console.log('Once you can see your messages, come back here and press Enter.')
  console.log('===========================================')
  console.log('')

  // Wait for user to press Enter
  await new Promise<void>(resolve => {
    process.stdin.once('data', () => resolve())
  })

  // Save the session
  await context.storageState({ path: SESSION_PATH })
  console.log(`Session saved to ${SESSION_PATH}`)
  console.log('You can now close this window and run the app normally.')

  await browser.close()
  process.exit(0)
}

setup().catch(err => {
  console.error(err)
  process.exit(1)
})
