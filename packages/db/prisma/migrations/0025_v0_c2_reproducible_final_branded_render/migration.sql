-- V0-C2 reproducible final branded render. A validated AE plan renders one retained 9:16
-- final MP4, thumbnail and captions through the deterministic AE worker simulator. The
-- render preserves the plan input hash and capability version, validates the worker output
-- (codec, duration, resolution, output hash against the deterministic golden render) and
-- retains a versioned FinalVideo with an immutable revision lineage: a new revision creates
-- a new row (CURRENT) and supersedes the prior CURRENT row (set to SUPERSEDED) without
-- overwriting it. A worker crash is recovered once; capability drift and incompatible worker
-- output are classified and never produce a final video. Render is a costly mutation
-- producing retained artifacts, so the RenderAttempt is persisted RUNNING before the AE
-- worker runs (persist external side-effect operation before the work) and an idempotency key
-- is required. The render attempt logs are retained as a CLEAN render-logs Artifact. The
-- final-video sha256 is the deterministic golden render hash for the plan, so the same plan
-- renders to the same hash across revisions. The input hash, asset hashes, timeline and
-- sha256 are server-side validation bindings and never reach the browser. Sources:
-- docs/V0/Sprints/V0-C2_REPRODUCIBLE_FINAL_BRANDED_RENDER_SPRINT.md, docs/V0/V0_DATA_MODELS.md,
-- docs/V0/V0_API.md, docs/V0/V0_STATUS_ENUMS.md, docs/V0/V0_JOBS.md, docs/V0/V0_ERROR_CATALOG.md.

CREATE TYPE render_attempt_status AS ENUM (
  'RUNNING',
  'SUCCEEDED',
  'FAILED'
);

CREATE TYPE final_video_status AS ENUM (
  'CURRENT',
  'SUPERSEDED'
);

-- Render attempt: the durable record of one AE render of a validated plan. Persisted RUNNING
-- before the AE worker runs, then SUCCEEDED with the retained final-video output hash, or
-- FAILED for capability drift, incompatible output or an unrecovered crash. input_hash is the
-- plan canonical timeline hash and input_asset_hashes are the referenced generated-asset
-- sha256s; both are server-side validation bindings and never reach the browser.
-- logs_artifact_id is the CLEAN render-logs Artifact (set when the attempt is persisted).
-- ae_plan_id is a FK to ae_plans (only validated plans are rendered). One active (RUNNING)
-- attempt per composition instruction is enforced by the partial unique index below; one
-- attempt per idempotency key by render_attempts_workspace_idem_idx.
CREATE TABLE IF NOT EXISTS render_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  composition_instruction_id UUID NOT NULL REFERENCES composition_instructions(id),
  ae_plan_id UUID NOT NULL REFERENCES ae_plans(id),
  version INT NOT NULL DEFAULT 1,
  renderer VARCHAR(80) NOT NULL,
  input_hash CHAR(64) NOT NULL,
  input_asset_hashes JSONB NOT NULL,
  worker_capability_version VARCHAR(80) NOT NULL,
  output_hash CHAR(64),
  status render_attempt_status NOT NULL DEFAULT 'RUNNING',
  logs_artifact_id UUID REFERENCES artifacts(id),
  cost_minor INT NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(120) NOT NULL,
  started_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT render_attempts_renderer_check CHECK (btrim(renderer) <> ''),
  CONSTRAINT render_attempts_input_hash_check CHECK (btrim(input_hash) <> ''),
  CONSTRAINT render_attempts_capability_version_check CHECK (btrim(worker_capability_version) <> ''),
  CONSTRAINT render_attempts_idempotency_key_check CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT render_attempts_version_check CHECK (version > 0),
  CONSTRAINT render_attempts_cost_minor_check CHECK (cost_minor >= 0),
  CONSTRAINT render_attempts_status_completed_check CHECK (
    (status = 'SUCCEEDED' AND output_hash IS NOT NULL AND completed_at IS NOT NULL) OR
    (status = 'FAILED' AND completed_at IS NOT NULL) OR
    (status = 'RUNNING')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS render_attempts_workspace_idem_idx
  ON render_attempts(workspace_id, idempotency_key);

-- One active (RUNNING) render attempt per composition instruction: a concurrency guard so a
-- second render of the same instruction cannot start while one is already running.
CREATE UNIQUE INDEX IF NOT EXISTS render_attempts_one_active_per_instruction_idx
  ON render_attempts(workspace_id, composition_instruction_id)
  WHERE status = 'RUNNING';

CREATE INDEX IF NOT EXISTS render_attempts_workspace_instruction_version_idx
  ON render_attempts(workspace_id, composition_instruction_id, version);

CREATE INDEX IF NOT EXISTS render_attempts_workspace_status_created_idx
  ON render_attempts(workspace_id, status, created_at);

ALTER TABLE render_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY render_attempts_workspace_isolation ON render_attempts
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

-- Final video: the approved production object retained from a succeeded render, with
-- thumbnail, captions and a media fingerprint (sha256). Versioned per composition
-- instruction: a new revision creates a new row (version N+1, CURRENT) and supersedes the
-- prior CURRENT row (set to SUPERSEDED) without overwriting it, preserving the immutable
-- revision lineage. Exactly one CURRENT final video per instruction is enforced by the
-- partial unique index below. render_attempt_id is a FK to render_attempts. The artifact ids
-- bind the retained CLEAN final video, thumbnail and captions media.
CREATE TABLE IF NOT EXISTS final_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  composition_instruction_id UUID NOT NULL REFERENCES composition_instructions(id),
  render_attempt_id UUID NOT NULL REFERENCES render_attempts(id),
  version INT NOT NULL DEFAULT 1,
  status final_video_status NOT NULL DEFAULT 'CURRENT',
  final_video_artifact_id UUID NOT NULL REFERENCES artifacts(id),
  thumbnail_artifact_id UUID NOT NULL REFERENCES artifacts(id),
  captions_artifact_id UUID NOT NULL REFERENCES artifacts(id),
  duration_seconds INT NOT NULL,
  resolution VARCHAR(20) NOT NULL,
  codec VARCHAR(40) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  byte_size INT NOT NULL,
  capability_version VARCHAR(80) NOT NULL,
  schema_version VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT final_videos_resolution_check CHECK (btrim(resolution) <> ''),
  CONSTRAINT final_videos_codec_check CHECK (btrim(codec) <> ''),
  CONSTRAINT final_videos_capability_version_check CHECK (btrim(capability_version) <> ''),
  CONSTRAINT final_videos_schema_version_check CHECK (btrim(schema_version) <> ''),
  CONSTRAINT final_videos_version_check CHECK (version > 0),
  CONSTRAINT final_videos_duration_seconds_check CHECK (duration_seconds > 0),
  CONSTRAINT final_videos_byte_size_check CHECK (byte_size > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS final_videos_workspace_instruction_version_idx
  ON final_videos(workspace_id, composition_instruction_id, version);

-- Exactly one CURRENT final video per composition instruction: the revision lineage invariant.
CREATE UNIQUE INDEX IF NOT EXISTS final_videos_one_current_per_instruction_idx
  ON final_videos(workspace_id, composition_instruction_id)
  WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS final_videos_workspace_status_created_idx
  ON final_videos(workspace_id, status, created_at);

ALTER TABLE final_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY final_videos_workspace_isolation ON final_videos
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));