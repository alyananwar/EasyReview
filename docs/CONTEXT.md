# EasyReview — Full Project Context

> **Historical (2026-10-22):** written for the old Vercel + Supabase setup. EasyReview now runs on the shop PC with SQLite. See `docs/SHOP_PC_SETUP.md` and `README.md` for the current design.

**Date:** 2026-04-30  
**For:** Senior developer review  
**Author:** Alyan Anwar

This document gives a complete picture of the project — what it is, every decision made, the current state of the codebase, and what work remains. Read this before reviewing PLAN.md.

---

## What This Product Does

EasyReview connects to a local business's QuickBooks Online account, pulls customers who had invoices in the last N days, and automatically sends them an SMS asking for a Google/Facebook/Yelp review. It runs on a daily cron and skips any customer who's already been texted.

**Target customers:** Local service businesses (auto shops, salons, plumbers, etc.) that want more online reviews but won't do it manually.

**First customer:** Lockeford Garage — an auto shop. Currently free. They previously paid a third-party service for the same functionality; this replaces it.

---

## Business Model

| Tier                                           | Price      | Notes                       |
| ---------------------------------------------- | ---------- | --------------------------- |
| Customer #1 (Lockeford Garage)                 | Free       | Validation / goodwill       |
| Solo (1 location, 40 texts/day)                | $49/month  | No contract, cancel anytime |
| Multi (up to 3 locations)                      | $89/month  | —                           |
| Shop+ (100/day, custom copy, priority support) | $149/month | High-volume shops           |

**Unit economics (per shop):**

- Twilio number: ~$1.15/month
- Twilio SMS (40/day × 30 days × $0.0079): ~$9.50/month
- A2P 10DLC carrier fees: ~$4/month + $15 one-time
- Vercel Pro (shared across all tenants): $20/month fixed
- Supabase free tier: $0 (up to ~5 shops)
- **Cost per shop:** ~$14.65/month variable + ~$20 fixed
- **Revenue per shop (Solo):** $49/month
- Profitable from shop #1 after Vercel fixed cost. At 5 shops: ~$93 cost, ~$245 revenue.

---

## Tech Stack

| Layer      | Technology              | Why                                            |
| ---------- | ----------------------- | ---------------------------------------------- |
| Framework  | Next.js 16 (App Router) | Full-stack, serverless-friendly, Vercel-native |
| Language   | TypeScript              | Type safety, better for long-term maintenance  |
| Styling    | Tailwind CSS v4         | Fast, consistent UI                            |
| Database   | Supabase (PostgreSQL)   | Managed Postgres, free tier generous, easy SDK |
| SMS        | Twilio REST API         | Reliable, industry standard, handles opt-outs  |
| CRM source | QuickBooks Online API   | Customer's existing system of record           |
| Hosting    | Vercel                  | Serverless, cron support, easy deploys         |
| Tests      | Vitest                  | Fast, native ESM support                       |

---

## Repository Structure

```
EasyReview/
├── app/
│   ├── page.tsx                          # Dashboard UI (single page)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── auth/quickbooks/
│       │   ├── route.ts                  # Initiates QB OAuth redirect
│       │   └── callback/route.ts         # Handles OAuth callback, saves tokens
│       ├── cron/route.ts                 # GET — triggered by Vercel cron (bearer-auth protected)
│       ├── customers/route.ts            # GET — returns customer list for dashboard
│       ├── runs/
│       │   ├── route.ts                  # GET — returns recent run history
│       │   └── [id]/route.ts             # GET — returns single run (dashboard polls this)
│       ├── send-texts/route.ts           # POST — manual "Run Now" trigger
│       └── settings/route.ts             # GET — returns QB connection status
├── lib/
│   ├── batch.ts                          # Core orchestration: fetch → dedupe → send → log
│   ├── quickbooks.ts                     # QB OAuth client, token refresh, customer fetch
│   ├── sms.ts                            # Twilio REST sender (SmsSender interface)
│   ├── phone.ts                          # US phone number normalization and validation
│   └── supabase.ts                       # Supabase client (anon + service role)
├── __tests__/
│   ├── batch.test.ts                     # Full batch logic coverage (8 test cases)
│   └── phone.test.ts                     # Phone normalization edge cases
├── supabase-schema.sql                   # Initial schema (customers + settings)
├── supabase/migrations/
│   └── 001_runs.sql                      # Adds runs table + last_status/error columns to customers
├── vercel.json                           # Cron schedule config
├── .env.example                          # All required env vars documented
└── docs/
    ├── DEPLOYMENT.md                     # Step-by-step deploy guide
    ├── PRICING.md                        # Unit economics
    └── PLAN.md                           # Phase 1 + Phase 2 technical plan
```

