# Senior Engineer Sprint Review

## Verdict

NEEDS FIXES BEFORE MERGE

R1 implements the review/comment flow, but `POST /review-items` requires an idempotency key and then does not bind the mutation through the idempotency store.

## Intended Outcome

V0-R1 should let reviewers inspect and comment on one exact final-video version without cross-version ambiguity. The sprint should create `ReviewItem`, `ReviewComment` and `Notification` records, bind review to the exact `FinalVideo` fingerprint, render video/thumbnail/caption/script preview state, enforce role-limited access, collapse duplicate notifications, and preserve archived review history.

## Implementation Map

- `docs/Project/Sprint_Reviews/reviewer_skill.md`: review rubric used for this file.
- `docs/V0/Sprints/V0-R1_EXACT_VERSION_REVIEW_AND_COMMENTS_SPRINT.md`: R1 sprint objective and backlog.
- `docs/V0/Evidence/V0-R1_EXACT_VERSION_REVIEW_AND_COMMENTS_LOCAL_VERIFICATION_2026-06-26.md`: submitted R1 evidence.
- `docs/V0/V0_API.md`, `V0_DATA_MODELS.md`, `V0_STATUS_ENUMS.md`, `V0_ERROR_CATALOG.md`, `V0_PERMISSIONS.md`, `V0_SCREEN_AND_STATE_INVENTORY.md`: owning contracts for routes, models, states, errors, roles and UI states.
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`, `PROJECT_DEVELOPMENT_WORKFLOW.md`, `Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md`, `Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`: project rules for idempotency, tenant isolation, evidence, language and verification.
- `apps/api/src/server.mjs`: R1 controller methods and permission checks.
- `apps/api/src/workspace-store.mjs`: in-memory and Prisma R1 implementations.
- `apps/web/src/review-workflow.mjs`: DOM-agnostic review and decision workflow state/rendering.
- `packages/db/prisma/schema.prisma` and migration `0027_v0_r1_exact_version_review_and_comments`: R1 tables, enums, indexes and RLS.
- `tests/integration/review-r1.test.mjs`: public API behaviour tests.
- `tests/unit/review-workflow.test.mjs`: UI state and leak-prevention tests.

## User Flow

1. A production actor with `select_blueprint_and_run_scripts` opens a review item for a current final video.
2. The API loads `FinalVideo` by `id + workspaceId`, rejects missing/cross-workspace references as `WORKSPACE_ACCESS_DENIED`, and rejects superseded media as `REVIEW_VERSION_STALE`.
3. The store creates or replays one `ReviewItem` per workspace and final video, capturing `finalVideoSha256`, `finalVideoVersion` and `compositionInstructionId`.
4. A reviewer with `submit_review_comments` opens the review item and sees the bound final video plus public artifact metadata.
5. The reviewer adds timestamped comments. The comment path is append-only, key-bound through `runIdempotent`, and collapses repeated activity into one logical notification.
6. If the final video is superseded before comment submission, the comment is rejected and the review item is archived while old comments remain visible.

The basic journey works in narrow tests. The broken part is the first irreversible mutation: the route requires an `Idempotency-Key`, but the key is not used to protect `createReviewItem`.

## Critical Issues

- Issue

`POST /review-items` does not use the idempotency store.

- Evidence

`apps/api/src/server.mjs` reads the key in `createReviewItem`, then calls `store.createReviewItem(auth.actor, input)` directly. Other externally visible mutations in the same controller, including comment, decision and calendar create, wrap their writes in `store.runIdempotent`.

The in-memory and Prisma store implementations enforce one review item per `workspaceId + finalVideoId`, but that is resource-level replay, not idempotency-key replay. A same key used for two different final videos in the same workspace is not detected as `IDEMPOTENCY_INPUT_CONFLICT`.

- User impact

A client retry bug, browser double-submit or SDK misuse can reuse a key with different `finalVideoId` and still create or replay a different review resource. That weakens the exact-version review contract before approval and scheduling depend on it.

- Root cause

The implementation treated the one-review-item-per-final-video unique index as a replacement for idempotency. It is not the same contract: idempotency keys must bind to the exact request input.

- Required fix

Wrap `createReviewItem` in `store.runIdempotent` with an operation name such as `review.item.create`. The idempotency input must include `workspaceId`, `finalVideoId` and `reviewStage`. Same key + same input should replay. Same key + different input should return `IDEMPOTENCY_INPUT_CONFLICT`.

- Verification

Add an R1 integration test that opens review item A with key `k`, replays A with key `k`, then attempts review item B with key `k` and expects `IDEMPOTENCY_INPUT_CONFLICT` with no second idempotent success. Add the same coverage to the Prisma runtime proof if R1 runtime tests remain the production persistence proof.

## Non-Blocking Issues

- The evidence says browser screenshots were required by the sprint, but the retained evidence relies on deterministic state-function/unit-renderer tests rather than a live browser screenshot. That is acceptable only if the project explicitly accepts renderer tests as browser-state evidence for this shell.
- `publicReviewItem` returns `createdByUserId`. The web workflow tests assert it is not rendered, but the API response still exposes an internal user id. If user ids are considered protected identifiers under V0 security, the public mapper should be revisited.

## Second-Order Risks

- R1 is the first human review boundary after final render. Weak create idempotency can create confusing review provenance that later makes R2 approval look clean while the client retry history was not.
- Notification collapse is keyed to review item opener. That is fine for deterministic local in-app notifications, but real client-review notification routing will need a broader recipient model.
- The route-level permission split is strict: opening/listing review items uses production roles, while comments/viewing use reviewer roles. That matches docs, but product UX must make it clear why a reviewer can comment on an assigned item but cannot list all review items.

## Test Review

Covered:

- Exact final-video binding on review open.
- Timestamped comment creation.
- Superseded final-video comment rejection and review item archival.
- Duplicate notification collapse.
- Cross-workspace open/comment/fetch hiding.
- Review list pagination.
- UI state mapping and markup leak checks.

Missing:

- Idempotency-key conflict on `POST /review-items`.
- Live browser journey or accepted equivalent screenshot evidence.
- Prisma/runtime proof for review create idempotency conflict.

## Commands Run

- `Get-Content docs\Project\Sprint_Reviews\reviewer_skill.md` -> reviewer rubric read.
- `Get-Content docs\V0\Sprints\V0-R1_EXACT_VERSION_REVIEW_AND_COMMENTS_SPRINT.md` -> sprint contract read.
- `Get-Content docs\V0\Evidence\V0-R1_EXACT_VERSION_REVIEW_AND_COMMENTS_LOCAL_VERIFICATION_2026-06-26.md` -> evidence read.
- `rg -n "createReviewItem|addReviewComment|ReviewItem|ReviewComment|Notification" apps\api\src apps\web\src packages\db docs\V0 tests` -> implementation and contracts traced.
- `node --test tests\integration\review-r1.test.mjs` -> pass, 5 tests.
- `node --test tests\unit\review-workflow.test.mjs` -> pass, 13 tests.
- `node scripts\verify.mjs` -> failed: `tests/unit/verify-script.test.mjs` still expects verification scope ending at U1 while `scripts/verify.mjs` prints U1/U2/U3.

## Fix Plan for Coding Agent

1. Wrap `createReviewItem` in `store.runIdempotent`.
2. Add same-key/same-input replay and same-key/different-final-video conflict tests.
3. Add Prisma runtime proof for the same conflict if R1 runtime coverage is required for merge.
4. Decide whether API responses may expose `createdByUserId`; update mapper/docs/tests if not.
5. Rerun `node --test tests\integration\review-r1.test.mjs`.
6. Fix the stale verification-script test and rerun `node scripts\verify.mjs`.
