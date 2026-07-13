-- V0-G4 exactly-once HeyGen submission. A durable ProviderOperation is persisted
-- BEFORE any provider network I/O so a crash between persistence and the network
-- response leaves a resumable operation, never a blind duplicate. The operation
-- binds the workspace, generation job, provider route, idempotency key and request
-- hash; submission transitions created -> submitting -> accepted -> processing ->
-- completed, with unknown for a timeout after possible acceptance and failed for a
-- malformed or rejected provider response. Reconciliation resolves unknown by
-- external id, request hash or original idempotency key; blind resubmission is
-- prohibited. The pay-as-you-go concurrency limit (10) is enforced in the domain
-- layer against active operations. Provider payloads stay adapter-private; the
-- callback handler verifies an HMAC signature in constant time, enforces a timestamp
-- window and deduplicates via inbox_events. Credit capture/release settlement is
-- V0-G5; V0-G4 only submits and reconciles. Sources:
-- docs/V0/Sprints/V0-G4_EXACTLY_ONCE_HEYGEN_SUBMISSION_SPRINT.md,
-- docs/V0/V0_HEYGEN_INTEGRATION.md, docs/V0/V0_JOBS.md.

CREATE TYPE provider_operation_status AS ENUM (
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

CREATE TABLE IF NOT EXISTS provider_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  generation_job_id UUID NOT NULL REFERENCES generation_jobs(id),
  provider VARCHAR(40) NOT NULL,
  operation_type VARCHAR(40) NOT NULL,
  status provider_operation_status NOT NULL DEFAULT 'CREATED',
  idempotency_key VARCHAR(200) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  external_id VARCHAR(200),
  price_version VARCHAR(80) NOT NULL,
  estimated_maximum_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  retry_after_ms INT,
  last_error_code VARCHAR(80),
  submitted_at TIMESTAMPTZ(6),
  accepted_at TIMESTAMPTZ(6),
  completed_at TIMESTAMPTZ(6),
  reconciled_at TIMESTAMPTZ(6),
  cancelled_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT provider_operations_provider_check CHECK (btrim(provider) <> ''),
  CONSTRAINT provider_operations_operation_type_check CHECK (btrim(operation_type) <> ''),
  CONSTRAINT provider_operations_currency_check CHECK (btrim(currency) <> '' AND length(currency) = 3),
  CONSTRAINT provider_operations_estimated_maximum_check CHECK (estimated_maximum_minor > 0),
  CONSTRAINT provider_operations_status_check CHECK (status IN (
    'CREATED', 'SUBMITTING', 'ACCEPTED', 'UNKNOWN', 'PROCESSING',
    'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'
  ))
);

-- Exactly-once submission per idempotency key per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS provider_operations_workspace_idem_idx
  ON provider_operations(workspace_id, idempotency_key);

-- One operation per generation job: a second paid submission for the same job is
-- rejected, preventing duplicate provider work under retry, callback replay or
-- worker crash.
CREATE UNIQUE INDEX IF NOT EXISTS provider_operations_one_per_job_idx
  ON provider_operations(generation_job_id);

-- Deduplicate by provider external id when present.
CREATE UNIQUE INDEX IF NOT EXISTS provider_operations_provider_external_idx
  ON provider_operations(provider, external_id)
  WHERE external_id IS NOT NULL;

-- Active-operation count for the concurrency limit and workspace status views.
CREATE INDEX IF NOT EXISTS provider_operations_workspace_status_updated_idx
  ON provider_operations(workspace_id, status, updated_at);

CREATE INDEX IF NOT EXISTS provider_operations_workspace_job_status_idx
  ON provider_operations(workspace_id, generation_job_id, status);

ALTER TABLE provider_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_operations_workspace_isolation ON provider_operations
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));