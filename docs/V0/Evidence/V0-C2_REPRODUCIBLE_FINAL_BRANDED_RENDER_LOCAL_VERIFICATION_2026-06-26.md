# V0-C2 Reproducible Final Branded Render Local Verification — 2026-06-26

## Slice

V0-C2: Reproducible Final Branded Render.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/Sprints/V0-C2_REPRODUCIBLE_FINAL_BRANDED_RENDER_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- `POST /composition-plans/{id}/render` renders a validated composition plan into one retained
  `current` `FinalVideo` through the deterministic AE worker simulator. The path `{id}` is the
  `CompositionInstruction` id. Rendering is an externally visible, reproducible mutation, so
  the caller must supply an `Idempotency-Key`; a missing key returns
  `IDEMPOTENCY_KEY_REQUIRED` (400). Only Owner, Admin or Client Manager
  (`select_blueprint_and_run_scripts`) may render; a Reviewer is denied by the shared
  `assertWorkspacePermission` guard (`PERMISSION_DENIED` 403). A missing or cross-workspace
  composition instruction is hidden behind `WORKSPACE_ACCESS_DENIED` (404) before any render
  state is observable. The response is `202 Accepted`.
- The store loads the composition instruction and its validated `AePlan` in the caller's
  workspace only. A plan that is not `validated` returns `AE_PLAN_SCHEMA_INVALID` (422). The
  AE render provider (`apps/api/src/ae-render-provider.mjs`) is the sole render boundary:
  `AE_RENDER_SCHEMA_VERSION` `ae.render.v1`, `AE_RENDER_RESOURCE_CLASS` `AE`,
  `AE_RENDER_RESOLUTION` `1080x1920`, `AE_RENDER_CODEC` `h264`. `resolveAeRenderMode(env)`
  reads `V0_C2_SIMULATOR_MODE` (default `success`). `renderAeVideo(env, request)` refuses any
  `AE_WORKER_MODE` other than `simulator` with `AE_RENDER_FAILED`; `success` returns a
  descriptor whose `outputHash` equals the golden render hash, `crash` returns a crash signal,
  `bad_output` returns an incompatible descriptor, `capability_drift` reports an unexpected
  capability version. `goldenRenderHash(planCanonicalHash, durationSeconds)` is
  `sha256("ae-render-final:${planCanonicalHash}:${durationSeconds}")`, stable across revisions
  and replays.
- `validateAeRenderOutput(descriptor, expected)` validates the worker output against the
  expected capability version, input hash, codec, resolution, duration and golden output hash
  with the catalog priority `AE_CAPABILITY_UNAVAILABLE` (409, capability mismatch) >
  `AE_RENDER_FAILED` (422, input hash / codec / resolution / duration mismatch, missing hash,
  or output hash != golden). Capability drift ranks above an output hash mismatch. A missing
  golden hash is `AE_RENDER_FAILED`; no incompatible output is ever silently promoted.
- A succeeded render is retained as a `RenderAttempt` (`succeeded`, output hash set to the
  golden render hash, renderer `ae-render-simulator`) and a new `current` `FinalVideo`
  (version N+1, `current`, bound to the retained CLEAN final-video, final-thumbnail and
  final-captions artifacts, sha256 = golden render hash, schema version `ae.render.v1`,
  resolution `1080x1920`, codec `h264`, capability version `ae.local.1`). Four CLEAN artifacts
  are retained: `final-video` (`video/mp4`), `final-thumbnail` (`image/jpeg`),
  `final-captions` (`text/vtt`) and `render-logs` (`application/json`, deterministic
  positive byte size satisfying `artifacts.byte_size > 0`). The composition instruction moves
  to `rendered`. A `composition.render_succeeded` audit is written against
  `CompositionInstruction`. The response carries the render attempt (status, version, output
  hash = golden render fingerprint), the final video (status, version, resolution, codec,
  duration, capability/schema version, sha256 = golden render hash), the render-level creative
  lineage, the composition status and the four public artifacts (id, sha256, content type, byte
  size, retention class, producer, schema version). The golden render hash is surfaced
  intentionally as the final-video sha256 and the render attempt output hash — public content
  fingerprints, not secrets. Signed URLs, secrets, raw worker payloads, the render-logs payload
  contents, the plan input hash, the input asset hashes, the idempotency input hash and artifact
  object/storage keys never appear in the response.
