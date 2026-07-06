# EasyReview

SMS review automation for local businesses. EasyReview pulls recent customers from QuickBooks Online and texts each one a review request through Twilio, once, with opt-out handling and a daily cap. A dashboard shows every run, every message, and lets the shop pause automation or edit the message copy.

**The pitch:** you close a work order in QuickBooks, and your customer gets a review text the same day. No new software to learn.

## How it works

```
Vercel Cron (daily 10am PT)
        │
        ▼
/api/cron ──► lib/batch.ts ──► QuickBooks: invoices from last N days
        │            │
        │            ├─► skip: already texted, opted out, invalid phone, over cap
        │            └─► Twilio SMS ──► customer
        │
        ▼
Supabase: runs, customers, opt_outs, message_attempts, settings
        │
        ▼
Dashboard (/) — stats, run history, customer log, message editor
```

- **Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, Supabase (Postgres), Twilio, QuickBooks Online API, Vercel
- **Single tenant:** one deployment + one Supabase project per shop (multi-tenant planned at 10+ shops, see `docs/INNGEST_ARCHITECTURE.md` for the durable-jobs design)
- **Auth:** password-protected dashboard with signed HttpOnly session cookies; cron protected by a bearer secret; Twilio webhook validated by signature

## Quick start (local dev)

```bash
git clone https://github.com/alyananwar/EasyReview.git
cd EasyReview
npm install
cp .env.example .env.local   # fill in every value — see the comments in the file
npm run dev                   # http://localhost:3000
```

You need accounts for Supabase, Twilio, and Intuit Developer. `docs/SETUP_ACCOUNTS.md` walks through creating each one step by step.

### Database setup

In the Supabase SQL editor, run these once, in order:

1. `supabase-schema.sql` (base tables)
2. `supabase/migrations/001_runs.sql`
3. `supabase/migrations/002_production_fixes.sql`
4. `supabase/migrations/003_message_attempts.sql`
5. `supabase/migrations/004_enable_rls.sql`

### Verify your setup

```bash
npx ts-node scripts/verify-setup.ts
```

Checks every env var, Supabase connectivity, and Twilio credentials before you deploy.

## Commands

| Command         | What it does                 |
| --------------- | ---------------------------- |
| `npm run dev`   | Dev server at localhost:3000 |
| `npm run build` | Production build             |
| `npm test`      | Run the Vitest suite         |
| `npm run lint`  | ESLint                       |

## Project layout

```
app/
  page.tsx            Dashboard (client component)
  _components/        Dashboard sections (setup, message editor, send, tables)
  login/              Password login page
  privacy/ terms/     Public legal pages (required for A2P 10DLC)
  api/
    auth/             Dashboard login/logout + QuickBooks OAuth
    cron/             Daily trigger (Vercel Cron, bearer secret)
    send-texts/       Manual "Run Now" trigger
    preview/          Dry-run: who would get texted, sample message
    runs/, customers/, opt-outs/, settings/   Dashboard data
    twilio/webhook/   Incoming SMS (STOP replies), signature-validated
    health/           Deployment health check (session or CRON_SECRET bearer)
lib/
  batch.ts            Core send loop: dedupe, caps, jitter, retext window
  message.ts          Template rendering + validation (editable from dashboard)
  quickbooks.ts       QB OAuth tokens + invoice/customer queries
  sms.ts              Twilio sender
  phone.ts            US phone normalization
  auth.ts             Signed session cookies
  preview.ts          Dry-run classification
proxy.ts              Route protection (redirects to /login)
supabase/migrations/  SQL migrations (run in order)
scripts/verify-setup.ts   Pre-deploy environment check
docs/                 Deployment, account setup, pricing, architecture
```

## Deploying

Full guide in `docs/DEPLOYMENT.md`. Short version:

1. Set every env var from `.env.example` in Vercel (Production scope)
2. `npx vercel --prod` (Pro plan required for cron)
3. Run the DB migrations in Supabase
4. Point the Twilio webhook at `https://yourapp.vercel.app/api/twilio/webhook`
5. Set the QuickBooks redirect URI to `https://yourapp.vercel.app/api/auth/quickbooks/callback`
6. Open the dashboard, log in, connect QuickBooks, send a test preview

External approvals to start early (they take weeks, not hours):

- **Twilio A2P 10DLC** brand + campaign registration (1–3 weeks) — required for US carrier delivery
- **Intuit production app** review (1–2 weeks) — sandbox works meanwhile

## Compliance notes

- Every message ends with opt-out language; the renderer appends "Reply STOP to opt out." if the template doesn't include it
- STOP replies are recorded via the Twilio webhook and checked before every send
- Customers are texted at most once per `RETEXT_DAYS` (default 90)
- Quiet hours (default 8pm–8am shop time) block cron sends
- `DAILY_CAP` (default 40) limits volume per run

## Docs

| Doc                            | Contents                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| `docs/SETUP_ACCOUNTS.md`       | Step-by-step account creation: Twilio, A2P, Supabase, Intuit, Vercel |
| `docs/DEPLOYMENT.md`           | Production deploy + per-shop onboarding checklist                    |
| `docs/CONTEXT.md`              | Full architecture context and decision history                       |
| `docs/PRICING.md`              | Pricing strategy ($49/mo Solo) and unit economics                    |
| `docs/PLAN.md`                 | Original phase 1/2 technical plan                                    |
| `docs/INNGEST_ARCHITECTURE.md` | Durable job design for when scale demands it                         |
