# V0-C2 Sprint: Reproducible Final Branded Render

## Sprint Objective

Render a retained 9:16 final MP4, thumbnail and captions from a validated AE plan while
preserving input hashes, worker capability version and immutable prior revisions.

## Source Contracts

- `../V0_DATA_MODELS.md`
- `../V0_JOBS.md`
- `../V0_SECURITY.md`
- `../V0_SCREEN_AND_STATE_INVENTORY.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_JOBS_AND_WORKERS.md`

## Sprint Backlog

- Validate licensed AE worker readiness.
- Enforce one-job default render concurrency.
- Create `RenderAttempt`, `FinalVideo`, `Artifact` and `CreativeLineage` records.
- Execute render through private worker APIs.
- Validate output codec, duration, resolution, captions, thumbnail and hash.
- Compare golden render where deterministic.
- Preserve prior final-video revisions immutably.

## TDD And Verification Plan

First failing test: render overwrites a prior final video, ignores input hashes or
accepts incompatible worker output.

Required tests:

- Golden-video comparison.
- Capability-drift rejection.
- Worker-crash recovery.
- Immutable prior revision test.
- Output hash validation.

## Security And Guardrails

- Final media remains private until authorized retrieval or publication flow.
- Worker output must match expected input hash and capability version.
- New revisions never rewrite historical review or lineage records.

## Completion Evidence

- Final MP4, thumbnail and caption artifact hashes.
- Render attempt logs.
- Worker crash recovery proof.
- Browser screenshot of final media ready state.
