-- The ControlAI card pointed at controlai.com/take-action/choose, which now
-- redirects to a 404 page. This points it straight at their email tool, which
-- accepts visitors from any country.
--
-- The returning clause shows the changed row. No rows back means the live id
-- differs from the seed id.

update resources
set
  url = 'https://act.controlai.org/actions/contact-your-representatives',
  description = 'ControlAI drafts an email to your representatives, and you review it before it goes out.',
  location = 'Global'
where id = 'controlai-legislators'
returning id, title, url, location;
