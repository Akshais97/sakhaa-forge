-- V0-U2 idempotent Meta publication. An authorised production role
-- (schedule_publish_approved_media: Owner/Admin/Client Manager; NOT Reviewer) publishes an
-- approved scheduled calendar post to the intended Meta account exactly once. A durable
-- PublishOperation is persisted BEFORE any Meta network I/O so a crash between persistence and
-- the network response leaves a resumable operation, never a blind duplicate. The operation
-- binds the workspace, the calendar post, the Meta provider route, the idempotency key and a
-- server-side request hash; it stores the external post id and the public post URL only once
-- the provider identity is known. A timeout after possible acceptance marks the operation
-- UNKNOWN and the caller must reconcile before any retry; blind resubmission is prohibited. The
-- Meta callback is signature-verified in constant time, windowed and deduplicated by
-- (workspace, source, eventId); a replay never transitions a second time. The wrong-account
-- check rejects a publish whose body account does not match the calendar post's bound account;
-- a manual-export post cannot be submitted to a provider. Publishing is not a V0 credit
-- operation (the HeyGen cost model owns paid generation), so there is no price/currency/
-- settlement here. The request hash is a server-side binding secret and is never surfaced
-- publicly; the public post URL is the audience-facing URL and is stored only once the post is
-- live. Provider payloads stay adapter-private. The new table inherits workspace-isolation RLS
-- keyed on app.current_workspace_id; no role is granted an RLS bypass. Sources:
-- docs/V0/Sprints/V0-U2_IDEMPOTENT_META_PUBLICATION_SPRINT.md, docs/V0/V0_API.md,
-- docs/V0/V0_STATUS_ENUMS.md, docs/V0/V0_JOBS.md.

-- Publish operation status enum (mirrors provider_operation_status; distinct lifecycle).
CREATE TYPE publish_operation_status AS ENUM (
  'CREATED',
  'SUBMITTING',
  'ACCEPTED',
  'UNKNOWN',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
  'CANCELLED'
);

-- Publish operation: one exactly-once publication per calendar post.
CREATE TABLE publish_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  calendar_post_id uuid NOT NULL REFERENCES calendar_posts(id),
  provider varchar(40) NOT NULL,
  operation_type varchar(40) NOT NULL,
  status publish_operation_status NOT NULL DEFAULT 'CREATED',
  idempotency_key varchar(200) NOT NULL,
  request_hash char(64) NOT NULL,
  external_id varchar(200),
  public_url varchar(500),
  retry_after_ms integer,
  last_error_code varchar(80),
  submitted_at timestamptz(6),
  accepted_at timestamptz(6),
  completed_at timestamptz(6),
  reconciled_at timestamptz(6),
  cancelled_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT publish_operations_provider_check CHECK (btrim(provider) <> ''),
  CONSTRAINT publish_operations_operation_type_check CHECK (btrim(operation_type) <> ''),
  CONSTRAINT publish_operations_status_check CHECK (status IN (
    'CREATED', 'SUBMITTING', 'ACCEPTED', 'UNKNOWN', 'PROCESSING',
    'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'
  ))
);

-- Exactly-once publication per idempotency key per workspace.
CREATE UNIQUE INDEX publish_operations_workspace_idem_idx
  ON publish_operations(workspace_id, idempotency_key);

-- One publish operation per calendar post: a second submission for the same post is rejected,
-- preventing duplicate posts under retry, callback replay or worker crash. Reconciliation
-- resolves an unknown operation rather than creating a new one.
CREATE UNIQUE INDEX publish_operations_one_per_post_idx
  ON publish_operations(calendar_post_id);

-- Deduplicate by provider external id when present.
CREATE UNIQUE INDEX publish_operations_provider_external_idx
  ON publish_operations(provider, external_id)
  WHERE external_id IS NOT NULL;

-- Workspace status views.
CREATE INDEX publish_operations_workspace_status_updated_idx
  ON publish_operations(workspace_id, status, updated_at);

CREATE INDEX publish_operations_workspace_post_status_idx
  ON publish_operations(workspace_id, calendar_post_id, status);

ALTER TABLE publish_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY publish_operations_workspace_isolation ON publish_operations
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));
