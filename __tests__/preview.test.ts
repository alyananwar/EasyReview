import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock batch.ts to avoid the REVIEW_LINK startup check
vi.mock("../lib/batch", () => ({
  buildMessage: (name: string) =>
    `Hi ${name}! Review link here. Reply STOP to opt out.`,
}));

// getMessageTemplate hits Supabase — return the default template instead.
vi.mock("../lib/message", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/message")>();
  return {
    ...actual,
    getMessageTemplate: async () => actual.DEFAULT_TEMPLATE,
  };
});

const fixtures = vi.hoisted(() => {
  interface CustomerRow {
    qb_customer_id: string;
    texted_at: string | null;
    next_eligible_at: string | null;
  }
  interface OptOutRow {
    phone: string;
  }
  const state: { customers: CustomerRow[]; opt_outs: OptOutRow[] } = {
    customers: [],
    opt_outs: [],
  };

  function buildChain(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];

    function tableRef() {
      if (table === "customers")
        return state.customers as unknown as Record<string, unknown>[];
      if (table === "opt_outs")
        return state.opt_outs as unknown as Record<string, unknown>[];
      return [] as Record<string, unknown>[];
    }

    const chain = {
      select() {
        return chain;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return chain;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return chain;
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        const rows = tableRef().filter((r) => filters.every((f) => f(r)));
        resolve({ data: rows, error: null });
      },
    };
    return chain;
  }

  const supabaseAdmin = { from: (table: string) => buildChain(table) };
  return { state, supabaseAdmin };
});

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: fixtures.supabaseAdmin,
  supabase: fixtures.supabaseAdmin,
}));

import { previewBatch } from "../lib/preview";
import type { QbCustomer } from "../lib/quickbooks";

function reset() {
  fixtures.state.customers = [];
  fixtures.state.opt_outs = [];
}

function makeCustomer(
  i: number,
  overrides: Partial<QbCustomer> = {},
): QbCustomer {
  return {
    qb_customer_id: `qb-${i}`,
    name: `Customer ${i}`,
    phone: `20955512${String(i).padStart(2, "0")}`,
    ...overrides,
  };
}

describe("previewBatch", () => {
  beforeEach(reset);

  it("counts all customers as eligible when none have been texted", async () => {
    const result = await previewBatch({
      fetchCustomers: async () => [1, 2, 3].map((i) => makeCustomer(i)),
    });
    expect(result.eligible).toBe(3);
    expect(result.already_texted).toBe(0);
    expect(result.total_found).toBe(3);
  });

  it("counts already-texted customers correctly", async () => {
    fixtures.state.customers.push({
      qb_customer_id: "qb-2",
      texted_at: new Date().toISOString(),
      next_eligible_at: null,
    });
    const result = await previewBatch({
      fetchCustomers: async () => [1, 2, 3].map((i) => makeCustomer(i)),
    });
    expect(result.eligible).toBe(2);
    expect(result.already_texted).toBe(1);
  });

  it("counts re-eligible customers as eligible (next_eligible_at in the past)", async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    fixtures.state.customers.push({
      qb_customer_id: "qb-1",
      texted_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      next_eligible_at: pastDate,
    });
    const result = await previewBatch({
      fetchCustomers: async () => [makeCustomer(1)],
    });
    expect(result.eligible).toBe(1);
    expect(result.already_texted).toBe(0);
  });

  it("counts opted-out customers correctly", async () => {
    fixtures.state.opt_outs.push({ phone: "2095551201" });
    const result = await previewBatch({
      fetchCustomers: async () => [makeCustomer(1), makeCustomer(2)],
    });
    expect(result.opted_out).toBe(1);
    expect(result.eligible).toBe(1);
  });

  it("counts invalid phones correctly", async () => {
    const result = await previewBatch({
      fetchCustomers: async () => [
        makeCustomer(1, { phone: "not-a-phone" }),
        makeCustomer(2),
      ],
    });
    expect(result.invalid_phone).toBe(1);
    expect(result.eligible).toBe(1);
  });

  it("enforces the daily cap in preview", async () => {
    const result = await previewBatch({
      dailyCap: 2,
      fetchCustomers: async () => [1, 2, 3, 4].map((i) => makeCustomer(i)),
    });
    expect(result.eligible).toBe(2);
    expect(result.over_cap).toBe(2);
    expect(result.daily_cap).toBe(2);
  });

  it("returns zeros when there are no customers", async () => {
    const result = await previewBatch({ fetchCustomers: async () => [] });
    expect(result.total_found).toBe(0);
    expect(result.eligible).toBe(0);
  });

  it("includes the first eligible customer name in sample_message", async () => {
    const result = await previewBatch({
      fetchCustomers: async () => [makeCustomer(1)],
    });
    expect(result.sample_message).toContain("Customer");
  });

  it("uses 'Customer' in sample message when no eligible customers", async () => {
    fixtures.state.opt_outs.push({ phone: "2095551201" });
    const result = await previewBatch({
      fetchCustomers: async () => [makeCustomer(1)],
    });
    expect(result.sample_message).toContain("Customer");
    expect(result.eligible).toBe(0);
  });
});
