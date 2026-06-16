# Historical ERP Prisma Optimisation Reference

> **Non-canonical:** This imported reference describes an unrelated ERP domain and uses
> `tenant_id`, tasks, workflows and other tables that are not this project's contracts.
> Active implementations must follow `PROJECT_GUARDRAIL_PRISMA_ORM.md`. This file may be
> consulted only for general query-performance examples that do not conflict with the
> project-specific guardrail.

  

## Purpose

  

Use Prisma as a typed database access layer, not as a replacement for database thinking.

PostgreSQL performance depends on query shape, indexes, tenancy, pagination, and measurement.

  

This ERP is multi-tenant. For tenant-owned data, `tenant_id` is a security boundary and a performance boundary.

  

---

  

## Optimisation Order

  

Always optimise in this order:

  

1. Correct tenant filtering.

2. Correct query shape.

3. Fetch only required fields.

4. Bound result size.

5. Paginate growing lists.

6. Add indexes only for real query patterns.

7. Measure with generated SQL and `EXPLAIN ANALYZE`.

8. Use raw SQL only when Prisma is inefficient or unclear.

9. Add caching only after the query is already correct.

  

Do not use Redis, queues, read replicas, or caching to hide bad Prisma queries.

  

---

  

## Hard Prisma Rules

  

1. **Single PrismaClient only**

   - Create PrismaClient only in `src/lib/prisma.ts` or equivalent shared file.

   - All other files import the shared client.

   - Never instantiate `new PrismaClient()` inside routes, services, repositories, helpers, or loops.

  

2. **No unbounded `findMany`**

   - Business-table `findMany` must normally include `where`, `select`, `take`, and `orderBy` when order matters.

   - A list query must have a boundary such as `tenant_id`, `user_id`, `status`, date range, cursor, `task_id`, `workflow_id`, or `client_id`.

  

3. **Tenant-owned reads require `tenant_id`**

   - Do not fetch tenant-owned data using only status, id, date, role, or user filters.

   - Missing `tenant_id` is both a security bug and a performance bug.

  

4. **Tenant-owned writes must be tenant-scoped**

   - Avoid ID-only updates/deletes for tenant-owned records.

   - Prefer compound unique keys such as `@@unique([id, tenant_id])` where appropriate.

   - If no compound unique key exists, use `updateMany/deleteMany` with `id + tenant_id` and verify `count === 1`.

  

5. **Use `select` by default**

   - Fetch only fields required by the screen, API, or operation.

   - Avoid full-row fetches unless explicitly needed.

  

6. **Use `include` carefully**

   - `include` is allowed only when the relation is required and bounded.

   - Do not create large nested object graphs.

   - Dashboards must not load entire tenant data through one large `include`.

  

7. **No Prisma queries inside loops without review**

   - Avoid `await prisma...` inside `for`, `forEach`, `map`, or similar loops.

   - Batch using `in: [...]` or a focused query instead.

   - Loop queries require explicit justification and bounded loop size.

  

8. **Paginate high-growth tables**

   - Always bound queries on `activity_logs`, `notifications`, `task_comments`, `task_attachments`, `time_entries`, and `tasks`.

   - Use `take`, deterministic `orderBy`, and cursor pagination where data can grow large.

  

9. **Use cursor pagination for large lists**

   - Offset pagination is acceptable only for small admin pages.

   - Use cursor pagination for logs, notifications, comments, time entries, large task lists, and infinite scroll.

  

---

  

## Thin Repository Rule

  

Prisma calls should live in repository/data-access files, but repositories must stay thin.

  

Repositories exist to centralize Prisma access, enforce tenant-safe queries, expose explicit query shapes, and make performance review easier.

  

Do **not** create:

  

- `BaseRepository<T>`

- `GenericCrudRepository`

- ORM wrappers over Prisma

- inheritance-heavy repository systems

- dynamic query-builder layers that hide the real query

- generic methods like `findAll(filters)`, `getAll()`, or `genericUpdate(id, data)`

  

Prefer specific functions:

  

- `findOpenTasksForTenant()`

