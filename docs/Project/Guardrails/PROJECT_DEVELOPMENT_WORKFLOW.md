# Project Development Workflow

**Status:** Canonical development and delivery workflow  
**Initial implementation scope:** Product V0

## 1. Toolchain

| Tool | Pinned policy |
|---|---|
| Node.js | `22.22.1` for V0 implementation |
| pnpm | Release line `11`; F0 resolves `pnpm@latest-11` and commits the exact version in root `packageManager` |
| Python | `3.12.13` |
| PostgreSQL | Supabase-supported PostgreSQL version, identical major in local/staging |
| Redis | Managed-compatible Redis with persistence and `noeviction` |
| ffmpeg | Version pinned in worker image lock metadata |
| Docker Desktop/Engine | Supported current version; image digests are pinned in CI/deploy |

Changing a runtime major requires an ADR, compatibility test and deployment plan.

## 2. Workspace and Build Tooling

- pnpm workspaces own TypeScript packages and applications.
- Turborepo orchestrates TypeScript build, lint, typecheck, test and code generation.
- Python uses `uv` with a committed lockfile.
- Prisma in `packages/db` is the sole migration owner.
- OpenAPI and generated TypeScript clients live in `packages/contracts/generated`.
- Design tokens generate CSS/TypeScript outputs in `packages/ui/generated`.
- Docker Compose runs local PostgreSQL and Redis; F0 uses a filesystem-backed object
  storage simulator until the B2 adapter work lands.
- Paid and publishing providers use deterministic simulators by default.

## 3. Expected Root Commands

These commands become executable in V0-F0:

```text
pnpm install --frozen-lockfile
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:queue
pnpm services:up
pnpm services:down
pnpm generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:e2e
pnpm test:rls
pnpm db:generate
pnpm db:migrate:dev
pnpm db:validate
pnpm verify
```

Python worker commands:

```text
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

No document may claim a command works before F0 implements and verifies it.

## 4. Formatting, Linting and Type Checking

- Prettier formats Markdown, JSON, YAML, TypeScript and supported web files.
- ESLint uses type-aware rules for applications/packages.
- TypeScript runs in strict mode; no unchecked indexed access and no implicit override.
- Ruff formats/lints Python; Pyright runs strict on worker contracts and domain schemas.
- Prisma format and validate run in CI.
- Markdown link and terminology checks cover canonical docs.
- Generated files are checked for clean reproducibility.
- Arbitrary visual hex/spacing outside design-token source is a lint failure.
- Unsafe SQL, secret patterns and raw provider payload logging are release failures.

## 5. TDD Workflow

For every behavioural change:

1. Read the owning V0 slice, contract, error entry and screen state.
2. Write one failing test against public behaviour.
3. Run the narrow test and record the expected failure.
4. Implement the minimum passing behaviour.
5. Run the narrow test.
6. Run nearby unit/contract/integration tests.
7. Regenerate affected contracts and verify no unexplained diff.
8. Run `pnpm verify` before completion.

External boundaries test success, malformed, unauthorised, duplicate, stale, timeout and
crash-window behaviour. Migration changes test forward, compatibility, RLS and restore.

## 6. Branch and Commit Convention

- Default branch: `main`.
- Branches: `feat/v0-f0-walking-skeleton`, `fix/v0-g4-provider-timeout`,
  `docs/v0-information-architecture`.
- One vertical slice may use multiple small branches/commits but one branch must not mix
  unrelated slices.
- Conventional commits:
  - `feat(v0-f1): add workspace membership enforcement`
  - `fix(v0-g4): reconcile unknown HeyGen operation`
  - `test(v0-f3): cover cross-tenant signed URL`
  - `docs(v0): define brand profile contract`
  - `chore(tooling): pin Python runtime`
- Do not rewrite shared history or force-push protected branches.
- Commits keep tests and generated artifacts consistent.

## 7. Pull Request Contract

Every PR states:

- owning V0 slice and gate;
- user/operator outcome;
- affected routes/contracts/models/jobs;
- security and tenant impact;
- migration and rollback/forward-recovery plan;
- observed red/green commands;
- screenshots for UI changes;
- performance/cost impact where relevant;
- documentation and generated files changed.

Review blocks on missing evidence, unexplained generated diffs or weakened assertions.

## 8. Migration Workflow

1. Update `V0_DATA_MODELS.md` and `V0_PRISMA_SCHEMA.md` when business meaning changes.
2. Change Prisma schema.
3. Generate an additive migration.
4. Add reviewed SQL inside that Prisma migration for RLS/check/partial constraints.
5. Test fresh database, existing database compatibility and restricted runtime role.
6. Verify rollback is code rollback with schema compatibility or documented forward fix.
7. Test backup/restore when financial, job, audit or lineage state changes.
8. Do not use a second migration tool or manual production DDL.

## 9. Generated-File Rules

Generated files include:

- OpenAPI documents and TypeScript clients;
- Prisma client and schema-derived types;
- status and design-token mappings;
- JSON Schemas and event/artifact types;
- fixture manifests.

Rules:

- Never edit generated output manually.
- Generated directories contain a header and source pointer.
- Generation is deterministic from committed inputs.
- CI runs generation and fails on a dirty diff.
- Secrets, signed URLs and environment-specific values never enter generated output.

## 10. CI Gates

Required checks:

1. dependency lock integrity;
2. formatting;
3. lint;
4. TypeScript/Python type checking;
5. unit tests;
6. OpenAPI/provider/worker contract tests;
7. Prisma validation and migration checks;
8. RLS/cross-tenant integration tests;
9. deterministic generated-file check;
10. secret, dependency, container and licence scans;
11. build;
12. slice-specific end-to-end test;
13. Markdown links and documentation authority check.

Production promotion additionally requires staging smoke, callback signature, restore,
ledger reconciliation and approved release evidence.

## 11. Dependency and Licence Policy

- Prefer standard library and existing approved dependencies.
- New runtime dependencies require purpose, owner, licence, maintenance status, security
  posture and removal plan.
- Block copyleft or source/data terms incompatible with paid SaaS until legal approval.
- Pin direct dependencies and commit lockfiles.
- Dependabot/Renovate changes run the full relevant test set.
- Provider SDKs stay behind adapters.
- Media codecs, fonts, AE plugins/templates and model/data artefacts have a licence
  manifest.

## 12. Documentation Requirements

Update the owning documents in the same change when modifying:

- routes or screens;
- user language or status presentation;
- API/event/artifact contracts;
- data models, schema or migrations;
- errors and retryability;
- analytics events;
- configuration variables;
- provider limits/pricing;
- security, retention or rights behaviour;
- slice acceptance evidence.

Executable contracts and passing tests establish implementation status; prose alone does
not.

## 13. Completion

A change is complete only after fresh verification output. If a required command cannot
run, report that limitation and do not mark the slice complete.
