import { optedOutPhones, recentlyTextedIds, sentInLast24h } from "./db";
import { getRecentCustomers, QbCustomer } from "./quickbooks";
import { normalizePhone } from "./phone";
import { buildMessage } from "./batch";
import { getMessageTemplate } from "./message";

const DAILY_CAP = parseInt(process.env.DAILY_CAP || "40", 10);
const DAYS_BACK = parseInt(process.env.DAYS_BACK || "7", 10);

export interface PreviewResult {
  daily_cap: number;
  total_found: number;
  eligible: number;
  already_texted: number;
  opted_out: number;
  invalid_phone: number;
  over_cap: number;
  sample_message: string;
}

export interface PreviewOptions {
  dailyCap?: number;
  daysBack?: number;
  fetchCustomers?: (daysBack: number) => Promise<QbCustomer[]>;
  fetchTemplate?: () => Promise<string>;
}

export async function previewBatch(
  opts: PreviewOptions = {},
): Promise<PreviewResult> {
  // Room left under the rolling 24h cap (see processBatch).
  const dailyCap = Math.max(0, (opts.dailyCap ?? DAILY_CAP) - sentInLast24h());
  const daysBack = opts.daysBack ?? DAYS_BACK;
  const fetchCustomers = opts.fetchCustomers ?? getRecentCustomers;
  const fetchTemplate = opts.fetchTemplate ?? getMessageTemplate;

  const template = await fetchTemplate();
  const customers = await fetchCustomers(daysBack);

  if (customers.length === 0) {
    return {
      daily_cap: dailyCap,
      total_found: 0,
      eligible: 0,
      already_texted: 0,
      opted_out: 0,
      invalid_phone: 0,
      over_cap: 0,
      sample_message: buildMessage("Customer", template),
    };
  }

  const alreadyTextedSet = recentlyTextedIds(
    customers.map((c) => c.qb_customer_id),
  );

  type Classified = {
    customer: QbCustomer;
    tenDigit?: string;
    skipReason?: "already_texted" | "invalid_phone" | "opted_out" | "over_cap";
  };

  const classified: Classified[] = customers.map((c) => {
    if (alreadyTextedSet.has(c.qb_customer_id))
      return { customer: c, skipReason: "already_texted" };
    const phone = normalizePhone(c.phone);
    if (!phone.ok) return { customer: c, skipReason: "invalid_phone" };
    return { customer: c, tenDigit: phone.tenDigit };
  });

  const validPhones = classified
    .filter((p) => !p.skipReason)
    .map((p) => p.tenDigit!);

  const optedOutSet = optedOutPhones(validPhones);

  for (const p of classified) {
    if (!p.skipReason && p.tenDigit && optedOutSet.has(p.tenDigit)) {
      p.skipReason = "opted_out";
    }
  }

  let eligible = 0;
  let already_texted = 0;
  let opted_out = 0;
  let invalid_phone = 0;
  let over_cap = 0;
  let wouldSend = 0;
  let firstEligibleName: string | null = null;

  for (const p of classified) {
    if (p.skipReason === "already_texted") {
      already_texted++;
      continue;
    }
    if (p.skipReason === "invalid_phone") {
      invalid_phone++;
      continue;
    }
    if (p.skipReason === "opted_out") {
      opted_out++;
      continue;
    }
    if (wouldSend >= dailyCap) {
      over_cap++;
      continue;
    }
    eligible++;
    wouldSend++;
    if (!firstEligibleName) {
      firstEligibleName = p.customer.name.split(" ")[0] || "Customer";
    }
  }

  return {
    daily_cap: dailyCap,
    total_found: customers.length,
    eligible,
    already_texted,
    opted_out,
    invalid_phone,
    over_cap,
    sample_message: buildMessage(firstEligibleName || "Customer", template),
  };
}
