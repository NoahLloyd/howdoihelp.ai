-- The ControlAI card said 15 min. With its drafted email it takes about 5 min,
-- like the other contact tools. One time for every country keeps the card simple.
--
-- The returning clause shows the changed row.

update resources
set min_minutes = 5
where id = 'controlai-legislators'
returning id, title, min_minutes;
