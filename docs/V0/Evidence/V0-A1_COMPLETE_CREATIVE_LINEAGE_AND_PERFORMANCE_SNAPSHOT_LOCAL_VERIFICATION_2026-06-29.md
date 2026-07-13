# V0-A1 Complete Creative Lineage And Performance Snapshot Local Verification — 2026-06-29

## Slice

V0-A1: Complete Creative Lineage And Performance Snapshot.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
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

## Owner decisions on unspecified contract dimensions

The canonical contracts named the lineage export and performance snapshot as V0-A1 outcomes but did
not pin several dimensions. Per CLAUDE.md §1 and §19, the unspecified dimensions were resolved by
owner decision rather than guesswork, and the conservative defaults are flagged here for
confirmation:

- Lineage export scope: one final video, bounded to its immutable ancestry
  (brandProfile -> selectedScript -> avatarProfile -> estimate -> providerOperation ->
  generatedAsset -> compositionInstruction -> aePlan -> renderAttempt -> finalVideo) extended through
  the bound calendar post (calendarPost -> postVerification -> performanceSnapshotInitial). A
  cross-workspace or missing final video hides behind `WORKSPACE_ACCESS_DENIED` (404) so the owning
  workspace id never leaks.
- Lineage `status` is `complete` / `incomplete` / `blocked` / `unknown`. Missing ancestry is
  `incomplete` with the missing kinds named in `missing` (honest, not an error); a final-video
  `sha256` that does not equal its render-attempt `outputHash` is `blocked` with the mismatch named
  in `mismatches`. `unknown` is preserved for an unrecognised body.
- The lineage manifest is `sha256` over the stable JSON of the entries sorted by `{kind, id}` and is
  stable across reads. The manifest sha256 and each artifact content sha256 are public content
  fingerprints; the object key never surfaces.
- The performance collect (`POST /calendar-posts/{id}/performance-collect`) is a synchronous,
  idempotent API write (not a queued BullMQ job). The deterministic performance simulator observes
  the verified live post in the request path. An `Idempotency-Key` is required; a same-key replay
  returns the same snapshot with `replay: true`.
- `PerformanceSnapshot.observation` is derived from `source` (`simulated` for a collect-simulator
  snapshot, `null` for the initial snapshot). No `observation` column is added; the public contract
  is identical across the in-memory and Prisma stores with no migration.
- Performance metrics are observations only (views, likes, comments, shares, saves). No reach,
  virality, conversion or causal performance claim is ever surfaced; the UI renders an explicit
  observations-only note.
- `view_lineage_and_performance` is a new read capability granted to Owner, Admin and Client
  Manager (NOT Reviewer). Collect stays on `schedule_publish_approved_media` because it writes an
  immutable observation.
- A snapshot is flagged `stale` on read when the post is no longer `published_verified`.
- A not-yet-`published_verified` post is not observable and returns `PERFORMANCE_NOT_OBSERVABLE`
  (409). A `processing_wait` observation returns `202 Accepted` with `PERFORMANCE_PROCESSING_WAIT`
  and a `retryAfterMs` (`PERFORMANCE_PROCESSING_RETRY_AFTER_MS`, default 60000 ms), and writes no
  snapshot. The collect-simulator is disabled when `PERFORMANCE_MODE` is set to a non-simulator
  value (`PERFORMANCE_PROVIDER_UNAVAILABLE`).

## Behaviour verified

- `GET /lineage/{finalVideoId}` exports the complete creative ancestry as a bounded, redacted,
  hash-manifested record. Only Owner, Admin or Client Manager (`view_lineage_and_performance`) may
  export; a Reviewer is denied (`PERMISSION_DENIED` 403). A cross-workspace or missing final video
  hides behind `WORKSPACE_ACCESS_DENIED` (404) with no owning workspace id leak. The `200 OK`
  response carries `workspaceId`, `finalVideoId`, `status`, `missing`, `mismatches`,
  `manifestSha256`, `generatedAt`, `cost`, `providerTimestamps` and the redacted `entries`. Each
  artifact entry carries only its public content `sha256`, `contentType` and `version`; the object
  key never surfaces. The export is a record of what was produced, not a prediction of reach,
  virality, conversion or causal performance.