- A revision renders a new `current` `FinalVideo` (version N+1) and supersedes the prior
  `current` row by setting it to `superseded` without overwriting it, preserving the immutable
  revision lineage. A `composition.video_superseded` audit is written. The golden render hash
  is identical across revisions for the same plan input, so a re-render of the same validated
  plan is reproducible; the version chain is the revision history.
- A failed render is retained as a `RenderAttempt` (`failed`) with a
  `composition.render_failed` audit carrying the failure code; no final video is retained. A
  replay of a failed render with the same idempotency key replays the failure (reconstructed
  from the most recent `composition.render_failed` audit for the instruction).
- A worker crash is recovered exactly once. The store persists the `RenderAttempt` `running`
  (with the CLEAN render-logs artifact and a `composition.render_started` audit) before the
  worker runs. A crash leaves the attempt `running`. A second call with the same idempotency
  key resumes: it finds the existing `running` attempt, runs the simulator to completion,
  retains the final media and moves the attempt to `succeeded`. A fresh attempt (different
  idempotency key) during the crash window is refused with `DEPENDENCY_UNAVAILABLE` (503) and
  the existing attempt stays `running`. A timeout after possible worker acceptance is
  preserved as `unknown` and reconciled before any retry; the caller never blindly retries an
  uncertain render.
- A terminal same-key replay (the attempt is already `succeeded` or `failed`) returns the
  original outcome without re-running the worker: a `succeeded` replay returns the same final
  video id, attempt id and lineage for the same composition; the audit is not duplicated.
  Partial unique indexes (`render_attempts_one_running_per_instruction` and
  `final_videos_one_current_per_instruction`) turn a concurrent render into a Prisma
  `P2002`/`P2034` conflict, normalised into a replay or a `503`, never a raw `500` and never a
  blind retry.
- Render idempotency is input-bound, not key-bound. The store hashes the canonical render
  request — `compositionInstructionId`, `aePlanId`, `planCanonicalHash`, `inputAssetHashes`
  and `capabilityVersion` — into `RenderAttempt.idempotencyInputHash` and compares it on
  lookup. The same `Idempotency-Key` replays or resumes only when it hashes to the same input
  for the same composition; the same key replayed against a different composition, plan, input
  assets or capability version returns `IDEMPOTENCY_INPUT_CONFLICT` (409) and creates no final
  video and no attempt, so a key reused across compositions can never silently return another
  composition's final video. This is verified for `succeeded`, `failed` and `running` prior
  attempts in the in-memory store and under RLS in the Prisma store. A worker crash resume uses
  the same key and the same input; `running` is a real state and the replay returns the exact
  same attempt, final video and lineage regardless of whether the prior final video was later
  superseded by a revision (the replay returns the final video belonging to the replayed
  attempt, not the current one).
- A succeeded render retains a V0-C2 render-level `CreativeLineage` row that binds the final
  video back through the `CompositionInstruction`, `AePlan` and `RenderAttempt` that produced
  it, copying the V0-G5 generated-asset ancestry in-row (`generatedAssetId`, `brandProfileId`,
  `estimateId`, `provider`, `providerOperationId`, `priceVersion`; `generationJobId` is null on
  a render-level row). One render-level lineage row per final video
  (`unique(workspaceId, finalVideoId)`); the G5 generation-job lineage row keeps
  `unique(workspaceId, generationJobId)` with `finalVideoId` null. SQL treats NULLs as distinct,
  so each unique constraint scopes only its non-null row kind. A revision creates a new
  render-level lineage row for the new final video and never overwrites the prior row, so the
  immutable ancestry of every retained final video is preserved. This is verified in the
  in-memory store and under RLS in the Prisma store.
- The web shell implements the final branded render workflow at
  `apps/web/src/composition-render-workflow.mjs` with pure, DOM-agnostic state functions unit
  tested in Node and a `renderMarkup` renderer. The workflow is never optimistic: it shows
  loading, calls `V0Client.renderCompositionPlan` with an idempotency key, and renders the
  committed render or a calm error. `classifyRenderError` maps each render and access error to
  a stable banner state (`blocked-hidden` `WORKSPACE_ACCESS_DENIED`, `forbidden`
  `PERMISSION_DENIED`, `render-failed` `AE_RENDER_FAILED`, `unsupported-capability`
  `AE_CAPABILITY_UNAVAILABLE`, `crash-recovery` `DEPENDENCY_UNAVAILABLE`). `attemptState` and
  `finalVideoState` lowercase the backend values and preserve `unknown` for an uncertain
  worker outcome. The rendered markup carries only status, version, resolution, codec,
  capability/schema version and the revision lineage; the render attempt output hash, golden
  render hash, render-logs payload, signed URLs and artifact ids never appear. The unit suite
  asserts the FORBIDDEN regex never matches the rendered markup.
