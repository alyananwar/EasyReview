import { describe, it, expect, beforeEach, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  interface RunRow {
    id: string;
    status: string;
    source: string;
    total: number;
    sent: number;
    skipped: number;
    failed: number;
    results: unknown[];
    error: string | null;
    started_at: string;
    finished_at: string | null;
  }
  interface CustomerRow {
    qb_customer_id: string;
    name: string;
    phone: string;
    texted_at: string | null;
  }
  const state: { runs: RunRow[]; customers: CustomerRow[] } = {
    runs: [],
    customers: [],
  };

  function buildChain(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;

    function tableRef() {
      if (table === "runs")
        return state.runs as unknown as Record<string, unknown>[];
      return state.customers as unknown as Record<string, unknown>[];
    }
    function applyFilters() {
      return tableRef().filter((r) => filters.every((f) => f(r)));
    }

    const chain = {
      select() {
        return chain;
      },
      insert(row: Record<string, unknown>) {
        pendingInsert = row;
        return chain;
      },
      update(patch: Record<string, unknown>) {
        pendingUpdate = patch;
        return chain;
      },
      upsert() {
        return chain;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return chain;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return chain;
      },
      lt(col: string, val: unknown) {
        filters.push((r) => r[col] < val);
        return chain;
      },
      limit() {
        return chain;
      },
      order() {
        return chain;
      },
      async maybeSingle() {
        return { data: applyFilters()[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert) {
          const newRow = {
            id: `r-${state.runs.length + 1}`,
            started_at: new Date().toISOString(),
            finished_at: null,
            total: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            results: [],
            error: null,
            ...pendingInsert,
          } as unknown as RunRow;
          if (table === "runs") state.runs.push(newRow);
          return { data: newRow, error: null };
        }
        const rows = applyFilters();
        return {
          data: rows[0] ?? null,
          error: rows[0] ? null : { message: "not found" },
        };
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (pendingUpdate) {
          const rows = applyFilters();
          for (const r of rows) Object.assign(r, pendingUpdate);
          resolve({ data: rows, error: null });
          return;
        }
        resolve({ data: applyFilters(), error: null });
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

vi.mock("../lib/sms", () => ({
  createTwilioSender: async () => ({
    send: async () => undefined,
    close: async () => {},
  }),
}));

import { processBatch, createRun } from "../lib/batch";
import type { QbCustomer } from "../lib/quickbooks";

function resetState() {
  fixtures.state.runs = [];
  fixtures.state.customers = [];
}

function makeCustomer(i: number): QbCustomer {
  return {
    qb_customer_id: `qb-${i}`,
    name: `Customer ${i}`,
    phone: `20955512${String(i).padStart(2, "0")}`,
  };
}

describe("processBatch: automation pause", () => {
  beforeEach(resetState);

  it("cancels the run immediately when automation is disabled", async () => {
    const runId = await createRun("manual");
    await processBatch(runId, {
      isAutomationEnabled: async () => false,
      fetchCustomers: async () => [makeCustomer(1)],
      sleep: async () => {},
    });
    const run = fixtures.state.runs[0];
    expect(run.status).toBe("cancelled");
    expect(run.error).toContain("Automation is paused");
    expect(run.sent).toBe(0);
  });

  it("proceeds normally when automation is enabled", async () => {
    const runId = await createRun("manual");
    let senderCalled = false;
    await processBatch(runId, {
      isAutomationEnabled: async () => true,
      fetchCustomers: async () => [makeCustomer(1)],
      senderFactory: async () => ({
        send: async () => {
          senderCalled = true;
          return undefined;
        },
        close: async () => {},
      }),
      sleep: async () => {},
    });
    const run = fixtures.state.runs[0];
    expect(run.status).toBe("completed");
    expect(senderCalled).toBe(true);
  });

  it("does not send any texts when paused", async () => {
    const runId = await createRun("manual");
    let sendCount = 0;
    await processBatch(runId, {
      isAutomationEnabled: async () => false,
      fetchCustomers: async () => [1, 2, 3].map(makeCustomer),
      senderFactory: async () => ({
        send: async () => {
          sendCount++;
          return undefined;
        },
        close: async () => {},
      }),
      sleep: async () => {},
    });
    expect(sendCount).toBe(0);
  });
});
