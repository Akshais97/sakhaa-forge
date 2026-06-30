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

## Service Credential Rotation

`ServiceCredential.rotationStatus` is `active`, `rotation_due` or `revoked`. The DB
enum is uppercase (`ACTIVE`, `ROTATION_DUE`, `REVOKED`) and the public API lowercases it
at the mapper boundary. V0-A2 rotation is append-style: the prior credential moves to
`revoked`, a fresh `active` row is created with a new `secret-manager://` reference and a
stamped `lastRotatedAt`, and one `service_credential.rotated` audit row is retained
against the prior id. A revoked credential's `secretRef` is never echoed. `rotation_due`
is a schedule marker only; no V0 job auto-rotates credentials.

## Composition

`draft`, `planning`, `validation_failed`, `validated`, `rendering`, `rendered`, `failed`,
`superseded`

V0-C1 reaches `planning`, `validation_failed` and `validated`: a composition instruction is
created in `planning`, then validated against the deterministic AE capability registry and
retained as `validated` (with a CLEAN plan artifact) or `validation_failed` (with every
unsupported item explained). V0-C2 reaches `rendered`: a validated plan rendered through the
deterministic AE worker moves the composition instruction to `rendered` on a succeeded render.
`rendering` and `failed` remain owned by later composition sprints and are present so the enum
is complete up front; `superseded` is reached by a prior final video when a new revision
retains a new `current` final video.

## Render Attempt

`running`, `succeeded`, `failed`

V0-C2 persists a `RenderAttempt` `running` before the AE worker runs, then `succeeded` (final
media retained, output hash set) or `failed` (capability drift, incompatible worker output, or
an unrecovered crash). `running` is a real state: a worker crash leaves the attempt `running`
and the caller resumes with the same idempotency key. The UI lowercases the value and preserves
`unknown` for an uncertain worker outcome.

## Final Video

`current`, `superseded`

V0-C2 retains exactly one `current` `FinalVideo` per composition instruction. A new revision
creates a new row (version N+1, `current`) and supersedes the prior `current` row (set to
`superseded`) without overwriting it, preserving the immutable revision lineage. The UI
lowercases the value.

## Review

Review item: `internal_review`, `client_review`, `change_requested`, `approved`, `rejected`,
`archived`

V0-R1 opens a `ReviewItem` bound to one exact `FinalVideo` version. The review stage is
`internal_review` or `client_review` (DB enum `INTERNAL_REVIEW`/`CLIENT_REVIEW`) and becomes the
initial review item status. A comment against a review item whose bound final video has been
superseded returns `REVIEW_VERSION_STALE` and archives the review item (`archived`) idempotently;
prior comments are preserved and the rejected comment is not appended. The UI lowercases the
value and preserves `unknown` for an unmapped backend status.

V0-R2 records one terminal `ReviewDecision` per review item, bound to the exact final-video
version captured at open time. The decision enum is `ApprovalDecision`
(`APPROVE`/`REJECT`/`REQUEST_CHANGES`); the public API lowercases it. `approve` moves the review
item to `approved`, `reject` to `rejected` and `request_changes` to `change_requested`. A decision
whose `expectedFinalVideoVersion` does not match the captured `finalVideoVersion`, or whose bound
final video has been superseded, returns `REVIEW_VERSION_STALE` (409) and archives the review
item idempotently; no decision is recorded against a superseded version. A second fresh-key
decision on the same review item returns `REVIEW_DECISION_ALREADY_RECORDED` (409); one terminal
decision exists per review item. New revisions never rewrite historical review or lineage
records.

Notification: `pending`, `sent`, `failed`

V0-R1 collapses repeated comment activity on one review item to one logical `Notification`
(unique by workspace + payload hash). The DB enum is `NotificationStatus` (`PENDING`, `SENT`,
`FAILED`); the public API lowercases it. The collapse is reported per-request as a
`duplicateCollapsed` flag (`false` for the first comment, `true` for any subsequent collapsed
comment), not as a separate status value.

## Calendar and Publishing

`draft`, `approved`, `scheduled`, `submitting`, `accepted`, `published_unverified`,
`published_verified`, `failed`, `cancelled`

V0-U1 creates one `CalendarPost` per approved exact final-video version. The DB enum is
`PublishStatus` (`DRAFT`/`APPROVED`/`SCHEDULED`/`SUBMITTING`/`ACCEPTED`/`PUBLISHED_UNVERIFIED`/
`PUBLISHED_VERIFIED`/`FAILED`/`CANCELLED`); the public API lowercases it and preserves `unknown` for
an unmapped value. A scheduled post (`manualExport` false) is created `scheduled` with the
offset-respected UTC `scheduledAt`; a manual-export post (`manualExport` true) is created
`approved` with no `scheduledAt` and a retained manual-export `Artifact`, leaving `manualLiveUrl`
null for the later verification path. The post is bound to the exact version
(`finalVideoSha256` + `finalVideoVersion` + the R2 `approvalToken`); a superseded bound version
returns `PUBLISH_MEDIA_STALE` (409) and a missing approval returns `REVIEW_APPROVAL_REQUIRED` (409).
A past, malformed, offset-less or conflicting schedule returns `PUBLISH_SCHEDULE_INVALID` (422).
New revisions never rewrite historical calendar posts or lineage records. V0-U1 also supports
optimistic-concurrency edits via `PATCH /calendar-posts/{id}` (caller supplies `expectedVersion`
against `CalendarPost.version`); a successful edit increments `version` and recomputes `status`
(`approved` for a manual export, else `scheduled`). An edit is only allowed on an editable
pre-publish post (`scheduled` or `approved`); a post that has progressed past that stage returns
`PUBLISH_POST_LOCKED` (409), and a stale `expectedVersion` returns `RESOURCE_VERSION_STALE` (409).
The 60-second schedule-conflict window is database-protected by a transaction-scoped
`pg_advisory_xact_lock` keyed by `{workspaceId}:{platform}:{account}` on both create and edit.

