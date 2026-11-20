-- Adds two US contact tools to the Quick tab on the browse page, and gives all
-- three contact tools an effort (friction) of 0.10. With value 0.55, they score
-- 5.50, between the petitions.
--
-- Their location is "US only". Take action hides them outside the US, and
-- ranked flows rank them low there.
--
-- Rerunning this is safe: existing rows keep their other fields.

update resources
set friction = 0.1
where id = 'controlai-legislators'
returning id, title, friction;

insert into resources (
  id, title, description, url, source_org, category, location,
  min_minutes, ev_general, friction, enabled, status
)
values
  (
    'ifanyonebuildsit-act',
    'Call, write, or email your representatives',
    'From the authors of If Anyone Builds It, Everyone Dies: tell Congress to stop superintelligent AI development.',
    'https://ifanyonebuildsit.com/act',
    'If Anyone Builds It',
    'other',
    'US only',
    5,
    0.55,
    0.1,
    true,
    'approved'
  ),
  (
    'callcongress',
    'Call Congress about AI',
    'Get a call script and reach your House and Senate offices.',
    'https://callcongress.ai',
    'CallCongress.ai',
    'other',
    'US only',
    5,
    0.55,
    0.1,
    true,
    'approved'
  )
on conflict (id) do nothing
returning id, title;
