-- V0-G5 retained generated media and settled credits. Completed HeyGen media is copied
-- into private V0 storage through the adapter only, quarantined, validated and hashed,
-- then bound to a GeneratedSegment, a versioned GeneratedAsset and a CreativeLineage row.
-- The transient provider URL is never retained as production source; media is not clean
-- until artifact validation passes. The reconciled provider total is compared with the
-- authorized maximum and credits are captured once on success or released once on
-- failure. Settlement is idempotent and append-only: the CAPTURE/RELEASE ledger entry
-- carries a job-derived idempotency key so a crash between media retention and ledger
-- settlement is recovered without orphaned capture or duplicate release. Sources:
-- docs/V0/Sprints/V0-G5_RETAINED_GENERATED_MEDIA_AND_SETTLED_CREDITS_SPRINT.md,
-- docs/V0/V0_HEYGEN_INTEGRATION.md, docs/V0/V0_HEYGEN_COST_MODEL.md,
-- docs/V0/V0_DATA_MODELS.md, docs/V0/V0_JOBS.md.

-- The reconciled actual provider cost and settlement timestamp on the provider operation.
-- provider_total_minor is nullable until settlement reconciles the cost; settled_at marks
-- the ledger settlement, not the provider completion.
ALTER TABLE provider_operations
  ADD COLUMN IF NOT EXISTS provider_total_minor BIGINT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ(6);

-- A retained provider output segment: the clean retained Artifact, the provider external
-- id, the duration and the SHA-256 hash. The transient provider URL is never stored here.
CREATE TABLE IF NOT EXISTS generated_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  generation_job_id UUID NOT NULL REFERENCES generation_jobs(id),
  provider_operation_id UUID NOT NULL REFERENCES provider_operations(id),
  provider VARCHAR(40) NOT NULL,
  external_id VARCHAR(200),
  segment_index INT NOT NULL DEFAULT 0,
  duration_seconds INT NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  byte_size INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  artifact_id UUID NOT NULL REFERENCES artifacts(id),
  source_fetched_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT generated_segments_provider_check CHECK (btrim(provider) <> ''),
  CONSTRAINT generated_segments_duration_check CHECK (duration_seconds > 0),
  CONSTRAINT generated_segments_byte_size_check CHECK (byte_size > 0),
  CONSTRAINT generated_segments_segment_index_check CHECK (segment_index >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS generated_segments_workspace_job_index_idx
  ON generated_segments(workspace_id, generation_job_id, segment_index);

CREATE INDEX IF NOT EXISTS generated_segments_workspace_job_idx
  ON generated_segments(workspace_id, generation_job_id);

ALTER TABLE generated_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY generated_segments_workspace_isolation ON generated_segments
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

-- A versioned generated asset: the retained clean Artifact bound to a segment, with a
-- kind (provider_video for V0-G5; assembled/rendered kinds are later sprints) and a
-- version. unique(workspace_id, generation_job_id, version) makes asset creation
-- exactly-once per version per job.
CREATE TABLE IF NOT EXISTS generated_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  generation_job_id UUID NOT NULL REFERENCES generation_jobs(id),
  segment_id UUID NOT NULL REFERENCES generated_segments(id),
  artifact_id UUID NOT NULL REFERENCES artifacts(id),
  version INT NOT NULL DEFAULT 1,
  kind VARCHAR(40) NOT NULL DEFAULT 'provider_video',
  duration_seconds INT NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'CLEAN',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT generated_assets_kind_check CHECK (btrim(kind) <> ''),
  CONSTRAINT generated_assets_duration_check CHECK (duration_seconds > 0),
  CONSTRAINT generated_assets_version_check CHECK (version > 0),
  CONSTRAINT generated_assets_status_check CHECK (status IN ('CLEAN', 'REJECTED', 'SUPERSEDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS generated_assets_workspace_job_version_idx
  ON generated_assets(workspace_id, generation_job_id, version);

CREATE INDEX IF NOT EXISTS generated_assets_workspace_job_idx
  ON generated_assets(workspace_id, generation_job_id);

ALTER TABLE generated_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY generated_assets_workspace_isolation ON generated_assets
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

-- Creative lineage: the immutable ancestry of a generated asset from the approved brand
-- profile, selected script, consent-safe avatar, estimate, provider operation and price
-- version. One lineage row per generation job.
CREATE TABLE IF NOT EXISTS creative_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  generation_job_id UUID NOT NULL REFERENCES generation_jobs(id),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  selected_script_id UUID,
  avatar_profile_id UUID REFERENCES avatar_profiles(id),
  estimate_id UUID NOT NULL REFERENCES generation_estimates(id),
  provider VARCHAR(40) NOT NULL,
  provider_operation_id UUID NOT NULL REFERENCES provider_operations(id),
  price_version VARCHAR(80) NOT NULL,
  generated_asset_id UUID NOT NULL REFERENCES generated_assets(id),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT creative_lineage_provider_check CHECK (btrim(provider) <> ''),
  CONSTRAINT creative_lineage_price_version_check CHECK (btrim(price_version) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_lineage_workspace_job_idx
  ON creative_lineage(workspace_id, generation_job_id);

CREATE INDEX IF NOT EXISTS creative_lineage_workspace_asset_idx
  ON creative_lineage(workspace_id, generated_asset_id);

ALTER TABLE creative_lineage ENABLE ROW LEVEL SECURITY;

CREATE POLICY creative_lineage_workspace_isolation ON creative_lineage
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));