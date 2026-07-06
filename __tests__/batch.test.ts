import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted runs before imports, so anything the mock factories need must
// be created inside here. We expose mutable state that individual tests can
// reset and inspect.
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
    last_status?: string | null;
    last_error?: string | null;
    last_attempt_at?: string | null;
  }
  const state: { runs: RunRow[]; customers: CustomerRow[] } = {
    runs: [],
    customers: [],
  };

  // Minimal Supabase chain — only the surface area batch.ts uses.
  function buildChain(table: "runs" | "customers") {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let limitN: number | null = null;
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;

    function tableRef(): Record<string, unknown>[] {
      return (table === "runs"
        ? state.runs
        : state.customers) as unknown as Record<string, unknown>[];
    }
    function applyFilters(): Record<string, unknown>[] {
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
      upsert(row: Record<string, unknown>) {
        pendingUpsert = row;
        return chain;
      },
      update(patch: Record<string, unknown>) {
        pendingUpdate = patch;
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
      limit(n: number) {
        limitN = n;
        return chain;
      },
      async maybeSingle() {
        const rows = applyFilters();
        return { data: rows[0] ?? null, error: null };
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
        if (pendingUpsert) {
          const t = tableRef();
          const key = table === "customers" ? "qb_customer_id" : "id";
          const pk = pendingUpsert![key];
          const idx = t.findIndex((r) => r[key] === pk);
          if (idx >= 0) {
            Object.assign(t[idx], pendingUpsert);
          } else {
            t.push({ ...pendingUpsert });
          }
          resolve({ data: null, error: null });
          return;
        }
        let rows = applyFilters();
        if (limitN !== null) rows = rows.slice(0, limitN);
        resolve({ data: rows, error: null });
      },
    };
    return chain;
  }

  const supabaseAdmin = {
    from: (table: string) => buildChain(table as "runs" | "customers"),
  };

  return { state, supabaseAdmin };
});

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: fixtures.supabaseAdmin,
}));

// getMessageTemplate hits Supabase — return the default template instead.
vi.mock("../lib/message", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/message")>();
  return {
    ...actual,
    getMessageTemplate: async () => actual.DEFAULT_TEMPLATE,
  };
});

// Guarantee the Twilio sender isn't actually called in tests.
vi.mock("../lib/sms", () => ({
  createTwilioSender: async () => ({
    send: async () => {},
    close: async () => {},
  }),
}));

// Import AFTER the mocks so the module under test picks up our fakes.
import {
  processBatch,
  createRun,
  hasActiveRun,
  buildMessage,
} from "../lib/batch";
import type { SmsSender } from "../lib/sms";
import type { QbCustomer } from "../lib/quickbooks";

