CREATE TABLE service_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider VARCHAR(120) NOT NULL,
  purpose VARCHAR(120) NOT NULL,
  environment VARCHAR(80) NOT NULL,
  secret_ref VARCHAR(300) NOT NULL,
  rotation_status VARCHAR(80) NOT NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX service_credentials_workspace_provider_idx
  ON service_credentials (workspace_id, provider, environment);

ALTER TABLE service_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY service_credentials_workspace_isolation
  ON service_credentials
  FOR ALL
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.workspace_id = service_credentials.workspace_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'ACTIVE'
        AND m.role IN ('OWNER', 'ADMIN')
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.workspace_id = service_credentials.workspace_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'ACTIVE'
        AND m.role IN ('OWNER', 'ADMIN')
    )
  );
