-- message_attempts: one row per send/skip attempt, for analytics and support.
-- Apply in Supabase: Dashboard > SQL Editor > New query > paste > Run.

CREATE TABLE IF NOT EXISTS message_attempts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  qb_customer_id      text        NOT NULL,
  customer_name       text        NOT NULL,
  phone               text        NOT NULL,
  status              text        NOT NULL,  -- sent | already_texted | invalid_phone | opted_out | over_cap | error
  provider            text        NOT NULL DEFAULT 'twilio',
  provider_message_id text,
  error_code          text,
  error_message       text,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_attempts_run_id_idx         ON message_attempts (run_id);
CREATE INDEX IF NOT EXISTS message_attempts_qb_customer_idx    ON message_attempts (qb_customer_id);
CREATE INDEX IF NOT EXISTS message_attempts_created_at_idx     ON message_attempts (created_at DESC);

ALTER TABLE message_attempts DISABLE ROW LEVEL SECURITY;

-- Default settings for new features (safe to re-run; ON CONFLICT DO NOTHING).
INSERT INTO settings (key, value) VALUES ('automation_enabled', 'true')             ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('business_timezone', 'America/Los_Angeles') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('quiet_hours_start', '20:00')             ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('quiet_hours_end',   '08:00')             ON CONFLICT (key) DO NOTHING;
