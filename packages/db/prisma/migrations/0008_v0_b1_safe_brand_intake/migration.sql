CREATE TABLE brand_crawl_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  source_url VARCHAR(1000) NOT NULL,
  normalized_url VARCHAR(500) NOT NULL,
  status job_status NOT NULL DEFAULT 'QUEUED',
  rights_acknowledged BOOLEAN NOT NULL,
  crawl_scope JSONB NOT NULL,
  robots_policy JSONB,
  job_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  crawl_run_id UUID NOT NULL REFERENCES brand_crawl_runs(id),
  artifact_id UUID NOT NULL REFERENCES artifacts(id),
  rights_basis VARCHAR(240) NOT NULL,
  permitted_use VARCHAR(240) NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT brand_assets_workspace_artifact_run_unique UNIQUE (workspace_id, artifact_id, crawl_run_id)
);

CREATE INDEX brand_crawl_runs_workspace_status_created_idx ON brand_crawl_runs(workspace_id, status, created_at);
CREATE INDEX brand_crawl_runs_workspace_normalized_url_idx ON brand_crawl_runs(workspace_id, normalized_url);
CREATE INDEX brand_assets_workspace_status_created_idx ON brand_assets(workspace_id, status, created_at);

ALTER TABLE brand_crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_crawl_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets FORCE ROW LEVEL SECURITY;

CREATE POLICY brand_crawl_runs_workspace_isolation ON brand_crawl_runs
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_crawl_runs.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_crawl_runs.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY brand_assets_workspace_isolation ON brand_assets
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_assets.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_assets.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  );
