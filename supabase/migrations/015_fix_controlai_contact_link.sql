-- The ControlAI card pointed at controlai.com/take-action/choose, which now
-- redirects to a 404 page. This points it straight at their email tool. It finds
-- lawmakers in the US and UK, and drafts an email for visitors elsewhere.
--
-- The returning clause shows the changed row. No rows back means the live id
-- differs from the seed id.

update resources
set
  url = 'https://act.controlai.org/actions/contact-your-representatives',
  description = 'Get an email to your lawmakers drafted for you. In the US and UK, ControlAI also finds who represents you.',
  location = 'Global'
where id = 'controlai-legislators'
returning id, title, url, location;
