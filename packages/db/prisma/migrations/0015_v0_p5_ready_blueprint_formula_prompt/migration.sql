-- V0-P5 immutable ready blueprint, formula and provider-neutral director prompt.
-- Sources: docs/V0/Sprints/V0-P5_IMMUTABLE_BLUEPRINT_FORMULA_AND_DIRECTOR_PROMPT_SPRINT.md.

CREATE TABLE IF NOT EXISTS formula_derivations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  blueprint_library_entry_id UUID NOT NULL REFERENCES blueprint_library_entries(id),
  blueprint_request_id UUID NOT NULL REFERENCES blueprint_requests(id),
  status VARCHAR(40) NOT NULL,
  formula_version VARCHAR(80) NOT NULL,
  slots JSONB NOT NULL,
  replacement_instructions JSONB NOT NULL,
  lineage JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT formula_derivations_status_check CHECK (status IN ('formula_done')),
  CONSTRAINT formula_derivations_slots_array_check CHECK (jsonb_typeof(slots) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS formula_derivations_workspace_entry_unique
  ON formula_derivations(workspace_id, blueprint_library_entry_id);
CREATE INDEX IF NOT EXISTS formula_derivations_workspace_status_created_idx
  ON formula_derivations(workspace_id, status, created_at);

CREATE TABLE IF NOT EXISTS director_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  blueprint_library_entry_id UUID NOT NULL REFERENCES blueprint_library_entries(id),
  formula_derivation_id UUID NOT NULL REFERENCES formula_derivations(id),
  blueprint_request_id UUID NOT NULL REFERENCES blueprint_requests(id),
  status VARCHAR(40) NOT NULL,
  prompt_version VARCHAR(80) NOT NULL,
  replacement_slots JSONB NOT NULL,
  prompt TEXT NOT NULL,
  lineage JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT director_prompts_status_check CHECK (status IN ('director_prompt_done')),
  CONSTRAINT director_prompts_replacement_slots_array_check CHECK (jsonb_typeof(replacement_slots) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS director_prompts_workspace_entry_unique
  ON director_prompts(workspace_id, blueprint_library_entry_id);
CREATE INDEX IF NOT EXISTS director_prompts_workspace_status_created_idx
  ON director_prompts(workspace_id, status, created_at);

ALTER TABLE formula_derivations ENABLE ROW LEVEL SECURITY;
ALTER TABLE director_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY formula_derivations_workspace_isolation ON formula_derivations
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY director_prompts_workspace_isolation ON director_prompts
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));
