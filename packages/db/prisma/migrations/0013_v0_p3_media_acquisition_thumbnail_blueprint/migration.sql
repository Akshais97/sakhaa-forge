-- V0-P3 rights-aware media acquisition and thumbnail blueprint.
-- Sources: docs/V0/Sprints/V0-P3_RIGHTS_AWARE_MEDIA_ACQUISITION_AND_THUMBNAIL_BLUEPRINT_SPRINT.md,
-- docs/V0/V0_DATA_MODELS.md, docs/V0/V0_PRISMA_SCHEMA.md.

CREATE TABLE media_acquisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  viral_candidate_id UUID NOT NULL REFERENCES viral_candidates(id),
  artifact_id UUID REFERENCES artifacts(id),
  status VARCHAR(40) NOT NULL,
  retrieval_policy VARCHAR(80) NOT NULL,
  acquisition_mode VARCHAR(80) NOT NULL,
  rights_decision JSONB NOT NULL,
  source_hash CHAR(64) NOT NULL,
  blocked_reason VARCHAR(160),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT media_acquisitions_status_check CHECK (status IN ('media_acquired', 'blocked', 'failed')),
  CONSTRAINT media_acquisitions_retrieval_policy_check CHECK (retrieval_policy IN ('retained_analysis_copy', 'reference_only')),
  CONSTRAINT media_acquisitions_source_hash_check CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT media_acquisitions_blocked_artifact_check CHECK ((status = 'media_acquired' AND artifact_id IS NOT NULL AND blocked_reason IS NULL) OR (status <> 'media_acquired'))
);

CREATE TABLE thumbnail_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  viral_candidate_id UUID NOT NULL REFERENCES viral_candidates(id),
  media_acquisition_id UUID NOT NULL REFERENCES media_acquisitions(id),
  artifact_id UUID REFERENCES artifacts(id),
  status VARCHAR(40) NOT NULL,
  ocr JSONB NOT NULL,
  composition JSONB NOT NULL,
  hook_hypothesis VARCHAR(500) NOT NULL,
  director_guidance JSONB NOT NULL,
  quality JSONB NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT thumbnail_blueprints_status_check CHECK (status IN ('thumbnail_deciphered', 'blocked', 'failed')),
  CONSTRAINT thumbnail_blueprints_source_hash_check CHECK (source_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX media_acquisitions_workspace_candidate_created_idx ON media_acquisitions(workspace_id, viral_candidate_id, created_at);
CREATE INDEX media_acquisitions_workspace_status_created_idx ON media_acquisitions(workspace_id, status, created_at);
CREATE INDEX thumbnail_blueprints_workspace_candidate_created_idx ON thumbnail_blueprints(workspace_id, viral_candidate_id, created_at);
CREATE INDEX thumbnail_blueprints_workspace_status_created_idx ON thumbnail_blueprints(workspace_id, status, created_at);

ALTER TABLE media_acquisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_acquisitions FORCE ROW LEVEL SECURITY;
ALTER TABLE thumbnail_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE thumbnail_blueprints FORCE ROW LEVEL SECURITY;

CREATE POLICY media_acquisitions_workspace_isolation ON media_acquisitions
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);

CREATE POLICY thumbnail_blueprints_workspace_isolation ON thumbnail_blueprints
  USING (workspace_id = current_setting('app.current_workspace_id', true)::uuid)
  WITH CHECK (workspace_id = current_setting('app.current_workspace_id', true)::uuid);