- `POST /calendar-posts/{id}/performance-collect` collects a fresh observed `PerformanceSnapshot`.
  Only Owner, Admin or Client Manager (`schedule_publish_approved_media`) may collect; an
  `Idempotency-Key` is required. A not-yet-`published_verified` post returns
  `PERFORMANCE_NOT_OBSERVABLE` (409). An `observed` result retains a NEW immutable snapshot (source
  `performance_collect_simulator`, observation `simulated`, a widened window and populated observed
  metrics) and never mutates the initial snapshot anchored at verification. A same-key replay
  returns the same snapshot with `replay: true` and writes no second row; a same-key+different-input
  attempt returns `IDEMPOTENCY_INPUT_CONFLICT` (409). A `processing_wait` observation returns `202`
  with `PERFORMANCE_PROCESSING_WAIT`, `retryAfterMs` and no snapshot. Cross-workspace and missing
  posts hide behind `WORKSPACE_ACCESS_DENIED` (404).
- `GET /calendar-posts/{id}/performance` reads every immutable `PerformanceSnapshot` for one
  calendar post. Only Owner, Admin or Client Manager (`view_lineage_and_performance`) may read; a
  Reviewer is denied. The read returns the `calendarPost` (with its `status`) and the bounded
  `snapshots` list, each carrying `id`, `source`, `observation`, `observationWindowStart`,
  `observationWindowEnd`, a `stale` flag and the observed `metrics`. The initial
  `audience_verification_initial` snapshot keeps empty metrics forever.
- The deterministic performance simulator lives in `apps/api/src/performance-provider.mjs`.
  `collectPerformanceObservation(env, request)` derives observed metrics deterministically from
  `sha256("performance.observation.v1:calendarPostId:collectSequence:platform")`, so metrics are
  stable across replays. It refuses when `PERFORMANCE_MODE` is set to a non-simulator value
  (`PERFORMANCE_PROVIDER_UNAVAILABLE`).
- The web shell implements two workflows with pure, DOM-agnostic state functions unit tested in
  Node: `apps/web/src/lineage-workflow.mjs` (`lineageState`, `classifyLineageError`,
  `deriveLineageState`, `lineageMarkup`) and `apps/web/src/performance-workflow.mjs`
  (`performanceState`, `classifyPerformanceError`, `derivePerformanceState`,
  `performanceMarkup`). The lineage workflow maps `complete`/`incomplete`/`blocked`/`unknown` and
  the export error codes to calm banner states (`blocked-hidden` for `WORKSPACE_ACCESS_DENIED`,
  `forbidden` for `PERMISSION_DENIED`, `lineage-invalid` for `VALIDATION_FAILED`). The performance
  workflow maps `observed`/`stale`/`awaiting-collection`/`not-observable`/`unknown` and the
  collect/read error codes. The performance markup renders the explicit observations-only note:
  the counts are not a prediction, forecast or promise of reach, virality, conversion or causal
  performance.
- No secret, signed URL, object key, raw provider payload, request hash, source hash, account id
  or cross-workspace reference appears in any lineage or performance response, analytics event or
  rendered markup. Cross-workspace and missing references hide behind `WORKSPACE_ACCESS_DENIED`
  (404) and never leak the owning workspace id.
- No Prisma migration is added: A1 reuses the `CreativeLineage` and `PerformanceSnapshot` tables
  and the existing idempotency machinery. `observation` is derived from `source` so the public
  contract is identical across stores with no schema change.

## Prisma runtime design

