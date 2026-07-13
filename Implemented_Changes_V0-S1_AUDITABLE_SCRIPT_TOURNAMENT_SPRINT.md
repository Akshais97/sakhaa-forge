# Implemented Changes: V0-S1 Auditable Script Tournament Sprint

## Slice

V0-S1: Auditable Script Tournament.

## Behaviour

- Added `POST /api/v0/script-tournaments` (202 Accepted, `Idempotency-Key` required,
  `select_blueprint_and_run_scripts` capability).
- Binds generation to the P5-ready blueprint request, approved brand-profile version,
  formula derivation and provider-neutral director prompt.
- Deterministic simulator generates 10-20 variants and evaluates hook strength, timing,
  pattern interrupts, CTA, claims, captions and tone against brand rules and universal
  prohibited-claim policy.
- Retains every variant and evaluation with prompt/model versions, provenance source
  hashes, a manifest artifact and a `script_tournament` job.
- Exposes bucketed `script_tournament_started`/`script_tournament_completed` analytics;
  raw prompts and script text never enter analytics.
- Fewer than ten valid variants return `SCRIPT_VARIANT_COUNT_INSUFFICIENT` (409); AI
  request refusal returns `AI_REQUEST_REFUSED` (422); schema-invalid output returns
  `AI_OUTPUT_SCHEMA_INVALID` (422). Failed tournaments never silently advance.
- Blocks unapproved brand profiles (`BRAND_PROFILE_NOT_APPROVED`) and draft blueprints
  (`BLUEPRINT_STAGE_INCOMPLETE`); cross-workspace requests are hidden with
  `WORKSPACE_ACCESS_DENIED` (404).
- Deduplicates tournament creation by `(actor, operation, idempotency_key)`.

## Contract and data changes

- Added `ScriptTournament`, `ScriptVariant` and `ScriptEvaluation` Prisma models with
  workspace back-relations and a 1:1 variant→evaluation link.
- Added migration `0016_v0_s1_script_tournament` with CHECK constraints, jsonb array
  checks, the unique `script_evaluations.variant_id` index and one RLS policy per table.
- Added `createScriptTournament` to the OpenAPI source and generated client.
- Added the deterministic `script-generation` simulator (`SCRIPT_PROMPT_VERSION`,
  `SCRIPT_MODEL_VERSION`, `supportedScriptSimulatorModes`, `generateScriptVariants`,
  `evaluateScriptVariant` and bucket helpers).
- Implemented `createScriptTournament` in both the in-memory and Prisma workspace stores.
- Added the script-tournament contract screen to the web shell with an e2e assertion.
- Updated V0 API, data model, Prisma schema and implementation-plan docs; marked Gate 3
  complete in `V0_IMPLEMENTATION_PLAN.md`.

## Verification

- Red: `node --test tests\integration\script-tournament-s1.test.mjs` failed on missing
  `createScriptTournament`, then on the draft-blueprint guard while ready-blueprint
  resolution was wired.
- Green: `node --test tests\integration\script-tournament-s1.test.mjs` (tests 6, pass 6).
- E2E: `node --test tests\e2e\web-workspace.test.mjs` (tests 9, pass 9).
- Final: `node scripts\verify.mjs` (tests 94, pass 93, skipped 1; prisma runtime 1 pass;
  db-validate valid for V0-F5/B1/B2/B3/P1/P2/P3/P4/P5/S1).

## Notes

All provider/script-generation boundaries remain deterministic simulators. No V1/V2
runtime dependency was added. Script selection (V0-S2) is not yet implemented; the
tournament stops at `ready_for_selection`.
