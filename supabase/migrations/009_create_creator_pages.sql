-- Creator pages: custom flows for creators with audiences.
-- Each creator can claim a unique slug and configure a custom flow.

create table if not exists creator_pages (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  slug text unique not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),

  -- Flow configuration (JSONB) - ordered list of steps
  flow_config jsonb not null default '[
    {"type": "welcome", "title": "You want to help.", "subtitle": "A few quick questions, then we''ll find the best ways for you to help with AI safety."},
    {"type": "questions", "useDefaults": true, "customQuestions": []},
    {"type": "results", "style": "browse"}
  ]',

  -- Resource overrides
  excluded_resources text[] default '{}',
  boosted_resources text[] default '{}',
  resource_weights jsonb default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create unique index idx_creator_pages_slug on creator_pages(slug);
create index idx_creator_pages_creator on creator_pages(creator_id);

-- RLS
alter table creator_pages enable row level security;

-- Anyone can read active creator pages (needed for public [slug] routes)
create policy "creator_pages_public_read_active" on creator_pages
  for select using (status = 'active' or auth.uid() = creator_id);

-- Creators can insert their own pages
create policy "creator_pages_insert_own" on creator_pages
  for insert with check (auth.uid() = creator_id);

-- Creators can update their own pages
create policy "creator_pages_update_own" on creator_pages
  for update using (auth.uid() = creator_id);

-- Creators can delete their own pages
create policy "creator_pages_delete_own" on creator_pages
  for delete using (auth.uid() = creator_id);

-- updated_at trigger
create trigger creator_pages_updated_at
  before update on creator_pages
  for each row execute function update_updated_at();
