# V0-P4 Sprint: Multimodal Scene Blueprint

## Sprint Objective

Process scene detection, transcription, keyframes, vision and OCR as separate stages and
produce a scene-level blueprint with honest partial or blocked states.

## Source Contracts

- `../V0_JOBS.md`
- `../V0_DATA_MODELS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_SCREEN_AND_STATE_INVENTORY.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_JOBS_AND_WORKERS.md`

## Sprint Backlog

- Create stage jobs for scene detection, transcription, keyframe extraction, vision and
  OCR.
- Model dependencies between stages.
- Validate timestamps, durations, shots and transcript alignment.
- Store stage artifacts with hashes and schemas.
- Build progress UI for independent stage states.
- Add replacement guidance for scenes, motion and on-screen text.
- Classify empty, malformed, timeout, OOM and partial-stage failures.

## TDD And Verification Plan

First failing test: partial stage failure or malformed model JSON is reported as a
complete blueprint.

Required tests:

- Per-stage deterministic fixtures.
- Empty transcript and malformed model output tests.
- Worker timeout and OOM classification.
- Partial-state UI and resource-class isolation test.

## Security And Guardrails

- Workers do not receive database or Redis credentials.
- Stage outputs must return through authenticated APIs.
- Low-confidence or missing required stages cannot silently advance.

## Completion Evidence

- Stage job graph.
- Stage artifact IDs and hashes.
- Partial and blocked UI screenshots.
- Worker resource-isolation proof.
