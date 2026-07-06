-- Enable row level security on every table, with no policies.
-- Apply in Supabase: Dashboard > SQL Editor > New query > paste > Run.
--
-- Why: the app only talks to the database through API routes using the
-- service-role key, which bypasses RLS. Enabling RLS with zero policies
-- blocks the public anon key (and any PostgREST caller without the service
-- key) from reading or writing anything, closing off direct database access.
-- Nothing in the app changes — supabaseAdmin keeps full access.

ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE opt_outs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attempts ENABLE ROW LEVEL SECURITY;
