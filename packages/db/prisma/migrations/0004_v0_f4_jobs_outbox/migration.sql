CREATE TYPE job_status AS ENUM (
  'CREATED',
  'QUEUED',
  'LEASED',
  'RUNNING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  type varchar(120) NOT NULL,
  resource_class varchar(40) NOT NULL,
  status job_status NOT NULL DEFAULT 'CREATED',
  priority integer NOT NULL DEFAULT 0,
  input_hash char(64) NOT NULL,
  input jsonb NOT NULL,
  output_artifact_id uuid REFERENCES artifacts(id),
  next_run_at timestamptz,
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  lease_token uuid NOT NULL,
  status job_status NOT NULL DEFAULT 'LEASED',
  leased_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, attempt_number)
);

CREATE TABLE job_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_job_id uuid NOT NULL REFERENCES jobs(id),
  child_job_id uuid NOT NULL REFERENCES jobs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_job_id, child_job_id),
  CHECK (parent_job_id <> child_job_id)
);

CREATE TABLE job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  event_type varchar(120) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  event_type varchar(120) NOT NULL,
  aggregate_type varchar(120) NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX jobs_workspace_status_next_run_idx
  ON jobs(workspace_id, status, next_run_at);

CREATE INDEX jobs_workspace_updated_idx
  ON jobs(workspace_id, updated_at, id);

CREATE INDEX job_attempts_workspace_status_heartbeat_idx
  ON job_attempts(workspace_id, status, heartbeat_at);

CREATE UNIQUE INDEX job_attempts_one_active_lease
  ON job_attempts(job_id)
  WHERE status IN ('LEASED', 'RUNNING');

CREATE INDEX job_events_workspace_job_created_idx
  ON job_events(workspace_id, job_id, created_at);

CREATE INDEX outbox_events_workspace_status_created_idx
  ON outbox_events(workspace_id, status, created_at);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE job_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE job_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE job_events FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY jobs_workspace_isolation
  ON jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = jobs.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = jobs.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY job_attempts_workspace_isolation
  ON job_attempts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = job_attempts.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = job_attempts.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY job_events_workspace_isolation
  ON job_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = job_events.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = job_events.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY outbox_events_workspace_isolation
  ON outbox_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = outbox_events.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = outbox_events.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY job_dependencies_workspace_isolation
  ON job_dependencies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM jobs parent
      JOIN memberships ON memberships.workspace_id = parent.workspace_id
      WHERE parent.id = job_dependencies.parent_job_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM jobs parent
      JOIN memberships ON memberships.workspace_id = parent.workspace_id
      WHERE parent.id = job_dependencies.parent_job_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );
