// Tests run against a real in-memory SQLite database (DB_PATH=":memory:"
// in vitest.config.ts), so these helpers just seed and read tables.
import { getDb, newId, nowIso } from "../lib/db";

export interface RunRecord {
  id: string;
  status: string;
  source: string;
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  results: Array<{ qb_customer_id: string; status: string }>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export function resetDb(): void {
  getDb().exec(
    "DELETE FROM message_attempts; DELETE FROM runs; DELETE FROM customers; DELETE FROM opt_outs; DELETE FROM settings;",
  );
}

export function runs(): RunRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM runs ORDER BY started_at, rowid")
    .all() as unknown as Array<RunRecord & { results: string }>;
  return rows.map((r) => ({ ...r, results: JSON.parse(r.results) }));
}

export function seedCustomer(
  qbId: string,
  fields: { texted_at?: string | null; next_eligible_at?: string | null } = {},
): void {
  getDb()
    .prepare(
      `INSERT INTO customers (id, qb_customer_id, name, phone, texted_at, next_eligible_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      qbId,
      `Customer ${qbId}`,
      "2095551200",
      fields.texted_at ?? null,
      fields.next_eligible_at ?? null,
      nowIso(),
    );
}

export function seedOptOut(phone: string): void {
  getDb()
    .prepare(
      "INSERT INTO opt_outs (id, phone, reason, created_at) VALUES (?, ?, 'manual', ?)",
    )
    .run(newId(), phone, nowIso());
}

export function seedRun(status: string): string {
  const id = newId();
  getDb()
    .prepare(
      "INSERT INTO runs (id, status, source, started_at, finished_at) VALUES (?, ?, 'manual', ?, ?)",
    )
    .run(id, status, nowIso(), status === "running" ? null : nowIso());
  return id;
}
