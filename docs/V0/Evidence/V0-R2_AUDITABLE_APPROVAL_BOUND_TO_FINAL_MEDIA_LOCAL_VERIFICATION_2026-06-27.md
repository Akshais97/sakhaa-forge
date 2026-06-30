# V0-R2 Auditable Approval Bound To Final Media Local Verification — 2026-06-27

## Slice

V0-R2: Auditable Approval Bound To Final Media.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/Sprints/V0-R2_AUDITABLE_APPROVAL_BOUND_TO_FINAL_MEDIA_SPRINT.md`
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

- `POST /review-items/{id}/decisions` records one terminal, auditable `ReviewDecision` bound to the
  exact `FinalVideo` version captured when the review item was opened (`finalVideoSha256`,
  `finalVideoVersion`). The store loads the review item by `id + workspaceId`; a missing or
  cross-workspace review item is hidden behind `WORKSPACE_ACCESS_DENIED` (404) before any decision
  state is observable. The bound final video must be `current`; a decision against a superseded
  final video returns `REVIEW_VERSION_STALE` (409), archives the review item idempotently under RLS
  and records no decision. An `expectedFinalVideoVersion` that does not match the captured
  `finalVideoVersion` (a stale review tab) is also `REVIEW_VERSION_STALE` (409) with no decision
  recorded. The decision is one of `approve`, `reject` or `request_changes`
  (`normalizeApprovalDecision` rejects anything else with `VALIDATION_FAILED` 422) and an optional
  `reason` (≤ 2000 characters). Only Owner, Admin or Client Manager (`approve_reject_final_video`)
  may record a decision; a Reviewer is denied by the shared `assertWorkspacePermission` guard
  (`PERMISSION_DENIED` 403). The response is `202 Accepted`.
- One terminal decision exists per review item (`review_decisions_one_per_review_item_idx`). A
  second fresh-key decision on the same review item returns `REVIEW_DECISION_ALREADY_RECORDED`
  (409); the prior decision, its audit and the review item status are unchanged. Decision
  idempotency is key-bound through `store.runIdempotent({operation: "review.decision.record", ...})`:
  the same `Idempotency-Key` with the same input replays the same decision, approval reference and
  audit, and with different input returns `IDEMPOTENCY_INPUT_CONFLICT` (409). A missing
  `Idempotency-Key` returns `IDEMPOTENCY_KEY_REQUIRED` (400). In the Prisma store the partial unique
  index turns a concurrent second decision into a normalised conflict (the existing decision is
  re-fetched under RLS), never a raw `500` and never a second decision.
- `approve` moves the review item to `approved`, `reject` to `rejected` and `request_changes` to
  `change_requested`. Only `approve` mints a deterministic approval token
  (`sha256("review-approval:{workspaceId}:{reviewItemId}:{finalVideoId}:{finalVideoVersion}")`),
  persisted as the `approvalReference` for downstream scheduling; `reject` and `request_changes`
  mint no token and return `approvalReference: null`. The token is unique per workspace
  (`review_decisions_one_approval_token_idx`). The response carries the decision (id, decision,
  reason, final-video id/sha256/version, decided-by user id, created at), the `approvalReference`
  (approve only: token, review item id, final-video id/sha256/version, decided by/at) and the
  `review.decision_recorded` audit (target type `ReviewItem`). The decided-by user id and the
  approval token object key are never rendered as copyable leaks in the web shell; the token is a
  public deterministic reference surfaced for scheduling, never a signed URL or provider payload.
- The web shell implements the decision workflow at `apps/web/src/review-workflow.mjs` with pure,
  DOM-agnostic state functions unit tested in Node and a `reviewMarkup` renderer. The workflow is
  never optimistic: it shows `decision-loading`, calls the API with an `Idempotency-Key`, and
  renders the committed decision and `approvalReference` or a calm error. `reviewDecisionState`
  maps the three decisions and preserves `unknown`. `classifyReviewError` maps each decision
  error to a stable banner state (`decision-already-recorded` `REVIEW_DECISION_ALREADY_RECORDED`,
  `stale-superseded` `REVIEW_VERSION_STALE`, `forbidden` `PERMISSION_DENIED`, `idempotency-conflict`
  `IDEMPOTENCY_INPUT_CONFLICT`; `VALIDATION_FAILED` stays `comment-invalid` as the shared R1/R2
  validation banner). `deriveReviewState` produces the decision descriptor and `approvalReference`
  for the `decision-recorded` phase. The rendered markup carries only the decision, reason, bound
  final-video version, the golden render hash and the approval reference. The unit suite asserts
  the FORBIDDEN regex never matches the markup and that the decided-by user id is never rendered.
- Signed URLs, object keys, decided-by user ids, raw provider payloads and secrets never appear in
  any decision response, audit row, analytics event or rendered markup. The final-video sha256 is
  a public content fingerprint and is surfaced as the bound golden render hash. The approval token
  is a public deterministic reference, not a secret. Cross-workspace and missing workspaces hide
  behind `WORKSPACE_ACCESS_DENIED` (404) and never leak the owning workspace id; a cross-workspace
  decision returns the same 404.
- Prisma schema and migration `0028_v0_r2_auditable_approval_bound_to_final_media` add the
  `approval_decision` enum (`APPROVE`/`REJECT`/`REQUEST_CHANGES`) and the `review_decisions` table.
  `review_decisions` has FKs to `workspaces`, `review_items` and `final_videos`, captures
  `final_video_sha256`/`final_video_version`, carries `decision`, `reason` (≤ 2000),
  `decided_by_user_id` and the `approval_token` (char 64). A unique index
  `review_decisions_one_per_review_item_idx` enforces one terminal decision per review item; a
  unique index `review_decisions_one_approval_token_idx` enforces one approval token per workspace;
  an index on `(workspace_id, decision, created_at)` supports filtered listing. The table enables
  RLS with a `review_decisions_workspace_isolation` policy keyed on `app.current_workspace_id`; no
  BYPASSRLS is granted. The migration is additive and forward-only, and is validated by
  `db-validate.mjs`.

## Prisma runtime design

The R2 Prisma path reuses the three R1 gotchas rather than introducing new ones. The
already-recorded conflict is resolved with the codebase pre-find pattern (not create-then-catch):
inside `withActor`, a `tx.reviewDecision.findFirst({ where: { workspaceId, reviewItemId } })` first;
if found, return `{ok:false, problem}` (REVIEW_DECISION_ALREADY_RECORDED) — the transaction commits
cleanly with no writes and `runIdempotent` stores no idempotency record for the conflict. No `P2002`
is raised inside the transaction, so the `25P02` abort does not occur. The superseded-version
archive update runs inside a `withActor` transaction (not a top-level update) so it persists under
RLS and does not hit `P2025`. The controller's `createResponse` re-throws any
`error instanceof HttpException` before the `RUNTIME_DB_WRITE_FAILED` sanitisation branch, so the
legitimate `409`/`422`/`403` business-rule responses surface with their own status. The approval
token is computed with Node `crypto.createHash("sha256")` from the bound fields, not from
`Date.now()` or `Math.random()`, so it is deterministic across replays.

## Red evidence

Command:

```text
node --test tests\integration\review-r2.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.recordReviewDecision is not a function
```

All five R2 integration tests failed before `recordReviewDecision` existed on the generated client
or the store/route, and before the `approval_decision` enum and `review_decisions` table existed in
the Prisma client and migration. The Prisma runtime proof additionally failed before the migration
was applied and the R2 runtime proof test was written.

## Green evidence

Command:

```text
node --test tests/integration/review-r2.test.mjs
```

Outcome:

```text
✔ R2 records an approve decision with audit and a downstream approval reference bound to the exact version
✔ R2 rejects and request_changes move the review item status and create no approval reference
✔ R2 rejects a decision against a superseded final-video version with REVIEW_VERSION_STALE and archives the review item
✔ R2 replays a decision by idempotency key and rejects a second decision with REVIEW_DECISION_ALREADY_RECORDED
✔ R2 hides a cross-workspace decision behind WORKSPACE_ACCESS_DENIED
tests 5
pass 5
fail 0
```

Required sprint tests and outcomes:

- Stale approval rejection — pass. A decision whose `expectedFinalVideoVersion` does not match the
  captured `finalVideoVersion` returns `REVIEW_VERSION_STALE` (409) with no decision recorded.
- Superseded media rejection — pass. A decision against a review item whose bound final video has
  been superseded returns `REVIEW_VERSION_STALE` (409), archives the review item idempotently, and
  records no decision; a fresh-key second decision against the now-archived item is also
  `REVIEW_VERSION_STALE`.
- Permission matrix tests — pass. The capability `approve_reject_final_video` is Owner/Admin/Client
  Manager (Yes/Yes/Yes/No), asserted by `tests/unit/permissions.test.mjs` via `canPerform`; the
  integration harness only ever creates OWNER memberships (no member-invite endpoint), so a second
  JWT user hits `WORKSPACE_ACCESS_DENIED` (404) and the `PERMISSION_DENIED` (403) path is
  unit-asserted rather than integration-asserted.
- Decision replay idempotency/rejection — pass. A same-key replay returns the same decision,
  approval reference and audit; a same-key+different-input attempt returns
  `IDEMPOTENCY_INPUT_CONFLICT` (409); a second fresh-key decision returns
  `REVIEW_DECISION_ALREADY_RECORDED` (409).
- Exact hash/decision trace — pass. The decision binds `finalVideoSha256` + `finalVideoVersion`
  captured at open time; the `review.decision_recorded` audit (target type `ReviewItem`) is
  retained once; the approval token is deterministic across replays.
- Cross-workspace hiding — pass. A different workspace cannot record a decision on another
  workspace's review item; it returns `WORKSPACE_ACCESS_DENIED` (404) with no owning workspace id
  leak.

Unit test commands and outcomes:

```text
node --test tests/unit/review-workflow.test.mjs
tests 13
pass 13
fail 0
```

The workflow unit suite asserts the decision mapping (three decisions, `unknown` preserved), every
decision error mapped to a calm banner state, the approve+`approvalReference` state, the
reject/request_changes no-`approvalReference` state, the rendered decision/reason/bound
version/golden hash/approval reference, and that the markup never leaks secrets, signatures, URLs,
the decided-by user id or the notification id (FORBIDDEN regex).

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 298
pass 279
fail 0
skipped 19

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 19
pass 19
fail 0
  ✔ prisma runtime persists V0-R2 auditable approval bound to final media under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../C2/R1/R2 identity, ... auditable approval decisions bound to
one exact final-video version with one-decision-per-review-item guard and a deterministic approval
token for scheduling, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2 local verification passed.
```