- Prisma schema and migration `0025_v0_c2_reproducible_final_branded_render` add the
  `render_attempt_status` enum (`RUNNING`/`SUCCEEDED`/`FAILED`) and `final_video_status` enum
  (`CURRENT`/`SUPERSEDED`), and the `render_attempts` and `final_videos` tables. Each table
  has a FK to `workspaces`, `composition_instructions`, `ae_plans` and `artifacts`
  (`render_attempts.logs_artifact_id`; `final_videos.final_video_artifact_id`,
  `thumbnail_artifact_id`, `captions_artifact_id`), CHECK constraints
  (`render_attempts_status_completed_check`: a `SUCCEEDED` row has `output_hash` and
  `completed_at`, a `FAILED` row has `completed_at`; `final_videos_byte_size_check`:
  `byte_size > 0`), workspace-scoped indexes, partial unique indexes
  (`WHERE status = 'RUNNING'` and `WHERE status = 'CURRENT'`) and RLS +
  `*_workspace_isolation` policies keyed on `app.current_workspace_id`. No BYPASSRLS is
  granted. `input_hash`, `input_asset_hashes` and `unsupported_items` are JSONB/text; the
  golden output hash is a plain text column on both `render_attempts` and `final_videos`.
- Migration `0026_v0_c2_render_level_lineage_and_input_bound_idempotency` extends
  `creative_lineage` for render-level lineage and input-bound render idempotency. It drops the
  `NOT NULL` on `creative_lineage.generation_job_id` (so a render-level row sets it NULL and is
  identified by `final_video_id`), adds nullable `composition_instruction_id`, `ae_plan_id`,
  `render_attempt_id` and `final_video_id` FK columns, adds the
  `creative_lineage_one_final_video_idx` unique index and a supporting
  `creative_lineage_workspace_final_video_idx` index, and adds
  `render_attempts.idempotency_input_hash CHAR(64)`. RLS is reasserted on `creative_lineage` and
  `render_attempts` (idempotent no-ops); the new columns inherit the existing
  workspace-isolation policies and no role is granted an RLS bypass. The migration is additive
  and forward-only, and is validated by `db-validate.mjs`.

## Red evidence

Command:

```text
node --test tests\integration\composition-c2.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.renderCompositionPlan is not a function
```

All fourteen C2 integration tests failed before `renderCompositionPlan` existed on the generated
client or the store/routes, and before the `RenderAttempt`, `FinalVideo`,
`render_attempt_status` and `final_video_status` enums existed in the Prisma client and
migration. The five tests added by the C2 review fix (three input-bound idempotency conflict
variants, the exact-replay-consistency test, and the render-level lineage retention test) failed
before `idempotencyInputHash` and the render-level `CreativeLineage` row existed.

## Green evidence

Command:

```text
node --test tests/integration/composition-c2.test.mjs
```

Outcome:

```text
✔ C2 renders a validated plan into a retained 9:16 final video, thumbnail and captions
✔ C2 rejects an AE worker capability drift
✔ C2 rejects an incompatible worker output hash
✔ C2 recovers a worker crash and renders exactly once
✔ C2 preserves prior final-video revisions immutably
✔ C2 requires an idempotency key for render
✔ C2 hides a cross-workspace render behind WORKSPACE_ACCESS_DENIED
✔ C2 hides a missing workspace behind WORKSPACE_ACCESS_DENIED
✔ C2 golden render hash is deterministic for the same plan input
✔ C2 conflicts when an idempotency key is replayed against a different composition (succeeded)
✔ C2 conflicts when an idempotency key is replayed against a different composition (failed)
✔ C2 conflicts when an idempotency key is replayed against a different composition (running)
✔ C2 replay returns the same composition's attempt, final video and lineage
✔ C2 retains render-level creative lineage and preserves prior lineage on revision
tests 14
pass 14
fail 0
```

Required sprint tests and outcomes:

- Succeeded render acceptance — pass. A validated plan renders into a `current` version-1
  `FinalVideo` with four CLEAN artifacts (final-video, final-thumbnail, final-captions,
  render-logs); the attempt is `succeeded` with the golden output hash; the composition moves
  to `rendered`; the audit is `composition.render_succeeded`; no URL, secret or signature
  leaks.
