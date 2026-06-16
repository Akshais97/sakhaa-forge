# V0-R2 Sprint: Auditable Approval Bound To Final Media

## Sprint Objective

Allow an authorized actor to approve, reject or request changes for one exact final video
version. Only the current approved version can become schedulable.

## Source Contracts

- `../V0_PERMISSIONS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Add review decision API and generated client support.
- Record decision reason, actor, timestamp and final media fingerprint.
- Enforce optimistic version checks for stale review tabs.
- Supersede previous review items when new final video revisions exist.
- Create downstream approval token/reference for scheduling.
- Reject wrong-role, replayed, stale and cross-workspace decisions.

## TDD And Verification Plan

First failing test: stale tabs, wrong roles, superseded renders or replayed decisions
approve different media.

Required tests:

- Stale approval rejection.
- Superseded media rejection.
- Permission matrix tests.
- Decision replay idempotency/rejection as specified.

## Security And Guardrails

- Approval applies to exact media hash only.
- Approval cannot be transferred to another revision.
- Scheduling and publishing must reject unapproved or superseded media.

## Completion Evidence

- Review decision audit record.
- Exact hash/decision trace.
- Browser screenshots for approve, reject and request changes.
- Downstream approval reference.
