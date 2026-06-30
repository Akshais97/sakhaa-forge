# V0-U1 Approved Calendar And Manual Export Fallback Local Verification — 2026-06-27

## Slice

V0-U1: Approved Calendar And Manual Export Fallback.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/Sprints/V0-U1_APPROVED_CALENDAR_AND_MANUAL_EXPORT_FALLBACK_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
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

The canonical contracts did not name several U1 dimensions. Per CLAUDE.md §1 and §19, the
unspecified dimensions were resolved by owner decision rather than guesswork, and the conservative
defaults are flagged here for confirmation:

- Calendar status enum: follow `V0_STATUS_ENUMS.md` (with `approved`). `V0_PRISMA_SCHEMA.md`
  previously omitted `APPROVED` from `PublishStatus`; it is now corrected to the nine-value enum
  (`DRAFT`/`APPROVED`/`SCHEDULED`/`SUBMITTING`/`ACCEPTED`/`PUBLISHED_UNVERIFIED`/
  `PUBLISHED_VERIFIED`/`FAILED`/`CANCELLED`).
- `POST /calendar-posts` requires an `Idempotency-Key`.
- The manual export package is delivered via a `manualExport` flag on create (not a separate route).
- The manual live URL lives on a nullable `CalendarPost.manualLiveUrl` column, left null at create for
  the later verification path.
- Schedule conflict is app-enforced: a second scheduled post for the same `workspaceId` + `platform`
  + `account` whose `scheduledAt` falls within a 60-second conflict window is rejected with
  `PUBLISH_SCHEDULE_INVALID` (422). No database exclusion constraint is added (deferred).
- `scheduledAt` is an ISO-8601 instant with an explicit numeric UTC offset (`Z` or `±hh:mm`); a
  date-only or offset-less value is rejected so the stored instant is never silently interpreted as
  UTC. `timezone` is an IANA field stored for display only (default `Asia/Kolkata`); no embedded tz
  database is used (honest about V0 scope).
- "Stale caption/media" is collapsed to a media-version check: the bound `FinalVideo` must be
  `current` and carry a matching R2 approval token; a superseded version returns `PUBLISH_MEDIA_STALE`
  (409) and a missing/invalid approval returns `REVIEW_APPROVAL_REQUIRED` (409).
- The "wrong account" hard-check (platform-specific account ownership/eligibility) is deferred to
  V0-U2 publish; U1 stores the account workspace-scoped at create and only enforces the tenant
  boundary (a cross-workspace `finalVideoId` is hidden behind `WORKSPACE_ACCESS_DENIED` 404).
- The sprint backlog's "edit CalendarPost records" is reconciled as idempotent create: the same
  `Idempotency-Key` with the same input replays the same post, and with different input returns
  `IDEMPOTENCY_INPUT_CONFLICT`. A dedicated edit route is not implemented in U1.

## Behaviour verified

- `POST /calendar-posts` creates one `CalendarPost` bound to one approved exact final-video version
  (`finalVideoId` + captured `finalVideoSha256` + `finalVideoVersion` + the R2 `approvalToken`). The
  store loads the final video by `id + workspaceId`; a missing or cross-workspace final video is
  hidden behind `WORKSPACE_ACCESS_DENIED` (404) before any post state is observable. Only Owner,
  Admin or Client Manager (`schedule_publish_approved_media`) may create a post; a Reviewer is
  denied by the shared `assertWorkspacePermission` guard (`PERMISSION_DENIED` 403). The response is
  `202 Accepted`.
- A scheduled post (`manualExport` false) requires a valid future `scheduledAt` as an ISO-8601
  instant with an explicit UTC offset; a past, malformed or offset-less value, or a `scheduledAt`
  supplied on a manual export, returns `PUBLISH_SCHEDULE_INVALID` (422). The IST offset is
  respected: `2999-01-01T09:00:00+05:30` is stored as `2999-01-01T03:30:00.000Z`. A schedule conflict
  (same `workspaceId` + `platform` + `account` within the 60-second window) returns
  `PUBLISH_SCHEDULE_INVALID` (422); a different account at the same time is not a conflict. A
  scheduled post is created `SCHEDULED`.
- The bound final video must still be `current`; a superseded version returns `PUBLISH_MEDIA_STALE`
  (409) and records no post. The `approvalToken` must match a recorded `approve` decision bound to
  the exact version (`reviewDecisions` lookup on `workspaceId` + `finalVideoId` + `decision: APPROVE`
  + `approvalToken`), else `REVIEW_APPROVAL_REQUIRED` (409).
