import {
  getDb,
  getSetting,
  newId,
  nowIso,
  addOptOut,
  optedOutPhones,
  recentlyTextedIds,
  sentInLast24h,
} from "./db";
import { createTwilioSender, SmsSender } from "./sms";
import { getRecentCustomers, QbCustomer } from "./quickbooks";
import { normalizePhone } from "./phone";
import { DEFAULT_TEMPLATE, getMessageTemplate, renderMessage } from "./message";

const BUSINESS_NAME = process.env.BUSINESS_NAME || "Lockeford Garage";
const REVIEW_LINK = process.env.REVIEW_LINK || "";
const DAILY_CAP = parseInt(process.env.DAILY_CAP || "40", 10);
const DAYS_BACK = parseInt(process.env.DAYS_BACK || "7", 10);
const MIN_DELAY_MS = parseInt(process.env.MIN_DELAY_MS || "1000", 10);
const MAX_DELAY_MS = parseInt(process.env.MAX_DELAY_MS || "3000", 10);
const RETEXT_DAYS = parseInt(process.env.RETEXT_DAYS || "90", 10);

// Fail hard at startup if the review link is missing or still a placeholder.
if (!REVIEW_LINK || REVIEW_LINK.includes("YOUR_REVIEW_LINK")) {
  throw new Error(
    "REVIEW_LINK env var is missing or still set to the placeholder. Set it to the real review URL before deploying.",
  );
}

export type AttemptStatus =
  | "sent"
  | "already_texted"
  | "invalid_phone"
  | "opted_out"
  | "error"
  | "over_cap";

export interface Attempt {
  name: string;
  phone: string;
  qb_customer_id: string;
  status: AttemptStatus;
  error?: string;
  at: string;
}

