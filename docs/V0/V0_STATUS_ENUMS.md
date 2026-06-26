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

V0-G3 produces `awaiting_confirmation` at estimate creation and `credits_reserved` once
credits are atomically reserved; the `GenerationJob` is created in `queued`. `submitting`,
`accepted`, `unknown`, `generating`, `generated`, `failed`, `cancel_requested` and
`cancelled` are driven by V0-G4 provider submission and later sprints; `unknown` is
preserved as a real state for uncertain provider outcomes and is never collapsed to
success or failure. The `GenerationJob.status` column stores this enum as a lowercase
string so provider-specific raw states map in without merge or rename.

V0-G4 implements exactly-once provider submission and drives `queued` → `submitting` →
`accepted` → `generating`/`generated`, with `unknown` reached when a timeout follows
possible provider acceptance and `cancel_requested`/`cancelled` for cancellation during
uncertainty. `generating` is entered on a reconciled `processing` provider report;
`generated` is entered on a verified `video.completed` callback (V0-G5 retains the media
and settles credits). `failed` is entered on a `video.failed` callback or a reconciled
`failed` report. `unknown` is never promoted to success or failure without a reconciled
provider outcome or a verified callback.

## Provider Operation

`created`, `submitting`, `accepted`, `unknown`, `processing`, `completed`, `rejected`,
`failed`, `cancelled`

V0-G4 introduces the `ProviderOperationStatus` DB enum (uppercase: `CREATED`, `SUBMITTING`,
`ACCEPTED`, `UNKNOWN`, `PROCESSING`, `COMPLETED`, `REJECTED`, `FAILED`, `CANCELLED`) and
the lowercase public mapping above. `created` is the durable pre-network row; `submitting`
covers the network I/O; `accepted` follows provider acceptance; `unknown` marks a timeout
after possible acceptance and is reconciled (the `reconciledAt` timestamp records
reconciliation, not a separate enum value) before any retry; `processing` and `completed`
follow reconciled provider reports and verified callbacks; `rejected`, `failed` and
`cancelled` are terminal. `unknown` is a real state, never collapsed. The public mapper
fails to `unknown` for any unmapped backend value.

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

V0-G3 creates a reservation in `active` at estimate confirmation, holding the integer
minor-unit authorized maximum against the workspace wallet with one `RESERVE` ledger
debit. V0-G5 settles the hold once the provider outcome is terminal: a `completed`
operation captures the unused remainder (`estimatedMaximumMinor - providerTotalMinor`,
0 when the actual provider total equals the maximum) and moves the reservation to
`captured` with one `CAPTURE` ledger entry; a `failed`/`rejected`/`cancelled` operation
returns the full reservation and moves it to `released` with one `RELEASE` ledger entry.
Settlement is idempotent and append-only (replay is detected by reservation status, not by
the caller's idempotency key), never changes the generation job status, and is recovered
once after a crash between media retention and ledger settlement. `expired` and `adjusted`
are later lifecycle states. The DB enum is uppercase (`ACTIVE` etc.) and the public API
lowercases it at the mapper boundary.

Transitions are validated by domain services, version-checked and written to audit/job
events. Provider-specific raw states are mapped into these enums.