function resetState() {
  fixtures.state.runs = [];
  fixtures.state.customers = [];
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

function makeSender(opts: { failIndexes?: number[] } = {}) {
  const sent: Array<{ phone: string; message: string }> = [];
  let callCount = 0;
  const sender: SmsSender = {
    async send(phone: string, message: string) {
      const idx = callCount++;
      if (opts.failIndexes?.includes(idx)) {
        throw new Error(`simulated failure at index ${idx}`);
      }
      sent.push({ phone, message });
    },
    async close() {},
  };
  return { sender, sent, factory: async () => sender };
}

describe("batch.processBatch", () => {
  beforeEach(resetState);

  it("sends to all valid, not-yet-texted customers", async () => {
    const runId = await createRun("manual");
    const customers = [1, 2, 3].map((i) => makeCustomer(i));
    const { sent, factory } = makeSender();

    await processBatch(runId, {
      senderFactory: factory,
      fetchCustomers: async () => customers,
      sleep: async () => {},
    });

    expect(sent).toHaveLength(3);
    expect(sent[0].phone).toBe("2095551201");

    const run = fixtures.state.runs[0];
    expect(run.status).toBe("completed");
    expect(run.total).toBe(3);
    expect(run.sent).toBe(3);
    expect(run.skipped).toBe(0);
    expect(run.failed).toBe(0);
  });

  it("skips customers already texted", async () => {
    fixtures.state.customers.push({
      qb_customer_id: "qb-2",
      name: "Customer 2",
      phone: "2095551202",
      texted_at: new Date().toISOString(),
    });
    const runId = await createRun("manual");
    const customers = [1, 2, 3].map((i) => makeCustomer(i));
    const { sent, factory } = makeSender();

    await processBatch(runId, {
      senderFactory: factory,
      fetchCustomers: async () => customers,
      sleep: async () => {},
    });

    expect(sent.map((s) => s.phone)).toEqual(["2095551201", "2095551203"]);
    const run = fixtures.state.runs[0];
    expect(run.sent).toBe(2);
    expect(run.skipped).toBe(1);
    expect(run.total).toBe(3);
  });

  it("skips invalid phone numbers without calling the sender for them", async () => {
    const runId = await createRun("manual");
    const customers = [
      makeCustomer(1, { phone: "not-a-number" }),
      makeCustomer(2, { phone: "2095551202" }),
    ];
    const { sent, factory } = makeSender();

    await processBatch(runId, {
      senderFactory: factory,
      fetchCustomers: async () => customers,
      sleep: async () => {},
    });

    expect(sent).toHaveLength(1);
    const run = fixtures.state.runs[0];
    expect(run.sent).toBe(1);
    expect(run.skipped).toBe(1);
    expect(run.results).toMatchObject([
      { qb_customer_id: "qb-1", status: "invalid_phone" },
      { qb_customer_id: "qb-2", status: "sent" },
    ]);
  });

  it("continues after a send failure instead of aborting the batch", async () => {
    const runId = await createRun("manual");
    const customers = [1, 2, 3, 4].map((i) => makeCustomer(i));
    const { sent, factory } = makeSender({ failIndexes: [1] });

    await processBatch(runId, {
      senderFactory: factory,
      fetchCustomers: async () => customers,
      sleep: async () => {},
    });

    expect(sent).toHaveLength(3);
    const run = fixtures.state.runs[0];
    expect(run.sent).toBe(3);
    expect(run.failed).toBe(1);
    expect(run.skipped).toBe(0);
    expect(run.status).toBe("completed");
    const results = run.results as Array<{ status: string }>;
    expect(results.some((r) => r.status === "error")).toBe(true);
  });

  it("enforces the daily cap and marks overflow as over_cap", async () => {
    const runId = await createRun("manual");
    const customers = [1, 2, 3, 4, 5].map((i) => makeCustomer(i));
    const { sent, factory } = makeSender();

    await processBatch(runId, {
      senderFactory: factory,
      fetchCustomers: async () => customers,
      sleep: async () => {},
      dailyCap: 2,
    });

    expect(sent).toHaveLength(2);
    const run = fixtures.state.runs[0];
    expect(run.sent).toBe(2);
    expect(run.skipped).toBe(3);
    const results = run.results as Array<{ status: string }>;
    expect(results.filter((r) => r.status === "over_cap")).toHaveLength(3);
  });

  it("marks run as failed if the customer fetch throws", async () => {
    const runId = await createRun("manual");

    await processBatch(runId, {
      senderFactory: async () => {
        throw new Error("should never boot browser");
      },
      fetchCustomers: async () => {
        throw new Error("QuickBooks down");
      },
      sleep: async () => {},
    });

    const run = fixtures.state.runs[0];
    expect(run.status).toBe("failed");
    expect(run.error).toContain("QuickBooks down");
  });

  it("does not boot the browser if everything is already-texted or invalid", async () => {
    fixtures.state.customers.push({
      qb_customer_id: "qb-1",
      name: "Customer 1",
      phone: "2095551201",
      texted_at: new Date().toISOString(),
    });
    const runId = await createRun("manual");
    const customers = [makeCustomer(1), makeCustomer(2, { phone: "bad" })];

    let factoryCalled = false;
    await processBatch(runId, {
      senderFactory: async () => {
        factoryCalled = true;
        return { send: async () => {}, close: async () => {} };
      },
      fetchCustomers: async () => customers,
      sleep: async () => {},
    });

    expect(factoryCalled).toBe(false);
    const run = fixtures.state.runs[0];
    expect(run.sent).toBe(0);
    expect(run.skipped).toBe(2);
    expect(run.status).toBe("completed");
  });

  it("completes cleanly when there are zero customers", async () => {
    const runId = await createRun("manual");
    const { factory } = makeSender();

    await processBatch(runId, {
      senderFactory: factory,
      fetchCustomers: async () => [],
      sleep: async () => {},
    });

    const run = fixtures.state.runs[0];
    expect(run.status).toBe("completed");
    expect(run.total).toBe(0);
  });
});

describe("batch.hasActiveRun", () => {
  beforeEach(resetState);

  it("returns true when a run is running", async () => {
    await createRun("manual");
    expect(await hasActiveRun()).toBe(true);
  });

  it("returns false when the last run completed", async () => {
    fixtures.state.runs.push({
      id: "r-1",
      status: "completed",
      source: "manual",
      total: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
    expect(await hasActiveRun()).toBe(false);
  });
});

describe("batch.buildMessage", () => {
  it("includes the first name and review link", () => {
    const msg = buildMessage("Alex");
    expect(msg).toContain("Hi Alex!");
    expect(msg).toContain("https://");
  });
});
