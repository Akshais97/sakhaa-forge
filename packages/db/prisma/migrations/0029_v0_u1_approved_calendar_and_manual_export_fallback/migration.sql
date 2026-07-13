-- V0-U1 approved calendar and manual export fallback. An authorised production role
-- (schedule_publish_approved_media: Owner/Admin/Client Manager; NOT Reviewer) creates a calendar
-- post bound to one approved exact final-video version (finalVideoId + captured
-- final_video_sha256 + final_video_version + the R2 approval_token), so a post can never silently
-- schedule unapproved or superseded media. An API-scheduled post requires a valid future
-- scheduled_at in the configured timezone and is created SCHEDULED; a manual-export post
-- (manual_export true) is created APPROVED with no scheduled_at, produces a retained manual-export
-- Artifact (export_artifact_id) and leaves manual_live_url null for later verification. Schedule
-- conflicts (same workspace + platform + account within the conflict window) are rejected with
-- PUBLISH_SCHEDULE_INVALID. manual_live_url is supplied later by the verification path. The new
-- table inherits workspace-isolation RLS keyed on app.current_workspace_id; no role is granted an
-- RLS bypass.

-- Calendar/publishing status enum (approved is the manual-export-ready state).
CREATE TYPE publish_status AS ENUM ('DRAFT', 'APPROVED', 'SCHEDULED', 'SUBMITTING', 'ACCEPTED', 'PUBLISHED_UNVERIFIED', 'PUBLISHED_VERIFIED', 'FAILED', 'CANCELLED');

-- Calendar post: one approved exact final-video version scheduled or manually exported.
CREATE TABLE calendar_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  platform varchar(40) NOT NULL,
  account varchar(240) NOT NULL,
  caption varchar(2000) NOT NULL,
  final_video_id uuid NOT NULL REFERENCES final_videos(id),
  final_video_sha256 char(64) NOT NULL,
  final_video_version integer NOT NULL,
  approval_token char(64) NOT NULL,
  scheduled_at timestamptz(6),
  timezone varchar(60) NOT NULL,
  manual_export boolean NOT NULL DEFAULT false,
  manual_live_url varchar(500),
  manual_url_provided_at timestamptz(6),
  export_artifact_id uuid REFERENCES artifacts(id),
  status publish_status NOT NULL DEFAULT 'APPROVED',
  created_by_user_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX calendar_posts_workspace_status_created_idx
  ON calendar_posts(workspace_id, status, created_at);
CREATE INDEX calendar_posts_workspace_scheduled_idx
  ON calendar_posts(workspace_id, scheduled_at, id);
CREATE INDEX calendar_posts_workspace_platform_account_scheduled_idx
  ON calendar_posts(workspace_id, platform, account, scheduled_at);

ALTER TABLE calendar_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_posts_workspace_isolation ON calendar_posts
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));