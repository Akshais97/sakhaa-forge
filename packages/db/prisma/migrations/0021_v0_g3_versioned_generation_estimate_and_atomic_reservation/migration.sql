-- V0-G3 versioned generation estimate and atomic reservation. The estimate is
-- extended with an input hash, expiry, optimistic version and confirmation
-- timestamp so confirmation can reject stale, changed or replayed inputs
-- cleanly. Confirming an estimate creates one GenerationJob, one active
-- CreditReservation and exactly one RESERVE ledger entry that debits the
-- workspace wallet in integer minor units, all before any provider network
-- I/O. Reservation does not imply provider submission (that is V0-G4). The
-- RESERVE/CAPTURE/RELEASE ledger types already exist in credit_ledger_type
-- from migration 0020, so this migration does not recreate that enum.
-- ProviderPriceVersion is global provider reference data (not tenant-owned),
-- seeded with the deterministic simulator rate; it is not RLS-protected.
-- Sources: docs/V0/Sprints/V0-G3_VERSIONED_GENERATION_ESTIMATE_AND_ATOMIC_RESERVATION_SPRINT.md.

CREATE TYPE credit_reservation_status AS ENUM (
  'ACTIVE',
  'CAPTURED',
  'RELEASED',
  'EXPIRED',
  'ADJUSTED'
);

-- Extend the existing generation_estimates table with the versioned-estimate
-- guard columns. Existing rows backfill to version 1, a 30s pilot duration and
-- null expiry/confirmation (they predate V0-G3 and are never confirmed).
ALTER TABLE generation_estimates
  ADD COLUMN IF NOT EXISTS input_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS duration_seconds INT NOT NULL DEFAULT 30;

-- Global provider price reference. One effective rate per provider + price
-- version. Not tenant-owned, so no workspace_id and no RLS policy; the
-- connection role reads it like other reference/catalogue rows.
CREATE TABLE IF NOT EXISTS provider_price_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(40) NOT NULL,
  price_version VARCHAR(80) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  rate_minor_per_second BIGINT NOT NULL,
  source VARCHAR(80) NOT NULL,
  valid_from TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT provider_price_versions_provider_check CHECK (btrim(provider) <> ''),
  CONSTRAINT provider_price_versions_price_version_check CHECK (btrim(price_version) <> ''),
  CONSTRAINT provider_price_versions_currency_check CHECK (btrim(currency) <> '' AND length(currency) = 3),
  CONSTRAINT provider_price_versions_rate_check CHECK (rate_minor_per_second >= 0),
  CONSTRAINT provider_price_versions_validity_check CHECK (valid_until >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_price_versions_provider_version_idx
  ON provider_price_versions(provider, price_version);

-- Deterministic simulator price version: the V0.local.1 HeyGen simulator rate
-- in INR minor units per second, valid indefinitely. The 30s pilot cap and the
-- 48,000 minor-unit authorized maximum are enforced in the domain layer; this
-- row is the reference the estimate binds.
INSERT INTO provider_price_versions (provider, price_version, currency, rate_minor_per_second, source, valid_from, valid_until)
VALUES (
  'heygen-simulator',
  'v0.local.1',
  'INR',
  1600,
  'deterministic_simulator',
  '2000-01-01T00:00:00Z',
  '2100-01-01T00:00:00Z'
)
ON CONFLICT (provider, price_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  estimate_id UUID NOT NULL REFERENCES generation_estimates(id),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  selected_script_id UUID,
  avatar_profile_id UUID,
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  idempotency_key VARCHAR(200) NOT NULL,
  input_hash CHAR(64) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  duration_seconds INT NOT NULL DEFAULT 30,
  maximum_authorized_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  price_version VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT generation_jobs_status_check CHECK (status IN (
    'draft', 'estimating_credits', 'awaiting_confirmation', 'credits_reserved',
    'queued', 'submitting', 'accepted', 'unknown', 'generating', 'generated',
    'failed', 'cancel_requested', 'cancelled'
  )),
  CONSTRAINT generation_jobs_currency_check CHECK (btrim(currency) <> '' AND length(currency) = 3),
  CONSTRAINT generation_jobs_duration_check CHECK (duration_seconds > 0 AND duration_seconds <= 30),
  CONSTRAINT generation_jobs_authorization_check CHECK (maximum_authorized_minor > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_workspace_idem_idx
  ON generation_jobs(workspace_id, idempotency_key);

CREATE INDEX IF NOT EXISTS generation_jobs_workspace_status_created_idx
  ON generation_jobs(workspace_id, status, created_at);

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY generation_jobs_workspace_isolation ON generation_jobs
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE TABLE IF NOT EXISTS credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  generation_job_id UUID NOT NULL REFERENCES generation_jobs(id),
  wallet_id UUID NOT NULL REFERENCES credit_wallets(id),
  status credit_reservation_status NOT NULL DEFAULT 'ACTIVE',
  amount_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  expires_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT credit_reservations_currency_check CHECK (btrim(currency) <> '' AND length(currency) = 3),
  CONSTRAINT credit_reservations_amount_check CHECK (amount_minor > 0)
);

-- Exactly-once reservation per idempotency key.
CREATE UNIQUE INDEX IF NOT EXISTS credit_reservations_workspace_idem_idx
  ON credit_reservations(workspace_id, idempotency_key);

-- One active reservation per generation job. The partial unique index is the
-- database-side concurrency guard: two concurrent confirmations of the same
-- generation job cannot both create an active reservation, so credits cannot
-- be reserved twice for one job even under worker retry or double-click.
CREATE UNIQUE INDEX IF NOT EXISTS credit_reservations_one_active_per_job_idx
  ON credit_reservations(generation_job_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS credit_reservations_workspace_job_status_idx
  ON credit_reservations(workspace_id, generation_job_id, status);

ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_reservations_workspace_isolation ON credit_reservations
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));