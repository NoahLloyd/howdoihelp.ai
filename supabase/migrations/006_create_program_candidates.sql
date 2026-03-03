-- Program Candidates: staging table for the program/course evaluation pipeline.
-- Raw scraped programs land here before AI evaluation promotes them to `resources`.

create table if not exists program_candidates (
  id text primary key,

  -- Raw data from gatherer
  title text not null,
  description text,
  url text not null,
  source text not null,       -- "bluedot" | "submission"
  source_id text,             -- upstream ID for dedup
  source_org text,
  location text,              -- "Online" for most programs
  submitted_by text,          -- only for source='submission'

  -- Program-specific fields
  course_type text,           -- "intensive" | "part-time" | "self-paced"
  duration_description text,  -- e.g. "5 hours/week, 6 weeks"
  duration_hours real,
  application_deadline text,  -- ISO date
  start_date text,            -- ISO date
  end_date text,              -- date range end
  date_range text,            -- human-readable date range

  -- Scraped context (filled by evaluator)
  scraped_text text,

  -- AI evaluation results (filled by evaluator)
  ai_is_real_program boolean,
  ai_is_relevant boolean,
  ai_relevance_score real,
  ai_quality_score real,
  ai_suggested_ev real,
  ai_suggested_friction real,
  ai_program_type text,
  ai_clean_title text,
  ai_clean_description text,
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
create trigger program_candidates_updated_at
  before update on program_candidates
  for each row
  execute function update_updated_at();

-- Indexes
create index idx_program_candidates_status on program_candidates(status);
create index idx_program_candidates_source on program_candidates(source, source_id);
create index idx_program_candidates_url on program_candidates(url);

-- RLS: public read for admin dashboard, service role write
alter table program_candidates enable row level security;

create policy "program_candidates_public_read" on program_candidates
  for select using (true);