The A1 Prisma path reuses the established patterns. `getLineageForActor` traverses the
`CreativeLineage` row and the publication/observation ancestry with tenant-leading predicates
(`prisma.creativeLineage.findFirst`, `prisma.calendarPost.findFirst`, etc.) outside a transaction
and computes the status, cost, provider timestamps and the manifest sha256 from the retained rows;
BigInt money fields are converted via `Number(...)`, and the uppercase Postgres enum labels are
lowercased at the mapper boundary. `collectPerformanceForActor` runs under a short `withActor`
transaction: it loads the post (returning `WORKSPACE_ACCESS_DENIED` 404 for a cross-workspace or
missing post), refuses a not-verified post with `PERFORMANCE_NOT_OBSERVABLE`, calls the simulator,
and on an `observed` result appends a new `PerformanceSnapshot` and a durable
`idempotencyRecord` (operation `calendar.performance_collect`, storing
`responseBody.performanceSnapshotId`); a same-key replay returns the stored `responseBody` with
`replay: true`. `getPerformanceForActor` reads the bounded snapshot list and attaches the `stale`
flag from the post status. A returned `{ok:false, problem}` (never a thrown `HttpException`) lets
the transaction commit cleanly with no writes; the controller re-throws any `HttpException` before
sanitisation, and the `202` processing-wait path throws `new HttpException(result.response, 202)`.

## Red evidence

Commands:

```text
node --test tests\integration\lineage-a1.test.mjs
node --test tests\unit\lineage-workflow.test.mjs tests\unit\performance-workflow.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.getLineage is not a function
TypeError: client.collectPerformance is not a function
TypeError: client.getPerformance is not a function
Cannot find module '../../apps/web/src/lineage-workflow.mjs'
Cannot find module '../../apps/web/src/performance-workflow.mjs'
```

All five A1 integration tests failed before `getLineage`, `collectPerformance` and `getPerformance`
existed on the generated client or the store/route, and the web workflow unit suites failed before
the workflow modules existed. The Prisma runtime proof additionally failed before the three store
functions were exposed on the Prisma return surface.

## Green evidence

Command:

```text
node --test tests/integration/lineage-a1.test.mjs
```

Outcome:

```text
✔ A1 exports the complete creative ancestry with cost, timestamps and a stable hash manifest
✔ A1 performance_collect creates a fresh immutable observed snapshot and never mutates the initial snapshot
✔ A1 rejects performance_collect on a not-yet-verified post and requires an idempotency key
✔ A1 denies a cross-workspace lineage export behind WORKSPACE_ACCESS_DENIED without leaking existence
✔ A1 hides a cross-workspace performance read behind WORKSPACE_ACCESS_DENIED
✔ A1 blocks lineage when a retained final-video sha256 no longer matches the render attempt output hash
✔ A1 blocks lineage when the retained render attempt output hash no longer matches the final video
✔ A1 denies lineage and performance reads to a Reviewer behind PERMISSION_DENIED
tests 8
pass 8
fail 0
```

The three added tests prove the sprint's required hash-mismatch behaviour and the Reviewer-role
denial at the API boundary:

- `A1 blocks lineage when a retained final-video sha256 no longer matches the render attempt output
  hash` corrupts the retained final-video `sha256` via a test-only fault-injection hook (gated to
  `APP_ENV=test`) and re-reads through the public `GET /lineage/{finalVideoId}` endpoint. It asserts
  `status: "blocked"`, `mismatches: ["final_video"]`, `missing: []` (the manifest does not claim
  complete ancestry), `status !== "complete"`, no secret/signed-URL/object-key/raw-payload leak, and
  a stable blocked result across reads.
- `A1 blocks lineage when the retained render attempt output hash no longer matches the final video`
  corrupts the other side of the binding (the render attempt `outputHash`) and asserts the same
  blocked export, proving the integrity guard is symmetric.
