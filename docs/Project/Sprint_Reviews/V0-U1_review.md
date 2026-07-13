# Senior Engineer Sprint Review

## Verdict

NEEDS FIXES BEFORE MERGE

U1 covers create and manual export, but it does not implement the sprint backlog's edit path and its schedule-conflict guard is race-prone.

## Intended Outcome

V0-U1 should schedule approved exact media for a platform/account/caption or generate a manual export package that can later be verified by live post URL. It should create and edit `CalendarPost` records, bind media identity, approval, account, caption and schedule, handle IST/timezone display, reject past/invalid/conflicting schedules, reject stale references, and retain a manual export artifact.

## Implementation Map

- `docs/V0/Sprints/V0-U1_APPROVED_CALENDAR_AND_MANUAL_EXPORT_FALLBACK_SPRINT.md`: sprint objective and backlog.
- `docs/V0/Evidence/V0-U1_APPROVED_CALENDAR_AND_MANUAL_EXPORT_FALLBACK_LOCAL_VERIFICATION_2026-06-27.md`: submitted evidence, including owner-decision notes.
- `docs/V0/V0_API.md`, `V0_DATA_MODELS.md`, `V0_PRISMA_SCHEMA.md`, `V0_STATUS_ENUMS.md`, `V0_ERROR_CATALOG.md`, `V0_PERMISSIONS.md`, `V0_SCREEN_AND_STATE_INVENTORY.md`: calendar post route/model/status/error/UI contracts.
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`, `PROJECT_DEVELOPMENT_WORKFLOW.md`, `Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md`, `Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`: project rules for irreversible work, India-first scheduling language and verification.
- `apps/api/src/server.mjs`: `createCalendarPost` route and permission/idempotency wrapper.
- `apps/api/src/workspace-store.mjs`: in-memory and Prisma calendar create, approval lookup, schedule validation and manual export artifact creation.
- `apps/web/src/calendar-workflow.mjs`: calendar UI states and markup.
- `packages/db/prisma/schema.prisma` and migration `0029_v0_u1_approved_calendar_and_manual_export_fallback`: `CalendarPost` model and indexes.
- `tests/integration/calendar-u1.test.mjs`: U1 behaviour tests.
- `tests/unit/calendar-workflow.test.mjs`: UI state and leak checks.

## User Flow

1. User approves a final video in R2 and receives an approval token.
2. User creates a calendar post for a platform/account/caption.
3. If `manualExport` is false, the user must provide a future ISO timestamp with explicit UTC offset. The store saves UTC `scheduledAt` and display `timezone`.
4. If `manualExport` is true, the store rejects `scheduledAt`, creates an `APPROVED` calendar post, creates a clean manual-export artifact, and leaves `manualLiveUrl` null for later verification.
5. The API rejects unapproved media, superseded media, invalid/past schedule and sequential schedule conflict.
6. Later U2/U3 publish only non-manual scheduled posts.

The create/export journey works in narrow tests. The edit journey does not exist, and concurrent conflict protection is not strong enough for scheduling.

## Critical Issues

- Issue

The sprint backlog requires editing `CalendarPost` records, but no edit route exists.

- Evidence

`docs/V0/Sprints/V0-U1_APPROVED_CALENDAR_AND_MANUAL_EXPORT_FALLBACK_SPRINT.md` says "Create and edit `CalendarPost` records." `docs/V0/V0_API.md` exposes `POST /calendar-posts` plus publish/reconcile/verify routes, but no `PATCH /calendar-posts/{id}` or equivalent edit route. The evidence reinterprets edit as idempotent create, but that deferral is not present as a clear canonical contract decision in the sprint file.

- User impact

A real client manager cannot correct a caption, schedule, account or manual-export choice after creating a calendar post. The only workaround is creating another post, which risks conflicts and duplicate publication attempts later.

- Root cause

Implementation narrowed U1 to create-only without updating the sprint backlog to make edit an explicit deferral.

- Required fix

Either implement an edit route with optimistic version checks and stale media/account/caption guards, or update the canonical sprint/API docs with an explicit accepted deferral. If implemented, edits must be blocked after publish submission and must audit changed fields without rewriting the original media approval truth.

- Verification

Add tests for successful edit before submission, stale `version` rejection, stale media rejection, conflict detection after edited schedule, and no edit after publish operation exists.

- Issue

Schedule conflict detection is app-enforced read-then-write with no database-level protection.

- Evidence

`apps/api/src/workspace-store.mjs` loads candidate posts and checks `Math.abs(existing - target) < SCHEDULE_CONFLICT_WINDOW_MS`. `docs/V0/V0_API.md` documents the conflict as app-enforced with no database exclusion constraint. `packages/db/prisma/schema.prisma` has an index on `(workspaceId, platform, account, scheduledAt)`, not a uniqueness/exclusion guarantee over the conflict window.

- User impact

Two concurrent create requests for the same workspace/platform/account/time window can both pass the read and both write. That can produce duplicate scheduled posts, which later become duplicate external publication attempts.

- Root cause

The implementation relies on sequential application checks for a constraint that matters under concurrency.

- Required fix

Add a database-backed conflict strategy. Options: a computed schedule bucket with a unique partial index for active scheduled posts, a transaction-level advisory lock keyed by workspace/platform/account/time window, or a PostgreSQL exclusion constraint if accepted by the Prisma migration workflow.

- Verification

Add a concurrent calendar-create test using different idempotency keys for the same account/window and assert exactly one row is created and the loser receives `PUBLISH_SCHEDULE_INVALID`.

## Non-Blocking Issues

- `timezone` is stored as display metadata and length-checked, but it is not validated as a real IANA timezone. The evidence calls this an owner decision; if that is accepted, the UI should not imply full timezone conversion support.
- Platform/account ownership is deferred to U2/U3 publish. U1 only enforces workspace and exact media approval. That is safe only if U2/U3 remain the first provider-account truth boundary.
- The manual export artifact byte size is the byte length of the deterministic hash string, not a real package payload. That is acceptable for a simulator if documented, but not production export behaviour.

## Second-Order Risks

- Missing edit support makes normal calendar corrections become new rows. That increases the chance of stale scheduled posts being accidentally published.
- App-only conflict checks can become external duplicate posts once workers or scheduler loops are added.
- Leaving `manualLiveUrl` null is correct for U1, but U4 verification must distinguish "manual export package exists" from "manual publication happened".

## Test Review

Covered:

- Approved scheduled post creation.
- Manual export artifact creation.
- Unapproved and superseded media rejection.
- Past/invalid schedule and IST offset conversion.
- Sequential schedule conflict.
- Idempotency replay/conflict.
- Cross-workspace hiding.
- Calendar UI state rendering.

Missing:

- Edit route coverage.
- Concurrent conflict proof.
- Real IANA timezone validation or explicit test proving display-only convention.
- Provider-account eligibility test at the first boundary that owns it.

## Commands Run

- `Get-Content docs\V0\Sprints\V0-U1_APPROVED_CALENDAR_AND_MANUAL_EXPORT_FALLBACK_SPRINT.md` -> sprint contract read.
- `Get-Content docs\V0\Evidence\V0-U1_APPROVED_CALENDAR_AND_MANUAL_EXPORT_FALLBACK_LOCAL_VERIFICATION_2026-06-27.md` -> evidence read.
- `rg -n "createCalendarPost|CalendarPost|SCHEDULE_CONFLICT_WINDOW_MS|PUBLISH_SCHEDULE_INVALID" apps\api\src packages\db docs\V0 tests` -> calendar data flow traced.
- `node --test tests\integration\calendar-u1.test.mjs` -> pass, 7 tests.
- `node --test tests\unit\calendar-workflow.test.mjs` -> pass, 9 tests.
- `node scripts\verify.mjs` -> failed: stale `tests/unit/verify-script.test.mjs` expected scope.

## Fix Plan for Coding Agent

1. Decide and document whether U1 includes edit or explicitly defers it.
2. If included, add `PATCH /calendar-posts/{id}` with optimistic version, auth, audit and stale-reference guards.
3. Add DB-backed schedule conflict protection.
4. Add concurrent schedule conflict test.
5. Rerun `node --test tests\integration\calendar-u1.test.mjs`.
6. Fix verification-script expected scope and rerun `node scripts\verify.mjs`.
