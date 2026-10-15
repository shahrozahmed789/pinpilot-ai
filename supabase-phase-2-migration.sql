-- PinPilot Phase 2 additive migration. Safe to run on the existing project.
-- Adds Buffer publishing metadata without dropping existing queued records.
alter table public.pin_queue add column if not exists buffer_post_id text;
alter table public.pin_queue add column if not exists source_url text;
alter table public.pin_queue add column if not exists product_snapshot jsonb;
alter table public.pin_queue add column if not exists idempotency_key text;
alter table public.pin_queue add column if not exists published_at timestamptz;
alter table public.pin_queue add column if not exists quality_checks jsonb not null default '{}'::jsonb;
alter table public.pin_queue add column if not exists last_error text;
alter table public.pin_queue add column if not exists attempt_count integer not null default 0;
alter table public.pin_queue add column if not exists source_keywords text[] not null default '{}';
alter table public.pin_queue add column if not exists source text;
alter table public.pin_queue add column if not exists pinterest_pin_id text;
alter table public.automation_settings alter column timezone set default 'America/Los_Angeles';

alter table public.pin_queue drop constraint if exists pin_queue_status_check;
alter table public.pin_queue add constraint pin_queue_status_check check (status in ('queued','publishing','published','buffer_draft','buffer_scheduled','review_required','failed','cancelled'));
drop index if exists public.pin_queue_idempotency_key_unique;
create unique index if not exists pin_queue_idempotency_key_unique on public.pin_queue(idempotency_key);
create index if not exists pin_queue_due_idx on public.pin_queue(status, scheduled_at) where status = 'queued';

create table if not exists public.site_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  canonical_url text,
  site_type text not null default 'website',
  title text,
  description text,
  product_name text,
  price_text text,
  image_urls jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  extracted_content jsonb not null default '{}'::jsonb,
  source_status text not null default 'available',
  captured_at timestamptz not null default now()
);
alter table public.site_snapshots enable row level security;

create table if not exists public.pin_performance (
  id uuid primary key default gen_random_uuid(),
  pin_queue_id uuid references public.pin_queue(id) on delete set null,
  provider text not null,
  provider_post_id text,
  impressions bigint,
  saves bigint,
  outbound_clicks bigint,
  engagement_rate numeric,
  raw_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);
alter table public.pin_performance enable row level security;
drop index if exists public.pin_performance_provider_post_unique;
create unique index if not exists pin_performance_provider_post_unique on public.pin_performance(provider, provider_post_id);
