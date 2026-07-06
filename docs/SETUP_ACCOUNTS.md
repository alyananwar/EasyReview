# EasyReview — External Service Setup Guide

This guide walks through every external account and integration EasyReview depends on. Each section is self-contained; you can do them in any order, but the **Status Checklist** below shows the rough critical path.

---

## Status Checklist

Track your progress here. Tick each box as you finish.

- [ ] **Twilio account created**
- [ ] **Twilio phone number purchased (area code 209)**
- [ ] **Twilio credentials added to `.env.local`**
- [ ] **Twilio incoming webhook configured for STOP replies**
- [ ] **A2P 10DLC brand registered**
- [ ] **A2P 10DLC campaign registered**
- [ ] **A2P 10DLC messaging service created and number attached**
- [ ] **A2P 10DLC fully approved (1–3 weeks)**
- [ ] **Vercel account created and GitHub connected**
- [ ] **EasyReview repo imported to Vercel**
- [ ] **All environment variables set in Vercel**
- [ ] **Vercel Pro plan active (cron jobs)**
- [ ] **First manual test run successful**
- [ ] **Supabase migrations executed (002, 003, 004)**
- [ ] **Intuit Developer Portal — production app submission filed**
- [ ] **Intuit production approval received**
- [ ] **Slack alert webhook configured (optional)**

---

## 1. Twilio Account + Phone Number

Twilio is what actually sends the SMS messages. You need an account, credentials, and a US local number.

### 1.1 Create the Account

1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio).
2. Fill in name, email, password. Click **Start your free trial**.
3. Verify your email — Twilio sends a confirmation link.
4. Verify your personal phone number — Twilio sends an SMS code.
5. Complete the onboarding profile:
   - **What do you plan to build?** → SMS
   - **Which Twilio product?** → Messaging
   - **What's your goal?** → Send notifications / alerts to users
   - **Code or no code?** → With code
   - **Language?** → Node.js

