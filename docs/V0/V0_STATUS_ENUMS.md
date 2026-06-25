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
