CREATE TABLE brand_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  crawl_run_id UUID NOT NULL REFERENCES brand_crawl_runs(id),
  field_type VARCHAR(120) NOT NULL,
  value JSONB NOT NULL,
  confidence DECIMAL(4, 3) NOT NULL,
  decision VARCHAR(80) NOT NULL DEFAULT 'candidate',
  extraction_state VARCHAR(80) NOT NULL,
  source_evidence JSONB NOT NULL,
  conflict BOOLEAN NOT NULL DEFAULT false,
  source_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT brand_candidates_workspace_run_field_source_unique UNIQUE (workspace_id, crawl_run_id, field_type, source_fingerprint)
);

CREATE INDEX brand_candidates_workspace_run_field_idx ON brand_candidates(workspace_id, crawl_run_id, field_type);
CREATE INDEX brand_candidates_workspace_state_created_idx ON brand_candidates(workspace_id, extraction_state, created_at);

ALTER TABLE brand_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_candidates FORCE ROW LEVEL SECURITY;

CREATE POLICY brand_candidates_workspace_isolation ON brand_candidates
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_candidates.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_candidates.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  );
