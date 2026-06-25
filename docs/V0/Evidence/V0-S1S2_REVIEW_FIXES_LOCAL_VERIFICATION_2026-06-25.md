# V0-S1/S2 Senior Review Fixes — Local Verification — 2026-06-25

## Slice

V0-S1 (Script Tournament) and V0-S2 (Immutable Selected Script) review fixes.

## Source

`docs/Project/Sprint Reviews/S1_S2review.md` (verdict: NEEDS FIXES BEFORE MERGE).

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`
- `docs/Project/Sprint Reviews/S1_S2review.md`

## Fixes verified

### Critical #1/#2 — Real S1/S2 frontend workflow

The web shell now runs the script tournament and selection workflow, not static
contract cards. `apps/web/src/script-tournament-workflow.mjs` drives the generated
`V0Client`:

- A Client Manager runs a ready blueprint tournament via
  `V0Client.createScriptTournament`.
- The workflow renders 10-20 variants with evaluations and eligibility (eligible or
  disabled for refused/unevaluated/superseded variants).
- A confirmed selection calls `V0Client.selectScriptVariant`. Selection is
  irreversible, so the browser glue confirms before the call (no optimistic UI).
- The workflow exposes empty, loading, error, stale, disabled, already-selected and
  success states as `data-state` attributes.

The workflow module is DOM-agnostic: pure functions (`variantEligibility`,
`classifySelectionError`, `buildSelectRequest`, `deriveWorkflowState`,
`workflowMarkup`) are unit-tested in Node and driven against the real API in an
integration test. The web server serves the workflow module and the generated client
at `/script-tournament-workflow.mjs` and `/v0-client.mjs`.

### Critical #3/#4 — Path tournamentId authoritative

`selectScriptVariant(request, tournamentId)` in `apps/api/src/server.mjs` now treats
the path `{tournamentId}` as authoritative. If the body carries a `tournamentId` that
differs from the path, the request fails with `VALIDATION_FAILED` (422) before the
store or idempotency layer is reached. The reconciled input
`{ ...body, tournamentId }` is passed to `runIdempotent` and the store.

### Critical #5/#6 — Concurrency-safe selection

The Prisma `selectScriptVariant` in `apps/api/src/workspace-store.mjs` now claims the
tournament atomically:

```text
tx.scriptTournament.updateMany({
  where: { id, workspaceId, status: "ready_for_selection" },
  data: { status: "selected" }
});
```

If `count === 0`, the selection returns `SCRIPT_ALREADY_SELECTED` (409) without
writing a `selected_scripts` row. Two concurrent selections with different
`Idempotency-Key` values therefore retain exactly one selected script and never hit a
unique-constraint violation or a 500. The in-memory store is synchronous and was
already safe; the Prisma path is the one that was vulnerable.

A store-level race test (in-memory) and a Prisma-runtime race test (real database)
both prove exactly one 200 and one 409 `SCRIPT_ALREADY_SELECTED`.

### Non-blocking #7 — S1/S2 Prisma runtime proof

`tests/integration/prisma-runtime.test.mjs` now proves S1 and S2 persistence under
Prisma: tournament creation retains a `ready_for_selection` tournament with the
expected valid variant and evaluation counts, and selection retains one immutable
`selected_scripts` row with `approver_user_id`, `version`, `human_override` and a
tournament advanced to `selected`. The same test runs the concurrent double-selection
race against the real database. This also surfaced and fixed a pre-existing Prisma
bug: `createScriptTournament` returned an in-memory `updatedAt` that did not match the
database's `@updatedAt`, so the very first selection failed the optimistic-version
guard. The Prisma path now re-fetches the tournament so the response carries the
authoritative timestamp.

### Non-blocking #8 — Approver lineage FK

Migration `0018_v0_s2_selected_script_approver_fk` adds
`FOREIGN KEY (approver_user_id) REFERENCES users(id)` on `selected_scripts`. The
Prisma `SelectedScript` model gains `approver User @relation("SelectedScriptApprover")`
with a `selectedScriptsAsApprover SelectedScript[]` back-relation on `User`.
`db-validate.mjs` and `db-migrate-dev.mjs` were extended for the new migration.

## Red evidence

Per AGENTS.md §9 (TDD, red before green), each behaviour was written as a failing test
first and observed red:

- Path/body mismatch: `node --test tests/integration/script-selection-s2.test.mjs`
  failed with `404 WORKSPACE_ACCESS_DENIED !== 422` before the controller reconciliation.
- Concurrency race (Prisma runtime): the new
  `prisma runtime persists S1 script tournament and S2 selected script and is
  concurrency-safe` test failed with `409 RESOURCE_VERSION_STALE !== 200` before the
  Prisma `updatedAt` re-fetch fix, then passed after the atomic claim and timestamp fix.
- Workflow unit and integration tests: written against the real module/API and run
  green after the workflow module was implemented.

## Green evidence

```text
node --test tests/integration/script-selection-s2.test.mjs
tests 9
pass 9
fail 0

node --test tests/integration/script-tournament-s1.test.mjs
tests 6
pass 6
fail 0

node --test tests/integration/script-selection-workflow.test.mjs
tests 3
pass 3
fail 0

node --test tests/unit/script-tournament-workflow.test.mjs
tests 7
pass 7
fail 0

node --test tests/e2e/web-workspace.test.mjs
tests 12
pass 12
fail 0
```

## Full verification

```text
node scripts/verify.mjs
tests 117
pass 115
fail 0
skipped 2

node --test tests/integration/prisma-runtime.test.mjs (V0_RUNTIME_DB_PROOF=1)
tests 2
pass 2

Database contract valid for ... selected scripts, selected-script approver lineage FK and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2 local verification passed.
```

The two skipped tests in the broad glob are the prisma-runtime tests intentionally
skipped there and run by the dedicated verification step immediately after, where both
pass against the real database.

## Migration evidence

```text
Applying packages/db/prisma/migrations/0018_v0_s2_selected_script_approver_fk/migration.sql
ALTER TABLE
```

The migration adds the `selected_scripts_approver_user_id_fkey` foreign key. It is
additive and does not alter existing rows or RLS.

## Contract and documentation updates

- `packages/contracts/src/openapi.v0.json`: documented the `422` response on
  `POST /script-tournaments/{tournament_id}/select` for a path/body mismatch.
- `docs/V0/V0_API.md`: documented the authoritative path tournamentId, the
  `VALIDATION_FAILED` mismatch behaviour and the atomic concurrency-safe claim.
- `docs/V0/V0_PRISMA_SCHEMA.md`: documented the `SelectedScript` relations including
  the approver FK to `users(id)`.
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`: documented the implemented S1/S2
  workflow and its states.

## Scope note

This is local deterministic simulator evidence for the S1/S2 review fixes. The
concurrency and Prisma runtime proofs run against the local Supabase PostgreSQL. No
V1/V2 runtime dependency was introduced. Generation (V0-G3 onward), credit reservation,
avatar selection and publishing remain unimplemented; the immutable `SelectedScript`
remains the downstream contract reference and selection never silently advances to
generation.
