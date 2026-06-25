# Product V0 Status Enums

## Brand

`draft`, `crawling`, `candidates_ready`, `in_review`, `approved`, `rejected`,
`superseded`, `archived`

## Blueprint

`pending`, `media_acquired`, `thumbnail_deciphered`, `scene_detection_done`,
`transcript_done`, `vision_done`, `ocr_done`, `merged`, `formula_done`,
`director_prompt_done`, `ready`

Terminal: `blocked`, `failed`, `archived`

V0-P4 uses `ocr_done` only when all required scene, transcript, keyframe, vision and OCR
stage evidence is valid. Empty, malformed, timed-out, OOM or missing stage outputs stay
`blocked` or `failed` and must not be shown as complete.

## Script Tournament

`draft`, `generating`, `evaluating`, `ready_for_selection`, `selected`, `failed`,
`cancelled`

## Generation

`draft`, `estimating_credits`, `awaiting_confirmation`, `credits_reserved`, `queued`,
`submitting`, `accepted`, `unknown`, `generating`, `generated`, `failed`,
`cancel_requested`, `cancelled`

## Avatars and Consent

Avatar and consent eligibility is derived, not stored as a separate enum. An
`AvatarProfile` carries `kind` (`generic`, `brand_ambassador`, `real_person`),
`likenessScope` and `voiceScope` (`internal`, `campaign`, `limited`) and
`serviceFulfillmentState` (`not_required`, `pending`, `fulfilled`). The linked
`AvatarConsent` carries `evidenceRef` (a secret-manager style reference, never
public), `expiresAt` and `revokedAt`. Derived `eligibility.reason` values are
`eligible`, `consent_required`, `consent_expired`, `consent_revoked` and
`service_pending`, checked in that blocking order. Consent revocation blocks future
use immediately and historical audit records remain. UI labels follow the content
guide (`expired` → "Expired", `revoked` → "Revoked"). No V0 enum collapses these
derived states into a single stored status.

## Composition

`draft`, `planning`, `validation_failed`, `validated`, `rendering`, `rendered`, `failed`,
`superseded`

## Review

`internal_review`, `client_review`, `change_requested`, `approved`, `rejected`, `archived`

## Calendar and Publishing

`draft`, `approved`, `scheduled`, `submitting`, `accepted`, `published_unverified`,
`published_verified`, `failed`, `cancelled`

## Verification

`pending`, `checking`, `processing_wait`, `retry_scheduled`, `verified`,
`verification_failed`, `identity_mismatch`, `visibility_restricted`,
`manual_url_required`

## Credits

Purchase: `initiated`, `pending`, `succeeded`, `failed`, `refunded`, `disputed`

Reservation: `active`, `captured`, `released`, `expired`, `adjusted`

Transitions are validated by domain services, version-checked and written to audit/job
events. Provider-specific raw states are mapped into these enums.
