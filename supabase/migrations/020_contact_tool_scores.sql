-- Scores for the US contact tools, by how valuable the action is and how much
-- work its form takes. Calling Congress counts most, FLI's email the least.
-- ControlAI keeps value 0.55 and effort 0.10, so visitors outside the US see
-- the same order as before.
--
-- Score = value / effort:
--   CallCongress.ai      0.85 / 0.15 = 5.67, 10 min (calls to 3 offices)
--   If Anyone Builds It  0.65 / 0.12 = 5.42
--   FLI Email Congress   0.35 / 0.08 = 4.38, 3 min (FLI writes and sends it)
--
-- The returning clauses show the changed rows.

update resources
set ev_general = 0.85, friction = 0.15, min_minutes = 10
where id = 'callcongress'
returning id, ev_general, friction, min_minutes;

update resources
set ev_general = 0.65, friction = 0.12
where id = 'ifanyonebuildsit-act'
returning id, ev_general, friction, min_minutes;

update resources
set ev_general = 0.35, friction = 0.08, min_minutes = 3
where id = 'fli-contact-legislators'
returning id, ev_general, friction, min_minutes;
