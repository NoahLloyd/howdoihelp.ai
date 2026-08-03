-- Seldon Lab was manually entered with "Other" as the organization and the
-- application time (40 minutes) as the program commitment. The accelerator is
-- an intensive, three-month, in-person program for technical founders, so the
-- old metadata made it look broadly suitable and allowed it to rank #1 for
-- people with only a few hours available.

update resources
set
  title = 'Seldon Lab AI Security Accelerator',
  description = 'A three-month, full-time San Francisco accelerator for highly technical early-stage founders building AI security companies, with capital, workspace, mentorship, and investor and customer introductions.',
  url = 'https://seldonlab.com/program',
  source_org = 'Seldon Lab',
  location = 'San Francisco, USA',
  min_minutes = 28800,
  ev_general = 0.6,
  ev_positioned = null,
  friction = 0.85,
  activity_score = null,
  background_tags = array['technical'],
  position_tags = array['ai_tech'],
  verified_at = now(),
  url_status = 'reachable',
  verification_notes = 'Manually verified against the Seldon Lab program and Batch 2 pages; intensive three-month SF accelerator for highly technical founders.'
where id = 'new-1774621532093'
  and upstream_managed = false;