The 19 skipped tests in the broad glob are the prisma-runtime proof tests intentionally skipped
there and run by the dedicated verification step immediately after, including the V0-R2 runtime
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
V0-F1/.../C2/R1/R2 migrations applied.
```

The migration creates the `approval_decision` enum and the `review_decisions` table (workspace,
review item, final video, final-video sha256/version, decision, reason, decided-by user,
approval token, created at). The table enables RLS with a `review_decisions_workspace_isolation`
policy keyed on `app.current_workspace_id`. No BYPASSRLS is granted.
`review_decisions_one_per_review_item_idx` enforces one terminal decision per review item;
`review_decisions_one_approval_token_idx` enforces one approval token per workspace.

The runtime-proof test confirms persistence under RLS:

```text
SELECT count(*)::text FROM review_decisions WHERE workspace_id = '<ws>' AND review_item_id = '<item>'
-- result: 1

SELECT decision::text || ':' || final_video_version::text || ':' || approval_token IS NOT NULL
FROM review_decisions WHERE workspace_id = '<ws>' AND review_item_id = '<item>'
-- result: APPROVE:1:true   (approve mints a token)

SELECT count(*)::text FROM audit_events WHERE workspace_id = '<ws>' AND event_type = 'review.decision_recorded'
  AND target_type = 'ReviewItem' AND target_id = '<item>'
