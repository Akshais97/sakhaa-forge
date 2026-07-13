# V0-U1 Edit Route And DB-Backed Schedule Conflict Fix Local Verification — 2026-06-29

## Slice

V0-U1 fix (senior sprint review): Approved Calendar And Manual Export Fallback — add the missing
`CalendarPost` edit route and make the 60-second schedule-conflict check database-backed. The two
critical "NEEDS FIXES BEFORE MERGE" issues in `docs/Project/Sprint_Reviews/V0-U1_review.md` are
addressed.

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
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/Project/Sprint_Reviews/V0-U1_review.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- `PATCH /calendar-posts/{id}` edits an existing calendar post before it is submitted. Only Owner,
  Admin or Client Manager (`schedule_publish_approved_media`, the same capability that owns create)
  may edit; a Reviewer is denied by the shared `assertWorkspacePermission` guard
  (`PERMISSION_DENIED` 403). The body carries the integer `expectedVersion` (optimistic concurrency
  against `CalendarPost.version`) and an optional patch of `caption`, `platform`, `account`,
  `timezone`, `manualExport` and, for a scheduled post, `scheduledAt`; omitted fields keep their
  current value. The response is `202 Accepted`.
- Edit idempotency is key-bound through `store.runIdempotent({operation: "calendar.post.update", ...})`
  exactly as create: the same `Idempotency-Key` with the same input replays the same edit result,
  and with different input returns `IDEMPOTENCY_INPUT_CONFLICT` (409). A missing `Idempotency-Key`
  returns `IDEMPOTENCY_KEY_REQUIRED` (400). A rejected path (HttpException) stores no idempotency
  record, so a later same-key attempt is not a false replay.
- An edit is only allowed on an editable pre-publish post (status `scheduled` or `approved`). A post
  that already has a `PublishOperation`, a supplied `manualLiveUrl`, or a terminal/processing
  status is locked and returns `PUBLISH_POST_LOCKED` (409). A stale `expectedVersion` returns
  `RESOURCE_VERSION_STALE` (409) (the existing code is reused; no new stale code was added). The
  bound final video is immutable on edit but is re-checked for `current`; a superseded version
  returns `PUBLISH_MEDIA_STALE` (409). The merged full state is validated with the same rules as
  create, so an invalid `scheduledAt`, a `scheduledAt` supplied on a manual export, or an
  over-length field returns `PUBLISH_SCHEDULE_INVALID` (422) or `VALIDATION_FAILED` (422).
- On success the post's `version` is incremented, `status` is recomputed (`APPROVED` for a manual
  export, else `SCHEDULED`), a manual-export post regenerates the retained manual-export `Artifact`
  with a versioned file name and object key (the prior row is retained as evidence), and a switch
  back to scheduled clears `exportArtifactId`. A `calendar.post_updated` audit is retained (target
  type `CalendarPost`, reason a comma-joined list of changed fields or `no_change`). The response
  carries the updated `calendarPost`, the `exportArtifact` (manual export only, omitting the object
  key) and the audit. Cross-workspace edits hide behind `WORKSPACE_ACCESS_DENIED` (404).
- The 60-second schedule-conflict window is now database-protected. Both create and edit run inside
  a PostgreSQL `withActor` transaction that first acquires a transaction-scoped
  `pg_advisory_xact_lock(hashtext('{workspaceId}:{platform}:{account}'))` before the candidate read,
  so concurrent creates/edits for the same account serialise and the 60-second window check is
  authoritative under concurrency. The lock is transaction-scoped (released on commit or rollback),
  is never persisted, and adds no schema object; `hashtext` collisions only cause harmless false
  serialisation (a real conflict always shares the key). The edit path additionally acquires a
  post-scoped `pg_advisory_xact_lock(hashtext(postId))` so the `expectedVersion` check cannot race a
  concurrent edit; the authoritative version check runs inside the transaction under that lock.
- The advisory lock is acquired via the parameterised Prisma tagged template
  `tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtext(${key}))\`` (a bind parameter, not
  string-built SQL), so it satisfies the raw-SQL allowlist and the lint rule that forbids
  `$queryRawUnsafe`/string-built SQL.
