# Project Engineering Guardrails

These rules apply to every product version.

## Subject Contracts

1. [PROJECT_GUARDRAIL_BACKEND.md](PROJECT_GUARDRAIL_BACKEND.md)
2. [PROJECT_GUARDRAIL_FRONTEND.md](PROJECT_GUARDRAIL_FRONTEND.md)
3. [PROJECT_GUARDRAIL_API_CALLS.md](PROJECT_GUARDRAIL_API_CALLS.md)
4. [PROJECT_GUARDRAIL_DATABASE.md](PROJECT_GUARDRAIL_DATABASE.md)
5. [PROJECT_GUARDRAIL_PRISMA_ORM.md](PROJECT_GUARDRAIL_PRISMA_ORM.md)
6. [PROJECT_GUARDRAIL_JOBS_AND_WORKERS.md](PROJECT_GUARDRAIL_JOBS_AND_WORKERS.md)
7. [PROJECT_GUARDRAIL_SECURITY.md](PROJECT_GUARDRAIL_SECURITY.md)
8. [PROJECT_GUARDRAIL_TDD.md](PROJECT_GUARDRAIL_TDD.md)
9. [PROJECT_GUARDRAIL_TDD_WORKFLOW.md](PROJECT_GUARDRAIL_TDD_WORKFLOW.md)
10. [PROJECT_GUARDRAIL_TEST_HARNESS.md](PROJECT_GUARDRAIL_TEST_HARNESS.md)
11. [PROJECT_GUARDRAIL_DEFINITION_OF_DONE.md](PROJECT_GUARDRAIL_DEFINITION_OF_DONE.md)
12. [PROJECT_GUARDRAIL_AI_ASSISTED_DEVELOPMENT.md](PROJECT_GUARDRAIL_AI_ASSISTED_DEVELOPMENT.md)
13. [PROJECT_GUARDRAIL_UI_UX.md](PROJECT_GUARDRAIL_UI_UX.md)
14. [PROJECT_DEVELOPMENT_WORKFLOW.md](PROJECT_DEVELOPMENT_WORKFLOW.md)

The canonical project-specific Prisma contract is
`PROJECT_GUARDRAIL_PRISMA_ORM.md`. `PROJECT_REFERENCE_ERP_PRISMA_OPTIMISATION.md` is
non-canonical historical reference material.

## Backend

- NestJS with Fastify is the sole domain API and PostgreSQL writer.
- Controllers validate transport input and delegate to domain/application services.
- Provider SDKs remain behind adapters; domain modules do not import them.
- External side effects occur after commit or through durable outbox/job workflows.

## Frontend

- Browser code has no database, Redis, provider or secret credentials.
- Use generated clients from versioned OpenAPI contracts.
- Keep server state in query caches and validate forms with shared schemas.
- Every async workflow exposes empty, loading, progress, failure, retry and recovery states.
- Accessibility requires keyboard operation, visible focus, AA contrast and text
  alternatives for non-text evidence.

## API and Contracts

- Authenticate and authorize every tenant route server-side.
- Use stable error codes and RFC 9457 problem details.
- Require idempotency keys for costly or externally visible mutations.
- Version public, internal-worker, event and artifact contracts.
- Provider payloads never become public contracts.
- Use cursor pagination and bounded results for growing collections.

## Database, Prisma and ORM

- Supabase PostgreSQL is canonical.
- Prisma is the sole schema and migration owner.
- Use one shared Prisma client per process.
- Every tenant-owned table and query carries `workspace_id`.
- RLS is mandatory defense in depth; runtime roles do not own tables or bypass RLS.
- Transactions are short and database-only.
- Use `select`, bounded queries and cursor pagination by default.
- Do not execute ORM queries in unbounded loops or build generic repositories that hide
  query shape.

Parameterized SQL is allowed only in named, typed, reviewed modules for:

- pgvector similarity;
- dashboard analytics aggregations;
- ranking or leaderboard queries;
- complex filtered search;
- measured high-frequency job-status reads;
- bulk inserts from AI/video pipelines;
- advanced JSONB queries;
- PostgreSQL full-text search;
- billing or credit reconciliation;
- audit/admin investigations;
- cost and usage analytics;
- PostgreSQL job claiming only when BullMQ is not used.

String-built SQL, `$queryRawUnsafe`, missing tenant predicates and unbounded results are
release-blocking.

## Jobs and Workers

- BullMQ transports opaque wake-up IDs; PostgreSQL owns job and billing truth.
- Delivery is at least once; handlers are idempotent.
- Python AI/video/GPU workers receive no PostgreSQL or Redis credentials.
- Paid/provider operations are durable before network I/O and support an `unknown`
  reconciliation state.
- Retries are bounded, observable and do not duplicate external side effects.

## Testing and Delivery

- Use test-driven development: observe red before green.
- Every external boundary covers success, timeout, duplicate, malformed, unauthorized
  and stale inputs.
- Every migration covers forward, compatibility, RLS and restore behavior.
- Completion requires fresh verification output.
- The project definition of done, harness, security and AI-assisted-development rules
  in this folder are mandatory.
