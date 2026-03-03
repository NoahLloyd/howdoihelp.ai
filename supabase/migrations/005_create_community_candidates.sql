-- Community Candidates: staging table for the community evaluation pipeline.
-- Raw scraped communities land here before AI evaluation promotes them to `resources`.

create table if not exists community_candidates (
  id text primary key,

  -- Raw data from gatherer
  title text not null,
  description text,
  url text not null,
  source text not null,       -- "ea-forum" | "lesswrong" | "pauseai" | "aisafety" | "submission"
  source_id text,             -- upstream ID for dedup
  source_org text,
  location text,
  submitted_by text,          -- only for source='submission'

  -- Scraped context (filled by evaluator)
  scraped_text text,

  -- AI evaluation results (filled by evaluator)
  ai_is_real_community boolean,
  ai_is_relevant boolean,
  ai_relevance_score real,
  ai_quality_score real,
  ai_suggested_ev real,
  ai_suggested_friction real,
  ai_community_type text,
  ai_clean_title text,
  ai_clean_description text,
  ai_clean_location text,
  ai_is_online boolean,
  ai_organization text,
  ai_reasoning text,
  duplicate_of text,

  -- Pipeline status
  status text not null default 'pending',
  processed_at timestamptz,
  promoted_at timestamptz,
  promoted_resource_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create trigger community_candidates_updated_at
  before update on community_candidates
  for each row
  execute function update_updated_at();

-- Indexes
create index idx_community_candidates_status on community_candidates(status);
create index idx_community_candidates_source on community_candidates(source, source_id);
create index idx_community_candidates_url on community_candidates(url);

-- RLS: public read for admin dashboard, service role write
alter table community_candidates enable row level security;

create policy "community_candidates_public_read" on community_candidates
  for select using (true);
