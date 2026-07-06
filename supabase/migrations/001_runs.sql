-- Runs table: one row per Run Now / cron invocation.
-- Tracks progress, per-customer results, and errors so the UI can poll live status
-- and we have a persistent audit trail even if the browser crashes mid-run.
--
-- Apply in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create table if not exists runs (
  id uuid default gen_random_uuid() primary key,
  status text not null default 'running', -- running | completed | failed | cancelled
  source text not null default 'manual',  -- manual | cron
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total int not null default 0,
  sent int not null default 0,
  skipped int not null default 0,
  failed int not null default 0,
  results jsonb not null default '[]'::jsonb, -- [{name, phone, status, error?}]
  error text
);

create index if not exists runs_started_at_idx on runs (started_at desc);
create index if not exists runs_status_idx on runs (status);

alter table runs disable row level security;

-- Also add a last_error column to customers so per-customer failures persist
-- without having to reopen the JSONB on runs.
alter table customers add column if not exists last_status text;
alter table customers add column if not exists last_error text;
alter table customers add column if not exists last_attempt_at timestamptz;
