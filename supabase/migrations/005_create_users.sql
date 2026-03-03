-- Users: store visitor profiles, answers, and session data for returning visitors.
create table if not exists users (
  id text primary key,
  profile_data jsonb,
  profile_platform text,
  profile_url text,
  linkedin_email text,
  answers jsonb,
  last_recommendations jsonb,
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_updated_at
  before update on users
  for each row
  execute function update_updated_at();

-- RLS: public insert/read (anonymous users create their own records)
alter table users enable row level security;

create policy "users_public_read" on users
  for select using (true);

create policy "users_public_insert" on users
  for insert with check (true);

-- No public update policy — updates happen server-side via service role (bypasses RLS)

-- API Usage: track every external API call for cost monitoring.
create table if not exists api_usage (
  id bigint generated always as identity primary key,
  provider text not null,
  model text,
  endpoint text,
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric,
  user_id text references users(id),
  created_at timestamptz not null default now()
);

alter table api_usage enable row level security;

-- Public can read for admin dashboard (auth checked in app layer)
-- No insert policy — inserts happen server-side via service role (bypasses RLS)
create policy "api_usage_public_read" on api_usage
  for select using (true);

-- Indexes
create index idx_api_usage_provider on api_usage(provider);
create index idx_api_usage_created on api_usage(created_at);
create index idx_api_usage_user on api_usage(user_id);
create index idx_users_linkedin_email on users(linkedin_email);
