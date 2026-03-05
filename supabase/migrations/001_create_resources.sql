-- howdoihelp.ai - Supabase schema
-- Run this migration to set up the resource database.

-- Resources table
create table if not exists resources (
  id text primary key,
  title text not null,
  description text not null,
  url text not null,
  source_org text not null,

  -- Time & commitment
  min_minutes integer not null default 5,
  is_ongoing boolean not null default false,
  has_deadline boolean not null default false,
  deadline_date date,

  -- Categorization
  action_type text not null check (action_type in (
    'learn', 'amplify', 'advocate', 'connect', 'build', 'fund', 'career'
  )),
  geo_type text not null default 'global' check (geo_type in ('global', 'country', 'city')),
  geo_value text,

  -- Scoring
  ev_general real not null default 0.5,
  ev_positioned real,
  friction real not null default 0.3,

  -- Display
  social_proof text,
  always_show boolean not null default false,

  -- Tags (arrays)
  background_tags text[] default '{}',
  position_tags text[] default '{}',

  -- Admin
  active boolean not null default true,
  last_verified date not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger resources_updated_at
  before update on resources
  for each row
  execute function update_updated_at();

-- Auto-archive: deactivate resources past their deadline
-- Run this as a cron job (Supabase pg_cron) daily
create or replace function archive_expired_resources()
returns void as $$
begin
  update resources
  set active = false
  where has_deadline = true
    and deadline_date < current_date
    and active = true;
end;
$$ language plpgsql;

-- Click tracking
create table if not exists resource_clicks (
  id bigint generated always as identity primary key,
  resource_id text not null references resources(id),
  variant text not null,
  user_time text, -- their "time" answer
  user_intents text[], -- their intent selections
  geo_country text,
  clicked_at timestamptz not null default now()
);

-- Index for analytics queries
create index idx_clicks_resource on resource_clicks(resource_id);
create index idx_clicks_variant on resource_clicks(variant);
create index idx_clicks_time on resource_clicks(clicked_at);

-- RLS policies (public read, admin write)
alter table resources enable row level security;
alter table resource_clicks enable row level security;

-- Anyone can read resources
create policy "resources_public_read" on resources
  for select using (true);

-- Anyone can insert clicks (anonymous tracking)
create policy "clicks_public_insert" on resource_clicks
  for insert with check (true);
