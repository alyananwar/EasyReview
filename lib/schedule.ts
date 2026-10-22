import { cleanStuckRuns, createRun, processBatch } from "./batch";
import { backupDatabase, getSettings } from "./db";

// Hours (shop local time) when the automatic run fires. Every 2 hours,
// 9am-5pm by default, so texts go out the same day as the invoice.
export const RUN_HOURS = (process.env.RUN_HOURS || "9,11,13,15,17")
  .split(",")
  .map((h) => parseInt(h.trim(), 10))
  .filter((h) => h >= 0 && h <= 23);
const TICK_MS = 60 * 1000;

export function isInQuietHours(
  timezone: string,
  startHHMM: string,
  endHHMM: string,
  now: Date = new Date(),
): boolean {
  try {
    const { h, m } = localTime(timezone, now);
    const cur = h * 60 + m;
    const [sh, sm] = startHHMM.split(":").map(Number);
    const [eh, em] = endHHMM.split(":").map(Number);
    const start = (sh || 0) * 60 + (sm || 0);
    const end = (eh || 0) * 60 + (em || 0);
    // Handles overnight ranges (e.g. 20:00 -> 08:00)
    return start > end ? cur >= start || cur < end : cur >= start && cur < end;
  } catch {
    return false;
  }
}

function localTime(
  timezone: string,
  now: Date,
): { h: number; m: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    h: parseInt(get("hour"), 10) % 24,
    m: parseInt(get("minute"), 10),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export type StartResult =
  | { status: "started"; runId: string }
  | { status: "skipped"; reason: "automation_paused" | "quiet_hours" };

// Shared by the in-process scheduler and the /api/cron endpoint.
// Throws with code ACTIVE_RUN when a run is already going.
export async function startAutomaticRun(): Promise<StartResult> {
  const s = getSettings([
    "automation_enabled",
    "business_timezone",
    "quiet_hours_start",
    "quiet_hours_end",
  ]);
  if (s["automation_enabled"] === "false") {
    return { status: "skipped", reason: "automation_paused" };
  }
  if (
    isInQuietHours(
      s["business_timezone"] ?? "America/Los_Angeles",
      s["quiet_hours_start"] ?? "20:00",
      s["quiet_hours_end"] ?? "08:00",
    )
  ) {
    return { status: "skipped", reason: "quiet_hours" };
  }

  await cleanStuckRuns();
  const runId = await createRun("cron");
  processBatch(runId).catch((err) =>
    console.error("Scheduled batch error:", err),
  );
  return { status: "started", runId };
}

// Fires once per scheduled hour and backs up the database once a day.
// ponytail: minute-tick loop, fine for one shop; a missed tick (sleep/reboot
// across the top of the hour) skips that slot until the next one.
export function startScheduler(): void {
  let lastSlot = "";
  let lastBackup = "";

  const tick = async () => {
    const tz = getSettings(["business_timezone"])["business_timezone"];
    const { h, m, date } = localTime(tz ?? "America/Los_Angeles", new Date());

    if (date !== lastBackup) {
      lastBackup = date;
      try {
        backupDatabase(date);
      } catch (err) {
        console.error("Database backup failed:", err);
      }
    }

    const slot = `${date}T${h}`;
    if (!RUN_HOURS.includes(h) || m > 5 || slot === lastSlot) return;
    lastSlot = slot;
    try {
      const result = await startAutomaticRun();
      console.log(`[scheduler] ${slot}:`, JSON.stringify(result));
    } catch (err) {
      console.error(`[scheduler] ${slot} failed to start:`, err);
    }
  };

  // A fresh process means no run can still be in progress.
  cleanStuckRuns(0).catch((err) => console.error("Startup cleanup:", err));
  setInterval(() => void tick(), TICK_MS);
  void tick();
  console.log(`[scheduler] started, run hours: ${RUN_HOURS.join(", ")}`);
}
