ALTER TABLE reviewer_team_invites
  ADD COLUMN IF NOT EXISTS private_key varchar(32),
  ADD COLUMN IF NOT EXISTS reviewer_email varchar(320),
  ADD COLUMN IF NOT EXISTS reviewer_name varchar(120),
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id uuid REFERENCES reviewer_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- statement-breakpoint
ALTER TABLE reviewer_registration_requests
  ALTER COLUMN team_id DROP NOT NULL,
  ALTER COLUMN invite_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS reviewer_name varchar(120),
  ADD COLUMN IF NOT EXISTS department varchar(120),
  ADD COLUMN IF NOT EXISTS requested_email varchar(320);

-- statement-breakpoint
UPDATE reviewer_registration_requests r
SET reviewer_name = u.display_name,
    requested_email = u.email
FROM reviewer_users u
WHERE u.id = r.reviewer_id
  AND r.reviewer_name IS NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reviewer_team_invites_assignment_idx
  ON reviewer_team_invites (team_id, assigned_reviewer_id, slot_number);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reviewer_registration_requested_email_idx
  ON reviewer_registration_requests (requested_email);
