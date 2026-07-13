# V0-G2 Creator Wallet And Verified Credit Purchase Local Verification — 2026-06-26

## Slice

V0-G2: Creator Wallet And Verified Credit Purchase.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-G2_CREATOR_WALLET_AND_VERIFIED_CREDIT_PURCHASE_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_HEYGEN_COST_MODEL.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAIL_SECURITY.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- `POST /credit-purchases` initiates a verified credit purchase for the deterministic
  Razorpay (India, INR) or Stripe (international, non-INR) simulator. The request requires
  an `Idempotency-Key` and the `purchase_credits_and_view_wallet_ledger` capability (Owner,
  Admin, Client Manager). Provider currency policy is enforced: Razorpay accepts INR only
  and Stripe accepts a non-INR currency only; a violation returns `VALIDATION_FAILED`
  (422). The API creates one workspace wallet per currency (idempotent on
  `(workspaceId, currency)`), a `CreditPurchase` in the `initiated` state with a simulator
  `providerReference`, and responds `202 Accepted` with a signed `checkout` envelope and
  HMAC-SHA256 signature. No payment instrument detail is ever stored or returned.
- `POST /callbacks/razorpay` and `POST /callbacks/stripe` are authenticated, deduplicated,
  replay-protected payment callbacks. The handler verifies the signature over the stable
  envelope with the simulator secret (`PAYMENT_SIGNATURE_INVALID` 401 on mismatch), rejects
  replays outside a five-minute timestamp window, and deduplicates by
  `(workspaceId, provider, providerReference)` via `InboxEvent`. A verified callback
  reconciles amount, currency, provider reference and workspace against the initiated
  purchase; a mismatch returns `PAYMENT_AMOUNT_MISMATCH` (409) and credits nothing. A
  matched callback transitions the purchase to `succeeded`, appends exactly one `PURCHASE`
  ledger entry in integer minor units, and credits the wallet. A forged callback writes no
  ledger row; a replayed callback produces one transition and never credits twice.
- Refund and dispute callbacks append `REFUND` ledger entries that debit the wallet; the
  purchase moves to `refunded` or `disputed`. Ledger entries are append-only; corrections
  are compensating entries, never edits to history.
- `GET /credit-wallets/{id}/ledger` returns the append-only wallet ledger in integer minor
  units with a per-entry running balance, bounded by `limit` (1-50) with a cursor. The
  endpoint requires the `purchase_credits_and_view_wallet_ledger` capability. Owner and
  Admin also receive a `reconciliation` summary that matches ledger purchase and refund
  totals against the deterministic simulator paid totals (`matched`, `mismatched`, or
  `unknown`); Client Manager receives the ledger without the reconciliation summary. A
  missing or cross-workspace wallet is hidden behind `WORKSPACE_ACCESS_DENIED` (404),
  never a 409 that leaks existence, and the other workspace id never appears in the error
  body.
- `POST /credit-wallets/{id}/adjustments` records a compensating credit adjustment as an
  append-only `ADJUSTMENT` ledger entry. The request requires an `Idempotency-Key` and the
  `adjust_credits` capability (Owner, Admin only; Client Manager is denied with
  `PERMISSION_DENIED` 403). A `debit` debits the wallet and a `credit` credits it; the
  adjustment never edits history and writes a durable `credit.adjustment.recorded` audit
  row (target type `CreditWallet`).
- Money is integer minor units everywhere (BigInt in Prisma, Number in the in-memory store
  and public mappers via `Number()`); floating point is never used for storage, math or
  display. The public purchase status is normalized to the lowercase `V0_STATUS_ENUMS.md`
  contract (`initiated`, `pending`, `succeeded`, `failed`, `refunded`, `disputed`) at the
  mapper boundary; the Prisma DB enum is uppercase (`INITIATED` etc.) per the repo
  convention. The ledger `type` is uppercase (`PURCHASE`, `REFUND`, `ADJUSTMENT`);
  `RESERVE`, `CAPTURE`, `RELEASE` are reserved for V0-G3 atomic credit reservation and are
  not written in V0-G2.