## Publish Operation

`created`, `submitting`, `accepted`, `unknown`, `processing`, `completed`, `rejected`,
`failed`, `cancelled`

V0-U2 introduces the `PublishOperationStatus` DB enum (uppercase: `CREATED`, `SUBMITTING`,
`ACCEPTED`, `UNKNOWN`, `PROCESSING`, `COMPLETED`, `REJECTED`, `FAILED`, `CANCELLED`) and the
lowercase public mapping above, mirroring `ProviderOperationStatus`. V0-U3 reuses the same enum
for YouTube Shorts publication (no new status values). One `PublishOperation` exists per
`CalendarPost` (one operation per post). `submitting` is the durable pre-network row persisted
before the provider network I/O; `accepted` follows provider acceptance with the external post id
bound; `unknown` marks a timeout after possible acceptance and is reconciled before any retry (the
`reconciledAt` timestamp records reconciliation, not a separate enum value); `processing` models a
YouTube upload accepted but still being processed (the operation is `processing` while the post
stays `accepted`), followed by a verified `publish.processing`/`publish.completed` callback or
reconciliation to `completed`; on `completed` the public post URL is bound and the `CalendarPost`
advances to `published_unverified` in lockstep; `rejected`, `failed` and `cancelled` are terminal.
`unknown` is a real state, never collapsed. The public mapper fails to `unknown` for any unmapped
backend value. The `CalendarPost` `PublishStatus` advances in lockstep with the publish operation
but has no `processing` or `unknown` value: while the provider processes the post stays `accepted`,
and the uncertain `unknown` truth lives on the operation while the post stays `submitting`. A
platform with no V0 publish adapter (`PUBLISH_PLATFORM_UNSUPPORTED`) or an exhausted upload quota
(`PUBLISH_QUOTA_EXHAUSTED`, a pre-flight refusal) writes no `PublishOperation` row, so neither
introduces a publish status.

## Verification

`pending`, `checking`, `processing_wait`, `retry_scheduled`, `verified`,
`verification_failed`, `identity_mismatch`, `visibility_restricted`,
`manual_url_required`

V0-U4 stores `processing_wait`, `verified`, `identity_mismatch` and
`visibility_restricted` on the `PostVerification` row (`VerificationStatus`). `pending`,
`checking` and `retry_scheduled` are UI/workflow states only; `manual_url_required` is a
transient pre-row guard (`VERIFY_MANUAL_URL_REQUIRED` 409), not a stored status. A not-yet-live
provider post is not yet verifiable: provider acknowledgement alone never becomes success, so the
verify endpoint returns `VERIFY_PROCESSING_WAIT` (202) with no `PostVerification` row, and a
still-processing live observation writes a `processing_wait` row that a later verified observation
advances in place. `verified` is the only state that advances the `CalendarPost` to
`published_verified` and sends the one deduplicated `publish_completed` notification.
`identity_mismatch` (wrong account and/or media) and `visibility_restricted` (not visible to the
required audience) are stored non-successes: they retain the audience-evidence artifact, write
`calendar.verification_failed`, and send no notification. `verification_failed` is the umbrella
non-success; the two concrete mismatch states are never silently collapsed to a generic failure in
the UI. The DB enum is uppercase (`VERIFIED` etc.) and the public API lowercases it at the mapper
boundary. `unknown` is preserved as a real state: an unmapped backend verification value fails to
`unknown`, never to a success.

## Creative Lineage Export

`complete`, `incomplete`, `blocked`, `unknown`

V0-A1 `GET /lineage/{finalVideoId}` exports the immutable ancestry of one final video as a bounded,
redacted, hash-manifested record. `complete` means every ancestry kind is retained
(brand_profile, selected_script, avatar_profile, estimate, provider_operation, generated_asset,
composition_instruction, ae_plan, render_attempt, final_video, calendar_post, post_verification,
performance_snapshot_initial). `incomplete` means one or more kinds are missing and named in
`missing` — this is honest, not an error: a lineage whose `selectedScriptId` cannot resolve to a
retained `SelectedScript` is reported incomplete rather than silently trusted. `blocked` means a
final-video `sha256` does not equal its render-attempt `outputHash` and the mismatch is named in
`mismatches`. `unknown` is preserved as a real state for an unrecognised export body. The export
is a record of what was produced, not a prediction of reach, virality, conversion or causal
performance.

## Performance Snapshot

Source: `audience_verification_initial`, `performance_collect_simulator`

V0-A1 anchors one immutable `PerformanceSnapshot` at verification
(`audience_verification_initial`, empty metrics, zero-width window) and appends further immutable
snapshots on `POST /calendar-posts/{id}/performance-collect`
(`performance_collect_simulator`, observation `simulated`, a widened window and populated observed
metrics). Snapshots are append-only: the initial snapshot is never mutated, and a replay of a
collect returns the same row with `replay: true` rather than writing a second. A snapshot read on a
post that is no longer `published_verified` is flagged `stale`. The metrics (views, likes,
comments, shares, saves) are observations of past platform state only, never a prediction,
forecast or promise of reach, virality, conversion or causal performance. `unknown` is preserved as
a real state for an unrecognised snapshot source. The DB enum is uppercase where stored and the
public API lowercases it at the mapper boundary; `observation` is derived from `source` (the
`PerformanceSnapshot` table has no `observation` column).

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
