# Implemented Changes: V0-S1/S2 Senior Review Fixes

## Slice

V0-S1 (Script Tournament) and V0-S2 (Immutable Selected Script) review fixes from
`docs/Project/Sprint Reviews/S1_S2review.md`.

## Behaviour

- Built the real S1/S2 frontend workflow in `apps/web/src/script-tournament-workflow.mjs`.
  A Client Manager runs a ready blueprint tournament via the generated
  `V0Client.createScriptTournament`, the workflow renders 10-20 variants with
  evaluations and eligibility, and a confirmed selection calls
  `V0Client.selectScriptVariant`. Selection is irreversible, so the browser glue
  confirms before the call (no optimistic UI). The workflow exposes empty, loading,
  error, stale, disabled, already-selected and success states.
- Made the path `tournamentId` authoritative in `selectScriptVariant`. A body
  `tournamentId` that differs from the path returns `VALIDATION_FAILED` (422) before
  the store or idempotency layer is reached.
- Made S2 selection concurrency-safe in the Prisma store with an atomic claim
  (`updateMany` guarded by `status: "ready_for_selection"`). Concurrent selections with
  different `Idempotency-Key` values retain exactly one selected script and return
  `SCRIPT_ALREADY_SELECTED` (409) to the other, never a duplicate or a 500.
- Added S1/S2 Prisma runtime persistence proof and a real-database concurrent
  double-selection race to `tests/integration/prisma-runtime.test.mjs`.
- Fixed a pre-existing Prisma bug surfaced by the runtime proof:
  `createScriptTournament` now re-fetches the tournament so the response carries the
  database's authoritative `updatedAt` for the optimistic-version guard.
- Added an additive foreign key from `selected_scripts.approver_user_id` to
  `users(id)` for actor lineage integrity.

## Contract and data changes

- `apps/api/src/server.mjs`: `selectScriptVariant` reconciles path and body
  tournamentId and passes the reconciled input to `runIdempotent` and the store.
- `apps/api/src/workspace-store.mjs`: Prisma `selectScriptVariant` uses an atomic
  `updateMany` claim; Prisma `createScriptTournament` re-fetches the tournament to
  return the authoritative `updatedAt`.
- `packages/contracts/src/openapi.v0.json`: added the `422` response to
  `POST /script-tournaments/{tournament_id}/select` for a path/body mismatch;
  generated artifacts regenerated.
- `packages/db/prisma/schema.prisma`: `SelectedScript.approver User` relation with
  `selectedScriptsAsApprover SelectedScript[]` back-relation on `User`.
- `packages/db/prisma/migrations/0018_v0_s2_selected_script_approver_fk/migration.sql`:
  additive `FOREIGN KEY (approver_user_id) REFERENCES users(id)`.
- `packages/db/scripts/db-migrate-dev.mjs` and `packages/db/scripts/db-validate.mjs`:
  extended for migration `0018` (sentinel, RLS-protected-table guard, FK validation).
- `apps/web/src/server.mjs`: serves the workflow and generated client modules and
  renders the real S1/S2 workflow form, state banners and variant container.
- `apps/web/src/script-tournament-workflow.mjs`: new DOM-agnostic workflow module with
  pure state functions and browser glue.
- `tests/helpers/script-tournament-fixtures.mjs`: shared S1/S2 flow helpers.
- `tests/integration/script-selection-s2.test.mjs`: path/body mismatch test and
  concurrent double-selection race test.
- `tests/integration/script-selection-workflow.test.mjs`: workflow integration test
  against the real API (ready, success, stale, invalid, already-selected).
- `tests/unit/script-tournament-workflow.test.mjs`: workflow pure-function unit tests.
- `tests/e2e/web-workspace.test.mjs`: workflow surface and module-serving e2e tests.
- `tests/integration/prisma-runtime.test.mjs`: S1/S2 persistence and race proof.
- `docs/V0/V0_API.md`, `docs/V0/V0_PRISMA_SCHEMA.md`,
  `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`: updated to reflect the authoritative path
  tournamentId, the concurrency-safe claim, the approver FK and the implemented
  workflow.

## Verification

- Red: path/body mismatch test failed `404 !== 422`; Prisma runtime S1/S2 test failed
  `409 RESOURCE_VERSION_STALE !== 200` before the timestamp re-fetch fix.
- Green:
  - `node --test tests/integration/script-selection-s2.test.mjs` (9 pass).
  - `node --test tests/integration/script-tournament-s1.test.mjs` (6 pass).
  - `node --test tests/integration/script-selection-workflow.test.mjs` (3 pass).
  - `node --test tests/unit/script-tournament-workflow.test.mjs` (7 pass).
  - `node --test tests/e2e/web-workspace.test.mjs` (12 pass).
  - `node scripts/verify.mjs` (117 tests, 115 pass, 2 skipped; prisma runtime 2 pass;
    db-validate valid for S1/S2 plus the approver FK).
- Migration `0018` applied against the local database.

## Notes

All provider/script-generation boundaries remain deterministic simulators. No
V1/V2 runtime dependency was added. The Prisma concurrency and runtime proofs run
against the local Supabase PostgreSQL. Generation (V0-G3 onward), credit reservation,
avatar selection and publishing remain unimplemented; the immutable `SelectedScript`
is the downstream contract reference and selection never silently advances to
generation.
