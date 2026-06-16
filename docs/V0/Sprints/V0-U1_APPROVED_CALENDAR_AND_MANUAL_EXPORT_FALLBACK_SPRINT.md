# V0-U1 Sprint: Approved Calendar And Manual Export Fallback

## Sprint Objective

Schedule approved exact media for a platform/account/caption or export a manual package
that can later be verified by live post URL.

## Source Contracts

- `../V0_API.md`
- `../V0_DATA_MODELS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_SCREEN_AND_STATE_INVENTORY.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Create and edit `CalendarPost` records.
- Bind platform, account, caption, media identity, approval and schedule.
- Handle IST and configured timezone display.
- Detect past schedules, invalid schedules and schedule conflicts.
- Generate manual export package artifact.
- Add manual live URL state for later verification.
- Reject stale caption/media/account references.

## TDD And Verification Plan

First failing test: unapproved/superseded media, wrong account, stale caption or invalid
timezone becomes publishable.

Required tests:

- Timezone boundary tests.
- Superseded-media rejection.
- Wrong-account rejection.
- Manual export package test.
- Calendar browser journey.

## Security And Guardrails

- Scheduling does not imply publication.
- Manual export still requires exact approved media identity.
- Platform/account data is workspace-scoped.

## Completion Evidence

- Calendar post ID.
- Manual export artifact hash.
- Browser screenshots for calendar and export fallback.
- Schedule validation test output.
