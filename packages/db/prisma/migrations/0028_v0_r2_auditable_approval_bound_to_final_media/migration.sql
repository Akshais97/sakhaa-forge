-- V0-R2 auditable approval bound to final media. An authorised production role
-- (approve_reject_final_video: Owner/Admin/Client Manager; NOT Reviewer) records one terminal
-- decision (approve/reject/request_changes) against a review item bound to one exact final-video
-- version. The decision records the actor, reason, timestamp and the bound final-media
-- fingerprint (finalVideoSha256 + finalVideoVersion). An approve persists a downstream approval
-- token bound to the exact version that scheduling may later consume; reject/request_changes
-- persist a token only for approve. One decision per review item; a second decision for the same
-- review item/version is rejected (REVIEW_DECISION_ALREADY_RECORDED). A decision against a
-- superseded bound version is rejected (REVIEW_VERSION_STALE) and the review item is archived.
-- New table inherits workspace-isolation RLS; no role is granted an RLS bypass.

-- Approval decision enum.
CREATE TYPE approval_decision AS ENUM ('APPROVE', 'REJECT', 'REQUEST_CHANGES');

-- Review decision: one terminal decision per review item, bound to the exact final-video version.
CREATE TABLE review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  review_item_id uuid NOT NULL REFERENCES review_items(id),
  final_video_id uuid NOT NULL REFERENCES final_videos(id),
  final_video_sha256 char(64) NOT NULL,
  final_video_version integer NOT NULL,
  decision approval_decision NOT NULL,
  reason varchar(2000) NOT NULL,
  decided_by_user_id uuid NOT NULL,
  approval_token char(64) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

-- One terminal decision per review item/version; one durable approval token per decision.
CREATE UNIQUE INDEX review_decisions_one_per_review_item_idx
  ON review_decisions(workspace_id, review_item_id);
CREATE UNIQUE INDEX review_decisions_one_approval_token_idx
  ON review_decisions(workspace_id, approval_token);
CREATE INDEX review_decisions_workspace_decision_created_idx
  ON review_decisions(workspace_id, decision, created_at);

ALTER TABLE review_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_decisions_workspace_isolation ON review_decisions
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));