- Non-validated plan rejection — pass. A plan that is not `validated` returns
  `AE_PLAN_SCHEMA_INVALID` (422).
- Incompatible worker output rejection — pass. A worker output whose hash differs from the
  golden render hash returns `AE_RENDER_FAILED` (422); the attempt is `failed`.
- Crash recovery — pass. A worker crash leaves the attempt `running`; a same-idempotency-key
  resume completes the render exactly once; a fresh attempt during the crash window is refused
  with `DEPENDENCY_UNAVAILABLE` (503).
- Revision lineage immutability — pass. A new revision creates a new `current` row and sets
  the prior `current` row to `superseded` without overwriting it; a `composition.video_superseded`
  audit is written; the prior row is still readable.
- Idempotency key required — pass. A render without an `Idempotency-Key` returns
  `IDEMPOTENCY_KEY_REQUIRED` (400).
- Cross-workspace hiding — pass. A workspace B rendering workspace A's composition returns
  `WORKSPACE_ACCESS_DENIED` (404) with no workspace A id leak.
- Missing workspace hiding — pass. A non-member workspace returns `WORKSPACE_ACCESS_DENIED`
  (404) with no owned workspace id leak.
- Golden hash determinism — pass. The same validated plan input produces the same golden
  render hash across revisions and replays.
- Input-bound idempotency conflict — pass. Replaying the same `Idempotency-Key` against a
  different composition (succeeded, failed and running prior attempts) returns
  `IDEMPOTENCY_INPUT_CONFLICT` (409) and creates no final video and no attempt for the second
  composition; a fresh key renders the second composition normally.
- Exact replay consistency — pass. A same-key same-input replay of a `succeeded` attempt
  returns the same composition's attempt, final video and lineage, including after a revision
  has superseded that attempt's final video.
- Render-level lineage retention — pass. A succeeded render retains a `CreativeLineage` row
  binding `compositionInstructionId`, `aePlanId`, `renderAttemptId` and `finalVideoId` with
  `generationJobId` null; a revision creates a new render-level lineage row and leaves the prior
  row immutable.

Unit test commands and outcomes:

```text
node --test tests/unit/ae-render-validator.test.mjs
tests 14
pass 14
fail 0

node --test tests/unit/composition-render-workflow.test.mjs
tests 10
pass 10
fail 0
```

The validator unit suite asserts the deterministic golden render hash, the
`validateAeRenderOutput` priority (`AE_CAPABILITY_UNAVAILABLE` ranks above `AE_RENDER_FAILED`),
codec/resolution/duration/input-hash mismatch rejection, missing-hash rejection, output hash
inequality rejection, the `AE_WORKER_MODE` gate, and that `renderAeVideo` never returns a
transient URL, signed URL, secret or raw worker payload.

The workflow unit suite asserts the render attempt and final-video status mapping (`unknown`
preserved), every render/access error mapped to a calm banner state, the loading/empty/ready
phases, the revision-lineage rendering (current + superseded), the crash-recovery banner, and
that the rendered markup never leaks secrets, signatures, URLs or artifact ids (FORBIDDEN
regex).

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 273
pass 256
fail 0
skipped 17

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 17
pass 17
fail 0
  ✔ prisma runtime persists V0-C2 render attempt, versioned final video and CLEAN final media under RLS
  ✔ prisma runtime recovers a V0-C2 worker crash and renders exactly once under RLS
  ✔ prisma runtime rejects a V0-C2 idempotency-key replay against a different composition under RLS
  ✔ prisma runtime retains V0-C2 render-level creative lineage and preserves prior lineage on revision under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../G5/C1/C2 ... reproducible final branded render with
versioned final videos, CLEAN final media, deterministic golden render hashes, render-level
creative lineage binding composition instruction, AE plan, render attempt and final video with
input-bound render idempotency, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2 local verification passed.
```

The 17 skipped tests in the broad glob are the prisma-runtime proof tests intentionally
skipped there and run by the dedicated verification step immediately after, including the four
C2 render-attempt / final-video / crash-recovery / idempotency-conflict / render-level-lineage
runtime proofs against Supabase. All nine verification phases ran green: generate-contracts,
db-generate, db-migrate-dev, check-format, lint, typecheck, the broad test glob, the
prisma-runtime proof and db-validate.

## Migration evidence

`node scripts/verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0025_v0_c2_reproducible_final_branded_render/migration.sql
CREATE TYPE
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

