# V0-R1 Sprint: Exact-Version Review And Comments

## Sprint Objective

Let reviewers inspect the exact final video version, thumbnail, caption and script, then
add timestamped comments or request changes without cross-version ambiguity.

## Source Contracts

- `../V0_PERMISSIONS.md`
- `../V0_DATA_MODELS.md`
- `../V0_SCREEN_AND_STATE_INVENTORY.md`
- `../V0_STATUS_ENUMS.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Create `ReviewItem`, `ReviewComment` and notification records.
- Bind review item to exact `FinalVideo` fingerprint.
- Build video, thumbnail, caption and script preview.
- Add timestamped comment threads.
- Enforce role-limited access for internal and client reviewers.
- Add duplicate notification collapse.
- Preserve archived review history.

## TDD And Verification Plan

First failing test: comments attach to another workspace/version or duplicate
notifications are sent.

Required tests:

- Review role tests.
- Cross-version comment rejection.
- Duplicate notification idempotency.
- Timestamped-comment browser journey.

## Security And Guardrails

- Review access never bypasses workspace membership.
- Comments bind to exact media version and timestamp.
- Signed media URLs are not exposed in comments, notifications or evidence.

## Completion Evidence

- Review item and comment IDs.
- Notification dedupe proof.
- Browser screenshots for preview and timestamped comment.
- Cross-version rejection test output.
