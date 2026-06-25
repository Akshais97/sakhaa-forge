-- V0-S1 auditable script tournament, variants and evaluations.
-- Sources: docs/V0/Sprints/V0-S1_AUDITABLE_SCRIPT_TOURNAMENT_SPRINT.md.

CREATE TABLE IF NOT EXISTS script_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  blueprint_request_id UUID NOT NULL REFERENCES blueprint_requests(id),
  blueprint_library_entry_id UUID NOT NULL REFERENCES blueprint_library_entries(id),
  formula_derivation_id UUID NOT NULL REFERENCES formula_derivations(id),
  director_prompt_id UUID NOT NULL REFERENCES director_prompts(id),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  brand_profile_version INT NOT NULL,
  objective_type VARCHAR(120) NOT NULL,
  objective VARCHAR(500) NOT NULL,
  requested_variant_count INT NOT NULL,
  valid_variant_count INT NOT NULL,
  status VARCHAR(40) NOT NULL,
  result VARCHAR(40) NOT NULL,
  prompt_version VARCHAR(80) NOT NULL,
  model_version VARCHAR(80) NOT NULL,
  telemetry JSONB NOT NULL,
  manifest_artifact_id UUID,
  job_id UUID,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT script_tournaments_status_check CHECK (status IN ('draft','generating','evaluating','ready_for_selection','selected','failed','cancelled')),
  CONSTRAINT script_tournaments_result_check CHECK (result IN ('ready_for_selection','insufficient_valid','ai_request_refused','schema_invalid','cancelled')),
  CONSTRAINT script_tournaments_variant_count_check CHECK (requested_variant_count >= 10 AND requested_variant_count <= 20)
);

CREATE INDEX IF NOT EXISTS script_tournaments_workspace_status_created_idx
  ON script_tournaments(workspace_id, status, created_at);
CREATE INDEX IF NOT EXISTS script_tournaments_workspace_brand_profile_created_idx
  ON script_tournaments(workspace_id, brand_profile_id, created_at);

CREATE TABLE IF NOT EXISTS script_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  tournament_id UUID NOT NULL REFERENCES script_tournaments(id),
  index INT NOT NULL,
  status VARCHAR(40) NOT NULL,
  hook_type VARCHAR(80) NOT NULL,
  hook TEXT NOT NULL,
  body TEXT NOT NULL,
  cta TEXT NOT NULL,
  captions TEXT NOT NULL,
  claims JSONB NOT NULL,
  cadence JSONB NOT NULL,
  formula_slots JSONB NOT NULL,
  provenance JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT script_variants_status_check CHECK (status IN ('generated','policy_refused','schema_invalid')),
  CONSTRAINT script_variants_claims_array_check CHECK (jsonb_typeof(claims) = 'array'),
  CONSTRAINT script_variants_formula_slots_array_check CHECK (jsonb_typeof(formula_slots) = 'array')
);

CREATE INDEX IF NOT EXISTS script_variants_workspace_tournament_index_idx
  ON script_variants(workspace_id, tournament_id, index);

CREATE TABLE IF NOT EXISTS script_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  tournament_id UUID NOT NULL REFERENCES script_tournaments(id),
  variant_id UUID NOT NULL REFERENCES script_variants(id),
  status VARCHAR(40) NOT NULL,
  hook_strength JSONB NOT NULL,
  timing JSONB NOT NULL,
  pattern_interrupts JSONB NOT NULL,
  cta JSONB NOT NULL,
  claims JSONB NOT NULL,
  captions JSONB NOT NULL,
  tone JSONB NOT NULL,
  formula_checks JSONB NOT NULL,
  policy_checks JSONB NOT NULL,
  brand_rule_checks JSONB NOT NULL,
  model_score DECIMAL(4, 3) NOT NULL,
  human_score DECIMAL(4, 3),
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT script_evaluations_status_check CHECK (status IN ('evaluated','policy_violation','schema_invalid')),
  CONSTRAINT script_evaluations_formula_checks_array_check CHECK (jsonb_typeof(formula_checks) = 'array'),
  CONSTRAINT script_evaluations_policy_checks_array_check CHECK (jsonb_typeof(policy_checks) = 'array'),
  CONSTRAINT script_evaluations_brand_rule_checks_array_check CHECK (jsonb_typeof(brand_rule_checks) = 'array')
);

CREATE INDEX IF NOT EXISTS script_evaluations_workspace_tournament_status_idx
  ON script_evaluations(workspace_id, tournament_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS script_evaluations_variant_unique
  ON script_evaluations(variant_id);

ALTER TABLE script_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY script_tournaments_workspace_isolation ON script_tournaments
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY script_variants_workspace_isolation ON script_variants
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY script_evaluations_workspace_isolation ON script_evaluations
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));