# EasyReview — Technical Plan v1.0

> **Historical (2026-10-22):** written for the old Vercel + Supabase setup. EasyReview now runs on the shop PC with SQLite. See `docs/SHOP_PC_SETUP.md` and `README.md` for the current design.

**Date:** 2026-04-30  
**Author:** Alyan Anwar  
**Status:** Draft — pending senior dev review

---

## Overview

EasyReview is a SaaS tool that connects to a business's QuickBooks Online account, pulls recent customers, and automatically sends them an SMS review request (Google, Facebook, Yelp). The goal is to help local service businesses grow their online reviews with zero manual effort.

**Current customer:** Lockeford Garage (free)  
**Target pricing:** Solo $49/month · Multi $89/month · Shop+ $149/month · No contract

---

## Current Architecture

```
QuickBooks Online API
        |
   Next.js API routes (Vercel)
        |
   lib/batch.ts  ←  orchestrates the run
   lib/quickbooks.ts  ←  QB OAuth + customer fetch
   lib/sms.ts  ←  Twilio REST sender
   lib/phone.ts  ←  phone number normalization
        |
   Supabase (customers, settings, runs tables)
        |
   Dashboard UI (app/page.tsx)
```

**Stack:** Next.js 16, TypeScript, Tailwind CSS, Supabase, Twilio, QuickBooks Online API  
**Hosting target:** Vercel (serverless functions + cron)

---

## What Is Already Built and Working

| Feature             | Status | Notes                                                          |
| ------------------- | ------ | -------------------------------------------------------------- |
| Dashboard UI        | Done   | Run history, customer log, stats, Run Now button               |
| QuickBooks OAuth    | Done   | Sandbox tested, tokens auto-refresh                            |
| QB customer fetch   | Done   | Pulls invoices from last N days, batched customer detail query |
| Phone normalization | Done   | `lib/phone.ts` handles messy QB formats                        |
| SMS sender          | Done   | `lib/sms.ts` — Twilio REST, injectable for tests               |
| Batch processor     | Done   | `lib/batch.ts` — dedupe, daily cap, jitter, live progress      |
| Run history         | Done   | Supabase `runs` table, per-attempt results                     |
| Duplicate guard     | Done   | Skips customers who already received a text                    |
| Cron config         | Done   | `vercel.json` — daily at 10am UTC                              |
| Tests               | Done   | `__tests__/batch.test.ts`, `__tests__/phone.test.ts`           |

**Key finding:** Google Voice has already been removed from the send path. `lib/batch.ts` already calls `createTwilioSender()` from `lib/sms.ts`. The SMS provider swap is complete in code.

---

## Phase 1 — Production Deploy (target: end of this week)

The only remaining work to get the first customer live remotely.

### 1.1 Twilio Account Setup

**Owner:** Alyan  
**Effort:** ~30 minutes

Steps:

1. Sign up at twilio.com
2. Buy a local phone number matching the customer's area code (Lockeford Garage: 209)
3. Collect: Account SID, Auth Token, from-number

**A2P 10DLC registration** — required for US business SMS:

- Submit Twilio brand registration + messaging campaign (use case: "Customer Care")
- Include STOP/opt-out language in all messages (already in message template)
- Approval takes 1–3 weeks; sending works while pending but throughput is throttled
- Submit today to avoid this being a later blocker

### 1.2 Environment Variables

Add to `.env.local` (dev) and Vercel dashboard (production):

```
# Twilio (new)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1209xxxxxxx

# QuickBooks (already in .env.local, add to Vercel)
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REDIRECT_URI=https://your-vercel-app.vercel.app/api/auth/quickbooks/callback
QUICKBOOKS_ENV=sandbox   # switch to production after Intuit approval

# Supabase (already set)
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Business config (already defaulted in batch.ts, override per customer)
BUSINESS_NAME=Lockeford Garage
REVIEW_LINK=https://maps.app.goo.gl/Eoac2rQsDkQMzrMU6
DAILY_CAP=40
DAYS_BACK=7
```

### 1.3 Vercel Deploy

**Owner:** Alyan  
**Effort:** ~1 hour

Steps:

