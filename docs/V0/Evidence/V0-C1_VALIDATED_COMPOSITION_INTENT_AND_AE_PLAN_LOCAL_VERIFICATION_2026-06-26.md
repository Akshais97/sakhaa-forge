# V0-C1 Validated Composition Intent And AE Plan Local Verification — 2026-06-26

## Slice

V0-C1: Validated Composition Intent And AE Plan.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/Sprints/V0-C1_VALIDATED_COMPOSITION_INTENT_AND_AE_PLAN_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- `POST /composition-plans` synchronously validates a composition intent bound to a retained
  generated asset against the deterministic AE capability registry. Composition planning is
  not a paid or externally visible mutation, so no `Idempotency-Key` is required and no credit
  ledger entry is written. The caller supplies the workspace id, the retained generated asset
  id, the input mode (`structured`) and optional raw direction, plus a versioned timeline
  (`schemaVersion` `ae.plan.v1`, `capabilityVersion` `ae.local.1`, `durationSeconds`,
  `resolution`, `tracks`, `overlays`, `effects`, `fonts`, `plugins`, `templates`). Only Owner,
  Admin or Client Manager (`select_blueprint_and_run_scripts`) may create a plan; a Reviewer
  is denied by the shared `assertWorkspacePermission` guard (`PERMISSION_DENIED` 403). The
  request requires no idempotency key. The response is `202 Accepted`.
- The deterministic AE capability registry (`apps/api/src/ae-capability-registry.mjs`,
  `aeCapabilityRegistry(env)`) is the only source of supported fonts (`Satoshi`, `Clash
  Display`, `JetBrains Mono`), plugins (`ae_builtin`), templates (`realestate_listing`,
  `property_walkthrough`, `testimonial_quote`), effects (`zoom_in`, `fade`, `slide`,
  `ken_burns`), codecs (`h264`), safe zones (`center`, `lower_third`, `upper_third`, `full`),
  duration bounds (5–90 s), resolutions (`1080x1920`), and the AE worker capability version
  (`ae.local.1`, env `AE_CAPABILITY_VERSION`, Internal/Fail). The schema version is
  `ae.plan.v1`. The LLM cannot invent assets, fonts, plugins, templates or effects: a plan
  that references an unsupported item is `validation_failed` with every unsupported item
  explained.
- The pure async validator `validateAePlan(timeline, registry, resolveAsset)` returns
  `{ ok, capabilityVersion, schemaVersion }` or `{ ok: false, primary, unsupported }`.
  `resolveAsset` is an async callback returning the retained CLEAN generated asset for an id,
  or `null` when the asset is missing, cross-workspace or not clean. The primary error code
  follows the catalog priority `AE_PLAN_SCHEMA_INVALID` (422) > `AE_CAPABILITY_UNAVAILABLE`
  (409) > `AE_ASSET_MISSING` (422) > `AE_TIMELINE_INVALID` (422); schema errors short-circuit
  because a structurally broken plan cannot be trusted for capability, asset or timing checks.
  Every unsupported item is explained in `unsupported` as `{ code, field, detail }`; none are
  silently dropped.
- A valid plan is retained as `validated`. The store creates a `CompositionInstruction`
  (status `validated`, version 1), an `AePlan` (status `validated`, capability version
  `ae.local.1`, schema version `ae.plan.v1`, `unsupportedItems` `[]`, `validatedAt` set), and a
  CLEAN plan `Artifact` (`application/json`, retention class `plan-artifact`, producer
  `composition:{instructionId}`, schema version `ae.plan.v1`, sha256 = canonical timeline
  hash, status `CLEAN`). The `planArtifactId` binds the plan to the artifact. A
  `composition.plan_validated` audit is written against `CompositionInstruction`. The
  response carries the composition instruction (id, generationAssetId, inputMode, status,
  version), the AE plan (id, compositionInstructionId, version, capabilityVersion,
  schemaVersion, status, unsupportedItems, planArtifactId, validatedAt), the plan artifact
  (id, status, contentType, sha256, retentionClass) and the audit (eventType, targetType).