- A manual-export post (`manualExport` true) is created `APPROVED` with no `scheduledAt` and produces
  a retained manual-export `Artifact` whose `sha256` is the deterministic package hash
  (`sha256("manual-export:{workspaceId}:{finalVideoId}:{finalVideoVersion}:{approvalToken}:
  {platform}:{account}:{caption}")`), `retentionClass` `manual-export`, `schemaVersion`
  `calendar.manual_export.v1` and `status` `CLEAN`. `manualLiveUrl` is left null for the later
  verification path; `manualUrlProvidedAt` is null. The export artifact object key never reaches the
  browser (`publicArtifact` omits `objectKey` and the web layer never re-adds it).
- Create idempotency is key-bound through `store.runIdempotent({operation: "calendar.post.create",
  ...})`: the same `Idempotency-Key` with the same input replays the same post, export artifact and
  audit, and with different input returns `IDEMPOTENCY_INPUT_CONFLICT` (409). A missing
  `Idempotency-Key` returns `IDEMPOTENCY_KEY_REQUIRED` (400). A `calendar.post_created` audit is
  retained once (target type `CalendarPost`, reason `scheduled` or `manual_export`).
- The web shell implements the calendar workflow at `apps/web/src/calendar-workflow.mjs` with pure,
  DOM-agnostic state functions unit tested in Node and a `calendarMarkup` renderer. The workflow is
  never optimistic: it shows `create-loading`, calls the API with an `Idempotency-Key`, and renders
  the committed calendar post, bound version + golden hash, public approval token, scheduled time,
  manual live URL (null until later verification) and manual-export artifact content hash, or a calm
  error. `calendarPostState` maps the nine publish statuses and preserves `unknown`.
  `classifyCalendarError` maps each calendar error to a stable banner state (`blocked-hidden`
  `WORKSPACE_ACCESS_DENIED`, `forbidden` `PERMISSION_DENIED`, `missing-idempotency`
  `IDEMPOTENCY_KEY_REQUIRED`, `approval-required` `REVIEW_APPROVAL_REQUIRED`, `media-stale`
  `PUBLISH_MEDIA_STALE`, `schedule-invalid` `PUBLISH_SCHEDULE_INVALID`, `idempotency-conflict`
  `IDEMPOTENCY_INPUT_CONFLICT`, `post-invalid` `VALIDATION_FAILED`). `deriveCalendarState` produces
  the `post-scheduled` / `manual-export-ready` / `unknown` / error descriptors. The rendered markup
  carries only the status, platform, account, bound final-video version, golden render hash, approval
  token, scheduled time and timezone, manual live URL state and export package content hash. The
  unit suite asserts the FORBIDDEN regex never matches the markup and that the export object key
  prefix never appears.
- Signed URLs, object keys, export artifact object keys, raw provider payloads and secrets never
  appear in any calendar response, audit row, analytics event or rendered markup. The final-video
  sha256 is a public content fingerprint and is surfaced as the bound golden render hash. The
  approval token is a public deterministic reference, not a secret. The export artifact sha256 is a
  public content hash. Cross-workspace and missing workspaces (including a `finalVideoId` from
  another workspace) hide behind `WORKSPACE_ACCESS_DENIED` (404) and never leak the owning workspace
  id; a cross-workspace create returns the same 404.
- Prisma schema and migration `0029_v0_u1_approved_calendar_and_manual_export_fallback` add the
  `publish_status` enum (nine values, including `APPROVED`) and the `calendar_posts` table.
  `calendar_posts` has FKs to `workspaces`, `final_videos` and `artifacts` (the export artifact),
  captures `final_video_sha256`/`final_video_version`/`approval_token`, carries `platform`,
  `account`, `caption`, `scheduled_at` (nullable), `timezone`, `manual_export`, `manual_live_url`
  (nullable), `manual_url_provided_at` (nullable), `export_artifact_id` (nullable), `status`
  (`publish_status`, default `APPROVED`), `created_by_user_id` and `version`. Three indexes support
  filtered listing, scheduled-time ordering and conflict detection
  (`(workspace_id, status, created_at)`, `(workspace_id, scheduled_at, id)`,
  `(workspace_id, platform, account, scheduled_at)`). The table enables RLS with a
  `calendar_posts_workspace_isolation` policy keyed on `app.current_workspace_id`; no BYPASSRLS is
  granted. The migration is additive and forward-only, and is validated by `db-validate.mjs`.

## Prisma runtime design

