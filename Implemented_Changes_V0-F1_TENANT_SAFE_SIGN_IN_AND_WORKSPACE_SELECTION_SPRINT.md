# Implemented changes - V0-F1 tenant-safe sign-in and workspace selection sprint

## Update rule

- Update this file whenever changes are made for this sprint.
- Keep one `Implemented_Changes_<sprint_name>.md` file per sprint.
- Do not use this file as acceptance evidence unless fresh verification output is recorded.

## Sources read

- `AGENTS.md`
- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-F1_TENANT_SAFE_SIGN_IN_AND_WORKSPACE_SELECTION_SPRINT.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_TESTING.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAIL_BACKEND.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAIL_DATABASE.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## 2026-06-16

Slice: `V0-F1`

Behaviour: workspace creation starts closed and requires authentication before tenant state can be created.

Red evidence:

- `node --test tests\integration\workspaces-auth.test.mjs` failed with `404 !== 401`.
- `node --test tests\contract\openapi-generation.test.mjs` failed because `/workspaces` and `createWorkspace` were absent.
- `node --test tests\e2e\generated-client-smoke.test.mjs` failed with `client.createWorkspace is not a function`.

Changes made:

- Added `POST /api/v0/workspaces` route that returns RFC 9457-style `AUTH_REQUIRED` problem details when no authenticated request is present.
- Added `/workspaces` to `packages/contracts/src/openapi.v0.json`.
- Updated `scripts/generate-contracts.mjs` to generate `V0Client.createWorkspace`.
- Regenerated `packages/contracts/generated/openapi.v0.json` and `packages/contracts/generated/v0-client.mjs`.
- Added integration, contract and generated-client smoke tests for the auth-required workspace creation boundary.

Assumptions:

- This is the first small F1 behaviour, not full F1 completion.
- No workspace records, RLS policies or browser workspace switcher are complete in this entry.
- No V1/V2 runtime dependency is introduced.

Verification:

- `node --test tests\integration\workspaces-auth.test.mjs` passed: 1 test.
- `node --test tests\contract\openapi-generation.test.mjs` passed: 2 tests.
- `node --test tests\e2e\generated-client-smoke.test.mjs` passed: 2 tests.
- `.\pnpm.cmd verify` passed: generated contracts, format, lint, typecheck, 11 tests, database validation.
- Caveat: `db-validate` still reports the F0 database contract because this entry does not add F1 tables, RLS or migrations.
- Caveat: verification reported the existing engine warning: repository wants Node `22.22.1`; machine ran Node `v24.15.0`.

## 2026-06-17

Slice: `V0-F1`

Behaviour: local dummy-data workspace isolation now has retained evidence.

Changes made:

- Added `tests/rls/workspace-isolation.test.mjs`.
- Changed `pnpm test:rls` from placeholder to `node --test tests/rls/*.test.mjs`.
- Added retained evidence file `docs/V0/Evidence/V0-F1_LOCAL_DUMMY_DATA_VERIFICATION_2026-06-17.md`.

Test workspaces:

- `Aster Heights`, owned by `user-a`.
- `Meridian Homes`, owned by `user-b`.

Verification:

- `node --test tests\rls\*.test.mjs` passed: 2 tests.
- `.\pnpm.cmd test:rls` passed: 2 tests.

Caveat:

- This is local dummy-data isolation, not live PostgreSQL RLS acceptance.
