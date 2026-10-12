-- Run in Supabase Dashboard > SQL Editor. Do not expose the service-role key in the browser.
create table if not exists public.account_tokens (
  id text primary key check (id = 'primary'),
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz not null,
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
  status text not null default 'queued' check (status in ('queued','published','failed','cancelled')),
  pinterest_pin_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Service-role access is server-side only. Enable RLS as defense in depth.
alter table public.account_tokens enable row level security;
alter table public.pin_queue enable row level security;
