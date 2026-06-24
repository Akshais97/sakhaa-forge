# V0-F1 Local Dummy-Data Verification Evidence - 2026-06-17

## Scope

Slice: `V0-F1` tenant-safe sign-in and workspace selection.

Behaviour verified:

- authenticated local user can create a workspace and receives `OWNER` membership;
- workspace list returns only the actor's memberships;
- direct object reference to another workspace returns existence-hiding `404`;
- simulated RLS test uses two deterministic workspaces:
  - `Aster Heights`, owned by `user-a` / `asha.owner@example.test`;
  - `Meridian Homes`, owned by `user-b` / `bhavesh.owner@example.test`;
- missing membership user `user-c` cannot read `Aster Heights`;
- response bodies do not expose protected cross-workspace names;
- web shell renders sign-in, create workspace and workspace switcher controls.

## Decision

Runtime remains local dummy data for now by project-owner decision on 2026-06-17.
Supabase PostgreSQL/Prisma runtime persistence and live database RLS integration remain
deferred. This file does not claim production database acceptance.

## Red Evidence

Formatter exclusion test was written before implementation:

```text
node --test tests\unit\file-list.test.mjs
SyntaxError: The requested module '../../scripts/lib/files.mjs' does not provide an export named 'shouldIncludeTextFile'
```

`pnpm test:rls` previously pointed at `tests/rls/placeholder.mjs`, so it did not execute
real RLS-style tests.

## Green Evidence

```text
node --test tests\unit\file-list.test.mjs
tests 1
pass 1
```

```text
node --test tests\rls\*.test.mjs
tests 2
pass 2
```

```text
.\pnpm.cmd test:rls
tests 2
pass 2
```

```text
.\pnpm.cmd verify
Format check passed for 197 text files.
Lint passed: no obvious secrets, signed URLs or unsafe SQL patterns.
tests 29
pass 29
Database contract valid for V0-F2 identity, idempotency and RLS.
V0-F0/F1/F2 local verification passed.
```

```text
node --test tests\unit\health.test.mjs tests\integration\readiness.test.mjs tests\integration\workspaces-auth.test.mjs tests\integration\idempotency.test.mjs tests\contract\openapi-generation.test.mjs tests\e2e\generated-client-smoke.test.mjs tests\unit\db-schema.test.mjs tests\unit\permissions.test.mjs tests\e2e\web-workspace.test.mjs
tests 23
pass 23
```

## Remaining Gaps

- No live Supabase/PostgreSQL runtime write path.
- No live database RLS integration suite using restricted runtime role.
- No stale membership mutation path yet; missing membership is covered.
- No browser screenshot artifact retained in this file.
