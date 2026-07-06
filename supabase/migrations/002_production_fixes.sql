-- Apply in Supabase: Dashboard > SQL Editor > New query > paste > Run.

-- Atomic active-run guard: at most one run in 'running' state at a time.
-- This replaces the non-atomic hasActiveRun() pre-check. The unique index
-- causes the INSERT in createRun() to fail with code 23505 if a run is
-- already active, which the caller handles as a 409.
CREATE UNIQUE INDEX IF NOT EXISTS at_most_one_active_run
  ON runs ((true))
  WHERE status = 'running';

-- Opt-out registry. Phones that replied STOP or were blocked by Twilio (21610).
-- Checked before every send attempt; also written to by the Twilio webhook.
CREATE TABLE IF NOT EXISTS opt_outs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text        UNIQUE NOT NULL,  -- 10-digit US, no country code
  reason     text        NOT NULL DEFAULT 'stop_reply',  -- stop_reply | twilio_blocked | manual
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opt_outs_phone_idx ON opt_outs (phone);
ALTER TABLE opt_outs DISABLE ROW LEVEL SECURITY;

-- Re-text eligibility window. NULL = never re-text (legacy rows keep this behavior).
-- Set to NOW() + RETEXT_DAYS on every successful send.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS next_eligible_at timestamptz;
