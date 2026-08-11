CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL,
  website_url VARCHAR(500) NOT NULL,
  normalized_domain VARCHAR(253) NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT brands_workspace_slug_unique UNIQUE (workspace_id, slug),
  CONSTRAINT brands_id_workspace_unique UNIQUE (id, workspace_id)
);

ALTER TABLE brand_crawl_runs ADD COLUMN brand_id UUID;
ALTER TABLE brand_assets ADD COLUMN brand_id UUID;
ALTER TABLE brand_candidates ADD COLUMN brand_id UUID;
ALTER TABLE brand_assets ALTER COLUMN crawl_run_id DROP NOT NULL;

-- Preserve the pre-existing BrandProfile identity where approval already established one.
INSERT INTO brands (id, workspace_id, name, slug, website_url, normalized_domain, created_at, updated_at)
SELECT DISTINCT ON (profile.brand_id)
  profile.brand_id,
  profile.workspace_id,
  COALESCE(
    NULLIF(profile.profile->'name'->'public'->>'value', ''),
    NULLIF(profile.profile->>'name', ''),
    'Brand ' || left(profile.brand_id::text, 8)
  ),
  'brand-' || profile.brand_id::text,
  run.normalized_url,
  lower(split_part(regexp_replace(run.normalized_url, '^https?://', ''), '/', 1)),
  profile.created_at,
  profile.updated_at
FROM brand_profiles profile
JOIN brand_crawl_runs run ON run.id = profile.crawl_run_id
ORDER BY profile.brand_id, profile.version DESC;

UPDATE brand_crawl_runs run
SET brand_id = profile.brand_id
FROM brand_profiles profile
WHERE profile.crawl_run_id = run.id;

-- Every earlier crawl becomes a recognizable brand record when no approved profile existed.
INSERT INTO brands (id, workspace_id, name, slug, website_url, normalized_domain, created_at, updated_at)
SELECT
  run.id,
  run.workspace_id,
  initcap(split_part(split_part(regexp_replace(run.normalized_url, '^https?://', ''), '/', 1), '.', 1)),
  'brand-' || run.id::text,
  run.normalized_url,
  lower(split_part(regexp_replace(run.normalized_url, '^https?://', ''), '/', 1)),
  run.created_at,
  run.updated_at
FROM brand_crawl_runs run
WHERE run.brand_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM brands brand WHERE brand.id = run.id);

UPDATE brand_crawl_runs SET brand_id = id WHERE brand_id IS NULL;
UPDATE brand_assets asset SET brand_id = run.brand_id FROM brand_crawl_runs run WHERE run.id = asset.crawl_run_id;
UPDATE brand_candidates candidate SET brand_id = run.brand_id FROM brand_crawl_runs run WHERE run.id = candidate.crawl_run_id;

ALTER TABLE brand_crawl_runs ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE brand_assets ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE brand_candidates ALTER COLUMN brand_id SET NOT NULL;

ALTER TABLE brand_crawl_runs ADD CONSTRAINT brand_crawl_runs_brand_fk FOREIGN KEY (brand_id, workspace_id) REFERENCES brands(id, workspace_id);
ALTER TABLE brand_assets ADD CONSTRAINT brand_assets_brand_fk FOREIGN KEY (brand_id, workspace_id) REFERENCES brands(id, workspace_id);
ALTER TABLE brand_candidates ADD CONSTRAINT brand_candidates_brand_fk FOREIGN KEY (brand_id, workspace_id) REFERENCES brands(id, workspace_id);
ALTER TABLE brand_profiles ADD CONSTRAINT brand_profiles_brand_fk FOREIGN KEY (brand_id, workspace_id) REFERENCES brands(id, workspace_id);
ALTER TABLE brand_approvals ADD CONSTRAINT brand_approvals_brand_fk FOREIGN KEY (brand_id, workspace_id) REFERENCES brands(id, workspace_id);
ALTER TABLE brand_rules ADD CONSTRAINT brand_rules_brand_fk FOREIGN KEY (brand_id, workspace_id) REFERENCES brands(id, workspace_id);

CREATE INDEX brands_workspace_domain_status_idx ON brands(workspace_id, normalized_domain, status);
CREATE INDEX brands_workspace_status_created_idx ON brands(workspace_id, status, created_at);
CREATE INDEX brand_crawl_runs_workspace_brand_created_idx ON brand_crawl_runs(workspace_id, brand_id, created_at);
CREATE INDEX brand_assets_workspace_brand_status_created_idx ON brand_assets(workspace_id, brand_id, status, created_at);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands FORCE ROW LEVEL SECURITY;

CREATE POLICY brands_workspace_isolation ON brands
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.workspace_id = brands.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.workspace_id = brands.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  );
