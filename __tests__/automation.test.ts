import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, runs } from "./db-helpers";

vi.mock("../lib/sms", () => ({
  createTwilioSender: async () => ({
    send: async () => undefined,
    close: async () => {},
  }),
}));

import { processBatch, createRun } from "../lib/batch";
import type { QbCustomer } from "../lib/quickbooks";

function makeCustomer(i: number): QbCustomer {
  return {
    qb_customer_id: `qb-${i}`,
    name: `Customer ${i}`,
    phone: `20955512${String(i).padStart(2, "0")}`,
  };
}

describe("processBatch: automation pause", () => {
  beforeEach(resetDb);

  it("cancels the run immediately when automation is disabled", async () => {
    const runId = await createRun("manual");
    await processBatch(runId, {
      isAutomationEnabled: async () => false,
      fetchCustomers: async () => [makeCustomer(1)],
      sleep: async () => {},
    });
    const run = runs()[0];
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
    const run = runs()[0];
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
