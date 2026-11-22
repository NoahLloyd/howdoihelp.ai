-- Adds FLI's tool for emailing Congress to the Quick tab. FLI finds the
-- visitor's Congressperson and Senators, writes a message they can edit, and
-- sends it for them. It only works in the US, so Take action hides it elsewhere.
--
-- Rerunning this is safe, because an existing row is left alone.

insert into resources (
  id, title, description, url, source_org, category, location,
  min_minutes, ev_general, friction, enabled, status
)
values (
  'fli-contact-legislators',
  'Email Congress about AI',
  'FLI finds your Congressperson and Senators, writes a message you can edit, and sends it for you.',
  'https://futureoflife.org/take-action/contact-your-legislator/',
  'Future of Life Institute',
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
