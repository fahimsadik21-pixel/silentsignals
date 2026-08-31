CREATE TABLE IF NOT EXISTS reviewer_users (
  id uuid PRIMARY KEY,
  email varchar(320) NOT NULL,
  display_name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  role varchar(24) NOT NULL DEFAULT 'reviewer'
    CHECK (role IN ('reviewer', 'administrator')),
  route_scope varchar(32) NOT NULL DEFAULT 'committee'
    CHECK (route_scope IN ('committee', 'independent_oversight', 'all')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reviewer_users_email_unique_idx
  ON reviewer_users (lower(email));

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reviewer_sessions (
  token_hash char(64) PRIMARY KEY,
  reviewer_id uuid NOT NULL REFERENCES reviewer_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reviewer_sessions_expiry_idx
  ON reviewer_sessions (expires_at);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reporter_sessions (
  token_hash char(64) PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reporter_sessions_expiry_idx
  ON reporter_sessions (expires_at);

-- statement-breakpoint
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id uuid REFERENCES reviewer_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reports_assignment_status_idx
  ON reports (assigned_reviewer_id, status, updated_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS evidence_files (
  id uuid PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  storage_pathname text UNIQUE,
  metadata_ciphertext text NOT NULL,
  metadata_iv varchar(32) NOT NULL,
  metadata_tag varchar(32) NOT NULL,
  encryption_version smallint NOT NULL DEFAULT 1,
  content_type varchar(120) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0 AND byte_size <= 15728640),
  etag text,
  status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'quarantined', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS evidence_files_report_created_idx
  ON evidence_files (report_id, created_at ASC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS case_messages (
  id uuid PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  sender_type varchar(16) NOT NULL CHECK (sender_type IN ('reporter', 'reviewer')),
  sender_reviewer_id uuid REFERENCES reviewer_users(id) ON DELETE SET NULL,
  body_ciphertext text NOT NULL,
  body_iv varchar(32) NOT NULL,
  body_tag varchar(32) NOT NULL,
  encryption_version smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  reporter_read_at timestamptz,
  reviewer_read_at timestamptz
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS case_messages_report_created_idx
  ON case_messages (report_id, created_at ASC);

-- statement-breakpoint
ALTER TABLE case_events
  ADD COLUMN IF NOT EXISTS actor_type varchar(20) NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system', 'reporter', 'reviewer')),
  ADD COLUMN IF NOT EXISTS actor_reviewer_id uuid REFERENCES reviewer_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS detail_ciphertext text,
  ADD COLUMN IF NOT EXISTS detail_iv varchar(32),
  ADD COLUMN IF NOT EXISTS detail_tag varchar(32),
  ADD COLUMN IF NOT EXISTS encryption_version smallint NOT NULL DEFAULT 1;

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reviewer_id uuid REFERENCES reviewer_users(id) ON DELETE SET NULL,
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  action varchar(64) NOT NULL,
  scope_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_log_report_created_idx
  ON audit_log (report_id, created_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS security_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope_hash char(64) NOT NULL,
  event_type varchar(48) NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS security_events_scope_created_idx
  ON security_events (scope_hash, created_at DESC);
