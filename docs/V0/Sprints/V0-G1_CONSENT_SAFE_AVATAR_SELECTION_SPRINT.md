# V0-G1 Sprint: Consent-Safe Avatar Selection

## Sprint Objective

Allow selection of eligible generic, brand-ambassador or consented real-person avatars
while blocking expired, revoked, missing-evidence or out-of-scope likeness/voice use.

## Source Contracts

- `../V0_PERMISSIONS.md`
- `../V0_SECURITY.md`
- `../V0_DATA_MODELS.md`
- `../V0_STATUS_ENUMS.md`
- `../../Project/Security/PROJECT_SECURITY_PRIVACY_AND_RIGHTS_METHODOLOGY.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Create avatar catalog API and UI.
- Model `AvatarProfile`, `AvatarConsent`, evidence artifacts and audit events.
- Record likeness scope, voice scope, expiry, revocation and brand/workspace eligibility.
- Show unavailable reasons without exposing protected cross-workspace existence.
- Block ineligible avatars from generation estimates and jobs.
- Add service-fulfillment state for custom avatars where applicable.

## TDD And Verification Plan

First failing test: an expired, revoked, missing-evidence or wrong-workspace avatar can
enter a generation estimate.

Required tests:

- Consent expiry and revocation tests.
- Cross-workspace avatar denial.
- Missing evidence blocked state.
- Avatar-selection browser journey.

## Security And Guardrails

- Consent revocation blocks future use immediately.
- Consent evidence is sensitive and must not appear in analytics or public responses.
- Generic avatars must still be labelled honestly; no unsupported performance claims.

## Completion Evidence

- Avatar eligibility matrix.
- Revocation/expiry test output.
- Selection audit record.
- Browser screenshots for eligible and unavailable states.
