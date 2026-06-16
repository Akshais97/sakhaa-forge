# V0-F0 Sprint: Runnable Walking Skeleton

## Sprint Objective

Make Product V0 start locally as a real system: Next.js web, NestJS/Fastify API,
PostgreSQL/Auth, Redis/BullMQ, a deterministic local storage simulator, queue processor
and fake worker.
The sprint proves dependency health through generated client calls and does not create
speculative product tables.

## Source Contracts

- `../V0.md`
- `../V0_VERTICAL_OUTCOME_SLICES.md`
- `../V0_ARCHITECTURE.md`
- `../V0_API.md`
- `../V0_DEPLOYMENT.md`
- `../V0_SETUP_RUNBOOK.md`
- `../../Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `../../Project/Architecture/PROJECT_ARCHITECTURE_REPOSITORY_STRUCTURE.md`

## Sprint Backlog

- Create the V0 monorepo shape for web, API, queue worker, Python worker, contracts,
  database, config, tests and infra.
- Pin the V0 toolchain: Node.js `22.22.1`, pnpm line `11`, Python `3.12.13`,
  PostgreSQL, Redis, ffmpeg and Docker image metadata.
- Add typed environment validation with redacted examples.
- Add `GET /health`, `GET /ready` and build/version metadata.
- Add local service orchestration for PostgreSQL/Auth, Redis and a deterministic local
  storage simulator.
- Add deterministic fake provider and fake worker process.
- Add root commands for dev, generation, lint, typecheck, test, DB validation and verify.

## TDD And Verification Plan

First failing test: a clean checkout cannot run the documented local command and cannot
fetch readiness through the generated TypeScript client.

Required tests:

- API unit test for health and readiness payload shape.
- Contract test that regenerates OpenAPI and the TypeScript client.
- Integration test where one dependency is unavailable and readiness reports only that
  dependency while liveness remains usable.
- Smoke test from web to API through the generated client.

## Security And Guardrails

- No product tables beyond migration metadata.
- No connection strings, secrets or credentials in readiness responses, logs or generated
  output.
- Local simulators are default; paid and publishing providers are not contacted.

## Completion Evidence

- Clean-machine startup transcript.
- Readiness success output and dependency-failure output.
- Generated-client smoke test output.
- Shutdown and cleanup instructions.
- Fresh `pnpm verify` output once F0 makes that command real.