- `A1 denies lineage and performance reads to a Reviewer behind PERMISSION_DENIED` seeds a real
  active `REVIEWER` membership in the owner's workspace and asserts `PERMISSION_DENIED` (403) on
  both `GET /lineage/{finalVideoId}` and `GET /calendar-posts/{id}/performance` — the direct
  Reviewer-role denial proof the prior review noted as missing.

The fault-injection hook is required because no public happy-path behaviour can produce a retained
mismatch: the AE render validator (`apps/api/src/ae-render-provider.mjs`) rejects a non-golden
output before any final video is retained, so the retained final-video `sha256` and render attempt
`outputHash` are always equal in retained state. The hook mutates the retained row directly and the
assertion reads through the public endpoint, so the mismatch is proven at the API boundary against
real retained state rather than a synthetic UI response. Red was observed first: with the mismatch
detection in `getLineageForActor` neutralised, both mismatch tests fail with `actual: 'complete',
expected: 'blocked'`; with detection restored they pass.

Unit test commands and outcomes:

```text
node --test tests/unit/lineage-workflow.test.mjs tests/unit/performance-workflow.test.mjs
tests 13
pass 13
fail 0
```

The lineage unit suite asserts the export status mapping (with `unknown` preserved), every lineage
error mapped to a calm banner state, the complete-ancestry descriptor (manifest, cost, redacted
entries, no object key), the incomplete and blocked descriptors, the rendered markup with the
manifest and artifact sha256, and the cross-workspace blocked-hidden banner with no owning workspace
leak. The performance unit suite asserts the observed-surface derivation from post status and
snapshot count, every performance error mapped to a banner state, the observed-snapshots
descriptor with metrics and the observations-only note, the stale flag, the fresh-collect vs replay
distinction, and the cross-workspace blocked-hidden banner. The FORBIDDEN regex never matches either
markup.

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 423
pass 395
fail 0
skipped 28

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 25
  ✔ prisma runtime persists V0-A1 complete creative lineage, immutable performance snapshots and idempotent collect under RLS
  ✔ prisma runtime blocks lineage on a real persisted final-video / render-attempt hash mismatch under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../U4 identity, ... an initial immutable PerformanceSnapshot
anchoring the observation window, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2/U1/U2/U3/U4 local verification passed.
```

The 28 skipped tests in the broad glob are the prisma-runtime proof tests intentionally skipped
there and run by the dedicated verification step immediately after, including the V0-A1 runtime
proof. The added `prisma runtime blocks lineage on a real persisted final-video / render-attempt
hash mismatch under RLS` test UPDATEs the retained `final_videos.sha256` (then the retained
`render_attempts.output_hash`) via scoped SQL, re-reads through the public lineage endpoint against
the Prisma-backed store, asserts `status: "blocked"` with `mismatches: ["final_video"]` and no
leak, then restores the original hash so the proof leaves the system of record intact. The broad
glob and the A1 integration/unit suites above were re-run locally for this fix; the DB-backed
prisma-runtime proof (25 tests) runs under `pnpm verify` with `V0_RUNTIME_DB_PROOF=1` against the
configured Supabase database and was not re-executed in this session to avoid mutating the remote
system of record without the owner's go-ahead. No Prisma migration was added for A1 (the slice
reuses the `CreativeLineage` and `PerformanceSnapshot` tables and derives `observation` from
`source`), so `db-validate.mjs` needs no A1 migration entry; A1 acceptance is carried by the unit,
integration and prisma-runtime suites above.

## Notes

- The export is honest, not flattering: a lineage whose `selectedScriptId` cannot resolve to a
  retained `SelectedScript` is reported `incomplete` (named) rather than silently trusted. The A1
  integration `complete` test drives the real script tournament and selects a variant so the
  retained `SelectedScript` record exists and the ancestry is genuinely complete.
- Performance metrics are observations of past platform state only. No reach, virality, conversion
  or causal performance claim is made or implied; the UI renders an explicit observations-only note.
- No commit was made; this evidence is retained on the working branch pending the owner's commit
  decision, per the task constraint.
