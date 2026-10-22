# EasyReview: External Service Setup

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
- [ ] **Shop PC set up and `PUBLIC_URL` known (see `docs/SHOP_PC_SETUP.md`)**
- [ ] **Intuit Developer Portal: production app submission filed**
- [ ] **Intuit production approval received**
- [ ] **First manual test run successful**

---

## 1. Twilio Account + Phone Number

Twilio is what actually sends the SMS messages. You need an account, credentials, and a US local number.

### 1.1 Create the Account

1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio).
2. Fill in name, email, password. Click **Start your free trial**.
3. Verify your email. Twilio sends a confirmation link.
4. Verify your personal phone number. Twilio sends an SMS code.
5. Complete the onboarding profile:
   - **What do you plan to build?** → SMS
   - **Which Twilio product?** → Messaging
   - **What's your goal?** → Send notifications / alerts to users
   - **Code or no code?** → With code
   - **Language?** → Node.js

After onboarding, you land on the **Twilio Console** at [https://console.twilio.com](https://console.twilio.com).

### 1.2 Find Account SID and Auth Token

1. From the Console home, look at the top-right card labeled **Account Info** (also visible at [https://console.twilio.com/us1/account/keys-credentials/api-keys](https://console.twilio.com/us1/account/keys-credentials/api-keys)).
2. Copy the **Account SID**: it starts with `AC…`.
3. Click **Show** next to **Auth Token** and copy it.

> **Warning:** The Auth Token is a master credential. Never commit it to git. It belongs only in `.env.local` on the shop PC.

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

Open `.env.local` on the shop PC (`C:\EasyReview\.env.local`) and set:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+12095551234
```

> **Note:** Use the exact variable names above. The app code reads these names directly.

### 1.5 Configure the Incoming Webhook (STOP replies)

This is how Twilio tells EasyReview right away when a customer texts back **STOP**, **UNSUBSCRIBE**, etc. Twilio also blocks opted-out numbers on its own, and EasyReview records that the next time a send fails with error 21610, so this webhook mainly makes STOPs show up on the dashboard immediately.

1. Go to **Phone Numbers → Manage → Active numbers**.
   Direct link: [https://console.twilio.com/us1/develop/phone-numbers/manage/incoming](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click your new 209 number.
3. Scroll to **Messaging Configuration**.
4. Under **A message comes in**, set:
   - Dropdown: **Webhook**
   - URL: `<PUBLIC_URL>/api/twilio/webhook`, for example `https://lockeford-pc.tail1234.ts.net/api/twilio/webhook`
   - Method: **HTTP POST**
5. Click **Save configuration** at the bottom.

> **Note:** `PUBLIC_URL` in `.env.local` must be exactly this address (no trailing slash). EasyReview checks Twilio's signature against it, and every request fails with 403 if they differ.

---

## 2. Twilio A2P 10DLC Registration

> **Warning:** This is the single most important step for US SMS deliverability. Without 10DLC, US carriers (AT&T, Verizon, T-Mobile) will silently filter or drop your messages. You won't see errors: they just never arrive. Do not skip this.

### 2.1 What is A2P 10DLC?

A2P (Application-to-Person) 10DLC is the US carrier framework for sending business SMS from a regular 10-digit long code (i.e. a normal local number, not a short code). You register your **brand** (the business) and your **campaign** (what kinds of messages you'll send), and carriers approve you for higher throughput.

### 2.2 Where to Find It

In the Twilio Console: **Messaging → Regulatory Compliance → A2P 10DLC**.
Direct link: [https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc/onboarding](https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc/onboarding)

### 2.3 Step 1: Register the Brand

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

### 2.4 Step 2: Create the Messaging Service

A Messaging Service is a logical "sender" that owns your phone number(s) and is tied to the campaign.

1. Go to **Messaging → Services**.
   Direct link: [https://console.twilio.com/us1/develop/sms/services](https://console.twilio.com/us1/develop/sms/services)
2. Click **Create Messaging Service**.
3. Name: `EasyReview Production`.
4. Use case: **Notify my users**.
5. Click **Create**.
6. In the new service, go to **Sender Pool → Add Senders → Phone Number → Add Phone Numbers**.
7. Tick your 209 number and click **Add Phone Numbers**.

### 2.5 Step 3: Register the Campaign

Back in **Messaging → Regulatory Compliance → A2P 10DLC**, click your verified brand → **Create Campaign**.

| Field                             | What to enter                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign use case                 | **Customer Care**                                                                                                                                                                                                                                                                                                                                  |
| Description                       | _Send post-service review request SMS to existing automotive repair customers, with reminder follow-ups, after their invoice is created in QuickBooks._                                                                                                                                                                                            |
| Sample message 1                  | `Hi {{first_name}}, this is Lockeford Garage. Thanks for your business! Mind leaving us a quick review? {{review_link}} Reply STOP to opt out.`                                                                                                                                                                                                    |
| Sample message 2                  | `Hi {{first_name}}, friendly reminder from Lockeford Garage. If you have a minute, a review really helps us out: {{review_link}} Reply STOP to opt out.`                                                                                                                                                                                           |
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

## 3. Intuit Developer Portal: Production App Submission

QuickBooks Online is the source of truth for customer phone numbers and recent invoices. Until Intuit approves the production app, you can only connect to sandbox.

### 3.1 Open the Existing App

1. Go to [https://developer.intuit.com/app/developer/myapps](https://developer.intuit.com/app/developer/myapps).
2. Sign in with the same Intuit account that owns the QuickBooks Online subscription.
3. Click into the existing **EasyReview** app.

### 3.2 Switch from Sandbox to Production

1. In the app, click the **Production** tab (top, next to **Development**).
2. You'll see a checklist of what's required before you can go live.

### 3.3 Required Submission Materials

Prepare each of these before clicking **Submit for review**.

#### Privacy Policy URL

1. Generate one for free at [https://app-privacy-policy-generator.firebaseapp.com](https://app-privacy-policy-generator.firebaseapp.com).
2. Fill in:
   - App name: **EasyReview**
   - App owner: Lockeford Garage / Alyan Anwar
   - Email: your contact email
   - Data collected: **Phone number, name, invoice metadata**
   - Third parties: **Twilio (SMS delivery), Intuit QuickBooks (data source)**. Data is stored on the shop's own PC.
3. The app already serves this at `/privacy`, publicly through Tailscale Funnel: `<PUBLIC_URL>/privacy`.

#### Terms of Service URL

Already served at `<PUBLIC_URL>/terms`.

#### App Logo

- 512x512 PNG.
- Simple: a wordmark or a single-letter mark is fine. Avoid stock clipart.

#### App Description

Paste this verbatim:

> EasyReview automatically sends review request SMS messages to customers after they receive a QuickBooks invoice. It reads invoice and customer data from QuickBooks to identify recent customers and their phone numbers, then sends a personalized text with a review link. No customer data is stored beyond what's needed to prevent duplicate messages.

#### Redirect URI

Set to:

```
<PUBLIC_URL>/api/auth/quickbooks/callback
```

For example `https://lockeford-pc.tail1234.ts.net/api/auth/quickbooks/callback`. Intuit only accepts `https://` redirect URIs for production (no `localhost`, no IP addresses). This **must exactly match** `QUICKBOOKS_REDIRECT_URI` in `.env.local`, including `https://` and no trailing slash. `npm run verify` checks it.

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

### 3.4 Submit and Wait

1. Click **Submit for review**.
2. Intuit's review queue is **1–2 weeks** typically.
3. Watch your inbox. They often ask one or two follow-up questions. Answering same-day is the difference between 1 week and 4 weeks.

> **Note:** Until production is approved, keep `QUICKBOOKS_ENV=sandbox` in `.env.local` and use sandbox test data. Do not point a real QuickBooks Online account at the sandbox app.

After approval, swap in the production keys, set `QUICKBOOKS_ENV=production` in `.env.local`, restart EasyReview (`deploy`), and have the shop owner re-do the OAuth connect flow against the real QBO company.

---

## Quick Reference: URLs that must match

`PUBLIC_URL` is the shop PC's Tailscale address, like `https://lockeford-pc.tail1234.ts.net`.

| Service | Setting                         | Value                                        |
| ------- | ------------------------------- | -------------------------------------------- |
| Twilio  | Number → Messaging webhook      | `<PUBLIC_URL>/api/twilio/webhook`            |
| Shop PC | `QUICKBOOKS_REDIRECT_URI`       | `<PUBLIC_URL>/api/auth/quickbooks/callback`  |
| Intuit  | App → Production → Redirect URI | `<PUBLIC_URL>/api/auth/quickbooks/callback`  |
| Intuit  | Privacy policy / EULA URLs      | `<PUBLIC_URL>/privacy`, `<PUBLIC_URL>/terms` |

A mismatch breaks OAuth or webhook delivery. Run `npm run verify` on the shop PC after setup.
