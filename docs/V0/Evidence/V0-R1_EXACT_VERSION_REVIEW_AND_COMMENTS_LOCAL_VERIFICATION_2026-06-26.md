# V0-R1 Exact-Version Review And Comments Local Verification — 2026-06-26

## Slice

V0-R1: Exact-Version Review And Comments.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/Sprints/V0-R1_EXACT_VERSION_REVIEW_AND_COMMENTS_SPRINT.md`
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

## Behaviour verified

- `POST /review-items` opens a `ReviewItem` bound to one exact `FinalVideo` version. The store
  loads the final video by `id + workspaceId`; a missing or cross-workspace final video is hidden
  behind `WORKSPACE_ACCESS_DENIED` (404) before any review state is observable. The bound final
  video must be `current`; an already-superseded final video returns `REVIEW_VERSION_STALE` (409)
  and opens no review item. The review stage is `internal_review` or `client_review`
  (`normalizeReviewStage` rejects anything else with `VALIDATION_FAILED` 422) and becomes the
  initial review item status. The captured `finalVideoSha256`, `finalVideoVersion` and
  `compositionInstructionId` are bound in-row at open time. The response carries the review item
  (id, status, review stage, final video id/sha256/version, composition instruction id,
  created-by user id) and the `review.created` audit (target type `ReviewItem`). An
  `Idempotency-Key` is required; a missing key returns `IDEMPOTENCY_KEY_REQUIRED` (400). Only
  Owner, Admin or Client Manager (`select_blueprint_and_run_scripts`) may open a review item; a
  Reviewer is denied by the shared `assertWorkspacePermission` guard (`PERMISSION_DENIED` 403).
  The response is `202 Accepted`.
- One review item exists per workspace + final video. The create is resource-bound
  find-or-create: a second open for the same exact final-video version with a fresh
  `Idempotency-Key` replays the same review item and the retained `review.created` audit rather
  than creating a second item. In the Prisma store the partial unique index
  `review_items_one_per_final_video_idx` turns a concurrent second open into a `P2002` conflict
  normalised into a replay (the existing item and its `review.created` audit are re-fetched),
  never a raw `500` and never a second review item.
- `POST /review-items/{id}/comments` adds a timestamped append-only comment (body 1–2000
  characters, `timestampMs` ≥ 0; `VALIDATION_FAILED` 422 otherwise). Comment idempotency is
  key-bound through `store.runIdempotent({operation: "review.comment.add", ...})`: the same
  `Idempotency-Key` with the same input replays the same comment and notification, and with
  different input returns `IDEMPOTENCY_INPUT_CONFLICT` (409). Only Owner, Admin, Client Manager or
  Reviewer (`submit_review_comments`) may comment. The response carries the comment (author user
  id, body, timestamp ms, thread id), the review item, the notification (id, notification type,
  channel, status, `duplicateCollapsed`) and the `review.comment_added` audit (target type
  `ReviewItem`).
- A comment against a review item whose bound final video is no longer `current` (superseded)
  returns `REVIEW_VERSION_STALE` (409), archives the review item idempotently, and preserves prior
  comments; the rejected comment is not appended. A second open for an already-superseded final
  video is also `REVIEW_VERSION_STALE`. Archiving is the only status mutation on a review item and
  it is irreversible for that bound version; the prior comments remain readable on the archived
  item. New revisions never rewrite historical review or lineage records.
- Repeated comment activity on one review item collapses to one logical `Notification`, unique by
  workspace + payload hash (`sha256(stableJson({workspaceId, reviewItemId, notificationType,
  recipientUserId}))`). The first comment creates the notification (`duplicateCollapsed` false,
  status `sent`); any subsequent comment collapses to the same notification (`duplicateCollapsed`
  true, same notification id) with no second notification row. A key-bound idempotent replay
  returns the same comment id and the same notification id and does not re-send or re-collapse.
  The notification recipient is the review item opener (`createdByUserId`).
- `GET /review-items/{id}` returns the review item, a preview of the bound final video and its
  CLEAN artifacts (final-video, thumbnail, captions as public artifacts via `publicArtifact`), and
  the preserved comments in creation order. `GET /review-items` lists review items for a workspace
  newest first with cursor pagination (`normalizeLimit` default 20, clamp 1–50). `GET
  /review-items/{id}/comments` lists the append-only comments in creation order with cursor
  pagination. The first two require `submit_review_comments`; `GET /review-items` requires
  `select_blueprint_and_run_scripts`.
- The web shell implements the review workflow at `apps/web/src/review-workflow.mjs` with pure,
  DOM-agnostic state functions unit tested in Node and a `reviewMarkup` renderer. The workflow is
  never optimistic: it shows loading, calls the API with an `Idempotency-Key`, and renders the
  committed review item, comments and the collapsed-notification state or a calm error.
  `reviewItemState` maps the six review item statuses and preserves `unknown`.
  `classifyReviewError` maps each review/access error to a stable banner state (`blocked-hidden`
  `WORKSPACE_ACCESS_DENIED`, `forbidden` `PERMISSION_DENIED`, `missing-idempotency`
  `IDEMPOTENCY_KEY_REQUIRED`, `stale-superseded` `REVIEW_VERSION_STALE`, `idempotency-conflict`
  `IDEMPOTENCY_INPUT_CONFLICT`, `comment-invalid` `VALIDATION_FAILED`). `deriveReviewState`
  produces the banner, review-item summary, comments and notification descriptor. The rendered
  markup carries only the review status, review stage, the bound final-video version, the golden
  render hash, the comment bodies with `@{timestampMs}ms` and the collapsed-notification state. The
  unit suite asserts the FORBIDDEN regex never matches the markup and that the recipient user id
  and notification id are never rendered.
- Signed URLs, object keys, recipient user ids, notification payload hashes, raw provider
  payloads and secrets never appear in any review response, audit row, analytics event or
  rendered markup. The final-video sha256 is a public content fingerprint and is surfaced as the
  bound golden render hash. Cross-workspace and missing workspaces hide behind
  `WORKSPACE_ACCESS_DENIED` (404) and never leak the owning workspace id; a cross-workspace open,
  comment and fetch all return the same 404.
- Prisma schema and migration `0027_v0_r1_exact_version_review_and_comments` add the
  `review_stage` enum (`INTERNAL_REVIEW`/`CLIENT_REVIEW`), `review_item_status` enum
  (`INTERNAL_REVIEW`/`CLIENT_REVIEW`/`CHANGE_REQUESTED`/`APPROVED`/`REJECTED`/`ARCHIVED`) and
  `notification_status` enum (`PENDING`/`SENT`/`FAILED`), and the `review_items`,
  `review_comments` and `notifications` tables. `review_items` has FKs to `workspaces`,
  `composition_instructions`, `final_videos` and captures `final_video_sha256`/`final_video_version`;
  a unique index `review_items_one_per_final_video_idx` enforces one review item per exact
  final-video version. `review_comments` is append-only (no update/delete path in the store) with
  a workspace-item-created index. `notifications` has a unique index
  `notifications_one_logical_per_payload_idx` on `(workspace_id, payload_hash)` enforcing one logical
  notification per deduplicated payload. All three tables enable RLS with
  `*_workspace_isolation` policies keyed on `app.current_workspace_id`; no BYPASSRLS is granted.
  The migration is additive and forward-only, and is validated by `db-validate.mjs`.

## Prisma runtime fixes

Three defects in the R1 Prisma path were found by the runtime proof and fixed before green. They
are recorded here because they are non-obvious and contract-relevant.

1. **Notification dedupe inside an interactive transaction.** The first implementation caught the
   notification `P2002` (unique on `workspace_id, payload_hash`) and re-fetched the existing
   notification inside the same `withActor` transaction. In PostgreSQL a unique-constraint violation
   aborts the whole interactive transaction (`25P02 current transaction is aborted, commands
   ignored until end of transaction block`), so the in-transaction `findFirst` and the subsequent
   audit create failed, surfacing as a raw `500`. Fixed by adopting the codebase's pre-find pattern
   (used for `inbox_events` in V0-G2/V0-G4): `tx.notification.findFirst({ where: { workspaceId,
   payloadHash } })` first; if found, `duplicateCollapsed = true` and reuse it; otherwise `create`.
   No `P2002` is raised inside the transaction, so the transaction never aborts and the
   `review.comment_added` audit commits. The `runIdempotent` layer handles same-key replays; the
   unique index is the database-side guard for the rare concurrent different-key race.
2. **Archive update under RLS.** The superseded-version archive update was a top-level
   `prisma.reviewItem.update`, which runs with no `app.current_workspace_id` RLS context, so RLS
   hid the row and the update affected zero rows (`P2025`), surfacing as a `500`. Fixed by running
   the archive update inside a `withActor` transaction so it persists under RLS. The update is
   idempotent (a retry re-archives) and runs outside `runIdempotent` (the `409` problem is not
   stored), so the idempotency record is never set for the stale path and a retry re-evaluates the
   now-archived version honestly.
3. **Business-rule HttpException escaping the controller.** The `addReviewComment` controller wraps
   `store.runIdempotent` in a try/catch that sanitises unexpected DB errors into
   `RUNTIME_DB_WRITE_FAILED`. The `createResponse` callback throws a business-rule
   `HttpException` (e.g. `REVIEW_VERSION_STALE` 409, `VALIDATION_FAILED` 422) for rejection cases.
   With `V0_EXPOSE_TEST_ERRORS=1` (set in the runtime proof), the broad catch was converting that
   legitimate `409`/`422` into a `500`. Fixed by re-throwing any `error instanceof HttpException`
   unchanged before the sanitisation branch, so business-rule responses surface with their own
   status. Only genuine non-HttpException DB errors are sanitised. (The in-memory tests did not
   surface this because their env does not set `V0_EXPOSE_TEST_ERRORS`.)

## Red evidence

Command:

```text
node --test tests\integration\review-r1.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.createReviewItem is not a function
```

All five R1 integration tests failed before `createReviewItem`, `addReviewComment`,
`getReviewItem`, `listReviewItems` and `listReviewComments` existed on the generated client or the
store/routes, and before the `review_stage`, `review_item_status` and `notification_status` enums
existed in the Prisma client and migration. The Prisma runtime proof additionally failed with
`500 !== 202` (notification `25P02`) and `500 !== 409` (archive `P2025` and the swallowed
`HttpException`) before the three Prisma fixes above.

## Green evidence

Command:

```text
node --test tests/integration/review-r1.test.mjs
```

Outcome:

```text
✔ R1 opens a review item bound to the exact final-video version and accepts a timestamped comment
✔ R1 rejects a comment against a superseded final-video version with REVIEW_VERSION_STALE and archives the review item
✔ R1 collapses duplicate comment notifications to one logical notification
✔ R1 hides a cross-workspace review item and comment behind WORKSPACE_ACCESS_DENIED
✔ R1 lists review items role-filtered by status with cursor pagination
tests 5
pass 5
fail 0
```

Required sprint tests and outcomes:

- Review item open + timestamped comment — pass. A production role opens a review item bound to
  the exact final-video version (sha256/version captured); a second open with a fresh key replays
  the same item; a timestamped comment is retained with a `review.comment_added` audit and a
  `sent` notification (`duplicateCollapsed` false); no URL, secret, signature, payload hash or
  object key leaks.
- Cross-version rejection + archive — pass. A comment against a superseded bound version returns
  `REVIEW_VERSION_STALE` (409); the review item is archived; prior comments are preserved; the
  rejected comment is not appended; a second open for the already-superseded final video is also
  `REVIEW_VERSION_STALE`.
- Duplicate notification collapse — pass. A second distinct comment on the same review item
  collapses to the same logical notification (`duplicateCollapsed` true, same notification id),
  no second notification row is created, and a same-key replay returns the same comment and
  notification ids.
- Cross-workspace hiding — pass. A different workspace cannot open a review item for another
  workspace's final video, comment on another workspace's review item, or fetch it; all return
  `WORKSPACE_ACCESS_DENIED` (404) with no owning workspace id leak.
- List with pagination — pass. `GET /review-items` returns the workspace's review items newest
  first with cursor pagination.

Unit test commands and outcomes:

```text
node --test tests/unit/review-workflow.test.mjs
tests 8
pass 8
fail 0
```

The workflow unit suite asserts the review-item status mapping (six statuses, `unknown`
preserved), every review/access error mapped to a calm banner state, the open/stale/duplicate
states, the rendered review status/review stage/bound version/golden hash/comments/notification
state, and that the markup never leaks secrets, signatures, URLs, the recipient user id or the
notification id (FORBIDDEN regex).

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 287
pass 269
fail 0
skipped 18

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 18
pass 18
fail 0
  ✔ prisma runtime persists V0-R1 exact-version review item, append-only comments and collapsed notifications under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../C2/R1 identity, ... exact-version review items bound to one
final-video version with append-only timestamped comments and one-logical-notification dedupe, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1 local verification passed.
```