- A malformed plan or capability mismatch is retained as `validation_failed`. The store still
  creates the `CompositionInstruction` (status `validation_failed`) and `AePlan` (status
  `validation_failed`, `unsupportedItems` = the full unsupported list, no `planArtifactId`)
  and writes a `composition.validation_failed` audit. The response is an RFC 9457 problem
  with the primary `code`, `planStatus: "validation_failed"`, `compositionId`, `planId` and
  the full `unsupported` list. No plan artifact is retained for a failed plan. Validation
  failure is explicit and is never treated as partial success.
- A referenced asset that is missing, cross-workspace or not clean is reported as
  `AE_ASSET_MISSING` so cross-workspace existence never leaks: `resolveAsset` looks up the
  retained CLEAN generated asset in the caller's workspace only (in-memory: by
  `workspaceId`; Prisma: `findFirst({ where: { id, workspaceId } })` under RLS), so a
  cross-workspace asset id resolves to `null` and is reported as missing without revealing
  that the asset exists in another workspace. A missing workspace is hidden behind
  `WORKSPACE_ACCESS_DENIED` (404) before any composition state is observable. The timeline
  JSON, plan artifact sha256, referenced asset ids, signed URLs and secrets never appear in
  any response; the public mappers (`publicCompositionInstruction`, `publicAePlan`) omit the
  timeline, raw direction and sha256. The integration tests assert no URL, secret, signature
  or asset id leak.
- The web shell implements the composition plan review workflow at
  `apps/web/src/composition-plan-workflow.mjs` with pure, DOM-agnostic state functions unit
  tested in Node and a `compositionMarkup` renderer. The workflow is never optimistic: it
  shows loading, calls `V0Client.createCompositionPlan`, and renders the committed plan or a
  calm error. `classifyCompositionError` maps each AE and access error to a stable banner
  state (`blocked-hidden` `WORKSPACE_ACCESS_DENIED`, `forbidden` `PERMISSION_DENIED`,
  `malformed-plan` `AE_PLAN_SCHEMA_INVALID`, `missing-asset` `AE_ASSET_MISSING`,
  `unsupported-capability` `AE_CAPABILITY_UNAVAILABLE`, `invalid-timeline`
  `AE_TIMELINE_INVALID`). The rendered markup carries only status, capability version, schema
  version and the explained unsupported items; the plan artifact sha256, asset ids, signed
  URLs and secrets never appear. The unit suite asserts the FORBIDDEN regex never matches the
  rendered markup.
- Prisma schema and migration `0024_v0_c1_validated_composition_intent_and_ae_plan` add the
  `composition_status` enum (`DRAFT`/`PLANNING`/`VALIDATION_FAILED`/`VALIDATED`/`RENDERING`/
  `RENDERED`/`FAILED`/`SUPERSEDED`) and the `composition_instructions` and `ae_plans` tables.
  Each table has a FK to `workspaces`, CHECK constraints (`input_mode` non-empty, version
  positive, `capability_version`/`schema_version` non-empty), workspace-scoped indexes, and
  RLS + `*_workspace_isolation` policies keyed on `app.current_workspace_id`. No BYPASSRLS is
  granted. `composition_instructions.generation_asset_id` is a plain UUID, not a FK: the
  application layer (`resolveAsset`) is the sole validator of asset existence, workspace
  ownership and CLEAN status, and a `validation_failed` plan for a missing or cross-workspace
  asset must still be retained (a FK would leak existence via P2003 and block recording failed
  attempts). `ae_plans.plan_artifact_id` is a nullable FK to `artifacts` (set only for a
  validated plan). `timeline` and `unsupported_items` are JSONB.

## Red evidence

Command:

```text
node --test tests\integration\composition-c1.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.createCompositionPlan is not a function
```

All eight C1 integration tests failed before `createCompositionPlan` existed on the generated
client or the store/routes, and before the `CompositionInstruction`, `AePlan` and
`composition_status` enum existed in the Prisma client and migration.

## Green evidence

Command:

```text
node --test tests/integration/composition-c1.test.mjs
```

Outcome:

```text
✔ C1 validates a well-formed plan bound to a retained generated asset
✔ C1 rejects an invented asset id and retains the plan as validation_failed
✔ C1 rejects an unsupported font, plugin and template as a capability mismatch
✔ C1 rejects invalid timing and an unsafe zone
✔ C1 rejects a capability version mismatch
✔ C1 rejects a malformed timeline schema
✔ C1 hides a cross-workspace asset reference behind AE_ASSET_MISSING
✔ C1 hides a missing workspace behind WORKSPACE_ACCESS_DENIED
tests 8
pass 8
fail 0
```

Required sprint tests and outcomes:

- Valid plan acceptance — pass. A well-formed plan bound to a retained CLEAN generated asset
  is retained as `validated`; the plan artifact is `CLEAN`, `application/json`, retention
  class `plan-artifact`, sha256 matches `^[0-9a-f]{64}$`; the audit is
  `composition.plan_validated`; no URL, secret or signature leaks.
- Invented asset rejection — pass. A non-existent asset id returns `AE_ASSET_MISSING` (422)
  with `planStatus: "validation_failed"`; the plan is retained as `validation_failed`; the
  real asset id from the workspace is not leaked.
- Unsupported capability rejection — pass. An unsupported font, plugin and template returns
  `AE_CAPABILITY_UNAVAILABLE` (409) with `planStatus: "validation_failed"`.
- Invalid timing and unsafe zone rejection — pass. Overlapping video tracks and an unsafe
  zone both return `AE_TIMELINE_INVALID` (422) with `planStatus: "validation_failed"`.
- Capability version mismatch — pass. A stale capability version returns
  `AE_CAPABILITY_UNAVAILABLE` (409).
- Malformed schema — pass. A timeline missing `schemaVersion` returns
  `AE_PLAN_SCHEMA_INVALID` (422).
- Cross-workspace asset hiding — pass. A workspace B referencing workspace A's retained asset
  returns `AE_ASSET_MISSING` (422) with no workspace A id leak.
- Missing workspace hiding — pass. A non-member workspace returns
  `WORKSPACE_ACCESS_DENIED` (404) with no owned workspace id leak.

Unit test commands and outcomes:

```text
node --test tests/unit/ae-plan-validator.test.mjs
tests 8
pass 8
fail 0

node --test tests/unit/composition-plan-workflow.test.mjs
tests 8
pass 8
fail 0
```

The validator unit suite asserts the deterministic capability registry is the only source of
supported fonts/plugins/templates/effects/codecs/safe zones/duration/resolution/capability
version; an invented asset, unsupported capability, capability mismatch, invalid timing,
overlaps, out-of-bounds duration, unsafe zone, malformed schema and multiple coexisting
errors are each rejected with the correct primary code and every unsupported item explained.

The workflow unit suite asserts the composition status mapping (unknown preserved), the
validation outcome mapping, every AE/access error mapped to a calm banner state, the
loading/empty/ready phases, the `planStatus` rendering, and that the rendered markup never
leaks secrets, signatures or URLs (FORBIDDEN regex) and renders every unsupported item.

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 231
pass 218
fail 0
skipped 13

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 13
pass 13
fail 0
  ✔ prisma runtime persists V0-C1 validated composition instruction, AE plan and CLEAN plan artifact under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../G5/C1 ... validated composition instructions and AE plans
with deterministic capability registry validation and CLEAN plan artifacts, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1 local verification passed.
```

The 13 skipped tests in the broad glob are the prisma-runtime proof tests intentionally
skipped there and run by the dedicated verification step immediately after, including the
new C1 validated composition instruction, AE plan and CLEAN plan artifact runtime proof
against Supabase.

## Migration evidence

`node scripts/verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0024_v0_c1_validated_composition_intent_and_ae_plan/migration.sql
CREATE TYPE
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
```

The migration creates the `composition_status` enum and the `composition_instructions`
(workspace, actor, retained generated asset, input mode, raw direction, status, version) and
`ae_plans` (workspace, composition instruction, version, capability version, schema version,
JSONB timeline, status, JSONB unsupported_items, nullable plan artifact, validated_at)
tables. Each table enables RLS with a `*_workspace_isolation` policy keyed on
`app.current_workspace_id`. No BYPASSRLS is granted. `generation_asset_id` is a plain UUID
(application-layer validated); `plan_artifact_id` is a nullable FK to `artifacts`.

The runtime-proof test confirms persistence under RLS:

```text
SELECT status::text || ':' || input_mode::text FROM composition_instructions
WHERE id = '<instruction>' AND workspace_id = '<ws>' AND generation_asset_id = '<asset>'
-- result: VALIDATED:structured

