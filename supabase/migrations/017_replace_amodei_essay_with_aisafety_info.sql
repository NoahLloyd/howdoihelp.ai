-- Learn > Reads & tools has four items, so each one reads as a recommendation.
-- This swaps the essay by one lab's CEO for a neutral 30-minute introduction.
-- The essay row stays in the table, disabled, so this is easy to undo.
--
-- The returning clauses show the changed rows. If the first one returns
-- nothing, the live id differs from the seed id.

update resources
set enabled = false
where id = 'adolescence-of-technology'
returning id, title, enabled;

insert into resources (
  id, title, description, url, source_org, category, location,
  min_minutes, ev_general, friction, enabled, status
)
values (
  'aisafety-info-learn',
  'Learn AI safety basics on AISafety.info',
  'Clear, sourced explanations of AI safety concepts, from alignment basics to open research questions. Great starting point.',
  'https://aisafety.info/',
  'AI Safety Info',
  'other',
  'Online',
  30,
  0.45,
  0.03,
  true,
  'approved'
)
on conflict (id) do update
set enabled = true, status = 'approved'
returning id, title, enabled;
