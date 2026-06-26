-- V0-G2 creator wallet and verified credit purchase: one workspace wallet per
-- currency, Razorpay (India, INR) / Stripe (international) purchase state, and
-- an append-only integer-minor-units ledger. Payment instrument details are
-- never stored. Ledger entries are financial truth; corrections are compensating
-- entries. RESERVE/CAPTURE/RELEASE are V0-G3 atomic-reservation types and are
-- present in the enum so G3 can use them without a migration; G2 writes only
-- PURCHASE, REFUND and ADJUSTMENT rows.
-- Sources: docs/V0/Sprints/V0-G2_CREATOR_WALLET_AND_VERIFIED_CREDIT_PURCHASE_SPRINT.md.

CREATE TYPE credit_purchase_status AS ENUM (
  'INITIATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'DISPUTED'
);

CREATE TYPE credit_ledger_type AS ENUM (
  'PURCHASE',
  'RESERVE',
  'CAPTURE',
  'RELEASE',
  'ADJUSTMENT',
  'REFUND'
);

CREATE TABLE IF NOT EXISTS credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  currency VARCHAR(3) NOT NULL,
  balance_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT credit_wallets_currency_check CHECK (btrim(currency) <> '' AND length(currency) = 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_wallets_workspace_currency_idx
  ON credit_wallets(workspace_id, currency);

CREATE INDEX IF NOT EXISTS credit_wallets_workspace_updated_idx
  ON credit_wallets(workspace_id, updated_at, id);

ALTER TABLE credit_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_wallets_workspace_isolation ON credit_wallets
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  wallet_id UUID NOT NULL REFERENCES credit_wallets(id),
  provider VARCHAR(40) NOT NULL,
  provider_reference VARCHAR(200) NOT NULL,
  status credit_purchase_status NOT NULL DEFAULT 'INITIATED',
  amount_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT credit_purchases_provider_check CHECK (provider IN ('razorpay', 'stripe')),
  CONSTRAINT credit_purchases_currency_check CHECK (btrim(currency) <> '' AND length(currency) = 3),
  CONSTRAINT credit_purchases_amount_check CHECK (amount_minor > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_workspace_idem_idx
  ON credit_purchases(workspace_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_workspace_provider_ref_idx
  ON credit_purchases(workspace_id, provider, provider_reference);

CREATE INDEX IF NOT EXISTS credit_purchases_workspace_status_updated_idx
  ON credit_purchases(workspace_id, status, updated_at);

ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_purchases_workspace_isolation ON credit_purchases
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE TABLE IF NOT EXISTS credit_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  wallet_id UUID NOT NULL REFERENCES credit_wallets(id),
  generation_job_id UUID,
  type credit_ledger_type NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  reason VARCHAR(500),
  effective_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_entries_currency_check CHECK (btrim(currency) <> '' AND length(currency) = 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_entries_workspace_idem_idx
  ON credit_ledger_entries(workspace_id, idempotency_key);

CREATE INDEX IF NOT EXISTS credit_ledger_entries_wallet_effective_idx
  ON credit_ledger_entries(wallet_id, effective_at, id);

ALTER TABLE credit_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_ledger_entries_workspace_isolation ON credit_ledger_entries
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));