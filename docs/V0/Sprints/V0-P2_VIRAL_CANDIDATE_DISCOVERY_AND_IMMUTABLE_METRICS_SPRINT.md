# V0-P2 Sprint: Viral Candidate Discovery And Immutable Metrics

## Sprint Objective

Allow a client manager to search a real-estate niche, review ranked viral candidates and
select one with immutable metric evidence and rights warnings.

## Source Contracts

- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../V0_ANALYTICS_EVENT_TAXONOMY.md`
- `../V0_ERROR_CATALOG.md`
- `../../Project/Security/PROJECT_SECURITY_PRIVACY_AND_RIGHTS_METHODOLOGY.md`

## Sprint Backlog

- Implement Xpoz adapter behind a deterministic simulator.
- Search and rank candidates with bounded results.
- Record immutable metric snapshots with observation time.
- Add source and rights warning states.
- Add manual candidate fallback with provenance.
- Handle provider outage, timeout, empty result and malformed payload states.
- Build candidate selection UI and audit.

## TDD And Verification Plan

First failing test: provider changes, empty results, malformed payloads or timeouts
fabricate candidates or mutate metric evidence.

Required tests:

- Adapter contract fixtures.
- Ranking determinism tests.
- Provider outage and empty result UI.
- Immutable metric snapshot proof.

## Security And Guardrails

- Rights warnings are preserved and cannot be hidden by ranking.
- Provider payloads stay adapter-private.
- Metrics are snapshots, not performance guarantees.

## Completion Evidence

- Candidate selection audit.
- Metric snapshot IDs and observation timestamps.
- Provider-outage screenshot.
- Ranking and adapter fixture test output.
