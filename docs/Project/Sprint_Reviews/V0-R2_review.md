# Senior Engineer Sprint Review

## Verdict

NEEDS FIXES BEFORE MERGE

R2 records decisions correctly at the API level, but the database stores approval tokens for reject and request_changes decisions even though the contract says tokens are minted only on approve.

## Intended Outcome

V0-R2 should let an authorised actor approve, reject or request changes for one exact final-video version. It should record decision reason, actor, timestamp and final-media fingerprint, reject stale/superseded/replayed/cross-workspace decisions, update review item status, and create a downstream approval reference only for approved media.

## Implementation Map

- `docs/V0/Sprints/V0-R2_AUDITABLE_APPROVAL_BOUND_TO_FINAL_MEDIA_SPRINT.md`: sprint objective and required tests.
- `docs/V0/Evidence/V0-R2_AUDITABLE_APPROVAL_BOUND_TO_FINAL_MEDIA_LOCAL_VERIFICATION_2026-06-27.md`: submitted evidence.
- `docs/V0/V0_API.md`, `V0_DATA_MODELS.md`, `V0_PRISMA_SCHEMA.md`, `V0_STATUS_ENUMS.md`, `V0_ERROR_CATALOG.md`, `V0_PERMISSIONS.md`: decision route, data and error contracts.
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`, `PROJECT_DEVELOPMENT_WORKFLOW.md`, `Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md`: project rules for exact media truth, immutable lineage and verification.
- `apps/api/src/server.mjs`: `recordReviewDecision` route, auth, permission and idempotency wrapper.
- `apps/api/src/workspace-store.mjs`: in-memory and Prisma decision write paths.
- `apps/web/src/review-workflow.mjs`: decision UI state and markup.
- `packages/db/prisma/schema.prisma` and migration `0028_v0_r2_auditable_approval_bound_to_final_media`: `ReviewDecision` schema and indexes.
- `tests/integration/review-r2.test.mjs`: R2 public behaviour tests.
- `tests/unit/review-workflow.test.mjs`: R1/R2 review UI tests.

## User Flow

1. User opens a current review item created by R1.
2. Authorised Owner/Admin/Client Manager submits `approve`, `reject` or `request_changes` with an expected final-video version.
3. The API rejects a stale tab or superseded final video as `REVIEW_VERSION_STALE`.
4. The API rejects a second fresh-key decision as `REVIEW_DECISION_ALREADY_RECORDED`.
5. An approve response returns `approvalReference`; reject and request_changes return `approvalReference: null`.
6. U1 later uses the approval token to schedule or export exact approved media.

The user-visible path works in narrow tests. The persistence layer still writes a token for all decision types, which contradicts the data contract and creates a bad downstream invariant.

## Critical Issues

- Issue

`ReviewDecision.approvalToken` is non-null and is populated for reject and request_changes decisions.

- Evidence

`apps/api/src/workspace-store.mjs` computes `approvalToken` before branching by decision and writes it into every `reviewDecision.create` call. `packages/db/prisma/schema.prisma` defines `approvalToken String @db.Char(64)` as mandatory with a unique index. `docs/V0/V0_DATA_MODELS.md` says the deterministic approval token is minted only on `approve`.

The response hides this by returning `approvalReference: null` for reject/request_changes, but the retained record still contains an approval-like token.

- User impact

The persisted system of record says rejected/change-requested decisions have approval tokens. A future query, report, migration, or scheduling bug could treat token existence as approval evidence. That is exactly the kind of second-order failure V0 is supposed to avoid.

- Root cause

Schema shape forced every decision row to carry an approval token. The implementation then generated one unconditionally and relied on application-level `decision = APPROVE` checks to avoid immediate misuse.

- Required fix

Make `approvalToken` nullable and write it only for `APPROVE`. Keep the unique constraint only for non-null approval tokens if PostgreSQL index semantics and Prisma migration allow it. Update `V0_DATA_MODELS.md`, `V0_PRISMA_SCHEMA.md`, OpenAPI response contract if needed, and runtime proof.

- Verification

Add tests that inspect persisted reject/request_changes decisions and assert `approval_token IS NULL`. Keep scheduling tests proving U1 accepts only `decision = APPROVE` plus matching token.

## Non-Blocking Issues

- Permission-deny coverage for Reviewer is mostly unit-level because the integration harness creates owner memberships. This is understandable, but a true role-matrix integration harness would give stronger evidence.
- `publicReviewDecision` exposes `decidedByUserId`. The web tests assert it is not rendered. Confirm whether the API response itself may expose actor ids to review clients.

## Second-Order Risks

- R2 is the approval root for U1/U2/U3. Any ambiguity in approval-token semantics can propagate into scheduling, publication and audit reports.
- The approval token is deterministic from workspace/review/final-video fields. That is acceptable as a public reference only if the token is never treated as an authorisation secret.
- A rejected decision changing the review item status is terminal. If product later allows a new review cycle for the same final-video version, this one-decision-per-review-item model will need a new revision/reopen contract, not an update-in-place.

## Test Review

Covered:

- Approve creates decision, audit and approval reference bound to exact version.
- Reject and request_changes move review item status and return no approval reference.
- Superseded media and stale expected version are rejected.
- Same-key replay and same-key different-input conflict.
- Second fresh-key decision rejection.
- Cross-workspace hiding.
- Review UI decision states.

Missing:

- DB/runtime assertion that reject/request_changes store no approval token.
- Full role matrix integration coverage.
- API public-surface decision on exposing `decidedByUserId`.

## Commands Run

- `Get-Content docs\V0\Sprints\V0-R2_AUDITABLE_APPROVAL_BOUND_TO_FINAL_MEDIA_SPRINT.md` -> sprint contract read.
- `Get-Content docs\V0\Evidence\V0-R2_AUDITABLE_APPROVAL_BOUND_TO_FINAL_MEDIA_LOCAL_VERIFICATION_2026-06-27.md` -> evidence read.
- `rg -n "recordReviewDecision|ReviewDecision|approvalToken|REVIEW_DECISION_ALREADY_RECORDED" apps\api\src packages\db docs\V0 tests` -> decision flow traced.
- `node --test tests\integration\review-r2.test.mjs` -> pass, 5 tests.
- `node --test tests\unit\review-workflow.test.mjs` -> pass, 13 tests.
- `node scripts\verify.mjs` -> failed: stale `tests/unit/verify-script.test.mjs` expected scope.

## Fix Plan for Coding Agent

1. Change `ReviewDecision.approvalToken` to nullable.
2. Generate an additive migration that permits null and enforces uniqueness only for real approval tokens.
3. Write token only when `decisionValue === "APPROVE"`.
4. Add runtime/DB tests for null token on reject and request_changes.
5. Rerun `node --test tests\integration\review-r2.test.mjs`.
6. Fix the verification-script test and rerun `node scripts\verify.mjs`.
