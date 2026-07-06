import { supabaseAdmin } from "./supabase";
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

async function sendAlert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch {
    // Never let alerting failure crash the run.
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
    await supabaseAdmin.from("message_attempts").insert({
      run_id: runId,
      qb_customer_id: data.qb_customer_id,
      customer_name: data.customer_name,
      phone: data.phone,
      status: data.status,
      provider: "twilio",
      provider_message_id: data.provider_message_id ?? null,
      error_code: data.error_code ?? null,
      error_message: data.error_message ?? null,
      sent_at: data.status === "sent" ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error("Failed to record message attempt:", err);
  }
}

// Create a run row and return its id.
// Throws an error with code "ACTIVE_RUN" if a run is already in progress.
// The DB partial unique index (002_production_fixes.sql) makes this atomic —
// a concurrent request that passes a hasActiveRun() pre-check will still fail
// here rather than creating a duplicate active run.
export async function createRun(
  source: "manual" | "cron" = "manual",
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("runs")
    .insert({ status: "running", source })
    .select("id")
    .single();

  if (error) {
    // PostgreSQL unique_violation = '23505' — at_most_one_active_run index fired.
    if ((error as { code?: string }).code === "23505") {
      throw Object.assign(new Error("A run is already in progress."), {
        code: "ACTIVE_RUN",
      });
    }
    throw new Error(`Failed to create run: ${error.message}`);
  }
  if (!data) throw new Error("Failed to create run: no data returned");
  return data.id as string;
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
  const { error } = await supabaseAdmin
    .from("runs")
    .update(patch)
    .eq("id", runId);
  if (error) console.error("Failed to update run:", error.message);
}

export async function hasActiveRun(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("runs")
    .select("id")
    .eq("status", "running")
    .limit(1);
  return !!(data && data.length > 0);
}

// Mark runs stuck in 'running' for more than 15 minutes as failed.
// Call before createRun() so stuck runs don't block new ones via the DB constraint.
export async function cleanStuckRuns(): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("runs")
    .update({
      status: "failed",
      error: "Run timed out — cleaned up automatically on next trigger",
      finished_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("started_at", cutoff);
  if (error) console.error("cleanStuckRuns failed:", error.message);
}

export async function checkAutomationEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "automation_enabled")
    .maybeSingle();
  return data?.value !== "false";
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
}

export async function processBatch(
  runId: string,
  opts: RunOptions = {},
): Promise<void> {
  const dailyCap = opts.dailyCap ?? DAILY_CAP;
  const daysBack = opts.daysBack ?? DAYS_BACK;
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
    const ids = customers.map((c) => c.qb_customer_id);
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("qb_customer_id, texted_at, next_eligible_at")
      .in("qb_customer_id", ids);

    const now = new Date();
    const alreadyTexted = new Set(
      (existing ?? [])
        .filter((r) => {
          if (!r.texted_at) return false;
          if (r.next_eligible_at && new Date(r.next_eligible_at) <= now)
            return false;
          return true;
        })
        .map((r) => r.qb_customer_id),
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

    const optedOut = new Set<string>();
    if (validPhones.length > 0) {
      const { data: optOuts } = await supabaseAdmin
        .from("opt_outs")
        .select("phone")
        .in("phone", validPhones);
      (optOuts ?? []).forEach((r) => optedOut.add(r.phone));
    }

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

        const nextEligibleAt = new Date(
          Date.now() + RETEXT_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();

        await supabaseAdmin.from("customers").upsert(
          {
            qb_customer_id: p.customer.qb_customer_id,
            name: p.customer.name,
            phone: p.customer.phone,
            texted_at: new Date().toISOString(),
            next_eligible_at: nextEligibleAt,
            last_status: "sent",
            last_error: null,
            last_attempt_at: new Date().toISOString(),
          },
          { onConflict: "qb_customer_id" },
        );

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
          await supabaseAdmin
            .from("opt_outs")
            .upsert(
              { phone: p.tenDigit!, reason: "twilio_blocked" },
              { onConflict: "phone" },
            );
        }

        await supabaseAdmin.from("customers").upsert(
          {
            qb_customer_id: p.customer.qb_customer_id,
            name: p.customer.name,
            phone: p.customer.phone,
            last_status: "error",
            last_error: errMsg,
            last_attempt_at: new Date().toISOString(),
          },
          { onConflict: "qb_customer_id" },
        );

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
        `EasyReview: run completed with 0 sent and ${failed} failures. Check Vercel logs.`,
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
    await sendAlert(`EasyReview: run ${runId} failed — ${errMsg}`);
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
