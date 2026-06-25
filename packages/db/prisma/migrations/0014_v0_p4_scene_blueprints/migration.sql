-- V0-P4 multimodal scene blueprint.
-- Sources: docs/V0/Sprints/V0-P4_MULTIMODAL_SCENE_BLUEPRINT_SPRINT.md,
-- docs/V0/V0_DATA_MODELS.md and docs/V0/V0_PRISMA_SCHEMA.md.

CREATE TABLE video_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  viral_candidate_id UUID NOT NULL REFERENCES viral_candidates(id),
  media_acquisition_id UUID NOT NULL REFERENCES media_acquisitions(id),
  thumbnail_blueprint_id UUID NOT NULL REFERENCES thumbnail_blueprints(id),
  status VARCHAR(40) NOT NULL,
  duration_ms INTEGER NOT NULL,
  stage_states JSONB NOT NULL,
  stage_artifact_ids JSONB NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT video_blueprints_status_check CHECK (status IN ('ocr_done', 'blocked', 'failed')),
  CONSTRAINT video_blueprints_duration_check CHECK (duration_ms > 0),
  CONSTRAINT video_blueprints_stage_artifact_ids_check CHECK (jsonb_typeof(stage_artifact_ids) = 'array'),
  CONSTRAINT video_blueprints_source_hash_check CHECK (source_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE blueprint_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  video_blueprint_id UUID NOT NULL REFERENCES video_blueprints(id),
  scene_index INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  formula_slot VARCHAR(80) NOT NULL,
  shot JSONB NOT NULL,
  motion JSONB NOT NULL,
  transcript JSONB NOT NULL,
  ocr JSONB NOT NULL,
  replacements JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT blueprint_scenes_time_check CHECK (start_ms >= 0 AND end_ms > start_ms),
  CONSTRAINT blueprint_scenes_json_check CHECK (
    jsonb_typeof(shot) = 'object'
    AND jsonb_typeof(motion) = 'object'
    AND jsonb_typeof(transcript) = 'object'
    AND jsonb_typeof(ocr) = 'object'
    AND jsonb_typeof(replacements) = 'array'
  ),
  CONSTRAINT blueprint_scenes_workspace_unique UNIQUE (workspace_id, video_blueprint_id, scene_index)
);

CREATE INDEX video_blueprints_workspace_candidate_created_idx ON video_blueprints(workspace_id, viral_candidate_id, created_at);
CREATE INDEX video_blueprints_workspace_status_created_idx ON video_blueprints(workspace_id, status, created_at);
CREATE INDEX blueprint_scenes_workspace_blueprint_index_idx ON blueprint_scenes(workspace_id, video_blueprint_id, scene_index);

ALTER TABLE video_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_blueprints FORCE ROW LEVEL SECURITY;
ALTER TABLE blueprint_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_scenes FORCE ROW LEVEL SECURITY;

CREATE POLICY video_blueprints_workspace_isolation ON video_blueprints
  USING (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY blueprint_scenes_workspace_isolation ON blueprint_scenes
  USING (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);
