-- V0-C1 validated composition intent and AE plan. User composition direction bound to a
-- retained generated asset is normalized into a versioned AE timeline plan and validated
-- against the deterministic AE capability registry. A valid plan is retained as `validated`
-- with a CLEAN plan artifact (application/json, retention class plan-artifact); a malformed
-- plan or capability mismatch is retained as `validation_failed` with every unsupported item
-- explained. The LLM cannot invent assets, fonts, plugins or effects. The plan artifact
-- sha256, timeline JSON and referenced asset ids are retained server-side only; plans
-- reference retained artifact ids, never signed URLs. Composition planning is not a paid or
-- externally visible mutation, so no idempotency key is required and no credit ledger entry
-- is written. Sources: docs/V0/Sprints/V0-C1_VALIDATED_COMPOSITION_INTENT_AND_AE_PLAN_SPRINT.md,
-- docs/V0/V0_DATA_MODELS.md, docs/V0/V0_API.md, docs/V0/V0_STATUS_ENUMS.md,
-- docs/V0/V0_ERROR_CATALOG.md.

CREATE TYPE composition_status AS ENUM (
  'DRAFT',
  'PLANNING',
  'VALIDATION_FAILED',
  'VALIDATED',
  'RENDERING',
  'RENDERED',
  'FAILED',
  'SUPERSEDED'
);

-- Composition instruction: user direction bound to a retained generated asset. The raw
-- direction is internal context, never returned to the browser. actor_user_id is retained
-- for audit lineage (the audit_events row carries the authorised actor); no Prisma relation
-- to users is required. generation_asset_id is a plain UUID, not a FK: the application layer
-- (resolveAsset) is the sole validator of asset existence, workspace ownership and CLEAN
-- status, and a validation_failed plan for a missing or cross-workspace asset must still be
-- retained. A FK would leak existence (P2003 vs P2002) and block recording failed attempts.
CREATE TABLE IF NOT EXISTS composition_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  actor_user_id UUID NOT NULL,
  generation_asset_id UUID NOT NULL,
  input_mode VARCHAR(40) NOT NULL,
  raw_direction VARCHAR(2000),
  status composition_status NOT NULL DEFAULT 'PLANNING',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT composition_instructions_input_mode_check CHECK (btrim(input_mode) <> ''),
  CONSTRAINT composition_instructions_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS composition_instructions_workspace_status_created_idx
  ON composition_instructions(workspace_id, status, created_at);

CREATE INDEX IF NOT EXISTS composition_instructions_workspace_updated_id_idx
  ON composition_instructions(workspace_id, updated_at, id);

ALTER TABLE composition_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY composition_instructions_workspace_isolation ON composition_instructions
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

-- AE plan: a versioned timeline JSON validated against the deterministic capability registry.
-- unsupported_items is a JSON array of { code, field, detail } entries explaining every
-- unsupported item for a validation_failed plan. plan_artifact_id is set only for a validated
-- plan (the CLEAN plan artifact Artifact row). validated_at marks the validation timestamp.
CREATE TABLE IF NOT EXISTS ae_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  composition_instruction_id UUID NOT NULL REFERENCES composition_instructions(id),
  version INT NOT NULL DEFAULT 1,
  capability_version VARCHAR(80) NOT NULL,
  schema_version VARCHAR(80) NOT NULL,
  timeline JSONB NOT NULL,
  status composition_status NOT NULL DEFAULT 'PLANNING',
  unsupported_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan_artifact_id UUID REFERENCES artifacts(id),
  validated_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT ae_plans_capability_version_check CHECK (btrim(capability_version) <> ''),
  CONSTRAINT ae_plans_schema_version_check CHECK (btrim(schema_version) <> ''),
  CONSTRAINT ae_plans_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS ae_plans_workspace_instruction_version_idx
  ON ae_plans(workspace_id, composition_instruction_id, version);

CREATE INDEX IF NOT EXISTS ae_plans_workspace_status_created_idx
  ON ae_plans(workspace_id, status, created_at);

ALTER TABLE ae_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY ae_plans_workspace_isolation ON ae_plans
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));