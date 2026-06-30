-- V0-U4 audience-facing verification and one completion notification. An authorised production
-- role (schedule_publish_approved_media) independently verifies the audience-facing live post
-- against the approved calendar post: target account, media identity (the approved final-video
-- sha256), caption, visibility and publish time. Only a verified PostVerification advances the
-- calendar post to published_verified and sends exactly one completion notification; provider
-- acknowledgement alone never becomes success. A wrong account/media (identity_mismatch) or
-- restricted visibility (visibility_restricted) is an explicit non-success and sends no
-- notification; a still-processing platform (processing_wait) is checked again. A manual-export
-- post is verifiable once a live URL is supplied (manual_url_required until then). One
-- PostVerification per calendar post (unique(calendar_post_id)) records the bounded attempts,
-- observed identity, final result and retained evidence artifact. An initial immutable
-- PerformanceSnapshot anchors the observation window at verification time (V0-A1 owns the full
-- performance_collect job). The completion notification binds to the calendar post via a new
-- nullable notifications.calendar_post_id and is deduplicated by (workspace_id, payload_hash).
-- The new tables inherit workspace-isolation RLS keyed on app.current_workspace_id; no role is
-- granted an RLS bypass.

-- Audience-facing verification status enum (verified is the only success).
CREATE TYPE verification_status AS ENUM ('PENDING', 'CHECKING', 'PROCESSING_WAIT', 'RETRY_SCHEDULED', 'VERIFIED', 'FAILED', 'IDENTITY_MISMATCH', 'VISIBILITY_RESTRICTED', 'MANUAL_URL_REQUIRED');

-- One audience-facing verification record per calendar post.
CREATE TABLE post_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  calendar_post_id uuid NOT NULL REFERENCES calendar_posts(id),
  evidence_artifact_id uuid REFERENCES artifacts(id),
  provider varchar(40) NOT NULL,
  status verification_status NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  account_matched boolean,
  media_sha256_matched boolean,
  caption_matched boolean,
  visibility varchar(40),
  observed_account varchar(240),
  observed_media_sha256 char(64),
  observed_caption varchar(2000),
  observed_published_at timestamptz(6),
  propagation_delay_ms integer,
  last_error_code varchar(80),
  verified_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX post_verifications_one_per_post_idx
  ON post_verifications(calendar_post_id);
CREATE INDEX post_verifications_workspace_status_updated_idx
  ON post_verifications(workspace_id, status, updated_at);
CREATE INDEX post_verifications_workspace_post_status_idx
  ON post_verifications(workspace_id, calendar_post_id, status);

ALTER TABLE post_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_verifications_workspace_isolation ON post_verifications
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

-- Initial immutable performance observation (V0-A1 owns the full performance_collect job).
CREATE TABLE performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  calendar_post_id uuid NOT NULL REFERENCES calendar_posts(id),
  platform varchar(40) NOT NULL,
  source varchar(40) NOT NULL,
  observation_window_start timestamptz(6) NOT NULL,
  observation_window_end timestamptz(6) NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash char(64) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX performance_snapshots_workspace_post_created_idx
  ON performance_snapshots(workspace_id, calendar_post_id, created_at);

ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY performance_snapshots_workspace_isolation ON performance_snapshots
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

-- The completion notification binds to the calendar post. The column is nullable so review
-- notifications (V0-R1) keep review_item_id and completion notifications carry calendar_post_id;
-- one logical notification per (workspace_id, payload_hash) still deduplicates. Added
-- additively; existing rows backfill to NULL.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS calendar_post_id uuid REFERENCES calendar_posts(id);
CREATE INDEX IF NOT EXISTS notifications_workspace_post_created_idx
  ON notifications(workspace_id, calendar_post_id, created_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;