export interface RunRow {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  results: Attempt[];
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export function buildMessage(
  firstName: string,
  template: string = DEFAULT_TEMPLATE,
): string {
  return renderMessage(template, {
    firstName,
    businessName: BUSINESS_NAME,
    reviewLink: REVIEW_LINK,
  });
}

function jitterMs(): number {
  const lo = Math.min(MIN_DELAY_MS, MAX_DELAY_MS);
  const hi = Math.max(MIN_DELAY_MS, MAX_DELAY_MS);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// Texts ALERT_PHONE (the admin, not a customer) when a run goes wrong.
// Skips the alert when the previous run already failed, so a broken
// QuickBooks connection texts once instead of every scheduled run.
export async function sendAlert(
  runId: string,
  message: string,
  senderFactory: () => Promise<SmsSender> = createTwilioSender,
): Promise<void> {
  const to = normalizePhone(process.env.ALERT_PHONE ?? "");
  if (!to.ok) return;
  const prev = getDb()
    .prepare(
      "SELECT status FROM runs WHERE id != ? AND finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 1",
    )
    .get(runId) as { status: string } | undefined;
  if (prev?.status === "failed") return;
  try {
    const sender = await senderFactory();
    await sender.send(to.tenDigit, `EasyReview alert: ${message}`);
    await sender.close();
  } catch (err) {
    // Never let alerting failure crash the run.
    console.error("Failed to send alert text:", err);
  }
}

async function recordAttempt(
  runId: string,
  data: {
    qb_customer_id: string;
    customer_name: string;
    phone: string;
    status: AttemptStatus;
    provider_message_id?: string;
    error_code?: string;
    error_message?: string;
  },
): Promise<void> {
  try {
    getDb()
      .prepare(
        `INSERT INTO message_attempts (id, run_id, qb_customer_id, customer_name, phone, status,
           provider_message_id, error_code, error_message, sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        runId,
        data.qb_customer_id,
        data.customer_name,
        data.phone,
        data.status,
        data.provider_message_id ?? null,
        data.error_code ?? null,
        data.error_message ?? null,
        data.status === "sent" ? nowIso() : null,
        nowIso(),
      );
  } catch (err) {
    console.error("Failed to record message attempt:", err);
  }
}

// Create a run row and return its id.
// Throws an error with code "ACTIVE_RUN" if a run is already in progress.
// The at_most_one_active_run partial unique index (lib/db.ts) makes this
// atomic: a second concurrent run fails here instead of running twice.
export async function createRun(
  source: "manual" | "cron" = "manual",
): Promise<string> {
  const id = newId();
  try {
    getDb()
      .prepare(
        "INSERT INTO runs (id, status, source, started_at) VALUES (?, 'running', ?, ?)",
      )
      .run(id, source, nowIso());
  } catch (err) {
    // 2067 = SQLITE_CONSTRAINT_UNIQUE from the active-run index.
    if ((err as { errcode?: number }).errcode === 2067) {
      throw Object.assign(new Error("A run is already in progress."), {
        code: "ACTIVE_RUN",
      });
    }
    throw new Error(
      `Failed to create run: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return id;
}

async function updateRun(
  runId: string,
  patch: Partial<
    Pick<
      RunRow,
      | "status"
      | "total"
      | "sent"
      | "skipped"
      | "failed"
      | "results"
      | "error"
      | "finished_at"
    >
  >,
): Promise<void> {
  const entries = Object.entries(patch).map(
    ([k, v]) => [k, k === "results" ? JSON.stringify(v) : v] as const,
  );
  if (entries.length === 0) return;
  try {
    // Column names come from the typed patch keys above, never from user input.
    getDb()
      .prepare(
        `UPDATE runs SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`,
      )
      .run(...entries.map(([, v]) => v as string | number | null), runId);
  } catch (err) {
    console.error("Failed to update run:", err);
  }
}

export async function hasActiveRun(): Promise<boolean> {
  return !!getDb()
    .prepare("SELECT 1 FROM runs WHERE status = 'running' LIMIT 1")
    .get();
}

// Mark runs stuck in 'running' for more than 15 minutes as failed.
// Call before createRun() so stuck runs don't block new ones via the DB constraint.
// Pass olderThanMs = 0 at server startup: a fresh process means nothing is running.
export async function cleanStuckRuns(
  olderThanMs = 15 * 60 * 1000,
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  getDb()
    .prepare(
      `UPDATE runs SET status = 'failed', error = ?, finished_at = ?
       WHERE status = 'running' AND started_at <= ?`,
    )
    .run(
      "Run was interrupted (timeout or server restart). Cleaned up automatically.",
      nowIso(),
      cutoff,
    );
}

export async function checkAutomationEnabled(): Promise<boolean> {
  return getSetting("automation_enabled") !== "false";
}

// Insert or update the customer row. Only the columns in `patch` change on
// update, so a failed send never clears an earlier texted_at.
function upsertCustomer(
  c: QbCustomer,
  patch: {
    texted_at?: string;
    next_eligible_at?: string | null;
    last_status: string;
    last_error: string | null;
  },
): void {
  const now = nowIso();
  const fields = { ...patch, last_attempt_at: now };
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  getDb()
    .prepare(
      `INSERT INTO customers (id, qb_customer_id, name, phone, created_at, ${cols.join(", ")})
       VALUES (?, ?, ?, ?, ?, ${cols.map(() => "?").join(", ")})
       ON CONFLICT(qb_customer_id) DO UPDATE SET name = excluded.name, phone = excluded.phone,
         ${cols.map((k) => `${k} = excluded.${k}`).join(", ")}`,
    )
    .run(newId(), c.qb_customer_id, c.name, c.phone, now, ...vals);
}

export interface RunOptions {
  source?: "manual" | "cron";
  dailyCap?: number;
  daysBack?: number;
  senderFactory?: () => Promise<SmsSender>;
  fetchCustomers?: (daysBack: number) => Promise<QbCustomer[]>;
  sleep?: (ms: number) => Promise<void>;
  isAutomationEnabled?: () => Promise<boolean>;
  fetchTemplate?: () => Promise<string>;
  retextDays?: number;
}

export async function processBatch(
  runId: string,
  opts: RunOptions = {},
): Promise<void> {
  // Rolling 24h cap, shared by every run that day.
  const dailyCap = Math.max(0, (opts.dailyCap ?? DAILY_CAP) - sentInLast24h());
  const daysBack = opts.daysBack ?? DAYS_BACK;
  const retextDays = opts.retextDays ?? RETEXT_DAYS;
  const fetchCustomers = opts.fetchCustomers ?? getRecentCustomers;
  const senderFactory = opts.senderFactory ?? createTwilioSender;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const isEnabled = opts.isAutomationEnabled ?? checkAutomationEnabled;
  const fetchTemplate = opts.fetchTemplate ?? getMessageTemplate;

  // Belt-and-suspenders: check automation before doing any work.
  // Primary check is in the route handler; this catches the race where
  // the setting changed between route check and after() execution.
  if (!(await isEnabled())) {
    await updateRun(runId, {
      status: "cancelled",
      error: "Automation is paused",
      finished_at: new Date().toISOString(),
    });
    return;
  }

  const attempts: Attempt[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let sender: SmsSender | null = null;

  try {
    // Load once per run so every message in the batch uses the same copy.
    const template = await fetchTemplate();
    const customers = await fetchCustomers(daysBack);

    await updateRun(runId, { total: customers.length });

    if (customers.length === 0) {
      await updateRun(runId, {
        status: "completed",
        finished_at: new Date().toISOString(),
      });
      return;
    }

    // Dedupe: skip customers who have been texted and are not yet re-eligible.
    const alreadyTexted = recentlyTextedIds(
      customers.map((c) => c.qb_customer_id),
    );

    type Planned = {
      customer: QbCustomer;
      tenDigit?: string;
      skipReason?: AttemptStatus;
      skipError?: string;
    };

    const planned: Planned[] = customers.map((c) => {
      if (alreadyTexted.has(c.qb_customer_id)) {
        return { customer: c, skipReason: "already_texted" };
      }
      const phone = normalizePhone(c.phone);
      if (!phone.ok) {
        return {
          customer: c,
          skipReason: "invalid_phone",
          skipError: phone.reason,
        };
      }
      return { customer: c, tenDigit: phone.tenDigit };
    });

    // Load opt-outs for all valid phones in this batch.
    const validPhones = planned
      .filter((p) => !p.skipReason)
      .map((p) => p.tenDigit!);

    const optedOut = optedOutPhones(validPhones);

    for (const p of planned) {
      if (!p.skipReason && p.tenDigit && optedOut.has(p.tenDigit)) {
        p.skipReason = "opted_out";
      }
    }

    const toSendCount = planned.filter((p) => !p.skipReason).length;

    if (toSendCount > 0) {
      sender = await senderFactory();
    }

    let actuallySent = 0;
    for (const p of planned) {
      if (p.skipReason === "already_texted" || p.skipReason === "opted_out") {
        attempts.push({
          name: p.customer.name,
          phone: p.customer.phone,
          qb_customer_id: p.customer.qb_customer_id,
          status: p.skipReason,
          at: new Date().toISOString(),
        });
        skipped++;
        await recordAttempt(runId, {
          qb_customer_id: p.customer.qb_customer_id,
          customer_name: p.customer.name,
          phone: p.customer.phone,
          status: p.skipReason,
        });
        continue;
      }
      if (p.skipReason === "invalid_phone") {
        attempts.push({
          name: p.customer.name,
          phone: p.customer.phone,
          qb_customer_id: p.customer.qb_customer_id,
          status: "invalid_phone",
          error: p.skipError,
          at: new Date().toISOString(),
        });
        skipped++;
        await recordAttempt(runId, {
          qb_customer_id: p.customer.qb_customer_id,
          customer_name: p.customer.name,
          phone: p.customer.phone,
          status: "invalid_phone",
          error_message: p.skipError,
        });
        continue;
      }

      if (actuallySent >= dailyCap) {
        attempts.push({
          name: p.customer.name,
          phone: p.customer.phone,
          qb_customer_id: p.customer.qb_customer_id,
          status: "over_cap",
          at: new Date().toISOString(),
        });
        skipped++;
        await recordAttempt(runId, {
          qb_customer_id: p.customer.qb_customer_id,
          customer_name: p.customer.name,
          phone: p.customer.phone,
          status: "over_cap",
        });
        continue;
      }

      const firstName = (p.customer.name.split(" ")[0] || "there").trim();
      const message = buildMessage(firstName, template);

      try {
        const sid = await sender!.send(p.tenDigit!, message);
        actuallySent++;
        sent++;

        // RETEXT_DAYS <= 0 means one text per customer, ever (NULL = never eligible again).
        const nextEligibleAt =
          retextDays > 0
            ? new Date(Date.now() + retextDays * 86_400_000).toISOString()
            : null;

        upsertCustomer(p.customer, {
          texted_at: nowIso(),
          next_eligible_at: nextEligibleAt,
          last_status: "sent",
          last_error: null,
        });

        attempts.push({
          name: p.customer.name,
          phone: p.customer.phone,
          qb_customer_id: p.customer.qb_customer_id,
          status: "sent",
          at: new Date().toISOString(),
        });

        await recordAttempt(runId, {
          qb_customer_id: p.customer.qb_customer_id,
          customer_name: p.customer.name,
          phone: p.customer.phone,
          status: "sent",
          provider_message_id: sid,
        });
      } catch (err) {
        failed++;
        const errMsg = err instanceof Error ? err.message : String(err);

        // Twilio 21610 = number on the opt-out blocklist. Store locally so
        // we skip before attempting next time instead of burning a send attempt.
        const twilioCode = (err as { code?: number }).code;
        if (twilioCode === 21610) {
          addOptOut(p.tenDigit!, "twilio_blocked");
        }

        upsertCustomer(p.customer, {
          last_status: "error",
          last_error: errMsg,
        });

        attempts.push({
          name: p.customer.name,
          phone: p.customer.phone,
          qb_customer_id: p.customer.qb_customer_id,
          status: "error",
          error: errMsg,
          at: new Date().toISOString(),
        });

        await recordAttempt(runId, {
          qb_customer_id: p.customer.qb_customer_id,
          customer_name: p.customer.name,
          phone: p.customer.phone,
          status: "error",
          error_code: twilioCode ? String(twilioCode) : undefined,
          error_message: errMsg,
        });
      }

      await updateRun(runId, {
        sent,
        skipped,
        failed,
        results: attempts,
      });

      const moreWillSend = planned
        .slice(planned.indexOf(p) + 1)
        .some((next) => !next.skipReason && actuallySent < dailyCap);
      if (moreWillSend) {
        await sleep(jitterMs());
      }
    }

    await updateRun(runId, {
      status: "completed",
      sent,
      skipped,
      failed,
      results: attempts,
      finished_at: new Date().toISOString(),
    });

    if (customers.length > 0 && sent === 0 && failed > 0) {
      await sendAlert(
        runId,
        `run finished with 0 sent and ${failed} failed. Check the dashboard or logs\\app.log on the shop PC.`,
      );
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Run failed:", err);
    await updateRun(runId, {
      status: "failed",
      sent,
      skipped,
      failed,
      results: attempts,
      error: errMsg,
      finished_at: new Date().toISOString(),
    });
    await sendAlert(runId, `run failed: ${errMsg}`);
  } finally {
    if (sender) {
      try {
        await sender.close();
      } catch {
        /* ignore */
      }
    }
  }
}