After onboarding, you land on the **Twilio Console** at [https://console.twilio.com](https://console.twilio.com).

### 1.2 Find Account SID and Auth Token

1. From the Console home, look at the top-right card labeled **Account Info** (also visible at [https://console.twilio.com/us1/account/keys-credentials/api-keys](https://console.twilio.com/us1/account/keys-credentials/api-keys)).
2. Copy the **Account SID** — it starts with `AC…`.
3. Click **Show** next to **Auth Token** and copy it.

> **Warning:** The Auth Token is a master credential. Never commit it to git. It belongs only in `.env.local` and in Vercel's environment variables.

### 1.3 Buy a Local US Phone Number (area code 209)

Lockeford CA is in the 209 area code, so customers will recognize it.

1. In the left sidebar, go to **Phone Numbers → Manage → Buy a number**.
   Direct link: [https://console.twilio.com/us1/develop/phone-numbers/manage/search](https://console.twilio.com/us1/develop/phone-numbers/manage/search)
2. Set filters:
   - **Country:** United States
   - **Type:** Local
   - **Number:** check **First part of number** and enter `209`
   - **Capabilities:** check **SMS** (Voice optional)
3. Click **Search**.
4. Pick a number and click **Buy** (typical cost ~$1.15/month).
5. Confirm the purchase.

Copy the new number in **E.164 format** (looks like `+12095551234`). You will need it for `TWILIO_FROM_NUMBER`.

### 1.4 Add Credentials to `.env.local`

Open `/Users/alyananwar/Desktop/EasyReview/.env.local` and set:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+12095551234
```

> **Note:** Use the exact variable names above. The app code reads these names directly.

### 1.5 Configure the Incoming Webhook (STOP replies)

This is how Twilio tells EasyReview when a customer texts back **STOP**, **UNSUBSCRIBE**, etc. Without this, opt-outs won't be recorded and you risk TCPA violations.

1. Go to **Phone Numbers → Manage → Active numbers**.
   Direct link: [https://console.twilio.com/us1/develop/phone-numbers/manage/incoming](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click your new 209 number.
3. Scroll to **Messaging Configuration**.
4. Under **A message comes in**, set:
   - Dropdown: **Webhook**
   - URL: `https://yourapp.vercel.app/api/twilio/webhook` (replace `yourapp` with your real Vercel domain)
   - Method: **HTTP POST**
5. Click **Save configuration** at the bottom.

> **Warning:** You must update this URL after Vercel gives you the real production domain. Until then, leave it unset or use a temporary ngrok tunnel for local testing.

---

## 2. Twilio A2P 10DLC Registration

> **Warning:** This is the single most important step for US SMS deliverability. Without 10DLC, US carriers (AT&T, Verizon, T-Mobile) will silently filter or drop your messages. You won't see errors — they just never arrive. Do not skip this.

### 2.1 What is A2P 10DLC?

A2P (Application-to-Person) 10DLC is the US carrier framework for sending business SMS from a regular 10-digit long code (i.e. a normal local number, not a short code). You register your **brand** (the business) and your **campaign** (what kinds of messages you'll send), and carriers approve you for higher throughput.

### 2.2 Where to Find It

In the Twilio Console: **Messaging → Regulatory Compliance → A2P 10DLC**.
Direct link: [https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc/onboarding](https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc/onboarding)

### 2.3 Step 1 — Register the Brand

Click **Start registration → Create a Brand**. Twilio will ask for:

| Field                        | What to enter                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Legal business name          | The exact name on the EIN letter or sole-prop registration (e.g. _Lockeford Garage_) |
| Business type                | Sole Proprietorship, LLC, Corporation, etc.                                          |
| EIN (or SSN if sole prop)    | Tax ID                                                                               |
| Business industry / vertical | **Automotive**                                                                       |
| Business address             | Street address of the shop                                                           |
| Business phone               | Shop's main phone                                                                    |
| Business website             | Public site (must be live, can be one page)                                          |
| Point of contact             | Alyan's name, email, phone                                                           |

Submit. Brand verification usually takes 1–3 business days. The status will show **Pending** then **Verified**.

### 2.4 Step 2 — Create the Messaging Service

A Messaging Service is a logical "sender" that owns your phone number(s) and is tied to the campaign.

1. Go to **Messaging → Services**.
   Direct link: [https://console.twilio.com/us1/develop/sms/services](https://console.twilio.com/us1/develop/sms/services)
2. Click **Create Messaging Service**.
3. Name: `EasyReview Production`.
4. Use case: **Notify my users**.
5. Click **Create**.
6. In the new service, go to **Sender Pool → Add Senders → Phone Number → Add Phone Numbers**.
7. Tick your 209 number and click **Add Phone Numbers**.

### 2.5 Step 3 — Register the Campaign

Back in **Messaging → Regulatory Compliance → A2P 10DLC**, click your verified brand → **Create Campaign**.

| Field                             | What to enter                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign use case                 | **Customer Care**                                                                                                                                                                                                                                                                                                                                  |
| Description                       | _Send post-service review request SMS to existing automotive repair customers, with reminder follow-ups, after their invoice is created in QuickBooks._                                                                                                                                                                                            |
| Sample message 1                  | `Hi {{first_name}}, this is Lockeford Garage. Thanks for your business! Mind leaving us a quick review? {{review_link}} Reply STOP to opt out.`                                                                                                                                                                                                    |
| Sample message 2                  | `Hi {{first_name}}, friendly reminder from Lockeford Garage — if you have a minute, a review really helps us out: {{review_link}} Reply STOP to opt out.`                                                                                                                                                                                          |
| Message flow / opt-in description | _Customers provide their phone number when scheduling service or paying an invoice at Lockeford Garage. Numbers are stored in QuickBooks Online. Customers receive a single review-request SMS after their invoice is created, with up to one follow-up reminder. All messages include "Reply STOP to opt out." Opt-outs are honored immediately._ |
| Opt-in keywords                   | (leave default)                                                                                                                                                                                                                                                                                                                                    |
| Opt-out keywords                  | `STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT`                                                                                                                                                                                                                                                                                                    |
| Help keywords                     | `HELP, INFO`                                                                                                                                                                                                                                                                                                                                       |
| Help message                      | `Lockeford Garage review requests. Msg & data rates may apply. Reply STOP to opt out.`                                                                                                                                                                                                                                                             |
| Embedded link                     | **Yes** (you send a review URL)                                                                                                                                                                                                                                                                                                                    |
| Embedded phone number             | **No**                                                                                                                                                                                                                                                                                                                                             |
| Age-gated content                 | **No**                                                                                                                                                                                                                                                                                                                                             |
| Direct lending                    | **No**                                                                                                                                                                                                                                                                                                                                             |

Attach the Messaging Service you created in 2.4. Submit.

### 2.6 Cost and Timeline

- **Brand registration:** $4 one-time
- **Campaign vetting:** ~$15 one-time
- **Carrier fees:** ~$1.50–$10/month depending on tier (Twilio passes through)
- **Total ongoing:** roughly **$4/month carrier fees + $15 one-time campaign fee**
- **Timeline:** brand verification 1–3 business days; campaign approval 1–3 weeks total. Throughput is capped while pending.

> **Note:** Twilio will email when each stage is approved. Until full approval, messages may still send but at lower throughput and with higher filter risk. Don't start a real customer batch until status shows **Approved**.

---

## 3. Vercel Deployment

Vercel hosts the Next.js app and runs the cron job that sends the daily review batch.

### 3.1 Create the Account

1. Go to [https://vercel.com/signup](https://vercel.com/signup).
2. Click **Continue with GitHub**.
3. Authorize Vercel to read your GitHub repos.

### 3.2 Import the EasyReview Repo

1. From the Vercel dashboard, click **Add New… → Project**.
2. Find the `alyananwar/EasyReview` repo and click **Import**.
3. Framework preset should auto-detect **Next.js**. Leave defaults.
4. **Do not click Deploy yet** — add the env vars first (next step).

### 3.3 Add Environment Variables

In the import screen, expand **Environment Variables** and add each of the following. The exact list mirrors `.env.example`:

```bash
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REDIRECT_URI=https://yourapp.vercel.app/api/auth/quickbooks/callback
QUICKBOOKS_ENV=production
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
BUSINESS_NAME=Lockeford Garage
REVIEW_LINK=
CRON_SECRET=
DASHBOARD_PASSWORD=
COOKIE_SECRET=
ALERT_WEBHOOK_URL=
RETEXT_DAYS=90
```

Notes on specific values:

- `QUICKBOOKS_REDIRECT_URI` — must exactly match what you'll set in the Intuit Developer Portal. Replace `yourapp` with your real Vercel project domain once you know it.
- `QUICKBOOKS_ENV` — leave as `sandbox` until Intuit approves the production app, then flip to `production`.
- `CRON_SECRET` — generate a random secret:
  ```bash
  openssl rand -hex 32
  ```
  Paste the output. This is what protects the cron endpoint from being hit by anyone.
- `ALERT_WEBHOOK_URL` — optional, see Section 6.
- `RETEXT_DAYS=90` — don't re-text a customer who was contacted in the last 90 days.
- `BUSINESS_NAME` — appears in the SMS body.
- `REVIEW_LINK` — Google review link for Lockeford Garage (the short `g.page/r/...` form is best).

For each variable, set **Environment** to **Production, Preview, and Development** unless you specifically want to scope it.

Click **Deploy**.

### 3.4 Vercel Pro Plan (required for cron)

Cron jobs on Vercel only run on the **Pro plan** ($20/month).

1. Go to **Settings → Plans** in your team/account.
2. Click **Upgrade to Pro**.
3. Add a payment method.

Confirm crons are enabled by checking the **Crons** tab on the project — you should see the schedule from `vercel.json`.

### 3.5 Update Twilio and Intuit With the Real Domain

Once the first deploy succeeds, Vercel gives you a domain like `easyreview-abc123.vercel.app` (or your custom domain). Now go back and:

1. Update the Twilio webhook URL (Section 1.5) to `https://<your-real-domain>/api/twilio/webhook`.
2. Update `QUICKBOOKS_REDIRECT_URI` in Vercel's env vars and in the Intuit app (Section 5).
3. Redeploy after env-var changes (Vercel does this automatically when you save).

### 3.6 Trigger the First Manual Test

After the deploy is live and env vars are set:

```bash
curl -X POST "https://<your-real-domain>/api/cron/send-batch" \
  -H "Authorization: Bearer <your CRON_SECRET value>"
```

What this does: hits the same endpoint the cron will hit. The handler will:

- Pull recent QuickBooks invoices
- Filter customers eligible for a review request
- Send SMS via Twilio
- Log results to Supabase

> **Note:** While `QUICKBOOKS_ENV=sandbox`, this only sends to QuickBooks sandbox test customers. Verify it works end-to-end in sandbox before flipping to production.

Check the Vercel **Logs** tab to see the run output, and Supabase to confirm rows were inserted into the messages table.

---

## 4. Supabase Migrations — Run 002, 003, and 004

These migrations add the production-grade safety features (opt-out tracking, dedup index, retext cooldown), the message_attempts audit table, and enable row level security. Run each file in `supabase/migrations/` in numeric order.

### 4.1 Open the SQL Editor

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Click your EasyReview project.
3. Left sidebar → **SQL Editor**.
4. Click **+ New query**.

### 4.2 Paste and Run

1. Open `/Users/alyananwar/Desktop/EasyReview/supabase/migrations/002_production_fixes.sql` in your editor.
2. Copy the entire contents.
3. Paste into the Supabase SQL Editor.
4. Click **Run** (or press Cmd+Enter).
5. Confirm the success toast at the bottom.

### 4.3 What Each Change Does

- **Partial unique index on messages** — prevents the same customer from getting two review requests for the same invoice, even under race conditions or retry storms.
- **`opt_outs` table** — stores phone numbers that have replied STOP, so the batch sender can filter them out before calling Twilio.
- **`next_eligible_at` column on customers** — tracks when a given customer is allowed to receive another review request again (driven by `RETEXT_DAYS=90`).

Verify in **Table Editor** that the `opt_outs` table now exists and that `customers` has a `next_eligible_at` column.

---

## 5. Intuit Developer Portal — Production App Submission

QuickBooks Online is the source of truth for customer phone numbers and recent invoices. Until Intuit approves the production app, you can only connect to sandbox.

### 5.1 Open the Existing App

1. Go to [https://developer.intuit.com/app/developer/myapps](https://developer.intuit.com/app/developer/myapps).
2. Sign in with the same Intuit account that owns the QuickBooks Online subscription.
3. Click into the existing **EasyReview** app.

### 5.2 Switch from Sandbox to Production

1. In the app, click the **Production** tab (top, next to **Development**).
2. You'll see a checklist of what's required before you can go live.

### 5.3 Required Submission Materials

Prepare each of these before clicking **Submit for review**.

#### Privacy Policy URL

1. Generate one for free at [https://app-privacy-policy-generator.firebaseapp.com](https://app-privacy-policy-generator.firebaseapp.com).
2. Fill in:
   - App name: **EasyReview**
   - App owner: Lockeford Garage / Alyan Anwar
   - Email: your contact email
   - Data collected: **Phone number, name, invoice metadata**
   - Third parties: **Twilio (SMS delivery), Supabase (data storage), Intuit QuickBooks (data source)**
3. Host the generated HTML somewhere public. Options:
   - Add it as a route in the Next.js app at `/privacy` and link to `https://yourapp.vercel.app/privacy`.
   - Or paste into a free GitHub Pages site.

#### Terms of Service URL

Same approach — generate at the same site or write a one-pager and host at `/terms`.

#### App Logo

- 512x512 PNG.
- Simple — wordmark or a single-letter mark is fine. Avoid stock clipart.

#### App Description

Paste this verbatim:

> EasyReview automatically sends review request SMS messages to customers after they receive a QuickBooks invoice. It reads invoice and customer data from QuickBooks to identify recent customers and their phone numbers, then sends a personalized text with a review link. No customer data is stored beyond what's needed to prevent duplicate messages.

#### Redirect URI

Set to:

```
https://yourapp.vercel.app/api/auth/quickbooks/callback
```

Replace `yourapp` with your real Vercel domain. This **must exactly match** the `QUICKBOOKS_REDIRECT_URI` env var in Vercel — including `https://`, no trailing slash.

#### Scopes / Use Case

- **Scope:** `com.intuit.quickbooks.accounting`
- **Use case:** Reading invoices and customer phone numbers to trigger review request SMS messages.

#### Screencast

Record a 2-minute Loom showing:

1. Opening the EasyReview app.
2. Clicking **Connect to QuickBooks**.
3. Going through the OAuth consent screen.
4. Returning to EasyReview and seeing the connected status.
5. Triggering a manual batch run.
6. Showing one SMS arriving on a test phone.

Upload to Loom, set sharing to **Anyone with the link**, paste the Loom URL into the submission form.

### 5.4 Submit and Wait

1. Click **Submit for review**.
2. Intuit's review queue is **1–2 weeks** typically.
3. Watch your inbox — they often ask one or two follow-up questions. Answering same-day is the difference between 1 week and 4 weeks.

> **Note:** Until production is approved, keep `QUICKBOOKS_ENV=sandbox` in Vercel and use sandbox test data. Do not point a real QuickBooks Online account at the sandbox app.

After approval, flip `QUICKBOOKS_ENV=production` in Vercel, redeploy, and have the shop owner re-do the OAuth connect flow against the real QBO company.

---

## 6. Slack Alert Webhook (optional)

Send batch failures, opt-out spikes, and Twilio errors to a Slack channel so you notice without checking logs.

### 6.1 Create the Slack App

1. Go to [https://api.slack.com/messaging/webhooks](https://api.slack.com/messaging/webhooks).
2. Click **Create your Slack app**.
3. Choose **From scratch**.
4. App name: **EasyReview Alerts**.
5. Workspace: pick your workspace.
6. Click **Create App**.

### 6.2 Activate Incoming Webhooks

1. In the app settings sidebar, click **Incoming Webhooks**.
2. Toggle **Activate Incoming Webhooks** to **On**.
3. Scroll down and click **Add New Webhook to Workspace**.
4. Pick the channel — recommend `#alerts` (or create one).
5. Click **Allow**.

### 6.3 Copy the Webhook URL

You'll see a URL like:

```
https://hooks.slack.com/services/<your-webhook-path>
```

Copy it.

### 6.4 Add to Vercel

1. In the Vercel project → **Settings → Environment Variables**.
2. Edit `ALERT_WEBHOOK_URL` and paste the webhook URL.
3. Save. Vercel will redeploy.

> **Note:** The webhook URL is a credential — anyone with it can post to that channel. Keep it in env vars only, never commit it.

Test it by triggering a manual batch (Section 3.6) and confirming you see the run summary land in `#alerts`.

---

## Quick Reference — Final Production Domains

Once everything is live, these are the URLs that must match across services:

| Service | Setting                         | Value                                                  |
| ------- | ------------------------------- | ------------------------------------------------------ |
| Twilio  | Number → Messaging webhook      | `https://<vercel-domain>/api/twilio/webhook`           |
| Vercel  | `QUICKBOOKS_REDIRECT_URI`       | `https://<vercel-domain>/api/auth/quickbooks/callback` |
| Intuit  | App → Production → Redirect URI | `https://<vercel-domain>/api/auth/quickbooks/callback` |
| Slack   | (n/a — credential only)         | `ALERT_WEBHOOK_URL` env var                            |

Any mismatch in these URLs will break OAuth or webhook delivery silently. Double-check after setup.