- The web shell implements the edit workflow at `apps/web/src/calendar-workflow.mjs`.
  `classifyCalendarError` maps `RESOURCE_VERSION_STALE` to `version-stale` and `PUBLISH_POST_LOCKED`
  to `post-locked`; `deriveCalendarState` adds the `edit-loading` and `edit-ready` phases (the
  `edit-ready` phase shows the `edit-saved` banner and the bumped `version`); `calendarMarkup`
  renders the new banners. The bound final-video sha256 and the approval token remain public
  references; signed URLs, object keys, producer secrets and raw provider payloads never appear in
  the rendered markup.

## Prisma runtime design

The edit reuses the existing `CalendarPost.version` column (Int @default(1)), so no migration was
required. The Prisma `updateCalendarPost` runs entirely inside `withActor` (RLS transaction): it
acquires the post-scoped advisory lock, re-reads the post, then runs the lock-state, version,
stale-media, merge and conflict guards, then `tx.calendarPost.update` (incrementing `version`),
`tx.artifact.create` for a manual export, and `tx.auditEvent.create`. Rejected paths return
`{ok:false, problem}` from inside the transaction, so the transaction commits cleanly with no writes
and `runIdempotent` stores no idempotency record. The create path moved its candidate read from
outside the transaction to inside `withActor` under the same account-scoped advisory lock. A Prisma
gotcha surfaced and was fixed: `post.scheduledAt` is a Prisma `Date`, not an ISO string, so when the
client does not supply a new `scheduledAt` the stored instant is reused directly (with a future
re-check) rather than fed back through the ISO-string `parseScheduledAt`; only a client-supplied
`scheduledAt` string is parsed.

## Red evidence

Command:

```text
node --test tests\integration\calendar-u1.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.updateCalendarPost is not a function
```

All nine new edit integration tests failed before `updateCalendarPost` existed on the generated
client, the store, the controller or the route. The new `version-stale`/`post-locked`/`edit-loading`/
`edit-saved` web-workflow states failed before `classifyCalendarError` and `deriveCalendarState`
were extended. The Prisma runtime edit + concurrent-conflict proof failed before the Prisma
`updateCalendarPost` and the advisory lock were added (a caption-only edit returned
`PUBLISH_SCHEDULE_INVALID` "Scheduled time must be an ISO-8601 instant with a UTC offset." because
the stored `Date` was fed back through the ISO-string parser).

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
✔ U1 edits a calendar post caption before submission with an optimistic version bump and audit
✔ U1 rejects an edit with a stale expected version
✔ U1 rejects an edit when the bound media has been superseded
✔ U1 detects a schedule conflict after editing the schedule into an occupied window
✔ U1 blocks an edit after a publish operation exists
✔ U1 edits a scheduled post into a manual export with a retained manual-export artifact
✔ U1 replays an edit by idempotency key and rejects a same-key different-input conflict
✔ U1 hides a cross-workspace edit behind WORKSPACE_ACCESS_DENIED
✔ U1 concurrent creates for the same account and window create exactly one post
tests 16
pass 16
fail 0
```

Required review-fix tests and outcomes:

- Missing edit route — pass. `PATCH /calendar-posts/{id}` edits an editable post, bumps `version`,
  recomputes `status` and retains a `calendar.post_updated` audit.
- Optimistic concurrency — pass. A stale `expectedVersion` returns `RESOURCE_VERSION_STALE` (409)
  with no second version bump.
- Locked post — pass. A post with an existing `PublishOperation` returns `PUBLISH_POST_LOCKED` (409).
- Schedule-conflict detection after edit — pass. Editing the schedule into an occupied 60-second
  window returns `PUBLISH_SCHEDULE_INVALID` (422).
- DB-backed conflict protection — pass. Six concurrent creates for the same fresh account and
  60-second window (distinct idempotency keys) persist exactly one post; the rest return
  `PUBLISH_SCHEDULE_INVALID` (422); the DB row count for that account is one.
- Manual-export edit — pass. Editing a scheduled post into a manual export regenerates the retained
  manual-export artifact with a versioned file name and object key.
- Edit idempotency — pass. A same-key replay returns the same edit; a same-key+different-input
  attempt returns `IDEMPOTENCY_INPUT_CONFLICT` (409).
- Cross-workspace hiding — pass. A different workspace cannot edit another workspace's post; it
  returns `WORKSPACE_ACCESS_DENIED` (404) with no owning workspace id leak.

Unit test commands and outcomes:

```text
node --test tests/unit/calendar-workflow.test.mjs
tests 12
pass 12
fail 0
```

The workflow unit suite asserts the new error mappings (`RESOURCE_VERSION_STALE` → `version-stale`,
`PUBLISH_POST_LOCKED` → `post-locked`), the `edit-loading` and `edit-ready`/`edit-saved` phases, the
bumped `version` in the descriptor, and that the `version-stale`/`post-locked` markup never leaks
secrets, signatures, URLs or object keys (FORBIDDEN regex).

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 366
pass 344
fail 0
skipped 22

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 22
pass 22
fail 0
  ✔ prisma runtime persists V0-U1 approved calendar and manual export fallback under RLS
    (edit DB proof + concurrent conflict DB proof)

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../U1/U2/U3 identity, ... approved calendar posts bound to one
approved exact final-video version with scheduled or manual-export fallback and a retained
manual-export artifact ... and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2/U1/U2/U3 local verification passed.
```