1. Connect GitHub repo to Vercel
2. Add all env vars from section 1.2 in the Vercel dashboard
3. Verify `vercel.json` cron schedule:
   - Currently: `0 17 * * *` (UTC) = 10am Pacific (correct for summer, adjust for DST)
4. Deploy from `main`
5. Confirm the cron endpoint is reachable: `POST /api/cron/send-texts`

**Vercel limitations to be aware of:**

- Serverless functions have a default 10-second timeout on Hobby plan; upgrade to Pro or set `maxDuration` in route config if batches run long
- Cron jobs are only available on Pro plan ($20/month) — factor into pricing model

### 1.4 Intuit Production App Approval

**Owner:** Alyan  
**Effort:** ~2 hours to submit, 1–2 weeks to approve  
**Start today — this is the longest lead-time item**

Required for accessing real customer data in QuickBooks (not sandbox).

Steps:

1. Go to Intuit Developer Portal → your app → Production tab
2. Update redirect URI to Vercel production URL
3. Add privacy policy URL (minimum: a simple hosted page)
4. Add terms of service URL
5. Write app description and use case
6. Record a short screencast demo of the flow
7. Submit for review
8. Respond to any Intuit follow-up questions same-day (keeps the queue moving)

**Until approved:** Deploy to Vercel using sandbox credentials. The full system (Twilio, Supabase, cron, dashboard) can be tested and verified against sandbox QB data. When Intuit approves, swap two env vars and re-authorize the customer.

### 1.5 Failure Alerting

**Owner:** Alyan  
**Effort:** ~1 hour

A batch that silently fails (runs but sends 0 messages) is the worst failure mode — you won't know until the customer asks why their reviews stopped.

Add a webhook notification when:

- A run finishes with `status = 'failed'`
- A run completes with `sent = 0` and `failed > 0`

Implementation: add a `POST` to a Slack incoming webhook or email via Resend/SendGrid at the end of `processBatch()`. A 5-line addition.

### 1.6 End-to-End Test (Pre-Launch Checklist)

Before going live with real customer data:

- [ ] Send a test text to your own cell from localhost
- [ ] Send a test text to your own cell from the Vercel deploy
- [ ] Verify the run appears in Supabase `runs` table with correct counts
- [ ] Verify the customer is marked `texted_at` in Supabase `customers` table
- [ ] Verify running again skips already-texted customers
- [ ] Trigger the cron endpoint manually and confirm it runs
- [ ] Verify the Vercel logs show no errors

---

## Phase 1 Blockers and Risks

| Item                               | Severity    | Timeline        | Mitigation                                                                                    |
| ---------------------------------- | ----------- | --------------- | --------------------------------------------------------------------------------------------- |
| Intuit production approval         | High        | 1–2 weeks       | Submit today; run sandbox on Vercel until approved                                            |
| Twilio A2P 10DLC registration      | Medium      | 1–3 weeks       | Submit today; sending works at reduced throughput while pending                               |
| Vercel Pro plan required for cron  | Medium      | Immediate       | Budget $20/month into pricing — covered by one paying customer                                |
| TCPA compliance (opt-out)          | Medium-High | Immediate       | Add "Reply STOP to opt out" to message template — Twilio handles STOP responses automatically |
| Phone number formatting edge cases | Low         | Already handled | `lib/phone.ts` normalizes QB's inconsistent formats before Twilio call                        |

---

## Current Message Template

```
Hi {firstName}! This is {BUSINESS_NAME}. We hope your visit went well!
We'd really appreciate it if you could leave us a quick review —
it helps us out a lot. {REVIEW_LINK} Thanks!
```

**Recommendation:** Add opt-out language before launch:

```
Hi {firstName}! This is {BUSINESS_NAME}. We hope your visit went well!
We'd love a quick review — it helps us a lot. {REVIEW_LINK}
Reply STOP to opt out.
```

---

## Phase 2 — Multi-Tenant Architecture (design only, do not build until Phase 1 is stable for 2+ weeks)

### Goal

Support multiple business customers from a single deployed app. Each customer has their own QuickBooks connection, Twilio number, review links, and message template.

### Data Model Changes