The migration creates the `render_attempt_status` and `final_video_status` enums and the
`render_attempts` (workspace, composition instruction, AE plan, version, renderer, input
hash, input asset hashes, worker capability version, status, logs artifact, cost minor,
idempotency key, output hash, completed at) and `final_videos` (workspace, composition
instruction, render attempt, version, status, final-video/thumbnail/captions artifacts,
sha256, byte size, schema version, resolution, codec, capability version, duration seconds)
tables. Each table enables RLS with a `*_workspace_isolation` policy keyed on
`app.current_workspace_id`. No BYPASSRLS is granted. Partial unique indexes enforce one
`RUNNING` attempt per instruction and one `CURRENT` final video per instruction, turning
concurrent renders into normalised conflicts. CHECK constraints ensure a `SUCCEEDED` attempt
has an output hash and completed_at, a `FAILED` attempt has completed_at, and a final video
has a positive byte size.

`node scripts/verify.mjs` then applied the review-fix migration:

```text
Applying packages/db/prisma/migrations/0026_v0_c2_render_level_lineage_and_input_bound_idempotency/migration.sql
ALTER TABLE
ALTER TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
ALTER TABLE
ALTER TABLE
```

The additive migration drops `NOT NULL` on `creative_lineage.generation_job_id`, adds the
nullable `composition_instruction_id`, `ae_plan_id`, `render_attempt_id` and `final_video_id`
FK columns, adds the `creative_lineage_one_final_video_idx` unique index and the
`creative_lineage_workspace_final_video_idx` index, adds
`render_attempts.idempotency_input_hash CHAR(64)`, and reasserts RLS on `creative_lineage` and
`render_attempts`. No role is granted an RLS bypass. The migration is forward-only and does not
rewrite existing G5 generation-job lineage rows.

The runtime-proof test confirms persistence under RLS:

```text
SELECT status::text || ':' || COALESCE(output_hash, 'null') FROM render_attempts
WHERE id = '<attempt>' AND workspace_id = '<ws>' AND composition_instruction_id = '<instruction>'
  AND idempotency_key = '<key>' AND logs_artifact_id = '<logs>'
-- result: SUCCEEDED:<golden sha256>

SELECT status::text || ':' || version::text || ':' || final_video_artifact_id::text FROM final_videos
WHERE id = '<video>' AND workspace_id = '<ws>' AND composition_instruction_id = '<instruction>'
  AND render_attempt_id = '<attempt>' AND sha256 = '<golden sha256>' AND schema_version = 'ae.render.v1'
-- result: CURRENT:1:<final-video artifact>

SELECT string_agg(retention_class, ',' ORDER BY retention_class) FROM artifacts
WHERE workspace_id = '<ws>' AND id IN ('<final-video>', '<thumbnail>', '<captions>', '<logs>')
  AND status = 'CLEAN'
-- result: final-captions,final-thumbnail,final-video,render-logs

SELECT status::text FROM composition_instructions WHERE id = '<instruction>' AND workspace_id = '<ws>'
-- result: RENDERED

SELECT count(*)::text FROM audit_events
WHERE workspace_id = '<ws>' AND event_type = 'composition.render_succeeded'
  AND target_type = 'CompositionInstruction' AND target_id = '<instruction>'
-- result: 1
```

The crash-recovery runtime proof confirms a worker crash leaves the attempt `RUNNING`
(`SELECT status::text FROM render_attempts ...` = `RUNNING`) before the resume; the
same-idempotency-key resume then completes the attempt `succeeded` with a version-1 final
video, and a further same-key same-input call replays the same final video, attempt and
lineage. The input-bound idempotency runtime proof confirms a same-key replay against a
different composition returns `IDEMPOTENCY_INPUT_CONFLICT` (409) under RLS with no final video
or attempt created for the second composition
(`SELECT count(*)::text FROM render_attempts WHERE idempotency_key = '<key>'` = `1`;
`SELECT status::text FROM composition_instructions WHERE id = '<planB>'` = `VALIDATED`;
`SELECT count(*)::text FROM creative_lineage WHERE workspace_id = '<ws>' AND final_video_id IS
NOT NULL AND composition_instruction_id = '<planB>'` = `0`). The render-level lineage runtime
proof confirms a succeeded render writes a `creative_lineage` row with `generation_job_id IS
NULL`, `composition_instruction_id`, `ae_plan_id`, `render_attempt_id`, `generated_asset_id`
and `final_video_id` all bound, and that a revision creates a second render-level lineage row
for the new final video while the prior row keeps its original `final_video_id` unchanged
(immutable; `SELECT count(*)::text FROM creative_lineage WHERE workspace_id = '<ws>' AND
final_video_id IS NOT NULL` = `2`). Signed URLs, secrets, raw worker payloads, the render-logs
payload contents, the plan input hash, the input asset hashes, the idempotency input hash and
artifact object keys never appear in any response; the golden render hash is surfaced as the
final-video sha256 and the render attempt output hash, and artifact ids and sha256s are
surfaced as public references.