- `findUnreadNotificationsForUser()`

- `updateTaskStatusForTenant()`

- `findRecentActivityForTenant()`

  

Route → service → thin repository is acceptable for maintainability. The extra function call is not a meaningful runtime cost. Bad queries inside repositories are the real risk.

  

---

  

## Dashboard Rule

  

Dashboards must be built from small focused queries, not one giant relational load.

  

Allowed dashboard data shape:

  

- task count by status

- overdue tasks limited to 10 or 20

- unread notifications limited to 20

- recent activity limited to 20 or 50

- active client count

- workflow summary

  

Principle: summarize first, list only recent or relevant records.

  

---

  

## Index Rules

  

Indexes are not free. They speed reads but can slow writes and increase storage.

  

Add indexes only when the matching query exists or is clearly part of the current implementation scope.

  

Index candidates should come from:

  

- `where` filters

- join fields

- `orderBy` fields

- unique lookups

- frequent date-range queries

- high-cardinality tenant-scoped reads

  

For tenant-owned tables, compound indexes usually start with `tenant_id`.

  

Do not auto-create indexes from tooling. Tools may suggest indexes; humans must review query need and write cost.

  

---

  

## ERP Candidate Index Map

  

These are candidates, not automatic requirements.

  

```prisma

// tasks: use only when matching queries exist

@@index([tenant_id])

@@index([tenant_id, status])

@@index([tenant_id, assigned_to])

@@index([tenant_id, due_date])

@@index([tenant_id, workflow_id])

@@index([tenant_id, created_at])

  

// task_comments

@@index([task_id, created_at])

@@index([tenant_id, task_id, created_at]) // only if tenant_id exists directly

  

// task_attachments

@@index([task_id])

@@index([tenant_id, task_id]) // only if tenant_id exists directly

  

// notifications

@@index([tenant_id, user_id, is_read, created_at])

@@index([tenant_id, user_id, created_at])

  

// notification_preferences

@@unique([tenant_id, user_id])

@@unique([tenant_id, user_id, preference_type]) // only if preference_type exists

  

// activity_logs

@@index([tenant_id, created_at])

@@index([tenant_id, entity_type, entity_id, created_at])

@@index([tenant_id, user_id, created_at])

  

// time_entries

@@index([tenant_id, user_id, started_at])

@@index([tenant_id, task_id])

@@index([tenant_id, started_at])

  

// clients

@@index([tenant_id])

@@index([tenant_id, status])

@@index([tenant_id, created_at])

@@unique([tenant_id, name]) // only if client names must be unique per tenant

  

// users

@@index([tenant_id])

@@index([tenant_id, role_id])

@@index([tenant_id, is_active])

@@unique([auth_user_id])

  

// workflows

@@index([tenant_id])

@@index([tenant_id, is_active])

  

// scope_templates: only if fields exist

@@index([tenant_id, is_active])

```

  

If templates can be global and tenant-specific, model scope explicitly. Do not rely on unclear `NULL` behavior without a documented rule.

  

---

  

## Supabase + Prisma Connection Rules

  

Use separate runtime and migration connections:

  

```prisma

datasource db {

  provider  = "postgresql"

  url       = env("DATABASE_URL")

  directUrl = env("DIRECT_URL")

}

```

  

Rules:

  

- `DATABASE_URL` = pooled runtime connection.

- `DIRECT_URL` = direct migration connection.

- App runtime must not use `DIRECT_URL`.

- Prisma migrations must not depend on runtime pooling behavior.

  

---

  

## Transaction Rules

  

Use transactions only when multiple database changes must succeed or fail together.

  

Good:

  

- create task + activity log

- create user + role assignment + notification preferences

- update task + comment + activity log

  

Forbidden inside transactions:

  

- email sending

- file upload

- external API calls

- long waits

- unrelated reads

  

Transactions must be short, database-only, and purpose-driven. External side effects should happen after commit, or through an outbox/job queue if reliability is required.

  

---

  

## Raw SQL Rules

  

Use Prisma for normal CRUD and relational reads.

  

