-- Add availability mode to guides (controls how many conversations they want)
ALTER TABLE guides ADD COLUMN IF NOT EXISTS availability_mode text
  DEFAULT 'unlimited' CHECK (availability_mode IN (
    'one_call', '1_per_month', '2_per_month', '1_per_week',
    '2_per_week', 'unlimited'
  ));

-- Track whether we've sent the follow-up email for one_call guides
ALTER TABLE guide_requests ADD COLUMN IF NOT EXISTS follow_up_sent boolean DEFAULT false;
