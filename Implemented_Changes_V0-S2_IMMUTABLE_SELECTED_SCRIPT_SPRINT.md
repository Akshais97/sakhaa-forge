# Implemented Changes: V0-S2 Immutable Selected Script Sprint

## Slice

V0-S2: Immutable Selected Script.

## Behaviour

- Added `POST /api/v0/script-tournaments/{id}/select` (200 OK,
  `Idempotency-Key` required, `select_blueprint_and_run_scripts` capability).
- Lets a Client Manager compare evaluated variants and select one exact
  immutable script version for generation.
- Retains one canonical, immutable `SelectedScript` per tournament with the
  actor, workspace, tournament, selected variant, version, optional
  human-override attestation and timestamp.
- Records a `script.selected` audit over `SelectedScript` and a bucketed
  `script_selected` analytics event (`variant_rank_bucket`,
  `human_overrode_top_score`); raw script text never enters analytics.
- Guards a stale comparison tab with an optimistic-version guard
  (`RESOURCE_VERSION_STALE` 409) captured from the tournament's content version.
- Rejects an unevaluated, refused, superseded or foreign variant with
  `SCRIPT_SELECTION_INVALID` (409) and a cross-workspace tournament with
  `WORKSPACE_ACCESS_DENIED` (404) without revealing existence.
- Refuses a second genuine selection attempt with `SCRIPT_ALREADY_SELECTED`
  (409) before the stale-version guard, so a retried comparison tab never
  overwrites a selection.
- Deduplicates selection by `(actor, operation, idempotency_key)`; retries
  return the same immutable selection.
- Selection never implies generation approval or credit reservation; the
  tournament advances only to `selected` and never silently to generation.

## Contract and data changes

- Added the `SelectedScript` Prisma model with workspace back-reference, unique
  `tournamentId` and `variantId`, `approverUserId`, `version`,
  `humanOverride` and timestamps, plus `selection` back-relations on
  `ScriptTournament` and `ScriptVariant`.
- Added migration `0017_v0_s2_selected_script` with the `selected_scripts`
  table, version and human-override CHECK constraints, unique
  `tournament_id`/`variant_id` constraints, a `(workspace_id, created_at)`
  index and a workspace-isolation RLS policy.
- Added `selectScriptVariant` to the OpenAPI source and the generated client.
- Added the `variantRankBucket` analytics helper and a `mixed_valid` simulator
  mode that keeps at least ten valid variants while retaining two
  policy-refused variants for selection-rejection tests.
- Implemented `selectScriptVariant` in both the in-memory and Prisma workspace
  stores (in-memory Maps and `withActor`/RLS transaction path respectively).
- Added the script-selection contract screen to the web shell with an e2e
  assertion.
- Updated V0 API, data model, Prisma schema and implementation-plan docs; the
  verify script and verify-script test now report the S1/S2 verification scope.
- Fixed missing trailing newlines on the S1 evidence and implemented-changes
  documents so the format check passes.

## Verification

- Red: `node --test tests\integration\script-selection-s2.test.mjs` failed on
  missing `selectScriptVariant` (7 tests, 7 fail).
- Green: `node --test tests\integration\script-selection-s2.test.mjs`
  (tests 7, pass 7).
- E2E: `node --test tests\e2e\web-workspace.test.mjs` (tests 10, pass 10).
- Final: `node scripts\verify.mjs` (tests 102, pass 101, skipped 1; prisma
  runtime 1 pass; db-validate valid for
  V0-F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2).

## Notes

All provider/script-generation boundaries remain deterministic simulators. No
V1/V2 runtime dependency was added. Generation (V0-G3 onward), credit
reservation, avatar selection and publishing are not yet implemented; the
immutable `SelectedScript` is the downstream contract reference for the
generation estimate, and selection never silently advances to generation.
