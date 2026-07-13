-- V0-S2 immutable selected script: one canonical immutable selection per
-- script tournament. Sources: docs/V0/Sprints/V0-S2_IMMUTABLE_SELECTED_SCRIPT_SPRINT.md.

CREATE TABLE IF NOT EXISTS selected_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  tournament_id UUID NOT NULL UNIQUE REFERENCES script_tournaments(id),
  variant_id UUID NOT NULL UNIQUE REFERENCES script_variants(id),
  approver_user_id UUID NOT NULL,
  version INT NOT NULL,
  human_override BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT selected_scripts_version_check CHECK (version >= 1),
  CONSTRAINT selected_scripts_human_override_check CHECK (human_override IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS selected_scripts_workspace_created_idx
  ON selected_scripts(workspace_id, created_at);

ALTER TABLE selected_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY selected_scripts_workspace_isolation ON selected_scripts
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));