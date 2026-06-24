# V0-G2 Sprint: Creator Wallet And Verified Credit Purchase

## Sprint Objective

Implement creator-credit wallets and verified purchases through Razorpay for India and
Stripe for international use, with append-only ledger reconciliation.

## Source Contracts

- `../V0_HEYGEN_COST_MODEL.md`
- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../V0_SECURITY.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_SECURITY.md`
- `../../Project/DESIGN.md`

## Sprint Backlog

- Create `CreditWallet`, `CreditPurchase`, `CreditLedgerEntry` and `InboxEvent` records.
- Initiate checkout for Razorpay and Stripe simulators.
- Validate signed payment callbacks and replay protection.
- Reconcile amount, currency, provider reference and workspace.
- Model purchase, refund, dispute and Admin adjustment entries.
- Build wallet ledger view with integer minor units only.
- Restrict compensating adjustments to Owner/Admin.

## TDD And Verification Plan

First failing test: forged/replayed callbacks, amount mismatch or currency mismatch create
duplicate credit or edit ledger history.

Required tests:

- Signed callback fixtures.
- Callback replay test.
- Amount and currency mismatch tests.
- Purchase/refund/dispute reconciliation tests.
- Owner/Admin adjustment permission test.

## Security And Guardrails

- Never store payment instrument details.
- Never use floating-point money.
- Ledger entries are append-only; corrections use compensating entries.

## Completion Evidence

- Ledger records for purchase, refund/dispute and adjustment cases.
- Callback verification and replay test output.
- Wallet ledger browser screenshot.
- Reconciliation proof against simulator totals.
