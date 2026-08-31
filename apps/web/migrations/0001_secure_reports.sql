CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY,
  tracking_code varchar(24) NOT NULL UNIQUE,
  access_key_hash text NOT NULL,
  payload_ciphertext text NOT NULL,
  payload_iv varchar(32) NOT NULL,
  payload_tag varchar(32) NOT NULL,
  encryption_version smallint NOT NULL DEFAULT 1,
  status varchar(32) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'triage', 'under_review', 'awaiting_reporter', 'resolved', 'closed')),
  route_type varchar(32) NOT NULL
    CHECK (route_type IN ('committee', 'independent_oversight')),
  urgency varchar(16) NOT NULL
    CHECK (urgency IN ('standard', 'urgent', 'immediate')),
  evidence_count smallint NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reports_status_created_idx
  ON reports (status, created_at DESC);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS reports_route_created_idx
  ON reports (route_type, created_at DESC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS case_events (
  id uuid PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  public_status varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS case_events_report_created_idx
  ON case_events (report_id, created_at ASC);

-- statement-breakpoint
CREATE TABLE IF NOT EXISTS access_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope_hash char(64) NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- statement-breakpoint
CREATE INDEX IF NOT EXISTS access_attempts_scope_created_idx
  ON access_attempts (scope_hash, created_at DESC);
