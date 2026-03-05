-- Add booking mode to guides (direct = show calendar link, approval_required = request form)
ALTER TABLE guides ADD COLUMN IF NOT EXISTS booking_mode text DEFAULT 'direct'
  CHECK (booking_mode IN ('direct', 'approval_required'));

-- Track guide match requests (for approval_required mode)
CREATE TABLE IF NOT EXISTS guide_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  requester_profile_link text NOT NULL,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  approval_token uuid DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

-- RLS: guides can read their own requests, service role handles inserts
ALTER TABLE guide_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guide_requests_read_own" ON guide_requests
  FOR SELECT USING (guide_id = auth.uid());