-- result: 1

SELECT status::text FROM review_items WHERE id = '<item>' AND workspace_id = '<ws>'
-- result: APPROVED   (after approve)

SELECT count(*)::text FROM review_decisions WHERE workspace_id = '<ws>' AND review_item_id = '<item>'
-- result: 1   (second fresh-key decision does not add a row)

SELECT status::text FROM review_items WHERE id = '<item>' AND workspace_id = '<ws>'
-- result: ARCHIVED   (after a supersede + stale decision; no decision recorded against the superseded version)
```

The runtime proof also confirms a cross-workspace decision returns `WORKSPACE_ACCESS_DENIED` (404)
with no owning workspace id leak, and that `reject`/`request_changes` mint no approval token
(`REJECTED`/`CHANGE_REQUESTED` status, `approval_token` null). Signed URLs, object keys, the
decided-by user id, raw provider payloads and secrets never appear in any response; the final-video
sha256 is surfaced as the bound golden render hash and the approval token is a public deterministic
reference.

## Downstream contract reference

`docs/V0/V0_API.md` (the `POST /review-items/{id}/decisions` route with the Owner/Admin/Client
Manager annotation and the Auditable Approval prose), `docs/V0/V0_DATA_MODELS.md` (the
`ReviewDecision` model), `docs/V0/V0_PRISMA_SCHEMA.md` (the `ApprovalDecision` enum and the
`ReviewDecision` model in the review/publishing inventory), `docs/V0/V0_STATUS_ENUMS.md` (the
decision status transitions `approve`→`approved`, `reject`→`rejected`,
`request_changes`→`change_requested` and the `ApprovalDecision` enum), `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
(the review item screen with `decision-loading`/`decision-recorded`/`decision-already-recorded`/
`decision-invalid`/`idempotency-conflict` states), `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md` (the
`review_decision_recorded` event with the `review.decision_recorded` audit row as record of truth),
`docs/V0/V0_ERROR_CATALOG.md` (`REVIEW_DECISION_ALREADY_RECORDED` 409, `REVIEW_VERSION_STALE` 409,
`REVIEW_APPROVAL_REQUIRED` 409) and `docs/V0/V0_PERMISSIONS.md` (`approve_reject_final_video` for
Owner/Admin/Client Manager) record the V0-R2 contract. R2 reuses the existing
`WORKSPACE_ACCESS_DENIED`, `PERMISSION_DENIED`, `IDEMPOTENCY_KEY_REQUIRED`,
`IDEMPOTENCY_INPUT_CONFLICT`, `VALIDATION_FAILED`, `REVIEW_VERSION_STALE`,
`REVIEW_DECISION_ALREADY_RECORDED` and `REVIEW_APPROVAL_REQUIRED` error codes and introduces no new
configuration (it reuses `SUPABASE_JWT_SECRET`, `V0_INTERNAL_WORKER_TOKEN`,
`V0_HEYGEN_SIMULATOR_SECRET` and `V0_C2_SIMULATOR_MODE`). The generated OpenAPI document and
generated `v0-client.mjs` carry the review decision endpoint.