The 22 skipped tests in the broad glob are the prisma-runtime proof tests intentionally skipped there
and run by the dedicated verification step immediately after. All nine verification phases ran green:
generate-contracts, db-generate, db-migrate-dev, check-format, lint, typecheck, the broad test glob,
the prisma-runtime proof and db-validate.

## Migration evidence

No migration was required. The edit route reuses the existing `CalendarPost.version` column
(Int @default(1)) added by `0029_v0_u1_approved_calendar_and_manual_export_fallback`; the
schedule-conflict protection is a runtime transaction-scoped `pg_advisory_xact_lock` that adds no
schema object and is never persisted. `db-migrate-dev` and `db-validate` ran green with no new
migration. The `db-validate` and `verify-script` scopes were unchanged (no new migration, no new
configuration), so `tests/unit/verify-script.test.mjs` required no change.

The runtime-proof test confirms persistence under RLS:

```text
-- edit bumps version and updates the row under RLS
SELECT version::text || ':' || caption || ':' || status::text FROM calendar_posts
 WHERE id = '<post>' AND workspace_id = '<ws>'
-- result: 2:Edited launch caption.:SCHEDULED

-- calendar.post_updated audit retained once
SELECT count(*)::text FROM audit_events WHERE workspace_id = '<ws>' AND actor_user_id = '<user>'
 AND event_type = 'calendar.post_updated' AND target_type = 'CalendarPost' AND target_id = '<post>'
-- result: 1

-- a stale-version edit writes no further version bump
SELECT version::text FROM calendar_posts WHERE id = '<post>'
-- result: 2

-- six concurrent creates for the same account and 60-second window persist exactly one post
SELECT count(*)::text FROM calendar_posts WHERE workspace_id = '<ws>'
 AND platform = 'meta' AND account = 'sunrise-estates-concurrent'
-- result: 1
```

The runtime proof also confirms a cross-workspace edit returns `WORKSPACE_ACCESS_DENIED` (404) with
no owning workspace id leak. Signed URLs, object keys, the created-by user id, raw provider payloads
and secrets never appear in any response; the bound final-video sha256 is a public content fingerprint
and the approval token is a public deterministic reference.

## Downstream contract reference

