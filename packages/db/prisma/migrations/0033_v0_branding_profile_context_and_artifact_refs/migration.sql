CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(160),
  contact_email VARCHAR(320),
  website_url VARCHAR(500),
  industry VARCHAR(120),
  primary_market VARCHAR(160),
  language VARCHAR(40),
  onboarding_skipped BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_user_unique UNIQUE (user_id)
);

CREATE TABLE brand_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES users(id),
  brand_name VARCHAR(200),
  website_url VARCHAR(500),
  industry VARCHAR(120),
  video_goal VARCHAR(500),
  primary_market VARCHAR(160),
  language VARCHAR(40),
  target_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT brand_contexts_workspace_user_unique UNIQUE (workspace_id, user_id)
);

ALTER TABLE brand_crawl_runs ADD COLUMN crawl_plan_artifact_id UUID;
ALTER TABLE brand_crawl_runs ADD COLUMN page_inventory_artifact_id UUID;
ALTER TABLE brand_crawl_runs ADD COLUMN asset_pack_artifact_id UUID;
ALTER TABLE brand_crawl_runs ADD COLUMN media_inventory_artifact_id UUID;
ALTER TABLE brand_crawl_runs ADD COLUMN readiness_report_artifact_id UUID;

ALTER TABLE brand_crawl_runs
  ADD CONSTRAINT brand_crawl_runs_crawl_plan_artifact_fk
  FOREIGN KEY (crawl_plan_artifact_id) REFERENCES artifacts(id);
ALTER TABLE brand_crawl_runs
  ADD CONSTRAINT brand_crawl_runs_page_inventory_artifact_fk
  FOREIGN KEY (page_inventory_artifact_id) REFERENCES artifacts(id);
ALTER TABLE brand_crawl_runs
  ADD CONSTRAINT brand_crawl_runs_asset_pack_artifact_fk
  FOREIGN KEY (asset_pack_artifact_id) REFERENCES artifacts(id);
ALTER TABLE brand_crawl_runs
  ADD CONSTRAINT brand_crawl_runs_media_inventory_artifact_fk
  FOREIGN KEY (media_inventory_artifact_id) REFERENCES artifacts(id);
ALTER TABLE brand_crawl_runs
  ADD CONSTRAINT brand_crawl_runs_readiness_report_artifact_fk
  FOREIGN KEY (readiness_report_artifact_id) REFERENCES artifacts(id);

CREATE INDEX user_profiles_industry_market_idx ON user_profiles(industry, primary_market);
CREATE INDEX brand_contexts_workspace_industry_market_idx ON brand_contexts(workspace_id, industry, primary_market);
CREATE INDEX brand_crawl_runs_artifact_refs_idx ON brand_crawl_runs(
  workspace_id,
  crawl_plan_artifact_id,
  page_inventory_artifact_id,
  asset_pack_artifact_id,
  media_inventory_artifact_id,
  readiness_report_artifact_id
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE brand_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_contexts FORCE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_user_isolation ON user_profiles
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

CREATE POLICY brand_contexts_workspace_isolation ON brand_contexts
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_contexts.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_contexts.workspace_id
        AND memberships.user_id = brand_contexts.user_id
        AND memberships.status = 'ACTIVE'
    )
  );
