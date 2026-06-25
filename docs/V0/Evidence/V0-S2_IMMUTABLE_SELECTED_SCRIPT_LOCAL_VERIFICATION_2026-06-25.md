# V0-S2 Immutable Selected Script Local Verification — 2026-06-25

## Slice

V0-S2: Immutable Selected Script.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-S2_IMMUTABLE_SELECTED_SCRIPT_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
- `docs/V0/V0_TESTING.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- `POST /api/v0/script-tournaments/{id}/select` lets a Client Manager compare
  evaluated variants and select one exact immutable script version. The request
  names the workspace, tournament, an eligible `variantId`, the
  `optimisticTournamentVersion` captured by the comparison tab and an optional
  `humanOverride` attestation. The endpoint requires an `Idempotency-Key`
  (missing → `IDEMPOTENCY_KEY_REQUIRED` 400) and the
  `select_blueprint_and_run_scripts` capability.
- One canonical, immutable `SelectedScript` is retained per tournament with the
  actor, workspace, tournament, variant, version, human-override attestation and
  timestamp. Unique `tournament_id` and `variant_id` enforce one selection per
  tournament and one selection per variant; changes require a new tournament and
  a new selection. Selection never implies generation approval or credit
  reservation.
- The response exposes the selected script, tournament (`status: selected`),
  variant, evaluation, audit (`script.selected` over `SelectedScript`) and a
  bucketed `script_selected` analytics event (`variant_rank_bucket`,
  `human_overrode_top_score`); raw script text never enters analytics.
- A stale comparison tab returns `RESOURCE_VERSION_STALE` (409). An unevaluated,
  refused, superseded or foreign variant returns `SCRIPT_SELECTION_INVALID`
  (409). A tournament that already has a selected script returns
  `SCRIPT_ALREADY_SELECTED` (409) before the stale-version guard, so a retried
  comparison tab never overwrites a selection. A cross-workspace tournament is
  hidden with `WORKSPACE_ACCESS_DENIED` (404). Retries with the same
  `Idempotency-Key` return the same immutable selection.
- The `mixed_valid` simulator mode keeps at least ten valid variants while
  retaining two policy-refused variants, so a `ready_for_selection` tournament
  can be used to prove rejected-variant selection rejection.
- The web shell exposes the script-selection contract, selected, stale and
  ineligible states.
- Prisma schema and migration include the `selected_scripts` table, its
  version and human-override CHECK constraints, the unique tournament/variant
  indexes and a workspace-isolation RLS policy.

## Red evidence

Command:

```text
node --test tests\integration\script-selection-s2.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.selectScriptVariant is not a function
```

All seven S2 tests failed before `selectScriptVariant` existed on the generated
client or the store/route.

## Green evidence

Command:

```text
node --test tests\integration\script-selection-s2.test.mjs
```

Outcome:

```text
tests 7
pass 7
fail 0
```

Required sprint tests and outcomes:

- Immutable selected-script identity proof — pass. The response retains a stable
  `selectedScript.id`, `version: 1`, `immutable: true`, the selected variant id
  and a `script.selected` audit record over `SelectedScript`.
- Stale selection rejection — pass. A `stale-version-token` returns
  `RESOURCE_VERSION_STALE` (409).
- Double-select idempotency — pass. A repeat with the same `Idempotency-Key`
  returns the same `selectedScript.id`.
- Cross-workspace selection denial — pass. A foreign workspace selecting against
  another workspace's tournament returns `WORKSPACE_ACCESS_DENIED` (404).
- Ineligible-variant rejection — pass. A policy-refused variant within a
  `ready_for_selection` tournament and a foreign variant id both return
  `SCRIPT_SELECTION_INVALID` (409). A second genuine selection attempt returns
  `SCRIPT_ALREADY_SELECTED` (409).

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome:

```text
tests 102
pass 101
fail 0
skipped 1

prisma runtime persists workspace and idempotency records in Supabase
tests 1
pass 1

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2 local verification passed.
```

The skipped test in the broad test glob is the runtime-proof test intentionally
skipped there and run by the dedicated verification step immediately after. The
web shell e2e suite now covers the S2 script-selection contract screen.

## Migration evidence

`node scripts\verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0017_v0_s2_selected_script/migration.sql
CREATE TABLE
CREATE INDEX
ALTER TABLE
CREATE POLICY
```

The migration creates `selected_scripts` with a primary key, workspace
back-reference, unique `tournament_id` and `variant_id` constraints,
`approver_user_id`, `version` and `human_override` columns with CHECK
constraints, a `(workspace_id, created_at)` index and a workspace-isolation RLS
policy (`workspace_id::text = current_setting('app.current_workspace_id', true)`).

## Downstream contract reference

`docs/V0/V0_JOBS.md` pipeline rule: generation requires a selected script,
avatar/route and active credit reservation. The immutable `SelectedScript.id`
and `variantId` are the downstream contract reference that V0-G3 generation
estimate and later generation work will bind to. No V0-G3 job, table or runtime
dependency was introduced in V0-S2.

## Browser state evidence

The web shell renders the script-selection contract with `selected`, `stale`
and `ineligible` states at `data-testid="script-selection-contract"`. The e2e
suite (`tests/e2e/web-workspace.test.mjs`) asserts the rendered comparison and
selected-state copy. This is the deterministic V0 browser-state evidence for the
sprint; no live browser screenshot is captured in local verification.

## Scope note

This is local deterministic simulator evidence for V0-S2. It does not claim
production provider readiness or full V0 acceptance. Generation (V0-G3 onward),
credit reservation, avatar selection and publishing are not yet implemented;
selection stops at the immutable `SelectedScript` and never silently advances
to generation.