- The web shell implements the wallet ledger workflow at
  `apps/web/src/wallet-ledger-workflow.mjs` with pure, DOM-agnostic state functions unit
  tested in Node and a browser glue that wires the generated
  `V0Client.getWalletLedger`. The ledger is read-only server truth; no paid, credit,
  publishing or adjustment action is taken optimistically from this view. Empty, loading,
  ready, refund, adjustment, matched, mismatched, forbidden and blocked-hidden states
  render as `data-state` attributes. The reconciliation section is hidden when the role
  cannot view it. Money renders from integer minor units with integer math; no payment
  instrument, signature, secret or signed URL ever appears in the rendered markup.
- Prisma schema and migration `0020_v0_g2_creator_wallet_verified_credit_purchase` create
  `credit_wallets`, `credit_purchases` and `credit_ledger_entries` with workspace
  back-references, integer-minor-units `BIGINT` columns, provider/currency/amount CHECK
  constraints, exactly-once `unique(workspace_id, idempotency_key)` indexes,
  `unique(workspace_id, provider, provider_reference)` for callback dedup, and
  workspace-isolation RLS policies on all three tables. The `credit_purchase_status` and
  `credit_ledger_type` DB enums are created with UPPERCASE values to match the Prisma
  schema enum declarations (no per-value `@map`), mirroring the `job_status` precedent.

## Red evidence

Command:

```text
node --test tests\integration\credit-g2.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.createCreditPurchase is not a function
```

All ten G2 integration tests failed before `createCreditPurchase`, `postRazorpayCallback`,
`getWalletLedger` and `createCreditAdjustment` existed on the generated client or the
store/routes.

## Green evidence

Command:

```text
node --test tests\integration\credit-g2.test.mjs
```

Outcome:

```text
tests 10
pass 10
fail 0
```

Required sprint tests and outcomes:

- Signed callback fixture — pass. A signed Razorpay callback transitions the purchase to
  `succeeded`, credits the wallet and writes one `PURCHASE` ledger entry in integer minor
  units.
- Forged callback — pass. A forged signature is rejected with `PAYMENT_SIGNATURE_INVALID`
  (401) and writes no ledger entry.
- Callback replay — pass. A replayed callback produces one transition and never credits
  twice.
- Amount and currency mismatch — pass. An amount or currency mismatch returns
  `PAYMENT_AMOUNT_MISMATCH` (409) and credits nothing.
- Purchase/refund/dispute reconciliation — pass. Refund and dispute callbacks append
  `REFUND` ledger entries that debit the wallet.
- Owner/Admin adjustment permission — pass. An Owner records a compensating `ADJUSTMENT`
  entry; a Client Manager is denied with `PERMISSION_DENIED` (403).
- Provider currency policy — pass. Razorpay is INR only and Stripe is international only;
  a violation returns `VALIDATION_FAILED` (422).
- Idempotency key required — pass. Credit purchases and adjustments without an
  `Idempotency-Key` return `IDEMPOTENCY_KEY_REQUIRED` (400).
- Cross-workspace ledger denial — pass. A cross-workspace wallet ledger is hidden behind
  `WORKSPACE_ACCESS_DENIED` (404); the other workspace id does not leak.
- Reconciliation summary — pass. The Owner/Admin reconciliation summary matches the wallet
  ledger totals against the deterministic simulator paid totals.

Unit test command and outcome:

```text
node --test tests\unit\wallet-ledger-workflow.test.mjs
tests 9
pass 9
fail 0
```

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome:

```text
tests 152
pass 147
fail 0
skipped 5

prisma runtime persists V0-G2 verified credit purchase, append-only ledger and Owner adjustment under RLS
tests 5
pass 5
fail 0

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2 local verification passed.
```

The five skipped tests in the broad test glob are the runtime-proof tests intentionally
skipped there and run by the dedicated verification step immediately after, including the
new G2 verified credit purchase runtime proof against Supabase.

## Migration evidence

