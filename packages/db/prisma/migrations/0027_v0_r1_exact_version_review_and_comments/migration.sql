-- V0-R1 exact-version review and comments. A production role opens a review item bound to one
-- exact final-video version (finalVideoId + captured finalVideoSha256 + finalVideoVersion), any
-- comment-capable role (including Reviewer) adds timestamped append-only comments, a comment
-- against a superseded version returns REVIEW_VERSION_STALE, and repeated comment activity on
-- one review item collapses to one logical notification. Comments cannot attach to another
-- workspace/version. New tables inherit workspace-isolation RLS; no role is granted an RLS
-- bypass.

-- Review stage and statuses.
CREATE TYPE review_stage AS ENUM ('INTERNAL_REVIEW', 'CLIENT_REVIEW');

CREATE TYPE review_item_status AS ENUM (
  'INTERNAL_REVIEW',
  'CLIENT_REVIEW',
  'CHANGE_REQUESTED',
  'APPROVED',
  'REJECTED',
  'ARCHIVED'
);

CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED');

-- Review item: one exact final-video version submitted to review.
CREATE TABLE review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  composition_instruction_id uuid NOT NULL REFERENCES composition_instructions(id),
  final_video_id uuid NOT NULL REFERENCES final_videos(id),
  final_video_sha256 char(64) NOT NULL,
  final_video_version integer NOT NULL,
  review_stage review_stage NOT NULL,
  status review_item_status NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);

-- One review item per exact final-video version.
CREATE UNIQUE INDEX review_items_one_per_final_video_idx
  ON review_items(workspace_id, final_video_id);
CREATE INDEX review_items_workspace_status_created_idx
  ON review_items(workspace_id, status, created_at);
CREATE INDEX review_items_workspace_stage_created_idx
  ON review_items(workspace_id, review_stage, created_at);

ALTER TABLE review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_items_workspace_isolation ON review_items
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

-- Review comment: append-only, timestamped feedback on one review item.
CREATE TABLE review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  review_item_id uuid NOT NULL REFERENCES review_items(id),
  author_user_id uuid NOT NULL,
  body varchar(2000) NOT NULL,
  timestamp_ms integer NOT NULL DEFAULT 0,
  thread_id uuid,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX review_comments_workspace_item_created_idx
  ON review_comments(workspace_id, review_item_id, created_at);

ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_comments_workspace_isolation ON review_comments
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

-- Notification: one logical notification per deduplicated payload.
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  review_item_id uuid REFERENCES review_items(id),
  notification_type varchar(80) NOT NULL,
  channel varchar(40) NOT NULL,
  recipient_user_id uuid NOT NULL,
  payload_hash char(64) NOT NULL,
  status notification_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  sent_at timestamptz(6)
);

-- One logical notification per workspace + payload.
CREATE UNIQUE INDEX notifications_one_logical_per_payload_idx
  ON notifications(workspace_id, payload_hash);
CREATE INDEX notifications_workspace_recipient_created_idx
  ON notifications(workspace_id, recipient_user_id, created_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_workspace_isolation ON notifications
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));