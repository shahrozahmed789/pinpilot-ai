-- Run in Supabase Dashboard > SQL Editor. Service-role credentials must remain server-only.
create extension if not exists pgcrypto;

create table if not exists public.account_tokens (
  id text primary key check (id = 'primary'),
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_settings (
  id text primary key check (id = 'primary'),
  niche text not null,
  audience text not null default 'United States',
  destination_url text not null,
  daily_pin_limit integer not null default 2 check (daily_pin_limit between 1 and 5),
  timezone text not null default 'UTC',
  board_id text,
  board_name text,
  enabled boolean not null default false,
  last_batch_date date,
  last_batch_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.pin_queue (
  id uuid primary key default gen_random_uuid(),
  board_id text not null,
  title text not null,
  description text not null,
  image_url text not null,
  destination_url text,
  scheduled_at timestamptz not null,
  status text not null default 'queued',
  pinterest_pin_id text,
  last_error text,
  attempt_count integer not null default 0,
  source_keywords text[] not null default '{}',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pin_queue_status_check check (status in ('queued','publishing','published','failed','cancelled'))
);

-- Existing MVP installs: add new columns and update the old status constraint safely.
alter table public.pin_queue add column if not exists attempt_count integer not null default 0;
alter table public.pin_queue add column if not exists source_keywords text[] not null default '{}';
alter table public.pin_queue add column if not exists source text;
alter table public.pin_queue drop constraint if exists pin_queue_status_check;
alter table public.pin_queue add constraint pin_queue_status_check check (status in ('queued','publishing','published','failed','cancelled'));

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'started',
  summary text,
  error_text text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null default current_date,
  impressions bigint,
  saves bigint,
  outbound_clicks bigint,
  total_pins bigint,
  raw_payload jsonb,
  captured_at timestamptz not null default now()
);

alter table public.account_tokens enable row level security;
alter table public.automation_settings enable row level security;
alter table public.pin_queue enable row level security;
alter table public.automation_runs enable row level security;
alter table public.analytics_snapshots enable row level security;
-- This private app accesses these tables only through the server-side Supabase service role.
-- Do not add public policies or expose SUPABASE_SERVICE_ROLE_KEY to the browser.

create table if not exists public.research_snapshots (
  id uuid primary key default gen_random_uuid(),
  niche text not null,
  region text not null default 'US',
  trend_data jsonb not null default '[]'::jsonb,
  suggested_terms jsonb not null default '[]'::jsonb,
  competitor_pins jsonb not null default '[]'::jsonb,
  source_status jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now()
);
alter table public.research_snapshots enable row level security;
