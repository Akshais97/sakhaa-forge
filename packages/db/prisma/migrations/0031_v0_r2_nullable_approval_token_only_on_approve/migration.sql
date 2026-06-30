-- V0-R2 fix: the deterministic approval token is minted only on approve. The original R2
-- migration (0028) declared approval_token NOT NULL and the implementation wrote a token for
-- every decision, so reject and request_changes rows carried approval-like tokens in the system
-- of record even though the response hid them. Make approval_token nullable and enforce token
-- uniqueness only for real (non-null) approval tokens via a partial unique index. The application
-- now writes approval_token only for decision = APPROVE. Additive and backward compatible: null
-- tokens are ignored by the partial index, so any pre-existing reject/request_changes rows keep
-- their (now-harmless) token and new non-approve rows store NULL. No role is granted an RLS bypass.

ALTER TABLE review_decisions ALTER COLUMN approval_token DROP NOT NULL;

DROP INDEX IF EXISTS review_decisions_one_approval_token_idx;

CREATE UNIQUE INDEX review_decisions_one_approval_token_idx
  ON review_decisions(workspace_id, approval_token)
  WHERE approval_token IS NOT NULL;

ALTER TABLE review_decisions ENABLE ROW LEVEL SECURITY;