The U1 Prisma path reuses the established patterns rather than introducing new ones. Pure
validation runs first with no DB writes (platform/account/caption/timezone/manualExport+scheduledAt/
approval-token format/scheduledAt parse/future). The bound final video, the matching approve
decision and any schedule-conflict candidates are read with tenant-leading predicates
(`prisma.finalVideo.findFirst`, `prisma.reviewDecision.findFirst`,
`prisma.calendarPost.findMany`) outside the transaction. The manual-export `Artifact` (if any), the
`calendar_posts` row and the `calendar.post_created` audit are written under RLS in one short
`withActor` transaction. A returned `{ok:false, problem}` (never a thrown `HttpException`) lets the
transaction commit cleanly with no writes; the controller's `createResponse` re-throws any
`error instanceof HttpException` before the `RUNTIME_DB_WRITE_FAILED` sanitisation branch, so the
legitimate `409`/`422`/`403` business-rule responses surface with their own status. The export
package hash and the approval token are computed with Node `crypto.createHash("sha256")` from the
bound fields, not from `Date.now()` or `Math.random()`, so they are deterministic across replays.
The schedule conflict is app-enforced: a concurrent double-schedule for the same slot could both
pass the read and both write (a race); this is an accepted V0 trade-off documented above (no DB
exclusion constraint, deferred).

## Red evidence

Command:

```text
node --test tests\integration\calendar-u1.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.createCalendarPost is not a function
```

All seven U1 integration tests failed before `createCalendarPost` existed on the generated client
or the store/route, and before the `publish_status` enum and `calendar_posts` table existed in the
Prisma client and migration. The Prisma runtime proof additionally failed before the migration was
applied and the U1 runtime proof test was written.

## Green evidence

Command:

```text
node --test tests/integration/calendar-u1.test.mjs
```

Outcome:

```text
✔ U1 schedules an approved exact final-video version with a valid future schedule and audit
✔ U1 manual-export creates an APPROVED calendar post with a deterministic manual-export artifact and no live URL
✔ U1 rejects unapproved or superseded media with REVIEW_APPROVAL_REQUIRED or PUBLISH_MEDIA_STALE
✔ U1 rejects past or invalid schedules and respects the IST offset boundary
✔ U1 rejects a schedule conflict for the same workspace + platform + account within the conflict window
✔ U1 replays a calendar post by idempotency key and rejects a same-key different-input conflict
✔ U1 hides a cross-workspace create behind WORKSPACE_ACCESS_DENIED
tests 7
pass 7
fail 0
```

Required sprint tests and outcomes:

- Timezone boundary tests — pass. A local IST midnight `2999-01-01T00:00:00+05:30` is stored as
  `2998-12-31T18:30:00.000Z`; `2999-01-01T09:00:00+05:30` is stored as `2999-01-01T03:30:00.000Z`;
  a past schedule and a malformed/offset-less schedule return `PUBLISH_SCHEDULE_INVALID` (422).
- Superseded-media rejection — pass. A new revision supersedes the bound version; scheduling the old
  version returns `PUBLISH_MEDIA_STALE` (409) and records no post.
- Wrong-account rejection — partial. U1 enforces the tenant boundary (a cross-workspace `finalVideoId`
  is hidden behind `WORKSPACE_ACCESS_DENIED` 404 with no owning workspace id leak). The
  platform-specific account-ownership/eligibility hard-check is deferred to V0-U2 publish by owner
  decision; U1 stores the account workspace-scoped at create.
- Manual export package test — pass. A manual export produces a retained `CLEAN` manual-export
  `Artifact` whose `sha256` is the deterministic package hash; a same-key replay returns the same
  hash; the object key never reaches the browser.
- Calendar browser journey — pass. `tests/unit/calendar-workflow.test.mjs` asserts the
  `post-scheduled` and `manual-export-ready` descriptors, the bound version + golden hash + approval
  token rendering, the manual-export artifact content hash rendering, the unknown-status guard, the
  cross-workspace blocked-hidden banner, and that the FORBIDDEN regex and the export object key
  prefix never appear in the markup.
- Unapproved/superseded media — pass. A wrong approval token returns `REVIEW_APPROVAL_REQUIRED`
  (409); a superseded bound version returns `PUBLISH_MEDIA_STALE` (409).
- Schedule conflict — pass. A second scheduled post for the same workspace + platform + account
  within the window returns `PUBLISH_SCHEDULE_INVALID` (422); a different account at the same time
  is accepted.
- Replay idempotency/conflict — pass. A same-key replay returns the same post; a same-key +
  different-input attempt returns `IDEMPOTENCY_INPUT_CONFLICT` (409).