The 18 skipped tests in the broad glob are the prisma-runtime proof tests intentionally skipped
there and run by the dedicated verification step immediately after, including the V0-R1 runtime
proof against Supabase. All nine verification phases ran green: generate-contracts, db-generate,
db-migrate-dev, check-format, lint, typecheck, the broad test glob, the prisma-runtime proof and
db-validate.

## Migration evidence

`node packages/db/scripts/db-migrate-dev.mjs` applied the new migration:

```text
CREATE TYPE
CREATE TYPE
CREATE TYPE
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
V0-F1/.../C2/R1 migrations applied.
```

The migration creates the `review_stage`, `review_item_status` and `notification_status` enums and
the `review_items` (workspace, composition instruction, final video, final-video sha256/version,
review stage, status, created-by user, timestamps), `review_comments` (workspace, review item,
author user, body, timestamp ms, thread id, created at) and `notifications` (workspace, review
item, notification type, channel, recipient user, payload hash, status, timestamps) tables. Each
table enables RLS with a `*_workspace_isolation` policy keyed on `app.current_workspace_id`. No
BYPASSRLS is granted. `review_items_one_per_final_video_idx` enforces one review item per exact
final-video version; `notifications_one_logical_per_payload_idx` enforces one logical notification
per deduplicated payload.

