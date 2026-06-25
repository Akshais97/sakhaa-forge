# V0-P5 Ready Blueprint Local Verification — 2026-06-25

## Slice

V0-P5: Immutable Blueprint, Formula And Director Prompt.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-P5_IMMUTABLE_BLUEPRINT_FORMULA_AND_DIRECTOR_PROMPT_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_TESTING.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- Extracted P4 scene blueprint and approved default formula paths both create a `v0.script-input.1` contract.
- Ready creation retains immutable `BlueprintLibraryEntry`, `FormulaDerivation` and `DirectorPrompt` identities.
- P5 records `blueprint_merge`, `formula_derive` and `director_prompt_generate` job evidence.
- Missing required stage evidence returns `BLUEPRINT_STAGE_INCOMPLETE`.
- Invalid formula slots return `BLUEPRINT_FORMULA_INVALID`.
- Duplicate ready creation for one blueprint request returns `RESOURCE_VERSION_STALE`.
- Web shell exposes ready-blueprint contract, success and blocked states.
- Prisma schema and migration include P5 tables and RLS policies.

## Red evidence

Command:

```text
node --test tests\integration\blueprint-ready-p5.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.createReadyBlueprint is not a function
```

After initial implementation, job evidence test failed as expected:

```text
TypeError: Cannot read properties of undefined (reading 'map')
```

## Green evidence

Command:

```text
node --test tests\integration\blueprint-ready-p5.test.mjs
```

Outcome:

```text
tests 2
pass 2
fail 0
```

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome:

```text
tests 87
pass 86
fail 0
skipped 1

prisma runtime persists workspace and idempotency records in Supabase
tests 1
pass 1

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5 local verification passed.
```

The skipped test in the broad test glob is the runtime-proof test intentionally skipped
there and run by the dedicated verification step immediately after.

## Migration evidence

`node scripts\verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0015_v0_p5_ready_blueprint_formula_prompt/migration.sql
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
ALTER TABLE
CREATE POLICY
CREATE POLICY
```

## Scope note

This is local deterministic simulator evidence for V0-P5. It does not claim production
provider readiness or full V0 acceptance.
