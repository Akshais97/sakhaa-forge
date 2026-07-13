-- V0-C2 review fix: render-level CreativeLineage retention + input-bound render idempotency.
-- Extends creative_lineage with render-level bindings (composition instruction, AE plan, render
-- attempt, final video) and relaxes generation_job_id to nullable so a render-level lineage row
-- is identified by final_video_id (one per final video) while a G5 lineage row stays identified
-- by generation_job_id (one per generation job). Adds render_attempts.idempotency_input_hash so an
-- idempotency key is scoped to the exact render operation input; the same key replayed against a
-- different composition is a conflict (IDEMPOTENCY_INPUT_CONFLICT), never a silent replay of the
-- wrong final video. New columns inherit the existing workspace-isolation RLS policies.

-- Render-level lineage: generation_job_id becomes nullable for render-level rows (the G5 row
-- keeps it set; the render-level row sets it NULL and is identified by final_video_id).
ALTER TABLE creative_lineage ALTER COLUMN generation_job_id DROP NOT NULL;

ALTER TABLE creative_lineage
  ADD COLUMN IF NOT EXISTS composition_instruction_id UUID REFERENCES composition_instructions(id),
  ADD COLUMN IF NOT EXISTS ae_plan_id UUID REFERENCES ae_plans(id),
  ADD COLUMN IF NOT EXISTS render_attempt_id UUID REFERENCES render_attempts(id),
  ADD COLUMN IF NOT EXISTS final_video_id UUID REFERENCES final_videos(id);

-- One render-level lineage row per final video. final_video_id is NULL for G5 rows, which the
-- unique constraint skips because SQL treats NULLs as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS creative_lineage_one_final_video_idx
  ON creative_lineage(workspace_id, final_video_id);

CREATE INDEX IF NOT EXISTS creative_lineage_workspace_final_video_idx
  ON creative_lineage(workspace_id, final_video_id);

-- Input-bound render idempotency: the hash of the exact render operation input, scoped to the
-- idempotency key. NULL on legacy rows; the application compares it on lookup.
ALTER TABLE render_attempts
  ADD COLUMN IF NOT EXISTS idempotency_input_hash CHAR(64);

-- RLS stays enabled on the extended tables; the new columns inherit the existing
-- workspace-isolation policy keyed on app.current_workspace_id. No role is granted an
-- RLS bypass.
ALTER TABLE creative_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE render_attempts ENABLE ROW LEVEL SECURITY;