The runtime-proof test confirms persistence under RLS:

```text
SELECT status::text || ':' || review_stage::text || ':' || final_video_version::text || ':' || final_video_sha256
FROM review_items WHERE id = '<item>' AND workspace_id = '<ws>' AND final_video_id = '<fv>'
  AND composition_instruction_id = '<instruction>' AND created_by_user_id = '<user>'
-- result: INTERNAL_REVIEW:INTERNAL_REVIEW:1:<golden sha256>

SELECT count(*)::text FROM review_items WHERE workspace_id = '<ws>' AND final_video_id = '<fv>'
-- result: 1

SELECT count(*)::text FROM audit_events WHERE workspace_id = '<ws>' AND event_type = 'review.created'
  AND target_type = 'ReviewItem' AND target_id = '<item>'
-- result: 1

SELECT count(*)::text FROM review_comments WHERE workspace_id = '<ws>' AND review_item_id = '<item>'
  AND author_user_id = '<user>'
-- result: 2

SELECT count(*)::text || ':' || status::text FROM notifications WHERE workspace_id = '<ws>'
  AND review_item_id = '<item>' AND notification_type = 'review_comment_added'
  AND recipient_user_id = '<user>' GROUP BY status
-- result: 1:SENT

SELECT count(*)::text FROM audit_events WHERE workspace_id = '<ws>' AND event_type = 'review.comment_added'
  AND target_type = 'ReviewItem' AND target_id = '<item>'
-- result: 2

SELECT status::text FROM review_items WHERE id = '<item>' AND workspace_id = '<ws>'
-- result: ARCHIVED   (after a supersede + stale comment)

SELECT count(*)::text FROM review_comments WHERE workspace_id = '<ws>' AND review_item_id = '<item>'
  AND body = 'Comment after supersede.'
-- result: 0   (the stale comment is not appended)
```