- Cross-workspace hiding — pass. A different workspace cannot schedule another workspace's approved
  final video; it returns `WORKSPACE_ACCESS_DENIED` (404) with no owning workspace id leak.

Unit test commands and outcomes:

```text
node --test tests/unit/calendar-workflow.test.mjs
tests 9
pass 9
fail 0
```

The workflow unit suite asserts the publish status mapping (nine statuses, `unknown` preserved),
every calendar error mapped to a calm banner state, the `post-scheduled` and `manual-export-ready`
descriptors, each error banner from a problem code, the rendered scheduled post / golden hash /
approval token, the rendered manual-export artifact content hash (with the object key prefix never
appearing), the unknown-status guard, and the cross-workspace blocked-hidden banner. The FORBIDDEN
regex never matches the markup.

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 315
pass 295
fail 0
skipped 20

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 20
pass 20
fail 0
  ✔ prisma runtime persists V0-U1 approved calendar and manual export fallback under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../C2/R1/R2/U1 identity, ... approved calendar posts bound to
one approved exact final-video version with scheduled or manual-export fallback and a retained
manual-export artifact, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2/U1 local verification passed.
```

The 20 skipped tests in the broad glob are the prisma-runtime proof tests intentionally skipped
there and run by the dedicated verification step immediately after, including the V0-U1 runtime
proof against Supabase. All nine verification phases ran green: generate-contracts, db-generate,
db-migrate-dev, check-format, lint, typecheck, the broad test glob, the prisma-runtime proof and
db-validate.

## Migration evidence

`node packages/db/scripts/db-migrate-dev.mjs` applied the new migration:

```text
CREATE TYPE
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
V0-F1/.../C2/R1/R2/U1 migrations applied.
```

The migration creates the `publish_status` enum (nine values, including `APPROVED`) and the
`calendar_posts` table (workspace, platform, account, caption, final video, final-video
sha256/version, approval token, scheduled_at, timezone, manual_export, manual_live_url,
manual_url_provided_at, export_artifact_id, status, created_by_user_id, version, timestamps). The
table enables RLS with a `calendar_posts_workspace_isolation` policy keyed on
`app.current_workspace_id`. No BYPASSRLS is granted.

The runtime-proof test confirms persistence under RLS:

```text
SELECT status::text || ':' || final_video_version::text || ':' || final_video_sha256 || ':' ||
       approval_token || ':' || coalesce(manual_live_url,'null') || ':' || coalesce(export_artifact_id::text,'null')
FROM calendar_posts WHERE id = '<scheduled>' AND workspace_id = '<ws>' AND created_by_user_id = '<user>'
-- result: SCHEDULED:1:<sha>:<token>:null:null

SELECT scheduled_at::text FROM calendar_posts WHERE id = '<scheduled>'
-- result: 2999-01-01 03:30:00...   (IST offset respected)

SELECT count(*)::text FROM audit_events WHERE workspace_id = '<ws>' AND event_type = 'calendar.post_created'
  AND target_type = 'CalendarPost' AND target_id = '<scheduled>' AND reason = 'scheduled'
-- result: 1

SELECT status::text || ':' || coalesce(scheduled_at::text,'null') || ':' || coalesce(manual_live_url,'null')
       || ':' || coalesce(export_artifact_id::text,'null')
FROM calendar_posts WHERE id = '<manual>' AND workspace_id = '<ws>'
-- result: APPROVED:null:null:<artifactId>

SELECT sha256 || ':' || retention_class || ':' || schema_version || ':' || status::text
FROM artifacts WHERE id = '<artifactId>' AND workspace_id = '<ws>'
-- result: <packageHash>:manual-export:calendar.manual_export.v1:CLEAN

SELECT count(*)::text FROM calendar_posts WHERE workspace_id = '<ws>' AND platform = 'meta' AND account = 'sunrise-estates'
-- result: 1   (idempotency conflict writes no second post)

