CREATE TABLE workspace_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  capability VARCHAR(120) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_reason VARCHAR(500),
  updated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, capability)
);

CREATE INDEX workspace_capabilities_workspace_enabled_idx
  ON workspace_capabilities (workspace_id, enabled);

ALTER TABLE workspace_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_capabilities FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_capabilities_workspace_isolation
  ON workspace_capabilities
  FOR ALL
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.workspace_id = workspace_capabilities.workspace_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.workspace_id = workspace_capabilities.workspace_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'ACTIVE'
        AND m.role IN ('OWNER', 'ADMIN')
    )
  );
