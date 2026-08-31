ALTER TABLE reviewer_users
  ADD COLUMN IF NOT EXISTS public_id varchar(16),
  ADD COLUMN IF NOT EXISTS account_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (account_status IN ('pending', 'active', 'rejected', 'revoked')),
  ADD COLUMN IF NOT EXISTS availability varchar(16) NOT NULL DEFAULT 'offline'
    CHECK (availability IN ('available', 'away', 'offline')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- statement-breakpoint
UPDATE reviewer_users
SET public_id = 'REV-' || upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE public_id IS NULL;

-- statement-breakpoint
UPDATE reviewer_users
SET account_status = CASE WHEN is_active THEN 'active' ELSE 'pending' END,
    approved_at = CASE WHEN is_active THEN COALESCE(approved_at, created_at) ELSE approved_at END;

-- statement-breakpoint
ALTER TABLE reviewer_users
  ALTER COLUMN public_id SET NOT NULL;

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reviewer_users_public_id_unique_idx
  ON reviewer_users (public_id);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reviewer_teams (
  id uuid PRIMARY KEY,
  public_id varchar(20) NOT NULL UNIQUE,
  team_type varchar(32) NOT NULL
    CHECK (team_type IN ('committee', 'independent_oversight')),
  label varchar(80) NOT NULL,
  capacity smallint NOT NULL DEFAULT 5 CHECK (capacity = 5),
  status varchar(16) NOT NULL DEFAULT 'forming'
    CHECK (status IN ('forming', 'active', 'paused', 'archived')),
  created_by uuid NOT NULL REFERENCES reviewer_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reviewer_teams_type_status_idx
  ON reviewer_teams (team_type, status, created_at ASC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reviewer_team_members (
  team_id uuid NOT NULL REFERENCES reviewer_teams(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES reviewer_users(id) ON DELETE CASCADE,
  member_role varchar(16) NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('lead', 'member')),
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, reviewer_id)
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reviewer_one_active_team_idx
  ON reviewer_team_members (reviewer_id) WHERE is_active = true;

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reviewer_one_lead_per_team_idx
  ON reviewer_team_members (team_id) WHERE member_role = 'lead' AND is_active = true;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reviewer_team_invites (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES reviewer_teams(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 5),
  created_by uuid NOT NULL REFERENCES reviewer_users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES reviewer_users(id) ON DELETE SET NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, slot_number)
);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reviewer_registration_requests (
  id uuid PRIMARY KEY,
  public_id varchar(20) NOT NULL UNIQUE,
  reviewer_id uuid NOT NULL UNIQUE REFERENCES reviewer_users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES reviewer_teams(id) ON DELETE CASCADE,
  invite_id uuid NOT NULL UNIQUE REFERENCES reviewer_team_invites(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reviewer_registration_status_idx
  ON reviewer_registration_requests (status, requested_at ASC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reviewer_registration_approvals (
  request_id uuid NOT NULL REFERENCES reviewer_registration_requests(id) ON DELETE CASCADE,
  administrator_id uuid NOT NULL REFERENCES reviewer_users(id) ON DELETE RESTRICT,
  decision varchar(12) NOT NULL CHECK (decision IN ('approve', 'reject')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, administrator_id)
);

-- statement-breakpoint
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES reviewer_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_reviewer_id uuid REFERENCES reviewer_users(id) ON DELETE SET NULL;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reports_team_status_idx
  ON reports (assigned_team_id, status, updated_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS case_internal_notes (
  id uuid PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES reviewer_teams(id) ON DELETE CASCADE,
  author_reviewer_id uuid REFERENCES reviewer_users(id) ON DELETE SET NULL,
  body_ciphertext text NOT NULL,
  body_iv varchar(32) NOT NULL,
  body_tag varchar(32) NOT NULL,
  encryption_version smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS case_internal_notes_report_created_idx
  ON case_internal_notes (report_id, created_at ASC);