`docs/V0/V0_API.md` (the `PATCH /calendar-posts/{id}` route table entry and the edit prose; the
create prose updated to describe the advisory-lock conflict protection), `docs/V0/V0_DATA_MODELS.md`
(the `CalendarPost.version` optimistic-concurrency + lock note), `docs/V0/V0_PRISMA_SCHEMA.md` (the
`CalendarPost` edit note: `version` backs optimistic concurrency, the advisory lock is
runtime-only, no migration), `docs/V0/V0_STATUS_ENUMS.md` (the edit/version/lock note in the Calendar
and Publishing section), `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md` (the `edit-loading`/`edit-saved`/
`version-stale`/`post-locked` states on the New schedule and Post detail screens),
`docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md` (the `calendar_post_updated` event and the
`calendar.post_updated` audit row as record of truth), `docs/V0/V0_ERROR_CATALOG.md`
(`PUBLISH_POST_LOCKED` 409 added; `RESOURCE_VERSION_STALE` reused) record the V0-U1 fix contract. The
fix reuses the existing `WORKSPACE_ACCESS_DENIED`, `PERMISSION_DENIED`, `IDEMPOTENCY_KEY_REQUIRED`,
`IDEMPOTENCY_INPUT_CONFLICT`, `VALIDATION_FAILED`, `PUBLISH_SCHEDULE_INVALID`, `PUBLISH_MEDIA_STALE`,
`REVIEW_APPROVAL_REQUIRED` and `RESOURCE_VERSION_STALE` error codes and introduces exactly one new
code (`PUBLISH_POST_LOCKED`), no new configuration and no new migration. The generated OpenAPI
document and generated `v0-client.mjs` carry the `updateCalendarPost` endpoint (`#patch` helper).

## Browser state evidence

The web shell renders the edit contract on the calendar screens with the `edit-loading`,
`edit-saved`, `version-stale`, `post-locked` states in addition to the existing create states. The
`calendar-workflow` unit suite asserts the new error mappings, the edit phases, the bumped `version`
in the descriptor, and that no secret, signature, signed URL, object key or external URL appears in
the `version-stale`/`post-locked` markup (FORBIDDEN regex). No live browser screenshot is captured in
local verification; the deterministic state functions and `calendarMarkup` renderer are the
browser-state evidence.

## Scope note

This is local deterministic simulator evidence for the V0-U1 senior-sprint-review fix. It does not
claim production readiness or full V0 acceptance. The schedule-conflict advisory lock serialises
concurrent creates/edits for the same `(workspace, platform, account)`; the runtime proof covers six
concurrent creates, a sequential edit, and a concurrent-edit race proof. A multi-process concurrency
proof across separate API processes (which would share the same PostgreSQL advisory-lock namespace)
is structurally equivalent but not separately executed here.

## Senior-sprint-review follow-up (2026-06-30)

The senior-engineer sprint review returned PASS but flagged one non-blocking coverage gap: no test
proved two simultaneous edits with the same `expectedVersion` produce exactly one success and one
`RESOURCE_VERSION_STALE`. A focused Prisma runtime test was added
(`prisma runtime serializes two concurrent V0-U1 edits to one post into one success and one
RESOURCE_VERSION_STALE under RLS`) that fires two `Promise.all` `PATCH /calendar-posts/{id}` calls
with the same `expectedVersion: 1` and distinct idempotency keys against one scheduled post. The
post-scoped `pg_advisory_xact_lock(hashtext(calendarPostId))` (acquired inside the RLS transaction
before the authoritative version re-read at `workspace-store.mjs:12997`) serialises the edits: the
first commit increments `version` to 2 and retains one `calendar.post_updated` audit row; the second
re-reads under the lock, sees `version: 2` vs `expectedVersion: 1` and returns `RESOURCE_VERSION_STALE`
(409) with no second audit row. The winner is nondeterministic, so the DB-caption assertion is made
against whichever edit actually succeeded. A first run failed only on an over-broad `https://` leak
scan that matched the RFC 9457 problem-detail `type` URI
(`https://errors.sakhaa-forge.invalid/v0/RESOURCE_VERSION_STALE`, a public contract namespace, not a
leak); the scan was narrowed to the success body for `https://` and to a secret/signed-URL/object-key
regex for both bodies. Targeted reruns: U1 integration 16/16, calendar-workflow unit 12/12, targeted
U1 Prisma proof 2/2, full `node scripts/verify.mjs` green (prisma-runtime 27/27, broad glob
418/391/0 fail/27 skipped, db-validate green). The second non-blocking review item (full Prisma
runtime file timing out when run as one batch in the reviewer's environment) is environmental, not a
U1 defect; the suite completes in one batch under `node scripts/verify.mjs`. Publishing is not a V0 credit op; an edit moves no credit. The
non-blocking review items (IANA timezone validation strictness, platform/account ownership checks,
manual-export byte size) are deferred as documented in the review and are not addressed by this fix.
No commit was made; the change is implemented, verified green and documented, and left for the
project owner to commit.
