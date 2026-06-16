# V0-G3 Sprint: Versioned Generation Estimate And Atomic Reservation

## Sprint Objective

Show the exact HeyGen route, price version, estimated cost and maximum authorization,
then reserve credits atomically for one confirmed generation.

## Source Contracts

- `../V0_HEYGEN_COST_MODEL.md`
- `../V0_HEYGEN_INTEGRATION.md`
- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../V0_STATUS_ENUMS.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Add `ProviderPriceVersion`, `GenerationEstimate`, `GenerationJob`,
  `CreditReservation` and ledger entries.
- Validate selected script, avatar, brand profile, blueprint and duration.
- Enforce provider limits and estimate expiry.
- Show estimate, maximum authorization, price version and wallet balance.
- Block insufficient balance and stale estimates.
- Reserve credits transactionally and idempotently.
- Prevent double-click and concurrent over-reservation.

## TDD And Verification Plan

First failing test: stale estimate, insufficient balance, changed input, double-click or
concurrent confirmation creates over-reservation or duplicate generation.

Required tests:

- Concurrent reservation test.
- Stale price/estimate rejection.
- Insufficient balance UI.
- Input hash mismatch rejection.
- One-reservation ledger proof.

## Security And Guardrails

- Paid generation cannot start before maximum authorization is accepted.
- Reservation does not imply provider submission.
- Money values use integer minor units or provider-native micros.

## Completion Evidence

- Estimate and reservation IDs.
- Ledger reserve entry.
- Browser screenshot of estimate/confirmation and insufficient-credit state.
- Concurrency and stale-estimate test output.
