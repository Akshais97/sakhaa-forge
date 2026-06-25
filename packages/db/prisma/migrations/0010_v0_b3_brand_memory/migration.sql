CREATE TABLE brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  brand_id UUID NOT NULL,
  crawl_run_id UUID NOT NULL REFERENCES brand_crawl_runs(id),
  schema_version VARCHAR(80) NOT NULL,
  version INTEGER NOT NULL,
  status VARCHAR(40) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  profile JSONB NOT NULL,
  source_summary JSONB NOT NULL,
  approved_by_user_id UUID NOT NULL REFERENCES users(id),
  approved_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT brand_profiles_workspace_brand_version_unique UNIQUE (workspace_id, brand_id, version),
  CONSTRAINT brand_profiles_status_check CHECK (status IN ('draft', 'approved', 'rejected', 'superseded', 'archived'))
);

CREATE UNIQUE INDEX brand_profiles_one_active_approved
  ON brand_profiles(workspace_id, brand_id)
  WHERE active = true AND status = 'approved';
CREATE INDEX brand_profiles_workspace_brand_status_active_idx
  ON brand_profiles(workspace_id, brand_id, status, active);

CREATE TABLE brand_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  brand_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  decision VARCHAR(40) NOT NULL,
  reason VARCHAR(500),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT brand_approvals_decision_check CHECK (decision IN ('approve', 'reject', 'request_changes'))
);

CREATE INDEX brand_approvals_workspace_brand_created_idx
  ON brand_approvals(workspace_id, brand_id, created_at);

CREATE TABLE brand_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  brand_id UUID NOT NULL,
  type VARCHAR(80) NOT NULL,
  value VARCHAR(500) NOT NULL,
  severity VARCHAR(40) NOT NULL,
  rationale VARCHAR(500) NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT brand_rules_profile_type_value_unique UNIQUE (workspace_id, brand_profile_id, type, value),
  CONSTRAINT brand_rules_severity_check CHECK (severity IN ('critical', 'warning'))
);

CREATE INDEX brand_rules_workspace_brand_status_idx
  ON brand_rules(workspace_id, brand_id, status);

CREATE TABLE generation_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  status VARCHAR(40) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  price_version VARCHAR(80) NOT NULL,
  maximum_authorized_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  selected_script_id UUID NOT NULL,
  avatar_profile_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT generation_estimates_positive_authorization CHECK (maximum_authorized_minor > 0)
);

CREATE INDEX generation_estimates_workspace_brand_profile_status_idx
  ON generation_estimates(workspace_id, brand_profile_id, status);

ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE brand_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE brand_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE generation_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_estimates FORCE ROW LEVEL SECURITY;

CREATE POLICY brand_profiles_workspace_isolation ON brand_profiles
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_profiles.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_profiles.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY brand_approvals_workspace_isolation ON brand_approvals
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_approvals.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_approvals.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY brand_rules_workspace_isolation ON brand_rules
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_rules.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = brand_rules.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY generation_estimates_workspace_isolation ON generation_estimates
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = generation_estimates.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = generation_estimates.workspace_id
        AND memberships.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND memberships.status = 'ACTIVE'
    )
  );
