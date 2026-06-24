CREATE TYPE asset_trust_status AS ENUM ('QUARANTINED', 'VALIDATING', 'CLEAN', 'REJECTED', 'DELETED');

CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  file_name varchar(240) NOT NULL,
  content_type varchar(120) NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  sha256 char(64) NOT NULL,
  status asset_trust_status NOT NULL DEFAULT 'QUARANTINED',
  retention_class varchar(80) NOT NULL,
  producer varchar(120) NOT NULL,
  schema_version varchar(80) NOT NULL,
  object_key varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  source varchar(120) NOT NULL,
  event_type varchar(120) NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  payload_hash char(64) NOT NULL,
  payload jsonb NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source, idempotency_key)
);

CREATE INDEX artifacts_workspace_status_created_idx
  ON artifacts(workspace_id, status, created_at);

CREATE INDEX artifacts_workspace_updated_idx
  ON artifacts(workspace_id, updated_at, id);

CREATE INDEX inbox_events_workspace_created_idx
  ON inbox_events(workspace_id, created_at);

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE inbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY artifacts_workspace_isolation
  ON artifacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = artifacts.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = artifacts.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY inbox_events_workspace_isolation
  ON inbox_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = inbox_events.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = inbox_events.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );
