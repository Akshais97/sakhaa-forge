# V0-G5 Sprint: Retained Generated Media And Settled Credits

## Sprint Objective

Copy completed HeyGen media into private V0 storage, validate and hash it, then capture or
release reserved credits exactly once.

## Source Contracts

- `../V0_HEYGEN_INTEGRATION.md`
- `../V0_HEYGEN_COST_MODEL.md`
- `../V0_DATA_MODELS.md`
- `../V0_SECURITY.md`
- `../../Project/Operations/PROJECT_OPERATIONS_OBSERVABILITY.md`

## Sprint Backlog

- Retrieve transient provider media URL through adapter only.
- Store generated media in quarantine before validation.
- Validate media type, duration, resolution, hash and workspace ownership.
- Create `GeneratedSegment`, `GeneratedAsset`, `Artifact` and `CreativeLineage` records.
- Reconcile provider cost with estimate/reservation.
- Capture successful eligible cost once or release reservation once.
- Recover crash windows between media retention and ledger settlement.

## TDD And Verification Plan

First failing test: crash between media retention and settlement causes orphaned capture,
duplicate release or untrusted provider media.

Required tests:

- Success capture test.
- Failure release test.
- Provider total mismatch classification.
- Crash-window reconciliation.
- Corrupt/missing media rejection.

## Security And Guardrails

- Provider URLs are transient and never retained as production source.
- Media is not clean until artifact validation passes.
- Ledger settlement is idempotent and append-only.

## Completion Evidence

- Generated media artifact hash.
- Capture/release ledger entries.
- Provider total comparison.
- Crash-window recovery proof.
