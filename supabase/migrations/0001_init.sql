-- Seelay schema v1 — PLAN.md steps 1.1/1.2, data model per ARCHITECTURE.md.
-- Two tables, deliberately separated: captures are immutable evidence (Law 1),
-- items are interpretation.

create table if not exists captures (
  id uuid primary key default gen_random_uuid(),
  payload_type text not null check (payload_type in ('url', 'text', 'image')),
  payload_text text,
  payload_image_ref text,
  source text not null default 'unknown',
  who_hint text,
  captured_at timestamptz not null default now(),
  check (payload_text is not null or payload_image_ref is not null)
);

-- Law 1: no capture is ever lost. Updates and deletes are blocked at the
-- database level, not just by convention.
create or replace function captures_are_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'captures are immutable (trust contract Law 1)';
end;
$$;

drop trigger if exists captures_immutability on captures;
create trigger captures_immutability
  before update or delete on captures
  for each row execute function captures_are_immutable();

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references captures (id),
  state text not null default 'raw'
    check (state in ('raw', 'resolved', 'needs_confirm', 'needs_hint', 'confirmed')),
  entity_type text not null default 'screen_title',
  tmdb_id integer,
  title text,
  year integer,
  media_type text check (media_type in ('movie', 'tv')),
  poster_ref text,
  confidence real,
  who text,
  metadata jsonb,
  resolved_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists items_created_at_idx on items (created_at desc);

-- RLS on, no policies: anon/authenticated roles see nothing; the server's
-- service role bypasses RLS. Single-tenant until PLAN.md Stage 5.
alter table captures enable row level security;
alter table items enable row level security;