```sql
-- New table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  owner_email TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'trial',  -- 'trial' | 'active' | 'comp' | 'cancelled'
  trial_ends_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add tenant_id to existing tables
ALTER TABLE customers ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE settings ADD COLUMN tenant_id UUID REFERENCES tenants(id);
-- (runs table gets tenant_id via settings join or direct column)

-- Current single-tenant settings keys become per-tenant rows
-- settings: { key: 'qb_tokens', value: '...', tenant_id: '...' }
-- settings: { key: 'qb_realm_id', value: '...', tenant_id: '...' }
-- settings: { key: 'review_link', value: '...', tenant_id: '...' }
-- settings: { key: 'twilio_from_number', value: '...', tenant_id: '...' }
-- settings: { key: 'business_name', value: '...', tenant_id: '...' }
```

### Architecture Changes

**Authentication:** Supabase Auth — one account per business owner  
**QB tokens:** Already stored in Supabase `settings`, just key by `tenant_id`  
**Twilio numbers:** Provision a unique number per tenant via Twilio API on signup (or assign manually for now)  
**Batch processor:** Pass `tenantId` into `processBatch()`, load config from `settings` by `tenant_id` instead of env vars  
**Cron:** Run once, iterate over all `active` tenants and kick off a batch per tenant

### New Routes/Pages

| Route                 | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `/signup`             | New tenant onboarding                                  |
| `/onboarding`         | Connect QB → enter review links → first test send      |
| `/dashboard`          | Tenant-scoped (existing dashboard, filtered by tenant) |
| `/admin`              | Alyan-only — list all tenants, run status, MRR         |
| `/api/stripe/webhook` | Handle subscription events                             |

### Billing

- Stripe Checkout for $20/month subscription with 7-day trial
- Webhook flips `plan` from `trial` to `active` on payment
- Lockeford Garage: `plan = 'comp'`, `trial_ends_at = null` (never billed)
- Gate batch runs to `plan IN ('active', 'comp')` — skip `trial` after `trial_ends_at`

### AI Chatbot Add-On (future, $40–50/month upsell)

- Reads tenant's QB customer and invoice data
- Answers natural language CRM questions in the dashboard
- Uses Groq or Gemini (existing AI provider strategy from TigerTrack)
- Separate subscription tier in Stripe

---

## Open Questions for Senior Dev Review

1. **Vercel cron reliability:** Is Vercel cron reliable enough for a paid service, or should we move to a dedicated job queue (e.g., Trigger.dev, Inngest) for Phase 2?

2. **Twilio number provisioning:** For multi-tenant, should each customer get a dedicated Twilio number (better deliverability, isolated opt-outs) or share one number with a tenant identifier in the message? Dedicated numbers are ~$1/month each.

3. **Serverless timeout:** Batch runs could take several minutes for large customer lists (40 sends × jitter delay). Vercel serverless functions time out at 60s max (Pro) or 10s (Hobby). Should we move the batch processor to a background job or stream the response?

4. **Token storage:** QB OAuth tokens are stored in plaintext in Supabase `settings.value`. Should these be encrypted at rest, or is Supabase RLS + service role key sufficient for a small-scale B2B tool?

5. **TCPA / opt-out tracking:** Twilio handles STOP replies but we're not storing opt-outs in our own DB. If a customer opts out, we'd still attempt to send next time (Twilio would block it, but we'd log it as a failure). Should we store opt-outs in Supabase and skip at the batch level?

---

## File Reference

| File                  | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `app/page.tsx`        | Dashboard UI                                        |
| `lib/batch.ts`        | Batch orchestration — dedupe, cap, jitter, progress |
| `lib/sms.ts`          | Twilio SMS sender                                   |
| `lib/quickbooks.ts`   | QB OAuth + customer fetch                           |
| `lib/phone.ts`        | Phone number normalization                          |
| `lib/supabase.ts`     | Supabase client                                     |
| `supabase-schema.sql` | Current DB schema                                   |
| `vercel.json`         | Cron schedule                                       |
| `docs/DEPLOYMENT.md`  | Existing deployment notes                           |
| `docs/PRICING.md`     | Existing pricing notes                              |
