-- Track rows managed by upstream mirrors such as the official AISafety.com API.
-- These columns intentionally do not add uniqueness constraints because legacy
-- rows may contain duplicate source/source_id or URL values.

alter table resources
  add column if not exists source text default 'manual',
  add column if not exists source_id text,
  add column if not exists upstream_managed boolean not null default false,
  add column if not exists upstream_collection text,
  add column if not exists upstream_last_seen_at timestamptz,
  add column if not exists upstream_missing_count integer not null default 0,
  add column if not exists upstream_payload_hash text;

alter table resources
  add constraint resources_upstream_collection_check
  check (
    upstream_collection is null
    or upstream_collection in ('communities', 'events', 'training')
  ) not valid;

alter table resources
  validate constraint resources_upstream_collection_check;

alter table resources
  add constraint resources_upstream_missing_count_check
  check (upstream_missing_count >= 0) not valid;

alter table resources
  validate constraint resources_upstream_missing_count_check;

create index if not exists idx_resources_upstream_managed_collection
  on resources (upstream_managed, upstream_collection);

create index if not exists idx_resources_upstream_last_seen
  on resources (upstream_last_seen_at);

create index if not exists idx_resources_upstream_payload_hash
  on resources (upstream_payload_hash);

create index if not exists idx_resources_source_source_id
  on resources (source, source_id);
