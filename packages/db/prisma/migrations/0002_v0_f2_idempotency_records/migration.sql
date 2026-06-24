CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  operation varchar(120) NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, operation, idempotency_key),
  UNIQUE (actor_user_id, operation, idempotency_key)
);

CREATE INDEX idempotency_records_actor_operation_created_idx
  ON idempotency_records(actor_user_id, operation, created_at);

ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records FORCE ROW LEVEL SECURITY;

CREATE POLICY idempotency_records_workspace_isolation
  ON idempotency_records
  FOR ALL
  USING (
    workspace_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = idempotency_records.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    actor_user_id = app_current_user_id()
    AND (
      workspace_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM memberships
        WHERE memberships.workspace_id = idempotency_records.workspace_id
          AND memberships.user_id = app_current_user_id()
          AND memberships.status = 'ACTIVE'
      )
    )
  );