## Downstream contract reference

`docs/V0/V0_API.md`, `docs/V0/V0_DATA_MODELS.md`, `docs/V0/V0_PRISMA_SCHEMA.md`,
`docs/V0/V0_STATUS_ENUMS.md`, `docs/V0/V0_JOBS.md`, `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`,
`docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`, `docs/V0/V0_ERROR_CATALOG.md` and
`docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` record that V0-C2 writes the
`RenderAttempt` and `FinalVideo` models, the `render_attempt_status` and `final_video_status`
enums, the `POST /composition-plans/{id}/render` endpoint, the `composition.render_started` /
`composition.render_succeeded` / `composition.render_failed` / `composition.video_superseded`
audit rows, the deterministic AE render simulator (`ae.render.v1` / `ae.local.1`), the
`final_video_rendered` and `final_video_revision_superseded` analytics events, the
`ae_render` job type, and the `AE_WORKER_MODE` and `V0_C2_SIMULATOR_MODE` (Internal/test)
configuration. The render error surface reuses the existing V0 error codes —
`AE_PLAN_SCHEMA_INVALID`, `AE_CAPABILITY_UNAVAILABLE`, `AE_RENDER_FAILED`,
`DEPENDENCY_UNAVAILABLE`, `WORKSPACE_ACCESS_DENIED`, `PERMISSION_DENIED` and
`IDEMPOTENCY_INPUT_CONFLICT` — so no new error code is introduced. The C2 review fix updated
`V0_API.md` (render route now documents input-bound idempotency, `IDEMPOTENCY_INPUT_CONFLICT`
on same-key different-composition, the render-level `CreativeLineage` response field, the
`text/vtt` captions content type, and the exact set of fields that do and do not reach the
response), `V0_DATA_MODELS.md` (the `CreativeLineage` two-row-kind contract and
`RenderAttempt.idempotencyInputHash`), `V0_PRISMA_SCHEMA.md` (the extended `CreativeLineage`
model with nullable `generationJobId` and the render-level bindings, the
`RenderAttempt.idempotencyInputHash` column, and the `creative_lineage_one_final_video_idx`
unique index) and the generated OpenAPI document. Exact-version review and comments are owned
by V0-R1 and were not implemented here.

## Browser state evidence

The web shell renders the final branded render contract at `final-video` with `empty`,
`loading`, `rendered`, `render-failed`, `unsupported-capability`, `crash-recovery`,
`blocked-hidden`, `forbidden` and `unknown` states. The `composition-render-workflow` unit
suite asserts the rendered copy, the attempt/final-video status mapping (`unknown` preserved
as a real state), the calm error banners for every render/access guard code, the
revision-lineage rendering (current + superseded), and that no secret, signature, signed URL,
artifact id or external URL appears in the markup. The deterministic V0 browser-state evidence
for the sprint is captured in `V0-C2_FINAL_BRANDED_RENDER_UI_SNAPSHOT_2026-06-26.html`; no
live browser screenshot is captured in local verification.

## Scope note

This is local deterministic simulator evidence for V0-C2. It does not claim production AE
worker readiness, real After Effects rendering, real media encoding or full V0 acceptance.
The `ae.local.1` capability version and `ae.render.v1` schema version are deterministic local
affordances; real After Effects worker rendering, real provider media composition and
publication are deferred to later sprints. The Prisma concurrency design is minimal: partial
unique indexes normalise concurrent renders into a replay or a `503`, and the runtime proof
covers crash recovery and idempotent replay; a full multi-process concurrency proof is
deferred. Rendering is not publication; no claim of audience-facing verification, scheduling
or publication is made before the owning sprints' verification passes. No credit is captured
or released by rendering (it is not a paid mutation); the `cost_minor` column is retained for
future render-cost settlement and is `0` in V0.
