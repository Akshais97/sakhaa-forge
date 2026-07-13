# V0-S1 Auditable Script Tournament Local Verification — 2026-06-25

## Slice

V0-S1: Auditable Script Tournament.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-S1_AUDITABLE_SCRIPT_TOURNAMENT_SPRINT.md`
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

- `POST /api/v0/script-tournaments` generates 10-20 formula- and brand-constrained
  variants through a deterministic simulator and binds to the P5-ready blueprint request,
  approved brand profile, formula derivation and provider-neutral director prompt.
- Every variant retains hook type, hook, body, CTA, captions, claims, cadence, formula
  slots and prompt/model provenance with a source hash; every evaluation retains hook
  strength, timing, pattern interrupts, CTA, claims, captions, tone, formula checks,
  policy checks, brand-rule checks, model score and explanation.
- The response exposes the tournament, variants, evaluations, the `script_tournament`
  job, audit and bucketed `script_tournament_started`/`script_tournament_completed`
  analytics; raw prompts and script text never enter analytics.
- Fewer than ten valid variants return `SCRIPT_VARIANT_COUNT_INSUFFICIENT` (409); an AI
  request refusal returns `AI_REQUEST_REFUSED` (422); schema-invalid simulator output
  returns `AI_OUTPUT_SCHEMA_INVALID` (422). No failed tournament silently advances.
- Variant-count lower (9) and upper (21) boundaries return `VALIDATION_FAILED`; the
  default count is 10.
- An unapproved/draft blueprint returns `BLUEPRINT_STAGE_INCOMPLETE` (409); a
  cross-workspace blueprint request returns `WORKSPACE_ACCESS_DENIED` (404).
- The endpoint requires an `Idempotency-Key` (missing → `IDEMPOTENCY_KEY_REQUIRED` 400)
  and deduplicates tournament creation; the `select_blueprint_and_run_scripts` capability
  is enforced.
- Web shell exposes the script-tournament contract, ready-for-selection, insufficient
  valid and draft-blueprint guard states.
- Prisma schema and migration include S1 tables, constraints and RLS policies.

## Red evidence

Command:

```text
node --test tests\integration\script-tournament-s1.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.createScriptTournament is not a function
```

After initial implementation, the draft-blueprint guard test failed as expected while the
ready-blueprint resolution path was being wired:

```text
AssertionError: expected 409, got ...
BLUEPRINT_STAGE_INCOMPLETE
```

## Green evidence

Command:

```text
node --test tests\integration\script-tournament-s1.test.mjs
```

Outcome:

```text
tests 6
pass 6
fail 0
```

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome:

```text
tests 94
pass 93
fail 0
skipped 1

prisma runtime persists workspace and idempotency records in Supabase
tests 1
pass 1

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1 local verification passed.
```

The skipped test in the broad test glob is the runtime-proof test intentionally skipped
there and run by the dedicated verification step immediately after. The web shell e2e
suite now covers the S1 script-tournament contract screen.

## Migration evidence

`node scripts\verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0016_v0_s1_script_tournament/migration.sql
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE UNIQUE INDEX
ALTER TABLE
ALTER TABLE
ALTER TABLE
CREATE POLICY
CREATE POLICY
CREATE POLICY
```

The migration creates `script_tournaments`, `script_variants` and `script_evaluations`
with status/result/variant-count CHECK constraints, jsonb array checks, a unique
`script_evaluations.variant_id` index and one workspace-isolation RLS policy per table
(`workspace_id::text = current_setting('app.current_workspace_id', true)`).

## Scope note

This is local deterministic simulator evidence for V0-S1. It does not claim production
provider readiness or full V0 acceptance. Script selection (V0-S2) is not yet
implemented; the tournament stops at `ready_for_selection` and never silently advances.
