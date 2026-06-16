# V0-U3 Sprint: Idempotent YouTube Shorts Publication

## Sprint Objective

Publish the approved internal publication contract to YouTube Shorts with quota-aware
behaviour and one external post identity.

## Source Contracts

- `../V0_API.md`
- `../V0_JOBS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_SECURITY.md`
- `../../Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`

## Sprint Backlog

- Add YouTube adapter and deterministic simulator.
- Reuse the internal publication contract from U1/U2.
- Confirm target YouTube account before upload.
- Model quota state and delayed processing state.
- Handle duplicate retry, account mismatch and provider callback/polling.
- Keep Meta/manual paths isolated from YouTube failure.

## TDD And Verification Plan

First failing test: quota exhaustion, delayed processing, duplicate retry or account
mismatch corrupts the shared publication state.

Required tests:

- Shared adapter contract tests.
- Quota-exhausted UI.
- Duplicate retry test.
- Account mismatch test.
- YouTube simulator journey.

## Security And Guardrails

- YouTube support is second after Meta and must not block manual fallback.
- Quota failure is explicit and not hidden as generic failure.
- Provider payloads remain private.

## Completion Evidence

- YouTube publish operation record.
- Quota and delayed-processing test output.
- Browser screenshot of YouTube publish states.
- Shared contract compatibility proof.
