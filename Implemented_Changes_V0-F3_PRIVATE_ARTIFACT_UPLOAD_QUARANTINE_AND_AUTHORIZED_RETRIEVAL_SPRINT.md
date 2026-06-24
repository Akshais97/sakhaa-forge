# Implemented changes - V0-F3 private artifact upload quarantine and authorized retrieval sprint

## Update rule

- Update this file whenever changes are made for this sprint.
- Keep one `Implemented_Changes_<sprint_name>.md` file per sprint.
- Do not use this file as acceptance evidence unless fresh verification output is recorded.

## Sources read

- `AGENTS.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-F3_PRIVATE_ARTIFACT_UPLOAD_QUARANTINE_AND_AUTHORIZED_RETRIEVAL_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_JOBS.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`

## 2026-06-17

Slice: `V0-F3`

Behaviour: local dummy-data artifact upload, validation and authorized retrieval.

Red evidence:

- `node --test tests\integration\artifacts.test.mjs` failed because generated client F3 methods were absent.
- `node --test tests\unit\artifact-schema.test.mjs` failed because `Artifact`, `InboxEvent`, `AssetTrustStatus` and migration `0003` were absent.

Changes made:

- Added F3 public routes:
  - `POST /api/v0/brands/assets/uploads`
  - `POST /api/v0/brands/assets/uploads/{artifact_id}/complete`
  - `POST /api/v0/artifacts/{artifact_id}/downloads`
- Added generated-client methods for upload initiation, upload completion and download contracts.
- Added local dummy-data artifact store with quarantine, clean and rejected states.
- Added hash mismatch, unsupported type and cross-workspace denial tests.
- Added Prisma `Artifact`, `InboxEvent`, `AssetTrustStatus` and migration text.
- Added retained evidence file `docs/V0/Evidence/V0-F3_LOCAL_DUMMY_DATA_VERIFICATION_2026-06-17.md`.

Verification:

- `node --test tests\integration\artifacts.test.mjs` passed: 3 tests.
- `node --test tests\unit\artifact-schema.test.mjs` passed: 2 tests.
- `.\pnpm.cmd verify` passed: 34 tests and DB contract validation through V0-F3.

Caveat:

- This is local dummy-data F3 evidence. B2 adapter, live PostgreSQL runtime writes, live RLS and browser screenshot evidence remain open.