SELECT count(*)::text FROM calendar_posts WHERE workspace_id = '<ws>' AND platform = 'meta' AND account = 'sunrise-estates-stale'
-- result: 0   (stale scheduling writes no post)
```

The runtime proof also confirms a cross-workspace create returns `WORKSPACE_ACCESS_DENIED` (404)
with no owning workspace id leak, that the manual-export artifact sha256 equals the deterministic
package hash computed in the test, and that the `calendar.post_created` audit is retained once for
both `scheduled` and `manual_export` reasons. Signed URLs, object keys, the export artifact object
key, raw provider payloads and secrets never appear in any response; the final-video sha256 is
surfaced as the bound golden render hash, the approval token is a public deterministic reference and
the export artifact sha256 is a public content hash.

## Downstream contract reference

`docs/V0/V0_API.md` (the `POST /calendar-posts` route with the Owner/Admin/Client Manager
annotation and the Approved Calendar prose; the `/calendar-posts/{id}/publish` and
`/calendar-posts/{id}/verify` routes remain forward-looking placeholders for V0-U2/U3 and are not
claimed as implemented), `docs/V0/V0_DATA_MODELS.md` (the `CalendarPost` model), `docs/V0/V0_PRISMA_SCHEMA.md`
(the `PublishStatus` enum with `APPROVED` and the `CalendarPost` model in the review/publishing
inventory), `docs/V0/V0_STATUS_ENUMS.md` (the calendar status transitions `scheduled` for a scheduled
post and `approved` for a manual-export post, with `manualLiveUrl` null until verification),
`docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md` (the new-schedule screen with the `post-scheduled`/
`manual-export-ready`/`approval-required`/`media-stale`/`schedule-invalid`/`blocked-hidden`/
`missing-idempotency`/`idempotency-conflict`/`post-invalid`/`unknown` states), `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
(the `calendar_post_created` event with the `calendar.post_created` audit row as record of truth),
`docs/V0/V0_ERROR_CATALOG.md` (`REVIEW_APPROVAL_REQUIRED` 409, `PUBLISH_SCHEDULE_INVALID` 422,
`PUBLISH_MEDIA_STALE` 409) and `docs/V0/V0_PERMISSIONS.md` (`schedule_publish_approved_media` for
Owner/Admin/Client Manager, Reviewer denied) record the V0-U1 contract. U1 reuses the existing
`WORKSPACE_ACCESS_DENIED`, `PERMISSION_DENIED`, `IDEMPOTENCY_KEY_REQUIRED`,
`IDEMPOTENCY_INPUT_CONFLICT` and `VALIDATION_FAILED` error codes and introduces no new configuration
(it reuses `SUPABASE_JWT_SECRET`, `V0_INTERNAL_WORKER_TOKEN`, `V0_HEYGEN_SIMULATOR_SECRET` and
`V0_C2_SIMULATOR_MODE`). The generated OpenAPI document and generated `v0-client.mjs` carry the
calendar-posts endpoint.

## Browser state evidence

The web shell renders the calendar contract at `/calendar/new` with the `create-loading`,
`post-scheduled`, `manual-export-ready`, `approval-required`, `media-stale`, `schedule-invalid`,
`blocked-hidden`, `missing-idempotency`, `idempotency-conflict`, `post-invalid`, `unknown` and
`error` states. The `calendar-workflow` unit suite asserts the rendered scheduled-post copy (status,
platform, account, bound version, golden hash, approval token, scheduled time + timezone, manual
live URL "Not provided yet"), the manual-export copy (export package, content hash, no object key
prefix), the publish status mapping (`unknown` preserved as a real state), the calm error banners
for every calendar guard code, and that no secret, signature, signed URL, external URL or export
object key appears in the markup. No live browser screenshot is captured in local verification; the
deterministic state functions and `calendarMarkup` renderer are the browser-state evidence.

## Scope note

This is local deterministic simulator evidence for V0-U1. It does not claim production scheduling
readiness, real publication handoff or full V0 acceptance. Scheduling does not imply publication;
real publication handoff is V0-U2 and later, and audience verification is V0-U3 and later. The
permission matrix is unit-asserted for the Reviewer-deny path because the integration harness only
creates OWNER memberships. The "wrong account" platform-specific hard-check is deferred to V0-U2
publish by owner decision; U1 stores the account workspace-scoped at create and only enforces the
tenant boundary. The schedule conflict is app-enforced with a 60-second window and no database
exclusion constraint (deferred); a concurrent double-schedule for the same slot is an accepted V0
race. The "edit CalendarPost" backlog item is reconciled as idempotent create, not a dedicated edit
route. The manual live URL is left null at create and is supplied later by the verification path.
The Prisma concurrency design is minimal: the runtime proof covers sequential schedule, manual
export, replay, idempotency conflict, schedule conflict, supersede-stale and cross-workspace
hiding; a full multi-process concurrency proof for the rare same-slot race is deferred. No credit is
captured, released or moved by a calendar create (it is not a paid mutation). New revisions never
rewrite historical calendar posts or lineage records. The 60-second conflict window, the IANA
`timezone` display-only convention and the `manualLiveUrl` null-at-create convention are flagged for
owner confirmation.
