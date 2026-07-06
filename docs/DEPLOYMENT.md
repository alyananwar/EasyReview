# EasyReview Deployment Guide

EasyReview now uses Twilio for SMS — no Playwright, no browser, no hardware at shops.
Everything deploys to Vercel. A batch of 40 messages finishes in under two minutes.

## Architecture

```
Customer browser → Vercel (Next.js)
                        │
                        ├── Supabase (Postgres)     customers, runs
                        ├── QuickBooks Online API   invoices
                        └── Twilio REST API         sends the texts
```

That's it. No boxes, no SSH, no session files.

## Cost per shop per month

| Item                                     | Cost                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| Twilio local number                      | ~$1.15                                                     |
| Twilio SMS (40/day × 30 days at $0.0079) | ~$9.50                                                     |
| Vercel Pro (shared across all tenants)   | $20                                                        |
| Supabase free tier (up to ~5 shops)      | $0                                                         |
| **Total at 1 shop**                      | ~$30                                                       |
| **Total at 5 shops**                     | ~$55 (Twilio scales linearly, Vercel/Supabase stays fixed) |

At $49/tenant, you're profitable from shop #1. By shop #5 you're clearing ~$190/mo.

## First-time setup

### 1. Get a Twilio account

1. Sign up at [twilio.com](https://www.twilio.com)
2. Buy a US local number — pick one with the shop's area code. It's ~$1.15/mo.
3. Note your Account SID, Auth Token, and the phone number.

**A2P 10DLC note:** Carriers require business text senders to register their brand and
campaign. This is called A2P 10DLC. It takes 1–2 weeks and costs ~$4/mo + a $15 one-time
campaign fee. Without it, some carriers will silently filter your texts as spam. Do this
before you go live with a real shop — Twilio walks you through it in their console.

### 2. Deploy to Vercel

```bash
# From the project root
npx vercel
```

Or connect the GitHub repo to Vercel directly (Settings → Git → Import Project). Vercel
auto-deploys on every push to main.

### 3. Set environment variables in Vercel

In your Vercel project → Settings → Environment Variables, add everything from `.env.example`.
The values you need for production:

| Variable                    | Where to find it                                          |
| --------------------------- | --------------------------------------------------------- |
| `QUICKBOOKS_CLIENT_ID`      | Intuit developer console                                  |
| `QUICKBOOKS_CLIENT_SECRET`  | Intuit developer console                                  |
| `QUICKBOOKS_REDIRECT_URI`   | `https://yourapp.vercel.app/api/auth/quickbooks/callback` |
| `QUICKBOOKS_ENV`            | `production`                                              |
| `TWILIO_ACCOUNT_SID`        | Twilio console                                            |
| `TWILIO_AUTH_TOKEN`         | Twilio console                                            |
| `TWILIO_FROM_NUMBER`        | The number you purchased, e.g. `+12095551234`             |
| `NEXT_PUBLIC_SUPABASE_URL`  | Supabase project settings                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → Service role                  |
| `BUSINESS_NAME`             | Shop's display name                                       |
| `REVIEW_LINK`               | Their Google Maps review link                             |
| `CRON_SECRET`               | Run `openssl rand -hex 32`                                |
| `DASHBOARD_PASSWORD`        | Strong password for the dashboard login                   |
| `COOKIE_SECRET`             | Run `openssl rand -hex 32`                                |

### 4. Apply the DB migration

In Supabase SQL editor, run `supabase-schema.sql`, then each file in `supabase/migrations/` in order (001 through 004), once each.

For multiple shops sharing one Supabase project, add a `tenant_id` column and filter every
query by it. For v1 with a handful of shops, give each shop its own Supabase project —
free tier supports this, and it's the simplest isolation story.

### 5. Connect QuickBooks

Visit your deployed app URL. Click **Connect to QuickBooks**, complete OAuth. Done.

### 6. Verify

Send a test run manually from the dashboard. Watch the progress bar. If it reads
`completed: sent: 1`, you're live.

## Daily cron

`vercel.json` already contains:

```json
{
  "crons": [{ "path": "/api/cron", "schedule": "0 10 * * *" }]
}
```

Vercel runs this at 10 AM UTC daily. It hits `/api/cron` with your `CRON_SECRET` header.
**This requires Vercel Pro** — crons are a Pro feature. It's $20/mo and already in the cost
table above.

If you want to test the cron manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourapp.vercel.app/api/cron
```

## Vercel free tier vs Pro

| Feature               | Free | Pro ($20/mo) |
| --------------------- | ---- | ------------ |
| Cron jobs             | No   | Yes          |
| Function max duration | 60s  | 300s         |
| Custom domains        | Yes  | Yes          |

**Recommendation: use Pro.** The cron alone justifies it. If you have 5 shops paying $49,
the $20 Vercel cost is 8% of revenue.

**On free tier:** set `MIN_DELAY_MS=0` and `MAX_DELAY_MS=0` in env vars. A 40-message
batch at zero delay completes in ~4 seconds (40 × ~100ms Twilio API call). This fits within
the 60s limit and the fire-and-forget still works.

## Updating the app

```bash
git push origin main
```

Vercel deploys automatically. If you touched the DB schema, run the new migration in
Supabase SQL editor before pushing.

## Multi-tenant onboarding (each new shop)

Per-shop checklist — 15 minutes once you've done it once:

- [ ] Buy a Twilio phone number for this shop
- [ ] Set up a new Vercel project (or use env preview branches — see below)
- [ ] Set all env vars for this shop's QB, Twilio number, business name, review link
- [ ] Run the DB migration (skip if already done)
- [ ] Connect QuickBooks via the OAuth flow
- [ ] Send one test message to yourself

**Simplest isolation model:** one Vercel project per shop, one Supabase project per shop.
Each is free at small scale. Costs you ~5 minutes per shop to set up.

**When you hit 10+ shops:** migrate to multi-tenant — one Supabase project with a
`tenant_id` column and one Vercel project with tenant-specific env config. Not worth the
complexity before that.

## What can go wrong

| Symptom                        | Cause                                        | Fix                                          |
| ------------------------------ | -------------------------------------------- | -------------------------------------------- |
| Texts not delivered, no errors | A2P 10DLC not set up                         | Register brand + campaign in Twilio console  |
| "Missing Twilio config" error  | Env vars not set in Vercel                   | Add them in Vercel → Settings → Env          |
| QuickBooks 401 on cron         | Refresh token expired (100-day idle limit)   | Re-auth via the dashboard                    |
| Cron not firing                | Free tier                                    | Upgrade to Vercel Pro                        |
| Run shows "failed" immediately | Supabase service role key wrong              | Regenerate and re-paste in Vercel env        |
| Duplicate sends                | Deduplication is run-level, not system-level | Don't trigger two manual runs within minutes |

## What NOT to do

- Don't store the Twilio Auth Token in `.env.local` and commit it to git. Use Vercel's env
  vars UI — they're encrypted at rest.
- Don't share one Twilio number across shops. Replies go to that number and replies need
  to be for the right shop. One number per shop is clean and costs $1.15/mo.
- Don't skip A2P 10DLC. Without it, you'll start seeing delivery failures silently at
  around 20–30 messages and never know why.
- Don't set `DAILY_CAP` above 100 on a fresh number without warming it up. Send 20/day
  the first week, 40/day the second, then ramp up.

## Scaling path

At ~15 shops:

1. Consolidate to a single Supabase project with `tenant_id` columns.
2. Explore Telnyx or Vonage as Twilio alternatives — cheaper per-SMS at volume.
3. Consider Inngest or Trigger.dev for proper background job queuing instead of
   fire-and-forget (helps with reliability on the free Vercel tier).

The current codebase handles all of this — the sender is already dependency-injected, so
swapping Twilio for another provider is a one-file change.