SELECT status::text || ':' || capability_version::text FROM ae_plans
WHERE id = '<plan>' AND workspace_id = '<ws>' AND plan_artifact_id = '<artifact>' AND validated_at IS NOT NULL
-- result: VALIDATED:ae.local.1

SELECT status::text || ':' || retention_class::text FROM artifacts
WHERE id = '<artifact>' AND workspace_id = '<ws>' AND producer = 'composition:<instruction>' AND schema_version = 'ae.plan.v1'
-- result: CLEAN:plan-artifact

SELECT count(*)::text FROM audit_events
WHERE workspace_id = '<ws>' AND event_type = 'composition.plan_validated' AND target_type = 'CompositionInstruction' AND target_id = '<instruction>'
-- result: 1
```

The failure-path runtime proof confirms an invented asset is retained as `VALIDATION_FAILED`
with no plan artifact (`plan_artifact_id` null) and a `composition.validation_failed` audit.
A cross-workspace asset reference resolves to `null` under RLS and returns
`AE_ASSET_MISSING` (422) with no other-workspace id leak. The timeline JSON, plan artifact
sha256 and referenced asset ids never appear in any response.

## Downstream contract reference

`docs/V0/V0_API.md`, `docs/V0/V0_DATA_MODELS.md`, `docs/V0/V0_PRISMA_SCHEMA.md`,
`docs/V0/V0_STATUS_ENUMS.md`, `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md` and
`docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` record that V0-C1 writes the
`CompositionInstruction` and `AePlan` models, the `composition_status` enum, the
`POST /composition-plans` endpoint, the `composition.plan_validated` /
`composition.validation_failed` audit rows, the deterministic AE capability registry
(`ae.local.1` / `ae.plan.v1`) and the `AE_CAPABILITY_VERSION` (Internal/Fail) configuration.
The composition error surface reuses the existing V0 error codes —
`AE_PLAN_SCHEMA_INVALID`, `AE_ASSET_MISSING`, `AE_CAPABILITY_UNAVAILABLE`,
`AE_TIMELINE_INVALID`, `WORKSPACE_ACCESS_DENIED` and `PERMISSION_DENIED` — so no new error
code is introduced. `RenderAttempt`/`FinalVideo` and `POST /composition-plans/{id}/render`
are owned by later composition sprints (V0-C2 and beyond) and were not implemented here.

## Browser state evidence

The web shell renders the composition plan review contract at
`composition-plan` with `empty`, `loading`, `validated`, `validation_failed`, `blocked-hidden`,
`forbidden`, `malformed-plan`, `missing-asset`, `unsupported-capability`, `invalid-timeline`
and `unknown` states. The `composition-plan-workflow` unit suite asserts the rendered copy, the
status mapping (unknown preserved as a real state), the calm error banners for every AE/access
guard code, the `planStatus` rendering, and that no secret, signature, signed URL, asset id or
external URL appears in the markup. The deterministic V0 browser-state evidence for the sprint
is captured in
`V0-C1_COMPOSITION_PLAN_REVIEW_UI_SNAPSHOT_2026-06-26.html`; no live browser screenshot is
captured in local verification.

## Scope note

This is local deterministic simulator evidence for V0-C1. It does not claim production AE
worker readiness, real provider media composition, real rendering or full V0 acceptance. The
`ae.local.1` capability version and `ae.plan.v1` schema version are deterministic local
affordances; real After Effects worker capability negotiation, real plan rendering and
publication are deferred to later sprints. Composition plan validation is not rendering and is
not publication; no claim of audience-facing verification, scheduling or publication is made
before the owning sprints' verification passes. No credit is captured or released by
composition planning (it is not a paid mutation), and no plan artifact is retained for a
`validation_failed` plan.
