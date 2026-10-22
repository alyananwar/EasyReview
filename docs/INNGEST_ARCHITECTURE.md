# EasyReview — Inngest Integration Architecture

> **Historical (2026-10-22):** written for the old Vercel + Supabase setup. EasyReview now runs on the shop PC with SQLite. See `docs/SHOP_PC_SETUP.md` and `README.md` for the current design.

**Status:** Design only — implement when second paying customer signs  
**Current approach:** `after()` from next/server (interim, sufficient for 1-2 shops)

---

## When to Make the Switch

Don't pre-migrate. Switch when any of these hit:

- Second paying shop signs (multi-tenant cron becomes a problem)
- A run silently dies in production and you can't tell why
- You need retries on Twilio 5xx without manual re-runs
- Batches exceed ~150 customers (300s `maxDuration` becomes a real ceiling)

---

## Function Structure: One function with `step.run` checkpoints

Do NOT fan-out one Inngest function per customer — that breaks the one-row-per-run polling model and creates 40 cold starts per batch.

One function, multiple internal steps:

```typescript
inngest.createFunction(
  { id: "run-batch", concurrency: { limit: 1 } },
  { event: "batch/run.requested" },
  async ({ event, step }) => {
    const { runId } = event.data;

    // Memoized — retries don't re-hit QuickBooks
    const planned = await step.run("fetch-and-plan", async () => {
      // QB fetch + dedupe + opt-out load + phone normalization
      // Returns the planned[] array (what to send, what to skip)
    });

    for (const [i, p] of planned.entries()) {
      if (p.skipReason) continue;
      await step.run(`send-${p.customer.qb_customer_id}`, async () => {
        // Twilio send + customers upsert + runs progress update
        // Step name is the idempotency key — Inngest won't re-run on retry
      });
      await step.sleep(`jitter-${i}`, randomMs()); // durable sleep, no execution time burned
    }

    await step.run("finalize", async () => {
      // Mark run completed, fire alert webhook
    });
  },
);
```

---

## Run ID Flow

Keep current order: route calls `createRun()` → gets `runId` → sends Inngest event → returns `{ runId }` immediately. Dashboard polls `/api/runs/[id]` as today. The Inngest function reads `runId` from `event.data` — it never creates the row itself.

```typescript
// send-texts/route.ts
const runId = await createRun("manual"); // DB row created, dashboard can poll immediately
await inngest.send({ name: "batch/run.requested", data: { runId } });
return NextResponse.json({ runId, status: "started" });
```

---

## Concurrency

```typescript
concurrency: { limit: 1 }  // single shop (now)
concurrency: { limit: 1, key: "event.data.tenantId" }  // multi-tenant (later)
```

The DB partial unique index (`at_most_one_active_run`) stays as defense-in-depth backstop — handles admin-triggered races and stale replays. Inngest concurrency is the front line.

---

## Local Dev

Run alongside `next dev`:

```bash
npx inngest-cli@latest dev
# UI at localhost:8288
```

Gate the fallback: if `INNGEST_DEV_SERVER_URL` is unset, call `processBatch(runId)` directly via `after()`. Same code path, no durability locally.

---

## Multi-Tenant Pattern

When multi-tenant lands:

- Event: `{ name: "batch/run.requested", data: { runId, tenantId } }`
- `concurrency: { limit: 1, key: "event.data.tenantId" }` — each shop gets its own serialization lane, shops run in parallel
- Cron route: query all active tenants, fire N events, return immediately
- DB index changes to `(tenant_id) WHERE status = 'running'`
- Prefer Inngest's own cron trigger over Vercel Cron at that point (one scheduler, one source of truth)

---

## New Files When Implementing

| File                       | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `lib/inngest.ts`           | Inngest client (`new Inngest({ id: "easyreview" })`)   |
| `app/api/inngest/route.ts` | Inngest serve handler (`serve({ client, functions })`) |
| `inngest.config.ts`        | Function definitions                                   |

**Check AGENTS.md before writing `app/api/inngest/route.ts`** — Next.js 16 route handler shape may differ from docs/training data.

---

## Gotchas

- **Sender lifecycle**: Twilio client can't survive across `step.run` boundaries. Construct it inside each send step (it's just a constructor call, negligible cost).
- **`results[]` growth**: writing the full attempts array on every send is fine at 40, painful at 500. When multi-tenant lands, switch to a child `attempts` table.
- **`REVIEW_LINK` throw at module top**: fires at Inngest function registration time. Deploys will hard-fail if env is misconfigured — that's correct behavior.
- **Vercel Cron vs Inngest cron**: once on Inngest, use Inngest's cron trigger, not Vercel Cron. Keep `app/api/cron/route.ts` as a manual-trigger escape hatch only.
