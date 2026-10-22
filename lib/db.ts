import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, unlinkSync } from "fs";
import path from "path";

// Single SQLite file on the shop PC. One Node process owns it, so there is no
// connection pool and no network database to pause or expire.
// ponytail: single-tenant, one file per shop; move to Postgres if we ever go multi-tenant.

const DATA_DIR = path.join(process.cwd(), "data");
const BACKUP_KEEP = 14;

// Timestamps are ISO-8601 UTC strings (same format as Date.toISOString()),
// so string comparison orders them correctly.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS customers (
  id               TEXT PRIMARY KEY,
  qb_customer_id   TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL,
  texted_at        TEXT,
  next_eligible_at TEXT,
  last_status      TEXT,
  last_error       TEXT,
  last_attempt_at  TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'running', -- running | completed | failed | cancelled
  source      TEXT NOT NULL DEFAULT 'manual',  -- manual | cron
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  total       INTEGER NOT NULL DEFAULT 0,
  sent        INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  results     TEXT NOT NULL DEFAULT '[]',      -- JSON array of attempts
  error       TEXT
);
CREATE INDEX IF NOT EXISTS runs_started_at_idx ON runs (started_at DESC);
-- At most one run in 'running' state. createRun() relies on this to be atomic.
CREATE UNIQUE INDEX IF NOT EXISTS at_most_one_active_run ON runs (status) WHERE status = 'running';

-- Phones that replied STOP or were blocked by Twilio (21610). 10-digit US.
CREATE TABLE IF NOT EXISTS opt_outs (
  id         TEXT PRIMARY KEY,
  phone      TEXT UNIQUE NOT NULL,
  reason     TEXT NOT NULL DEFAULT 'stop_reply', -- stop_reply | twilio_blocked | manual
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_attempts (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  qb_customer_id      TEXT NOT NULL,
  customer_name       TEXT NOT NULL,
  phone               TEXT NOT NULL,
  status              TEXT NOT NULL,
  provider            TEXT NOT NULL DEFAULT 'twilio',
  provider_message_id TEXT,
  error_code          TEXT,
  error_message       TEXT,
  sent_at             TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS message_attempts_run_id_idx ON message_attempts (run_id);
`;

function dbPath(): string {
  return process.env.DB_PATH || path.join(DATA_DIR, "easyreview.db");
}

function open(): DatabaseSync {
  const file = dbPath();
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(
    "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
  );
  db.exec(SCHEMA);
  return db;
}

// Cached on globalThis so every route bundle (and dev hot reloads) share one handle.
const g = globalThis as { __easyreviewDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__easyreviewDb) g.__easyreviewDb = open();
  return g.__easyreviewDb;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function getSettings(keys: readonly string[]): Record<string, string> {
  const rows = getDb()
    .prepare(
      "SELECT key, value FROM settings WHERE key IN (SELECT value FROM json_each(?))",
    )
    .all(JSON.stringify(keys)) as Array<{ key: string; value: string }>;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function addOptOut(phone: string, reason: string): void {
  getDb()
    .prepare(
      "INSERT INTO opt_outs (id, phone, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET reason = excluded.reason",
    )
    .run(newId(), phone, reason, nowIso());
}

// Phones from `phones` that are on the opt-out list.
export function optedOutPhones(phones: string[]): Set<string> {
  if (phones.length === 0) return new Set();
  const rows = getDb()
    .prepare(
      "SELECT phone FROM opt_outs WHERE phone IN (SELECT value FROM json_each(?))",
    )
    .all(JSON.stringify(phones)) as Array<{ phone: string }>;
  return new Set(rows.map((r) => r.phone));
}

// QuickBooks customer ids that were texted and are not yet eligible again.
export function recentlyTextedIds(
  qbIds: string[],
  now = nowIso(),
): Set<string> {
  if (qbIds.length === 0) return new Set();
  const rows = getDb()
    .prepare(
      `SELECT qb_customer_id FROM customers
       WHERE qb_customer_id IN (SELECT value FROM json_each(?))
         AND texted_at IS NOT NULL
         AND (next_eligible_at IS NULL OR next_eligible_at > ?)`,
    )
    .all(JSON.stringify(qbIds), now) as Array<{ qb_customer_id: string }>;
  return new Set(rows.map((r) => r.qb_customer_id));
}

// Texts actually sent in the last 24 hours, across all runs. DAILY_CAP is
// measured against this, since the scheduler runs several times a day.
export function sentInLast24h(): number {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM message_attempts WHERE status = 'sent' AND sent_at > ?",
    )
    .get(since) as { n: number };
  return row.n;
}

// Consistent point-in-time copy via VACUUM INTO, one file per day, last 14 kept.
export function backupDatabase(date = nowIso().slice(0, 10)): string | null {
  if (dbPath() === ":memory:") return null;
  const dir = path.join(path.dirname(dbPath()), "backups");
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `easyreview-${date}.db`);
  try {
    unlinkSync(target);
  } catch {
    // no backup yet today
  }
  getDb().prepare("VACUUM INTO ?").run(target);

  const old = readdirSync(dir)
    .filter((f) => /^easyreview-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -BACKUP_KEEP);
  for (const f of old) unlinkSync(path.join(dir, f));
  return target;
}
