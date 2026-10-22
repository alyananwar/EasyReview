import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, runs, seedCustomer, seedRun } from "./db-helpers";

vi.mock("../lib/message", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/message")>();
  return { ...actual, getMessageTemplate: async () => actual.DEFAULT_TEMPLATE };
});

import {
  cleanStuckRuns,
  createRun,
  processBatch,
  sendAlert,
} from "../lib/batch";
import { getDb, optedOutPhones } from "../lib/db";
import { isInQuietHours } from "../lib/schedule";
import type { SmsSender } from "../lib/sms";

function recordingSender() {
  const sent: Array<{ to: string; body: string }> = [];
  const sender: SmsSender = {
    async send(to, body) {
      sent.push({ to, body });
      return "SM123";
    },
    async close() {},
  };
  return { sent, factory: async () => sender };
}

const customer = {
  qb_customer_id: "qb-1",
  name: "Pat Lee",
  phone: "(209) 555-1201",
};

describe("active run lock", () => {
  beforeEach(resetDb);

  it("refuses a second run while one is running", async () => {
    await createRun("cron");
    await expect(createRun("manual")).rejects.toMatchObject({
      code: "ACTIVE_RUN",
    });
  });

  it("startup cleanup (olderThanMs=0) frees the lock", async () => {
    await createRun("cron");
    await cleanStuckRuns(0);
    expect(runs()[0].status).toBe("failed");
    await expect(createRun("manual")).resolves.toBeTypeOf("string");
  });
});

describe("send results in the database", () => {
  beforeEach(resetDb);

  it("a failed retry does not erase an earlier texted_at", async () => {
    const longAgo = new Date(Date.now() - 100 * 86_400_000).toISOString();
    seedCustomer("qb-1", {
      texted_at: longAgo,
      next_eligible_at: new Date(Date.now() - 1000).toISOString(),
    });
    const runId = await createRun("manual");
    await processBatch(runId, {
      fetchCustomers: async () => [customer],
      senderFactory: async () => ({
        send: async () => {
          throw new Error("carrier rejected");
        },
        close: async () => {},
      }),
      sleep: async () => {},
    });
    const row = getDb()
      .prepare("SELECT texted_at, last_status, last_error FROM customers")
      .get() as { texted_at: string; last_status: string; last_error: string };
    expect(row.texted_at).toBe(longAgo);
    expect(row.last_status).toBe("error");
    expect(row.last_error).toBe("carrier rejected");
  });

  it("Twilio 21610 adds the phone to opt-outs", async () => {
    const runId = await createRun("manual");
    await processBatch(runId, {
      fetchCustomers: async () => [customer],
      senderFactory: async () => ({
        send: async () => {
          throw Object.assign(new Error("unsubscribed"), { code: 21610 });
        },
        close: async () => {},
      }),
      sleep: async () => {},
    });
    expect(optedOutPhones(["2095551201"]).has("2095551201")).toBe(true);
  });

  it("a successful send sets texted_at and blocks the next run", async () => {
    const { sent, factory } = recordingSender();
    const first = await createRun("cron");
    await processBatch(first, {
      fetchCustomers: async () => [customer],
      senderFactory: factory,
      sleep: async () => {},
    });
    const second = await createRun("cron");
    await processBatch(second, {
      fetchCustomers: async () => [customer],
      senderFactory: factory,
      sleep: async () => {},
    });
    expect(sent).toHaveLength(1);
    expect(runs()[1].results[0].status).toBe("already_texted");
  });
});

describe("rolling 24h cap", () => {
  beforeEach(resetDb);

  it("counts texts from earlier runs today against DAILY_CAP", async () => {
    const { sent, factory } = recordingSender();
    const morning = await createRun("cron");
    await processBatch(morning, {
      fetchCustomers: async () => [customer],
      senderFactory: factory,
      sleep: async () => {},
      dailyCap: 2,
    });
    const afternoon = await createRun("cron");
    const more = [2, 3, 4].map((i) => ({
      qb_customer_id: `qb-${i}`,
      name: `C ${i}`,
      phone: `20955512${i}0`,
    }));
    await processBatch(afternoon, {
      fetchCustomers: async () => more,
      senderFactory: factory,
      sleep: async () => {},
      dailyCap: 2,
    });
    expect(sent).toHaveLength(2);
    const statuses = runs()[1].results.map((r) => r.status);
    expect(statuses).toEqual(["sent", "over_cap", "over_cap"]);
  });
});

describe("re-text window", () => {
  beforeEach(resetDb);

  async function runTwice(retextDays: number) {
    const { sent, factory } = recordingSender();
    for (let i = 0; i < 2; i++) {
      const id = await createRun("cron");
      await processBatch(id, {
        fetchCustomers: async () => [customer],
        senderFactory: factory,
        sleep: async () => {},
        retextDays,
      });
    }
    return sent.length;
  }

  it("RETEXT_DAYS=0 texts a customer once, ever", async () => {
    expect(await runTwice(0)).toBe(1);
    const row = getDb()
      .prepare("SELECT next_eligible_at FROM customers")
      .get() as { next_eligible_at: string | null };
    expect(row.next_eligible_at).toBeNull();
  });

  it("RETEXT_DAYS=90 blocks the next run", async () => {
    expect(await runTwice(90)).toBe(1);
  });
});

describe("sendAlert", () => {
  beforeEach(() => {
    resetDb();
    process.env.ALERT_PHONE = "209-555-0199";
  });
  afterEach(() => {
    delete process.env.ALERT_PHONE;
  });

  it("texts the admin phone", async () => {
    seedRun("completed");
    const current = seedRun("failed");
    const { sent, factory } = recordingSender();
    await sendAlert(current, "run failed: boom", factory);
    expect(sent).toEqual([
      { to: "2095550199", body: "EasyReview alert: run failed: boom" },
    ]);
  });

  it("stays quiet when the previous run already failed", async () => {
    seedRun("failed");
    const current = seedRun("failed");
    const { sent, factory } = recordingSender();
    await sendAlert(current, "run failed: boom", factory);
    expect(sent).toHaveLength(0);
  });

  it("does nothing without ALERT_PHONE", async () => {
    delete process.env.ALERT_PHONE;
    const { sent, factory } = recordingSender();
    await sendAlert(seedRun("failed"), "x", factory);
    expect(sent).toHaveLength(0);
  });
});

describe("isInQuietHours", () => {
  // 2026-10-22 is PDT (UTC-7).
  const at = (utc: string) => new Date(`2026-10-22T${utc}:00Z`);
  const tz = "America/Los_Angeles";

  it("handles the overnight 20:00-08:00 window", () => {
    expect(isInQuietHours(tz, "20:00", "08:00", at("16:00"))).toBe(false); // 9am
    expect(isInQuietHours(tz, "20:00", "08:00", at("04:00"))).toBe(true); // 9pm
    expect(isInQuietHours(tz, "20:00", "08:00", at("14:30"))).toBe(true); // 7:30am
  });
});
