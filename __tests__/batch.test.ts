import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, runs, seedCustomer, seedRun } from "./db-helpers";

// Pin the message template to the default.
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
      return undefined;
    },
    async close() {},
  };
  return { sender, sent, factory: async () => sender };
}

describe("batch.processBatch", () => {
  beforeEach(resetDb);

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

    const run = runs()[0];
    expect(run.status).toBe("completed");
    expect(run.total).toBe(3);
    expect(run.sent).toBe(3);
    expect(run.skipped).toBe(0);
    expect(run.failed).toBe(0);
  });

  it("skips customers already texted", async () => {
    seedCustomer("qb-2", { texted_at: new Date().toISOString() });
    const runId = await createRun("manual");
    const customers = [1, 2, 3].map((i) => makeCustomer(i));
    const { sent, factory } = makeSender();

    await processBatch(runId, {
      senderFactory: factory,
      fetchCustomers: async () => customers,
      sleep: async () => {},
    });

    expect(sent.map((s) => s.phone)).toEqual(["2095551201", "2095551203"]);
    const run = runs()[0];
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
    const run = runs()[0];
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
    const run = runs()[0];
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
    const run = runs()[0];
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

    const run = runs()[0];
    expect(run.status).toBe("failed");
    expect(run.error).toContain("QuickBooks down");
  });

  it("does not boot the browser if everything is already-texted or invalid", async () => {
    seedCustomer("qb-1", { texted_at: new Date().toISOString() });
    const runId = await createRun("manual");
    const customers = [makeCustomer(1), makeCustomer(2, { phone: "bad" })];

    let factoryCalled = false;
    await processBatch(runId, {
      senderFactory: async () => {
        factoryCalled = true;
        return { send: async () => undefined, close: async () => {} };
      },
      fetchCustomers: async () => customers,
      sleep: async () => {},
    });

    expect(factoryCalled).toBe(false);
    const run = runs()[0];
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

    const run = runs()[0];
    expect(run.status).toBe("completed");
    expect(run.total).toBe(0);
  });
});

describe("batch.hasActiveRun", () => {
  beforeEach(resetDb);

  it("returns true when a run is running", async () => {
    await createRun("manual");
    expect(await hasActiveRun()).toBe(true);
  });

  it("returns false when the last run completed", async () => {
    seedRun("completed");
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
