# V0-R1 Review-Create Idempotency Fix Local Verification — 2026-06-29

## Slice

V0-R1: Exact-Version Review And Comments — review-create idempotency fix raised by the senior
engineer sprint review (`docs/Project/Sprint_Reviews/V0-R1_review.md`,
"NEEDS FIXES BEFORE MERGE").

## Problem raised

`POST /review-items` required an `Idempotency-Key` but did not bind the open mutation through the
idempotency store. `apps/api/src/server.mjs` `createReviewItem` read the key, then called
`store.createReviewItem(auth.actor, input)` directly. The sibling comment and decision routes
(`addReviewComment`, `recordReviewDecision`) wrap their writes in `store.runIdempotent`; the
review open did not.

The in-memory and Prisma store implementations enforce one review item per
`workspaceId + finalVideoId` (the `review_items_one_per_final_video_idx` partial unique index in
Prisma), but that is resource-level replay, not idempotency-key replay. A client retry,
double-submit or SDK misuse that reuses one key with a different `finalVideoId` could create or
replay a different review resource. The exact-version review contract is weakened before approval
and scheduling depend on it.

## Contracts read

- `docs/Project/Sprint_Reviews/V0-R1_review.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`

## Behaviour changed

- `POST /review-items` (`createReviewItem` controller) now wraps `store.createReviewItem` in
  `store.runIdempotent({operation: "review.item.create", idempotencyKey, input})`, mirroring the
  `recordReviewDecision` (`review.decision.record`) and `addReviewComment`
  (`review.comment.add`) pattern. The idempotency input is `workspaceId` + `finalVideoId` +
  `reviewStage` (the `idempotencyKey` is the scope, not part of the hashed input, matching
  `recordReviewDecision`).
- Same `Idempotency-Key` + same input replays the same review item and `review.created` audit.
- Same `Idempotency-Key` + different input (different `finalVideoId` or `reviewStage`) returns
  `IDEMPOTENCY_INPUT_CONFLICT` (409) and opens no review item; no `review.created` audit and no
  `IdempotencyRecord` are written for the conflicting request.
- A fresh `Idempotency-Key` for the same exact final-video version still replays the one
  review item (resource-level find-or-create is preserved). The key-bound replay and the
  resource-level replay compose: a reused key with a different final video is rejected at the
  idempotency layer before `createReviewItem` runs.
- Business-rule problems still surface unchanged: `REVIEW_VERSION_STALE` (409) for an
  already-superseded final video, `WORKSPACE_ACCESS_DENIED` (404) for a missing or
  cross-workspace final video, `VALIDATION_FAILED` (422) for an invalid review stage, and
  `IDEMPOTENCY_KEY_REQUIRED` (400) for a missing key. The controller re-throws
  `HttpException` before the `V0_EXPOSE_TEST_ERRORS` sanitisation branch, so a legitimate
  business-rule 409/422/404 is never masked as `RUNTIME_DB_WRITE_FAILED` (500). No idempotency
  record is stored for a business-rule rejection, because the `createResponse` callback throws
  before `runIdempotent` records the response.

## Non-blocking review items — decision

- **`publicReviewItem` exposes `createdByUserId`.** Verified against the codebase: the R1
  public mappers already expose `authorUserId` (`publicReviewComment`) and `actorUserId`
  (`publicAudit`) as public identifiers within the owning workspace, and the R1 integration
  tests assert `comment.authorUserId` is surfaced. V0 security protects cross-tenant workspace
  existence, signed URLs, secrets, raw provider payloads, object keys and payload hashes — not
  user ids within a caller's own workspace. `createdByUserId` is consistent with the established
  R1 convention. No mapper, doc or test change made; the field remains in the public review item
  shape documented in `V0_API.md`.
- **Browser screenshot evidence.** The sprint accepts deterministic state-function and
  unit-renderer tests as browser-state evidence for this shell (as in prior sprints). No live
  browser screenshot added.

## Stale verification-script test — fixed

`tests/unit/verify-script.test.mjs` still asserted `scripts/verify.mjs` prints a verification
scope ending at `U1`, while `scripts/verify.mjs` prints `.../R1/R2/U1/U2/U3 local verification
passed` (sprints through V0-U3 are complete and locally verified). The test was updated to
expect the `U1/U2/U3` scope and to reject regression to the stale shorter scope.

## Verification

Red-before-green observed for the new behaviour:

1. Added `R1 binds POST /review-items to the idempotency key: same key + different final video
   returns IDEMPOTENCY_INPUT_CONFLICT` to `tests/integration/review-r1.test.mjs`. Before the
   fix: `202 !== 409` (a second review item was created for the conflicting final video). After
   the fix: 409 `IDEMPOTENCY_INPUT_CONFLICT`, one review item retained, and a fresh key opens B.
2. Added a Prisma runtime proof block to the R1 case in
   `tests/integration/prisma-runtime.test.mjs`: renders a second independent current final
   video B in the same workspace, opens B with A's idempotency key, asserts
   `IDEMPOTENCY_INPUT_CONFLICT` 409, no `review_items` row for B, exactly one
   `idempotency_records` row for `review.item.create` with A's key (the conflicting open stored
   none), and a fresh key for B opens a review item under RLS.

Commands run (fresh):

- `node --test tests/integration/review-r1.test.mjs` -> pass, 6 tests (5 prior + 1 new).
- `node --test tests/integration/review-r2.test.mjs tests/integration/calendar-u1.test.mjs tests/unit/review-workflow.test.mjs` -> pass, 25 tests (no regression in R2 / U1 / review-workflow unit).
- `V0_RUNTIME_DB_PROOF=1 node --test --test-name-pattern="V0-R1 exact-version review" tests/integration/prisma-runtime.test.mjs` -> pass, 1 test (R1 Prisma runtime proof incl. the new conflict block).
- `node --test tests/unit/verify-script.test.mjs` -> pass, 1 test (U1/U2/U3 scope).
- `node scripts/verify.mjs` -> green (full local verification scope F0–G5/C1/C2/R1/R2/U1/U2/U3).

## Impact

- **Contract:** `V0_API.md` `POST /review-items` prose updated to state the open is key-bound
  (input-bound) through `runIdempotent` operation `review.item.create`, with the
  `IDEMPOTENCY_INPUT_CONFLICT` (409) behaviour, while preserving the one-review-item-per-final
  -video replay for fresh keys. No new error codes (reuses `IDEMPOTENCY_INPUT_CONFLICT`,
  `IDEMPOTENCY_KEY_REQUIRED`, `REVIEW_VERSION_STALE`, `WORKSPACE_ACCESS_DENIED`,
  `VALIDATION_FAILED`). No data-model, migration, status-enum, permission, job, analytics or
  screen-state change.
- **Tenant/security:** the open mutation is now bound to the caller's idempotency key + input
  before any review state is written, strengthening the exact-version review provenance that R2
  approval and U1 scheduling depend on. RLS, existence-hiding and the permission guard are
  unchanged.
- **No commit:** per the standing user constraint, implementation is complete and verified
  green but stopped before any git commit.

## Status

V0-R1 review-create idempotency fix: VERIFIED GREEN locally. Critical issue resolved; the
sprint review's fix plan items 1, 2, 3, 5 and 6 are addressed; item 4 (`createdByUserId`) is
decided as no-change with rationale above.
