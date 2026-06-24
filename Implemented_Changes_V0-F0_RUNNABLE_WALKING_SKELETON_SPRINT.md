# Implemented changes - V0-F0 runnable walking skeleton sprint

## Update rule

- Update this file whenever changes are made for this sprint.
- Keep one `Implemented_Changes_<sprint_name>.md` file per sprint.
- Do not use this file as acceptance evidence unless fresh verification output is recorded.

## Sources read

- `AGENTS.md`
- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-F0_RUNNABLE_WALKING_SKELETON_SPRINT.md`
- `docs/V0/Evidence/V0-F0_LOCAL_VERIFICATION_2026-06-16.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## 2026-06-16

Slice: `V0-F0`

Behaviour: runnable walking skeleton API runtime alignment.

Observed existing uncommitted changes:

- `apps/api/src/server.mjs` now creates the F0 API through NestJS with Fastify instead of raw `node:http`.
- `apps/api/package.json` adds NestJS/Fastify runtime dependencies.
- `apps/api/src/build-info.mjs` exposes `apiRuntime: "nestjs-fastify"`.
- `tests/helpers/server.mjs` starts and closes the NestJS application for API integration tests.
- `tests/unit/health.test.mjs` checks the runtime metadata.
- `pnpm-lock.yaml` contains dependency lock updates.

Change made in this entry:

- Added this sprint-specific implemented-changes file and recorded the update rule.

Assumptions:

- Active sprint is `V0-F0` because canonical slice order says begin with `V0-F0`, and current dirty files affect F0 API health/readiness.
- No V1/V2 runtime dependency is introduced by this documentation file.

Verification:

- `node --test tests\unit\health.test.mjs tests\integration\readiness.test.mjs` passed: 4 tests.
- `.\pnpm.cmd verify` passed: generated contracts, format, lint, typecheck, 9 tests, database validation.
- Caveat: verification reported the existing engine warning: repository wants Node `22.22.1`; machine ran Node `v24.15.0`.
