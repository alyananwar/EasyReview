-- Run this in your Supabase SQL editor (Dashboard > SQL Editor > New query)

create table if not exists customers (
  id uuid default gen_random_uuid() primary key,
  qb_customer_id text unique not null,
  name text not null,
  phone text not null,
  texted_at timestamptz default null,
  created_at timestamptz default now()
);

create table if not exists settings (
  key text primary key,
  value text
);

-- Disable row level security for now (enable later when adding auth)
alter table customers disable row level security;
alter table settings disable row level security;
