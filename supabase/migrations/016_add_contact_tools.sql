-- Adds two US contact tools, which appear in the Quick tab on the browse page.
-- The code pins them there, so their scores stay at the same level as the
-- ControlAI card.
--
-- Their location is "US only". Ranked flows can place them near the top for US
-- visitors and rank them low for everyone else.
--
-- Rerunning this is safe, because existing rows are left alone.

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
    0.2,
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
    0.2,
    true,
    'approved'
  )
on conflict (id) do nothing
returning id, title;