Use raw SQL only when Prisma is awkward or inefficient for reports, aggregates, window functions, complex dashboards, bulk updates, or advanced PostgreSQL features.

  

Rules:

  

- use parameterized queries only

- never concatenate user input

- keep SQL in repository/data-access files

- comment why raw SQL is used

- validate result shape before exposing it

  

Never use unsafe raw SQL with user input.

  

---

  

## Security + Performance Rule

  

Authorization must happen inside the query boundary, not after over-fetching.

  

Bad pattern:

  

```ts

const task = await prisma.task.findUnique({ where: { id: taskId } });

if (task.tenant_id !== tenantId) throw new Error("Forbidden");

```

  

Better pattern:

  

```ts

const task = await prisma.task.findFirst({

  where: { id: taskId, tenant_id: tenantId },

  select: { id: true, title: true, status: true }

});

```

  

Never fetch cross-tenant data and filter after retrieval.

  

---

  

## Automated Validation

  

Performance rules should be tested gradually through CI, linting, scripts, logs, and load tests.

  

Automate checks for:

  

- `new PrismaClient()` outside the shared client file

- unbounded `findMany`

- missing `take`

- missing `tenant_id` on tenant-owned repository queries

- Prisma queries inside loops

- excessive nested `include`

- Prisma usage outside repository/data-access layer

- unsafe raw SQL

- external calls inside transactions

- new indexes without matching query justification

  

Schema checks should verify:

  

- tenant-owned tables have `tenant_id`

- high-growth tables have `created_at`

- foreign-key lookup fields are index-reviewed

- compound uniqueness exists where required

- schema changes mention query impact

  

---

  

## Measurement Workflow

  

Do not claim a query is optimized until measured.

  

For slow queries:

  

1. Capture generated SQL.

2. Run `EXPLAIN ANALYZE`.

3. Check scan type, rows scanned, sort cost, join cost, and index usage.

4. Add or change candidate indexes only if justified.

5. Re-measure after the change.

  

Monitor query duration, slow-query threshold breaches, and the endpoint linked to each slow query.

  

---

  

## Load Testing Targets

  

Before claiming performance readiness, load test critical ERP flows:

  

- dashboard

- task listing

- notifications

- activity logs

- authentication

- tenant switching

- time entries

  

Measure response time, throughput, database latency, error rate, and connection exhaustion.

  

---

  

## Caching Rules

  

Cache only after query design is correct.

  

Good candidates:

  

- roles

- static configuration

- scope templates

- feature flags

- rarely changing lookup data

  

Risky candidates:

  

- tasks

- notifications

- activity logs

- time entries

- permission-sensitive data

  

Cache stable data. Be careful with tenant-specific, user-specific, or permission-sensitive data.

  

---

  

## Agent Implementation Checklist

  

Agents must follow this checklist for Prisma-related work:

  

```text

[ ] Uses shared PrismaClient only

[ ] Prisma query is in repository/data-access layer

[ ] Repository function is thin and specific

[ ] No generic CRUD abstraction added

[ ] Tenant-owned read includes tenant_id

[ ] Tenant-owned write includes tenant_id

[ ] findMany has where/select/take where applicable

[ ] Full-row fetch is avoided unless justified

[ ] include is necessary and bounded

[ ] No Prisma query inside loop

[ ] High-growth table query is paginated

[ ] Cursor pagination used for large lists

[ ] New index matches a real query pattern

[ ] Transaction is short and database-only

[ ] Raw SQL is parameterized

[ ] Supabase DATABASE_URL/DIRECT_URL roles are correct

[ ] Slow query has EXPLAIN ANALYZE evidence when relevant

[ ] Critical flow has load-test coverage before performance claims

```

  

---

  

## Final Rule

  

Prisma is acceptable for this ERP if database discipline stays strict.

  

Main risks to prevent:

  

- unbounded queries

- missing tenant filters

- missing or excessive indexes

- N+1 queries

- overuse of `include`

- large offset pagination

- wrong Supabase connection setup

- fat repository abstraction

- long transactions

- lack of measurement

  

> Keep Prisma convenient, but keep database thinking strict.