---

## Database Schema

### `customers`

Tracks every customer seen from QuickBooks. One row per QB customer ID.

```sql
id               uuid    PK
qb_customer_id   text    UNIQUE — QB's internal ID, used as the dedupe key
name             text
phone            text    — raw format from QB (normalized before send, not stored normalized)
texted_at        timestamptz  — set when a text is successfully sent; NULL = not yet texted
last_status      text    — 'sent' | 'error' | 'invalid_phone' etc.
last_error       text    — error message if last_status = 'error'
last_attempt_at  timestamptz
created_at       timestamptz
```

**Deduplication logic:** a customer is skipped if `texted_at IS NOT NULL`. This is a permanent skip — once texted, never texted again. There is no "re-text after 90 days" logic yet.

### `settings`

Key-value store for per-instance config. Currently used only for QB OAuth tokens and realm ID.

```sql
key    text    PK
value  text    — JSON-encoded for qb_tokens, plain string for qb_realm_id
```

Current keys in use:

- `qb_tokens` — serialized QuickBooks OAuth token object (access token, refresh token, expiry)
- `qb_realm_id` — QuickBooks company ID, required for all API calls

### `runs`

Audit trail of every send batch.

```sql
id           uuid    PK
status       text    — 'running' | 'completed' | 'failed' | 'cancelled'
source       text    — 'manual' | 'cron'
started_at   timestamptz
finished_at  timestamptz
total        int     — number of customers pulled from QB
sent         int
skipped      int     — already_texted + invalid_phone + over_cap
failed       int     — Twilio errors
results      jsonb   — [{name, phone, qb_customer_id, status, error?, at}] — full per-customer log
error        text    — top-level error if the whole run failed
```

**RLS:** Disabled on all tables. No auth layer yet. Service role key used server-side only. This is acceptable for single-tenant v1 but must be addressed before multi-tenant.

---

## Key Design Decisions and Why

### 1. Twilio over Google Voice

The original implementation used Playwright to automate Google Voice in a headless browser. This was replaced with Twilio REST because:

- Google Voice sessions expire randomly and require manual re-login
- Headless browser can't run on Vercel (serverless)
- Twilio is $9–10/month per shop vs zero for Google Voice, but reliability justified it
- Twilio handles STOP/opt-out automatically (required for TCPA compliance)
- `lib/sms.ts` is already written and integrated into `lib/batch.ts`

**Current state:** Twilio is the only send path. The Google Voice code has been deleted from the repo.

### 2. Fire-and-forget batch execution

`/api/send-texts` and `/api/cron` both return immediately after creating the run row, then call `processBatch()` in a detached promise. The dashboard polls `/api/runs/[id]` every 3 seconds for live progress.

This was necessary because a 40-message batch with 1–3s jitter takes 60–90 seconds — longer than a synchronous HTTP response should be held open. The run row in Supabase acts as the communication channel between the background process and the polling frontend.

**Known risk:** If the serverless function is killed mid-batch (timeout, cold start kill, etc.), the run row stays in `status: 'running'` forever. There is no watchdog or timeout cleanup. This is a known gap.