`node scripts/verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0020_v0_g2_creator_wallet_verified_credit_purchase/migration.sql
CREATE TYPE
CREATE TYPE
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
```

The migration creates `credit_wallets` (one wallet per `(workspace_id, currency)`,
`balance_minor BIGINT`, workspace-isolation RLS policy), `credit_purchases` (provider
CHECK in `razorpay`/`stripe`, `amount_minor > 0` CHECK, `unique(workspace_id,
idempotency_key)` and `unique(workspace_id, provider, provider_reference)`, RLS policy) and
`credit_ledger_entries` (`unique(workspace_id, idempotency_key)` exactly-once guard, RLS
policy). The `credit_purchase_status` and `credit_ledger_type` enums are created with
UPPERCASE values to match the Prisma schema. No BYPASSRLS is granted.

The runtime-proof test confirms persistence under RLS:

```text
SELECT balance_minor::text FROM credit_wallets WHERE id = '<wallet>' AND workspace_id = '<ws>'
-- result: 50000

SELECT status::text || ':' || amount_minor::text FROM credit_purchases WHERE workspace_id = '<ws>' AND wallet_id = '<wallet>'
-- result: SUCCEEDED:50000

SELECT count(*)::text FROM credit_ledger_entries WHERE workspace_id = '<ws>' AND wallet_id = '<wallet>' AND type = 'PURCHASE'
-- result: 1

SELECT string_agg(type::text, ':' ORDER BY effective_at, id) FROM credit_ledger_entries WHERE workspace_id = '<ws>' AND wallet_id = '<wallet>'
-- result: PURCHASE:ADJUSTMENT
```

A 50,000 minor-unit (INR 500.00) Razorpay purchase credits the wallet; a forged callback
(`PAYMENT_SIGNATURE_INVALID` 401) writes no extra ledger row; an Owner debit adjustment of
2,000 minor units appends an `ADJUSTMENT` entry and brings the balance to 48,000. The
public API returns the purchase status as lowercase `succeeded` per the
`V0_STATUS_ENUMS.md` contract while the DB enum stores `SUCCEEDED`. A cross-workspace
ledger read returns `WORKSPACE_ACCESS_DENIED` (404) with no workspace id leak.

## Downstream contract reference

`docs/V0/V0_DATA_MODELS.md`, `docs/V0/V0_API.md` and `docs/V0/V0_PRISMA_SCHEMA.md` record
that V0-G2 writes only `PURCHASE`, `REFUND` and `ADJUSTMENT` ledger entries. The
`RESERVE`, `CAPTURE` and `RELEASE` ledger types and the `CreditReservation` model are
reserved for V0-G3 atomic credit reservation against generation jobs and are not written or
consumed in V0-G2. No V0-G3 job, table, route or runtime dependency was introduced in
V0-G2; the `generationJobId` column on `credit_ledger_entries` is nullable and unused until
G3 binds a reservation to a generation job.

## Browser state evidence

The web shell renders the wallet ledger contract at
`data-testid="wallet-ledger-contract"` with `ready`, `purchase`, `refund`, `adjustment`,
`matched`, `mismatched`, `forbidden`, `blocked-hidden`, `loading` and `empty` states. The
`wallet-ledger-workflow` unit suite asserts the rendered copy, the integer-minor-units
money formatting (no floating point), the reconciliation section hiding for roles that
cannot view it, and that no payment instrument, signature, secret or signed URL appears in
the markup. This is the deterministic V0 browser-state evidence for the sprint; no live
browser screenshot is captured in local verification.

## Scope note

This is local deterministic simulator evidence for V0-G2. It does not claim production
payment-provider readiness or full V0 acceptance. The Razorpay and Stripe adapters are
deterministic simulators with a local HMAC secret; real provider SDKs, webhook signing
keys, settlement reconciliation and payout reconciliation are deferred. Credit reservation
against generation jobs (V0-G3) and publishing are not yet implemented. No payment
instrument detail is ever stored, and no claim of settlement or payout is made before the
deterministic simulator callback verifies.