## Browser state evidence

The web shell renders the decision contract at `/reviews/{reviewItemId}` with the `decision-loading`,
`decision-recorded`, `decision-already-recorded`, `decision-invalid`, `idempotency-conflict`,
`stale-superseded`, `forbidden`, `blocked-hidden`, `missing-idempotency` and `error` states in
addition to the R1 comment states. The `review-workflow` unit suite asserts the rendered decision
copy, the decision mapping (`unknown` preserved as a real state), the calm error banners for every
decision guard code, the `approvalReference` rendering for `approve` and its absence for
`reject`/`request_changes`, and that no secret, signature, signed URL, decided-by user id or
external URL appears in the markup. No live browser screenshot is captured in local verification;
the deterministic state functions and `reviewMarkup` renderer are the browser-state evidence.

## Scope note

This is local deterministic simulator evidence for V0-R2. It does not claim production approval
readiness, real scheduling handoff or full V0 acceptance. The approval token is a deterministic
local reference for downstream scheduling; real publication handoff is V0-U1 and later. The
permission matrix is unit-asserted for the Reviewer-deny path because the integration harness only
creates OWNER memberships. The Prisma concurrency design is minimal: the pre-find already-recorded
check and the `review_decisions_one_per_review_item_idx` / `review_decisions_one_approval_token_idx`
unique indexes normalise concurrent decisions into a conflict or a replay, and the runtime proof
covers sequential decision, replay, supersede-archive and cross-workspace hiding; a full
multi-process concurrency proof for the rare different-key race is deferred. No credit is
captured, released or moved by a decision (it is not a paid mutation). New revisions never rewrite
historical review or lineage records.