### 3. Injectable dependencies in `processBatch()`

`processBatch()` accepts optional `senderFactory`, `fetchCustomers`, and `sleep` overrides. This allows tests to run without hitting Twilio, QuickBooks, or adding real delays. The production defaults are used when these are omitted.

This is why tests in `__tests__/batch.test.ts` can fully exercise the batch logic without mocking at the module level (except for Supabase, which is vi.mock'd).

### 4. Phone number normalization before send

QuickBooks returns phone numbers in inconsistent formats: `(209) 555-1234`, `209.555.1234`, `12095551234`, `+12095551234`. `lib/phone.ts` strips non-digits, handles the leading `+1` case, validates length, and rejects area codes starting with 0 or 1. Returns a typed result (`ok: true/false`) — never throws.

Twilio requires E.164 format (`+1XXXXXXXXXX`). `sms.ts` prepends `+1` to the 10-digit result from `phone.ts`.

**Resolved:** The stale Google Voice comment in `phone.ts` has been updated.

### 5. Single-tenant architecture (intentional for v1)

All config (business name, review link, QB tokens, Twilio number) comes from env vars or the single `settings` table. There is no concept of a tenant ID. This was a deliberate choice to ship faster — multi-tenant adds significant schema and auth complexity.

The current deployment model for multiple shops is: **one Vercel project per shop, one Supabase project per shop.** Each shop gets its own set of env vars. This works cleanly up to ~10 shops and requires zero code changes.

### 6. QuickBooks token auto-refresh

`getRecentCustomers()` always calls `oauthClient.refresh()` before making API calls, regardless of whether the token is expired. This prevents the common failure mode where a token silently expires overnight and the next morning's cron fails. The refreshed token is saved back to Supabase.

**Risk:** QB refresh tokens expire after 100 days of non-use. If a shop goes dormant for 3+ months, the cron will fail with a 401. The dashboard shows connection status but there's no proactive alert for this.

### 7. Cron schedule

`vercel.json` sets the cron at `0 10 * * *` — 10 AM UTC. That's 3 AM Pacific (PDT) / 2 AM Pacific (PST). This is wrong for the intended use case — Lockeford Garage likely wants messages sent during business hours (e.g., 10 AM Pacific = 17:00–18:00 UTC).

This should be corrected to `0 17 * * *` (10 AM PDT) or `0 18 * * *` (10 AM PST) before go-live. UTC offset depends on daylight saving time; consider using a consistent offset or adding a note in DEPLOYMENT.md.

---

## API Routes

### `GET /api/auth/quickbooks`

Redirects browser to Intuit OAuth authorization URL. Scopes: Accounting, OpenId, Profile.

### `GET /api/auth/quickbooks/callback`

Handles OAuth redirect from Intuit. Saves access token, refresh token, and realm ID to Supabase `settings`. Redirects to `/?connected=true` on success.

### `GET /api/settings`

Returns `{ isConnected: boolean }` — checks whether `qb_tokens` and `qb_realm_id` exist in `settings`.

### `GET /api/customers`

Returns all rows from the `customers` table, ordered by `created_at DESC`.

### `GET /api/runs`

Returns the 20 most recent rows from `runs`, ordered by `started_at DESC`.

### `GET /api/runs/[id]`

Returns a single run row by ID. Used by the dashboard's 3-second poll during an active run.

### `POST /api/send-texts`

Creates a run row, fires `processBatch()` in the background, returns `{ runId, status: 'started' }` immediately. Returns 409 if a run is already in progress.

### `GET /api/cron`

Same as send-texts but triggered by the scheduler. Protected by `Authorization: Bearer {CRON_SECRET}`. Returns 401 if the header is missing or wrong. Vercel automatically sends this header when `CRON_SECRET` is set as an env var.

---

## Test Coverage

Tests are in `__tests__/` using Vitest.

**`batch.test.ts`** — 8 test cases covering:

- Happy path: sends to all valid unsent customers
- Deduplication: skips already-texted customers
- Invalid phone: skips and logs, doesn't call sender
- Partial failure: continues batch after individual send error
- Daily cap: enforces cap, marks overflow as `over_cap`
- Fetch failure: marks run as `failed`, propagates error message
- No-op sender boot: doesn't initialize Twilio if nothing to send
- Empty customer list: completes cleanly with zero counts

Supabase is mocked via `vi.hoisted` with a minimal in-memory chain that replicates the query API surface used by `batch.ts`. Twilio sender is mocked via `vi.mock('../lib/sms')`.

**`phone.test.ts`** — covers normalization edge cases (various QB formats, too-short, too-long, invalid area codes).

**Gaps:**

- No tests for API routes
- No tests for `quickbooks.ts`
- No E2E tests
- No test for the "run stays stuck in running" scenario

---

## Environment Variables

Full list from `.env.example`:

| Variable                    | Required | Description                                                           |
| --------------------------- | -------- | --------------------------------------------------------------------- |
| `QUICKBOOKS_CLIENT_ID`      | Yes      | From Intuit developer console                                         |
| `QUICKBOOKS_CLIENT_SECRET`  | Yes      | From Intuit developer console                                         |
| `QUICKBOOKS_REDIRECT_URI`   | Yes      | Must match exactly in Intuit console — include full path              |
| `QUICKBOOKS_ENV`            | Yes      | `sandbox` or `production`                                             |
| `NEXT_PUBLIC_SUPABASE_URL`  | Yes      | Supabase project URL                                                  |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | Server-side only — bypasses RLS                                       |
| `TWILIO_ACCOUNT_SID`        | Yes      | From Twilio console                                                   |
| `TWILIO_AUTH_TOKEN`         | Yes      | From Twilio console — treat like a password                           |
| `TWILIO_FROM_NUMBER`        | Yes      | E.164 format, e.g. `+12095551234`                                     |
| `BUSINESS_NAME`             | No       | Defaults to `"Lockeford Garage"`                                      |
| `REVIEW_LINK`               | No       | Defaults to a placeholder — **must be set for production**            |
| `DAILY_CAP`                 | No       | Defaults to `40` — hard limit per run                                 |
| `DAYS_BACK`                 | No       | Defaults to `7` — how far back to pull invoices                       |
| `MIN_DELAY_MS`              | No       | Defaults to `1000` — set to `0` on Vercel free tier                   |
| `MAX_DELAY_MS`              | No       | Defaults to `3000` — set to `0` on Vercel free tier                   |
| `CRON_SECRET`               | Yes      | Bearer token for cron endpoint — generate with `openssl rand -hex 32` |

---

## Known Issues and Gaps

| Issue                                                | Severity    | Status                                                            |
| ---------------------------------------------------- | ----------- | ----------------------------------------------------------------- |
| Stuck `running` runs if function times out mid-batch | Medium      | No fix yet — needs a watchdog or timeout cleanup job              |
| Cron timezone is wrong (10 AM UTC ≠ 10 AM Pacific)   | Medium      | Needs correction in `vercel.json` before go-live                  |
| No opt-out tracking in own DB                        | Medium      | Twilio blocks STOP numbers but we still attempt and log failure   |
| QB tokens stored as plaintext JSON in Supabase       | Low–Medium  | Supabase service role is the only access layer; acceptable for v1 |
| RLS disabled on all tables                           | Medium      | Fine for single-tenant; must be enabled before multi-tenant       |
| Stale comment in `phone.ts` (says "Google Voice")    | Low         | Cosmetic — functionally correct                                   |
| `lib/google-voice.ts` still in repo                  | Low         | Not called by anything; safe to delete if desired                 |
| No failure alerting                                  | Medium      | Silent failures only visible in Vercel logs                       |
| No re-text logic (customers never re-texted)         | Low         | By design for v1 — may need "re-text after 90 days" for Phase 2   |
| Vercel free tier: cron requires Pro                  | Known       | Budget $20/month Vercel Pro into pricing                          |
| Intuit production approval pending                   | Blocker     | Takes 1–2 weeks; running sandbox until approved                   |
| A2P 10DLC not yet submitted                          | Blocker     | Takes 1–3 weeks; affects delivery without it                      |
| `REVIEW_LINK` env var has no fallback validation     | Low         | Will send a placeholder URL if not set                            |
| Message template has no opt-out language             | Medium-High | Required for TCPA compliance — add before go-live                 |

---

## Compliance Notes

### TCPA (US SMS marketing law)

- Businesses sending promotional SMS to customers need either prior express written consent or an existing business relationship
- The review request message qualifies as a transactional/relationship message (post-service follow-up) — lower bar than marketing
- Still required: an opt-out mechanism in every message
- Twilio handles `STOP` replies automatically but we should add "Reply STOP to opt out" to the message template
- Current message template in `lib/batch.ts` (`buildMessage()`) does **not** include opt-out language

### A2P 10DLC

- US carriers require all business SMS senders to register a brand and campaign
- Without registration, texts may be silently filtered (no error, just not delivered)
- Costs: ~$4/month carrier fees + $15 one-time campaign registration
- Process: done through Twilio console, takes 1–3 weeks for approval
- Sending works while pending but throughput is limited

---

## Dependency Inventory

| Package                 | Version  | Purpose                                                         |
| ----------------------- | -------- | --------------------------------------------------------------- |
| `next`                  | 16.2.3   | Framework                                                       |
| `react` / `react-dom`   | 19.2.4   | UI                                                              |
| `@supabase/supabase-js` | ^2.102.1 | Database client                                                 |
| `twilio`                | ^5.13.1  | SMS sending                                                     |
| `intuit-oauth`          | ^4.2.2   | QuickBooks OAuth                                                |
| `tailwindcss`           | ^4       | Styling                                                         |
| `vitest`                | ^4.1.4   | Testing                                                         |
| `typescript`            | ^5       | Types                                                           |
| `ts-node`               | ^10.9.2  | Used only by the now-deprecated `scripts/setup-google-voice.ts` |

No heavy dependencies. No ORM. No auth library (single-tenant, no user accounts yet).

---

## Git History Summary

The repo is in active development with no tagged releases. Key milestones:

- Initial build: QB OAuth + Google Voice Playwright automation
- SMS refactor: Replaced Google Voice with Twilio; `lib/sms.ts` + `lib/phone.ts` added
- Batch hardening: Daily cap, deduplication, jitter delay, run history, live progress polling
- Test suite: `batch.test.ts` added with injectable dependencies pattern
- Docs: DEPLOYMENT.md, PRICING.md added

The Google Voice code and debug screenshots have been removed.

---

## What a Reviewer Should Focus On

1. **The fire-and-forget pattern** (`send-texts/route.ts`, `cron/route.ts`) — is this safe on Vercel serverless? What happens if the function is recycled mid-batch?

2. **Stuck run recovery** — there's no mechanism to detect or clean up runs stuck in `running`. Is this acceptable for v1?

3. **QB token storage** — tokens are JSON-stringified into a `text` column in Supabase with no encryption. RLS is disabled. Is the service role key boundary sufficient?

4. **Cron reliability** — Vercel cron is best-effort (not guaranteed). For a paid service where missed sends = unhappy customers, is this acceptable or do we need a more reliable scheduler (Inngest, Trigger.dev, etc.)?

5. **TCPA exposure** — the message template has no opt-out language. Is the existing business relationship exemption sufficient, or is explicit opt-out text required?

6. **The `maxDuration = 300` setting** — only honored on Vercel Pro. On free tier, functions die at 60s. The fire-and-forget continues running after the HTTP response but Vercel may still kill the Node process. Is this a real risk?
