# V0-R2 Nullable Approval Token (Minted Only On Approve) Fix Local Verification — 2026-06-29

## Slice

V0-R2: Auditable Approval Bound To Final Media — approval-token persistence fix raised by the
senior engineer sprint review (`docs/Project/Sprint_Reviews/V0-R2_review.md`,
"NEEDS FIXES BEFORE MERGE").

## Problem raised

`ReviewDecision.approvalToken` was `NOT NULL` and populated for every decision type. The
`recordReviewDecision` store paths (in-memory and Prisma) computed the deterministic approval
token before branching by decision and wrote it into every `reviewDecision.create`. The API
response hid this by returning `approvalReference: null` for `reject`/`request_changes`, but the
retained row still carried an approval-like token.

The persisted system of record therefore said rejected/change-requested decisions had approval
tokens. A future query, report, migration or scheduling bug could treat token existence as
approval evidence — exactly the second-order failure V0 is meant to avoid. `V0_DATA_MODELS.md`
and `V0_API.md` already stated the token is minted only on `approve`; the code violated the
contract, not the docs.

## Contracts read

- `docs/Project/Sprint_Reviews/V0-R2_review.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`

## Behaviour changed

- `ReviewDecision.approvalToken` is now nullable. `packages/db/prisma/schema.prisma` declares
  `approvalToken String? @map("approval_token") @db.Char(64)`. The `@@unique([workspaceId,
  approvalToken])` block was removed from the schema because the uniqueness guard is now a
  partial unique index (migration-only), matching the established C2 convention
  (`render_attempts_one_active_per_instruction_idx WHERE status = 'RUNNING'`,
  `final_videos_one_current_per_instruction_idx WHERE status = 'CURRENT'`).
- Migration `0031_v0_r2_nullable_approval_token_only_on_approve` (additive, backward compatible):
  `ALTER TABLE review_decisions ALTER COLUMN approval_token DROP NOT NULL`,
  `DROP INDEX IF EXISTS review_decisions_one_approval_token_idx`, recreate it as a partial unique
  index `ON review_decisions(workspace_id, approval_token) WHERE approval_token IS NOT NULL`, and
  re-assert `ALTER TABLE review_decisions ENABLE ROW LEVEL SECURITY`. PostgreSQL treats NULLs as
  distinct, so the partial index enforces uniqueness only for real approval tokens and allows many
  non-approve decisions to coexist without collision.
- `apps/api/src/workspace-store.mjs` `recordReviewDecision` now computes `approvalToken` only when
  `decisionValue === "APPROVE"` and writes `null` otherwise, in both the in-memory and Prisma
  paths. The token formula is unchanged:
  `sha256("review-approval:{workspaceId}:{reviewItemId}:{finalVideoId}:{finalVideoVersion}")`.
- `publicApprovalReference` is still built only for `approve`, so the public response contract is
  unchanged: `approvalReference` is non-null only for approve and carries the token; `reject` and
  `request_changes` return `approvalReference: null`. `publicReviewDecision` never exposed the
  token. No OpenAPI / generated-client contract change was required.
- U1 scheduling (`createCalendarPost`) looks up the approve decision by
  `decision: "APPROVE"` + matching token; approve still mints the token, so U1 binding is
  unchanged. `CalendarPost.approvalToken` stays non-nullable because a calendar post only binds
  to an approved decision's token.

## Non-blocking review items — decision

- **`publicReviewDecision` exposes `decidedByUserId`.** Same decision as the R1 fix: user ids are
  already public in this slice (`publicReviewItem.createdByUserId`,
  `publicReviewComment.authorUserId`, `publicAudit.actorUserId`) and V0 security protects
  cross-tenant workspace existence, signed URLs, secrets, provider payloads, object keys and
  payload hashes — not in-workspace user ids. No mapper, doc or test change.
- **Reviewer role-matrix integration coverage.** The integration harness creates owner
  memberships, so the Reviewer-deny is unit-asserted only. Understood and accepted, matching
  prior sprints; no change in this fix.

## Verification

Red-before-green observed for the new DB-level proof:

1. Added DB assertions to the R2 case in `tests/integration/prisma-runtime.test.mjs`: after the
   `reject` and `request_changes` decisions, `SELECT approval_token IS NULL FROM review_decisions
   WHERE workspace_id = ... AND review_item_id = ...` must return `t`. Before the fix: `'f' !==
   't'` (the reject row carried a token). After the fix: `t` for both non-approve decisions.
2. The existing R2 prisma-runtime approve assertion (`approval_token` equals the minted token)
   still passes — approve still persists the token.

Commands run (fresh):

- `V0_RUNTIME_DB_PROOF=1 node --test --test-name-pattern="V0-R2 auditable approval" tests/integration/prisma-runtime.test.mjs` -> pass, 1 test (R2 Prisma runtime proof incl. the new
  null-token assertions for reject and request_changes, and the approve token assertion).
- `node --test tests/integration/review-r1.test.mjs tests/integration/review-r2.test.mjs tests/integration/calendar-u1.test.mjs tests/unit/review-workflow.test.mjs` -> pass, 31 tests
  (no regression in R1 / R2 / U1 / review-workflow unit; U1 approve-token scheduling intact).
- `node packages/db/scripts/db-generate.mjs` -> Prisma client regenerated for the nullable field.
- `node packages/db/scripts/db-migrate-dev.mjs` -> applied `0031` (`ALTER TABLE`, `DROP INDEX`,
  `CREATE INDEX`, `ALTER TABLE`); `0031` registered in the per-slice migration list.
- `node packages/db/scripts/db-validate.mjs` -> green; new required-statements block for `0031`
  and updated descriptive success line ("approval token minted only on approve (nullable, NULL on
  reject/request_changes, unique over non-null tokens)").
- `node scripts/verify.mjs` -> green (full local verification scope F0–G5/C1/C2/R1/R2/U1/U2/U3).

## Impact

- **Contract:** `V0_DATA_MODELS.md` `ReviewDecision` and `V0_API.md` `POST
  /review-items/{id}/decisions` updated to state the persisted `approval_token` is nullable, minted
  only on `approve`, `NULL` on `reject`/`request_changes`, with uniqueness enforced only over
  non-null tokens. No new error codes; no public response-shape change. No OpenAPI / generated
  client regeneration required (no contract surface changed).
- **Migration:** additive `0031_v0_r2_nullable_approval_token_only_on_approve`; drops `NOT NULL`,
  swaps the full unique index for a partial unique index, re-asserts RLS. Backward compatible:
  pre-existing reject/request_changes rows keep their now-harmless token; new non-approve rows
  store `NULL`. `db-migrate-dev.mjs` and `db-validate.mjs` per-slice migration lists both updated
  (the recurring two-list trap). No RLS bypass.
- **Tenant/security/financial:** the persisted system of record no longer carries approval
  evidence for non-approve decisions, removing the second-order risk that a future query/report/
  migration/scheduling bug treats token existence as approval. RLS, existence-hiding and the
  permission guard are unchanged.
- **No commit:** per the standing user constraint, implementation is complete and verified green
  but stopped before any git commit.

## Status

V0-R2 nullable approval token fix: VERIFIED GREEN locally. Critical issue resolved; the sprint
review's fix-plan items 1, 2, 3, 4 and 5 are addressed (item 6, the stale verification-script
test, was already fixed in the V0-R1 review-fix change). The two non-blocking items are decided
as no-change with rationale above.
