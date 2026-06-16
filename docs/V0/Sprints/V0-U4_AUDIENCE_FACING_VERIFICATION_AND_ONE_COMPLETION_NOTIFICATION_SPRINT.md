# V0-U4 Sprint: Audience-Facing Verification And One Completion Notification

## Sprint Objective

Independently verify target account, media identity, caption, visibility and publish time
before setting `published_verified` and sending exactly one completion notification.

## Source Contracts

- `../V0_STATUS_ENUMS.md`
- `../V0_ANALYTICS_EVENT_TAXONOMY.md`
- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Add `PostVerification`, notification and initial `PerformanceSnapshot` records.
- Implement bounded retries and delayed propagation handling.
- Verify platform account, media identity, caption, visibility and publish time.
- Support manual URL verification.
- Store audience-facing evidence artifact.
- Deduplicate completion notifications.
- Keep `published_unverified`, failed and blocked states distinct.

## TDD And Verification Plan

First failing test: provider acknowledgement alone marks success, or wrong
media/account/visibility sends completion notification.

Required tests:

- Delayed-processing verification.
- Identity mismatch rejection.
- Manual URL verification journey.
- Notification dedupe test.
- Audience evidence reference test.

## Security And Guardrails

- Publication success requires audience-facing verification.
- Completion notification fires once after `published_verified`.
- Wrong media, account or restricted visibility is non-success.

## Completion Evidence

- Verification record and evidence artifact.
- Notification ID and dedupe proof.
- Browser screenshot of verification checklist.
- Status transition to `published_verified`.
