# Prisma and PostgreSQL Query Principles

**Status:** Canonical under ADR-017.

## Prisma Owns

- schema and migrations;
- users, teams, memberships and permissions;
- projects, brand profiles, campaigns and assets;
- normal video-job creation and updates;
- append-only credit ledger writes and subscription records;
- ordinary CRUD APIs and transactional outbox writes.

## Parameterized SQL Allowlist

Use the restricted `pg` adapter only for named modules covering:

- pgvector similarity when the extension is approved and required;
- dashboard analytics, ranking and leaderboard aggregation;
- complex filtered search, JSONB and PostgreSQL full-text search;
- measured high-frequency job status reads;
- streaming, COPY and bulk pipeline inserts;
- billing/credit reconciliation, audit investigation and cost/usage analytics;
- PostgreSQL job claiming only if BullMQ is removed.

This is an allowlist, not an instruction to replace working Prisma queries. Require a
measured plan, an unsupported PostgreSQL capability or a clear bulk/streaming need.

## Mandatory Controls

- Parameter binding only; no string-built SQL or `$queryRawUnsafe`.
- Named repository/query modules; no SQL in controllers or domain services.
- Runtime result validation and explicit selected columns.
- Workspace predicate and transaction-local RLS context.
- Statement timeout, bounded result size and cursor pagination.
- `EXPLAIN (ANALYZE, BUFFERS)` fixtures for hot paths.
- Same restricted runtime role used by Prisma and `pg`.
- COPY writes enter staging or validated tables and preserve idempotency.

## Index and Pooling Rules

Start with tenant-leading indexes for measured access patterns, then add partial or
covering indexes from query plans. Keep API and queue-worker pools separately bounded.
Use the Supabase session pooler for always-on application services where appropriate and
a dedicated migration connection for Prisma migrations. Alert before connection
saturation.
