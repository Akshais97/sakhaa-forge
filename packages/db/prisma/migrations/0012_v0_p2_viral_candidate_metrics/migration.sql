-- V0-P2 viral candidate discovery and immutable metric snapshots.

CREATE TABLE viral_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  blueprint_request_id UUID NOT NULL REFERENCES blueprint_requests(id),
  provider VARCHAR(80) NOT NULL,
  source_identity VARCHAR(240) NOT NULL,
  source_url VARCHAR(1000) NOT NULL,
  title VARCHAR(240) NOT NULL,
  creator_handle VARCHAR(160) NOT NULL,
  niche VARCHAR(240) NOT NULL,
  market VARCHAR(120) NOT NULL,
  objective_type VARCHAR(120) NOT NULL,
  rank INTEGER NOT NULL,
  score INTEGER NOT NULL,
  selection_state VARCHAR(40) NOT NULL,
  rights_warnings JSONB NOT NULL,
  metadata JSONB NOT NULL,
  provenance JSONB NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT viral_candidates_rank_check CHECK (rank > 0),
  CONSTRAINT viral_candidates_score_check CHECK (score >= 0),
  CONSTRAINT viral_candidates_selection_state_check CHECK (selection_state IN ('available', 'selected', 'blocked', 'archived')),
  CONSTRAINT viral_candidates_source_hash_check CHECK (source_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  viral_candidate_id UUID NOT NULL REFERENCES viral_candidates(id),
  provider VARCHAR(80) NOT NULL,
  observed_at TIMESTAMPTZ(6) NOT NULL,
  metrics JSONB NOT NULL,
  source_hash CHAR(64) NOT NULL,
  immutable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT metric_snapshots_immutable_check CHECK (immutable = true),
  CONSTRAINT metric_snapshots_source_hash_check CHECK (source_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX viral_candidates_workspace_request_source_hash_idx
  ON viral_candidates(workspace_id, blueprint_request_id, source_hash);
CREATE INDEX viral_candidates_workspace_request_rank_idx
  ON viral_candidates(workspace_id, blueprint_request_id, rank);
CREATE INDEX viral_candidates_workspace_selection_created_idx
  ON viral_candidates(workspace_id, selection_state, created_at);

CREATE UNIQUE INDEX metric_snapshots_workspace_candidate_source_hash_idx
  ON metric_snapshots(workspace_id, viral_candidate_id, source_hash);
CREATE INDEX metric_snapshots_workspace_observed_idx
  ON metric_snapshots(workspace_id, observed_at, id);

ALTER TABLE viral_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY viral_candidates_workspace_isolation ON viral_candidates
  USING (workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY metric_snapshots_workspace_isolation ON metric_snapshots
  USING (workspace_id::text = current_setting('app.current_workspace_id', true))
  WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));
