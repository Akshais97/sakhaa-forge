-- V0-P1 explicit blueprint path selection.
-- Sources: docs/V0/Sprints/V0-P1_EXPLICIT_BLUEPRINT_PATH_SELECTION_SPRINT.md,
-- docs/V0/V0_DATA_MODELS.md and docs/V0/V0_PRISMA_SCHEMA.md.

CREATE TABLE blueprint_library_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  title VARCHAR(200) NOT NULL,
  status VARCHAR(40) NOT NULL,
  compatibility JSONB NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT blueprint_library_entries_status_check CHECK (status IN ('ready', 'archived'))
);

CREATE TABLE blueprint_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  path VARCHAR(40) NOT NULL,
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  brand_profile_version INTEGER NOT NULL,
  blueprint_library_entry_id UUID REFERENCES blueprint_library_entries(id),
  objective_type VARCHAR(120) NOT NULL,
  objective VARCHAR(500) NOT NULL,
  status VARCHAR(40) NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT blueprint_requests_path_check CHECK (path IN ('existing_blueprint', 'new_discovery', 'default_formula')),
  CONSTRAINT blueprint_requests_status_check CHECK (status IN ('pending', 'blocked', 'failed', 'ready')),
  CONSTRAINT blueprint_requests_existing_entry_check CHECK (
    (path = 'existing_blueprint' AND blueprint_library_entry_id IS NOT NULL)
    OR (path <> 'existing_blueprint' AND blueprint_library_entry_id IS NULL)
  )
);

CREATE INDEX blueprint_library_entries_workspace_status_created_idx
  ON blueprint_library_entries(workspace_id, status, created_at);
CREATE INDEX blueprint_library_entries_workspace_updated_idx
  ON blueprint_library_entries(workspace_id, updated_at, id);
CREATE INDEX blueprint_requests_workspace_status_created_idx
  ON blueprint_requests(workspace_id, status, created_at);
CREATE INDEX blueprint_requests_workspace_profile_created_idx
  ON blueprint_requests(workspace_id, brand_profile_id, created_at);

ALTER TABLE blueprint_library_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_library_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE blueprint_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY blueprint_library_entries_workspace_isolation ON blueprint_library_entries
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY blueprint_requests_workspace_isolation ON blueprint_requests
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));