The runtime proof also confirms a cross-workspace open, comment and fetch all return
`WORKSPACE_ACCESS_DENIED` (404) with no owning workspace id leak. Signed URLs, object keys, the
recipient user id, the notification payload hash, raw provider payloads and secrets never appear
in any response; the final-video sha256 is surfaced as the bound golden render hash.

## Downstream contract reference

`docs/V0/V0_API.md` (the `POST /review-items`, `GET /review-items`, `GET /review-items/{id}`,
`POST /review-items/{id}/comments`, `GET /review-items/{id}/comments` routes and the Exact-Version
Review And Comments prose), `docs/V0/V0_DATA_MODELS.md` (the `ReviewItem`, `ReviewComment` and
`Notification` models), `docs/V0/V0_PRISMA_SCHEMA.md` (the review/publishing model inventory),
`docs/V0/V0_STATUS_ENUMS.md` (the review item statuses, `review_stage` and `notification_status`
enums), `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md` and `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
(the review screen with `stale/superseded` state and the notifications route),
`docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md` (the `review_opened` and `review_comment_added` events with
the `review.created`/`review.comment_added` audit rows as records of truth and the
`duplicateCollapsed` flag), `docs/V0/V0_ERROR_CATALOG.md` (`REVIEW_VERSION_STALE` 409) and
`docs/V0/V0_PERMISSIONS.md` (`submit_review_comments` for Owner/Admin/Client Manager/Reviewer and
`select_blueprint_and_run_scripts` for opening) record the V0-R1 contract. R1 reuses the existing
`WORKSPACE_ACCESS_DENIED`, `PERMISSION_DENIED`, `IDEMPOTENCY_KEY_REQUIRED`,
`IDEMPOTENCY_INPUT_CONFLICT` and `VALIDATION_FAILED` error codes and introduces no new
configuration (it reuses `SUPABASE_JWT_SECRET`, `V0_INTERNAL_WORKER_TOKEN`,
`V0_HEYGEN_SIMULATOR_SECRET` and `V0_C2_SIMULATOR_MODE`); the `NOTIFICATION_MODE` configuration in
the operations catalogue is unrelated to R1's in-app `Notification` collapse. The generated
OpenAPI document and generated `v0-client.mjs` carry the five review endpoints.

## Browser state evidence

The web shell renders the review contract at `/reviews/{reviewItemId}` with `empty`, `loading`,
`open`, `comment-loading`, `comment-added`, `stale-superseded`, `forbidden`, `blocked-hidden`,
`missing-idempotency`, `idempotency-conflict`, `comment-invalid`, `error` and `unknown` states.
The `review-workflow` unit suite asserts the rendered copy, the review-item status mapping
(`unknown` preserved as a real state), the calm error banners for every review/access guard code,
the duplicateCollapsed notification rendering, and that no secret, signature, signed URL,
recipient user id, notification id or external URL appears in the markup. No live browser
screenshot is captured in local verification; the deterministic state functions and `reviewMarkup`
renderer are the browser-state evidence.

## Scope note

This is local deterministic simulator evidence for V0-R1. It does not claim production review
readiness, real notification delivery, real email/push channels or full V0 acceptance. The
in-app `Notification` with `channel: "in_app"` and `status: "SENT"` is a deterministic local
affordance; real notification delivery is deferred. The Prisma concurrency design is minimal: the
pre-find dedupe and the `review_items_one_per_final_video_idx` / `notifications_one_logical_per_payload_idx`
unique indexes normalise concurrent opens and comments into a replay or a collapse, and the
runtime proof covers sequential collapse and cross-workspace hiding; a full multi-process
concurrency proof for the rare different-key race is deferred. Review is not approval; no
`approved`/`rejected`/`change_requested` decision is recorded by R1 (that is V0-R2). No credit is
captured, released or moved by review or comments (they are not paid mutations). New revisions
never rewrite historical review or lineage records.
