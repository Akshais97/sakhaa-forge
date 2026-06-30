# V0-U4 Audience-Facing Verification And One Completion Notification Local Verification — 2026-06-29

## Slice

V0-U4: Audience-Facing Verification And One Completion Notification.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/Sprints/V0-U4_AUDIENCE_FACING_VERIFICATION_AND_ONE_COMPLETION_NOTIFICATION_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_JOBS.md`
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

## Owner decisions on unspecified contract dimensions

The canonical contracts named the V0-U4 outcome (independently verify target account, media
identity, caption, visibility and publish time before `published_verified` and exactly one
completion notification) and its failure contract (provider acknowledgement alone is not
success, wrong media/account/visibility sends no notification), but did not name several
operational dimensions. Per CLAUDE.md §1 and §19, the unspecified dimensions were resolved by
owner decision rather than guesswork:

- Exactly-once model: one `PostVerification` row per `CalendarPost` (unique `calendarPostId`), not
  a request idempotency key. The manual `POST /calendar-posts/{id}/verify` endpoint requires no
  `Idempotency-Key`: the row uniqueness is the exactly-once guarantee. A same-post replay returns
  the existing verification with `replay: true` and never calls the verifier again.
- Verification status set: the stored `VerificationStatus` DB enum is `PROCESSING_WAIT`,
  `VERIFIED`, `IDENTITY_MISMATCH`, `VISIBILITY_RESTRICTED` (plus `PENDING`/`CHECKING`/
  `RETRY_SCHEDULED`/`FAILED`/`MANUAL_URL_REQUIRED` for the wider UI/workflow vocabulary).
  `manual_url_required` is a transient pre-row guard (`VERIFY_MANUAL_URL_REQUIRED` 409), not a
  stored status. The DB enum is uppercase; the public API lowercases it at the mapper boundary.
- Delayed propagation: a not-yet-live provider post (`accepted`/`submitting`/`processing`) returns
  `VERIFY_PROCESSING_WAIT` (202) with NO `PostVerification` row — provider acknowledgement alone
  never becomes success. A still-processing live observation writes a `processing_wait` row that a
  later verified observation advances in place (attempts increment). The retry-after is
  `VERIFY_PROCESSING_RETRY_AFTER_MS` (default 60000 ms).
- Bounded retry budget: `V0_VERIFY_MAX_ATTEMPTS` (default 5) for the automatic `verify_post` job
  (V0-A1 territory). The manual endpoint records each attempt and is not itself bounded by the
  budget in V0. The contract does not name a value; the default is flagged for owner confirmation.
- Evidence artifact: a deterministic public content sha256 (`verifyEvidenceSha256`, binding the
  calendar post, approved media identity, live URL, result and observed identity), retained as an
  immutable `Artifact` with `retentionClass "audience-evidence"`, `schemaVersion
  "calendar.verify_evidence.v1"` and `status "CLEAN"`. The sha256 is a public fingerprint and IS
  surfaced; the object key is never surfaced (omitted by `publicArtifact`).
- Notification dedupe: one logical `publish_completed` `in_app` notification per
  `(workspaceId, payloadHash)` where `payloadHash` is `sha256` over the stable
  `workspaceId`+`calendarPostId`+`notificationType`+`recipientUserId` tuple. The recipient is the
  production user who created the calendar post. Dedupe is a pre-find under RLS (not a
  create-then-catch on P2002) so a second verify collapses into the existing notification
  (`duplicateCollapsed: true`) with no duplicate send. `payloadHash` and `recipientUserId` are
  storage secrets and never appear in the API response or rendered UI.
- Initial PerformanceSnapshot: one immutable `PerformanceSnapshot` (source
  `audience_verification_initial`, empty `metrics` object, zero-width window bounded by
  `verifiedAt`) anchored at the verified instant. V0-A1 owns the full `performance_collect` job
  that later populates metrics as fresh immutable rows. The raw `metrics` and server-side
  `sourceHash` stay private.
- No `Idempotency-Key` on verify; no credit op on verify (verification is not a paid, publishing or
  provider-paid action in V0).

## Behaviour verified

- `POST /calendar-posts/{id}/verify` independently verifies the audience-facing live post against
  the approved calendar post. Only Owner, Admin or Client Manager (`schedule_publish_approved_media`)
  may verify; a Reviewer is denied (`PERMISSION_DENIED` 403). No `Idempotency-Key` is required. The
  body carries `workspaceId`, an optional simulator `mode`, and for a manual-export post an
  optional `manualLiveUrl`.
- Provider acknowledgement alone never becomes success: a provider post that is not yet live
  (`accepted`/`submitting`/`processing`) returns `202 Accepted` with a `VERIFY_PROCESSING_WAIT`
  body, a `retryAfterMs` and NO `PostVerification` record. A still-processing live observation
  returns `202` with a `processing_wait` `PostVerification` row that a later verified observation
  advances in place (attempts increment from the prior row).
- A `verified` observation advances the `CalendarPost` to `published_verified`, retains an
  immutable audience-evidence `Artifact` (a public sha256 fingerprint; the object key is never
  surfaced), sends exactly one deduplicated `publish_completed` `in_app` notification, anchors an
  initial immutable `PerformanceSnapshot`, and records a `calendar.verification_completed` audit
  (target type `CalendarPost`, reason `verified`). The `200 OK` response carries `calendarPost`,
  `verification`, `evidenceArtifact`, `notification` and `performanceSnapshot`.
- An `identity_mismatch` observation (wrong account and/or media) returns `VERIFY_IDENTITY_MISMATCH`
  (409), retains the evidence and an `identity_mismatch` `PostVerification` row, records a
  `calendar.verification_failed` audit (reason `identity_mismatch`), and sends NO notification. A
  `visibility_restricted` observation (not visible to the required audience) returns
  `VERIFY_VISIBILITY_RESTRICTED` (409), retains the evidence and a `visibility_restricted` row,
  records a `calendar.verification_failed` audit (reason `visibility_restricted`), and sends NO
  notification. These non-successes are never silently collapsed to a generic failure.
- A manual-export post without a live URL returns `VERIFY_MANUAL_URL_REQUIRED` (409) and verifies
  nothing. When a `manualLiveUrl` is supplied (an `https?://` URL up to 500 chars), it is bound to
  the post (`manualUrlProvidedAt` set) and verified in the same call; on `verified` the manual post
  advances to `published_verified`.
- An already-`published_verified` post replays the existing verification, evidence, notification
  and snapshot with `replay: true` and never calls the verifier again; a second verify collapses the
  notification to `duplicateCollapsed: true` with no duplicate send.
- The public `PostVerification` carries `status` (lowercased), `attempts` (Number),
  `accountMatched`, `mediaSha256Matched`, `captionMatched`, `visibility`, `evidenceArtifactId` and
  `verifiedAt`. The raw observed account, observed media sha256, observed caption, observed
  published at, propagation delay and last error code stay server-side and never appear in the
  response. The evidence object key, notification recipient user id and notification payload hash
  never appear in the response or rendered markup. Cross-workspace and missing posts hide behind
  `WORKSPACE_ACCESS_DENIED` (404) and never leak the owning workspace id.
- The web shell implements the verify workflow at `apps/web/src/verify-workflow.mjs` with pure,
  DOM-agnostic state functions unit tested in Node and a `verifyMarkup` renderer. The workflow is
  never optimistic: it shows `verify-loading`, calls the API (no `Idempotency-Key`), and renders the
  verification result, the audience evidence reference (a public sha256; the object key is never
  rendered), the one notification and the initial performance snapshot, or a calm error.
  `verificationState` maps the known verification statuses and preserves `unknown` as a real state.
  `classifyVerifyError` maps each verify/access problem to a stable banner state
  (`WORKSPACE_ACCESS_DENIED` -> `blocked-hidden`, `PERMISSION_DENIED` -> `forbidden`,
  `VERIFY_IDENTITY_MISMATCH` -> `identity-mismatch`, `VERIFY_VISIBILITY_RESTRICTED` ->
  `visibility-restricted`, `VERIFY_MANUAL_URL_REQUIRED` -> `manual-url-required`,
  `PROVIDER_OUTPUT_INVALID`/`VALIDATION_FAILED` -> `verify-invalid`). `deriveVerifyState` shows the
  `processing-wait` banner with a `retryAfterMs` for a 202 `VERIFY_PROCESSING_WAIT` and never claims
  success while processing; the `verified` banner shows the evidence sha256 and the one notification.
  The unit suite asserts the FORBIDDEN regex never matches the markup and that the evidence object
  key, recipient user id and payload hash never appear.

## Prisma runtime design

The U4 Prisma `verifyCalendarPost` runs under `withActor` (the calling user, not the system actor).
A cross-workspace or missing post returns `WORKSPACE_ACCESS_DENIED` (404) from a tenant-leading
`findUnique` so the caller cannot learn whether a post they do not own exists. Replay is detected
by `findUnique` on `calendarPostId` (unique) before any verifier call: an already-verified post
returns the existing verification, evidence, notification and snapshot with `replay: true` and
never calls the verifier. For a manual-export post the supplied `manualLiveUrl` is bound and the
post re-read inside the transaction before verification. The verifier
(`verifyAudiencePost`, deterministic simulator, refuses a non-`simulator` `VERIFY_MODE`) runs
outside the transaction. The second transaction applies the outcome:

- A `verified` outcome uses `upsert` against `unique(calendarPostId)` to atomically create-or-update
  the `PostVerification` (avoids P2002 inside the interactive transaction), advances the
  `CalendarPost` to `PUBLISHED_VERIFIED`, creates the audience-evidence `Artifact`
  (`objectKey verify-evidence/<workspaceId>/<post.id>.json`, `retentionClass "audience-evidence"`,
  `schemaVersion "calendar.verify_evidence.v1"`, `status "CLEAN"`), pre-finds the notification by
  `payloadHash` under RLS (dedupe, never create-then-catch on P2002) and creates it if absent
  (`notificationType "publish_completed"`, `channel "in_app"`, `status "SENT"`, `sentAt`), creates
  the initial `PerformanceSnapshot` (source `audience_verification_initial`, empty `metrics`,
  zero-width window, server-side `sourceHash`), and writes a `calendar.verification_completed` audit.
- An `identity_mismatch` or `visibility_restricted` outcome upserts the `PostVerification` with
  the matching status and `lastErrorCode`, creates the evidence `Artifact`, and writes a
  `calendar.verification_failed` audit (reason `identity_mismatch` or `visibility_restricted`); no
  notification is created. The controller surfaces `VERIFY_IDENTITY_MISMATCH`/`VERIFY_VISIBILITY_RESTRICTED`
  (409).
- A `processing_wait` outcome upserts a `processing_wait` `PostVerification` (attempts increment)
  and returns `202` with `VERIFY_PROCESSING_WAIT`; no evidence artifact, no notification.
- A not-yet-live provider post returns `202` with `VERIFY_PROCESSING_WAIT` and no row.

The public mappers (`publicPostVerification`, `publicPerformanceSnapshot`) omit the server-private
observed identity, propagation delay, last error code, raw metrics and source hash, and
`publicArtifact` omits the object key. `@updatedAt` fields are auto-managed by Prisma and never set
manually. The new `post_verifications`, `notifications.calendar_post_id` and `performance_snapshots`
tables inherit workspace-isolation RLS keyed on `app.current_workspace_id`; no role is granted an
RLS bypass.

## Red evidence

Command:

```text
node --test tests\integration\calendar-u4.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.verifyCalendarPost is not a function
```

The nine U4 integration tests failed before the verify route, the `verifyCalendarPost` in-memory and
Prisma store functions, the `verify-provider.mjs` simulator, the `PostVerification`/
`PerformanceSnapshot`/`Notification` mappers and controller, and the `verify-workflow.mjs` web
workflow existed. The Prisma runtime proof additionally failed before the `upsert`-on-unique and
pre-find notification dedupe design was applied (an earlier create-then-catch on P2002 aborted the
interactive transaction with `25P02`).

## Green evidence

Command:

```text
node --test tests/integration/calendar-u4.test.mjs
```

Outcome:

```text
✔ U4 never marks a provider-acknowledged-only post verified and sends no completion notification
✔ U4 verifies a live provider post, advances to published_verified and sends one completion notification
✔ U4 rejects a wrong-media identity mismatch with VERIFY_IDENTITY_MISMATCH and sends no completion notification
✔ U4 rejects a restricted-visibility post with VERIFY_VISIBILITY_RESTRICTED and keeps it unverified
✔ U4 models delayed processing: a still-processing platform is VERIFY_PROCESSING_WAIT then verifies on a later check
✔ U4 supports the manual URL verification journey
✔ U4 deduplicates completion notifications across repeated successful verifies
✔ U4 retains the audience evidence reference and never leaks the object key or recipient
✔ U4 hides a cross-workspace verify behind WORKSPACE_ACCESS_DENIED
tests 9
pass 9
fail 0
```

Unit test command and outcome:

```text
node --test tests/unit/verify-workflow.test.mjs
tests 10
pass 10
fail 0
```

The workflow unit suite covers: `verificationState` maps the known statuses and preserves `unknown`;
`classifyVerifyError` maps each verify/access code to a stable banner state; `deriveVerifyState`
shows the `verified` banner with the evidence sha256 and the one notification; the `processing-wait`
banner carries a `retryAfterMs` and never claims success or surfaces a verification record; each
error banner state surfaces from a problem code; the verified markup renders the evidence sha256
without leaking; the processing-wait markup renders a retry and never claims verified; the
cross-workspace verify hides behind the same blocked banner without leaking; the manual live URL
renders on a manual-export verified post without leaking; and an unknown verification status never
renders as a verified state. The FORBIDDEN regex
(`secret|api[_-]?key|signature|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user|observed[_-]?account|observed[_-]?media|credential`)
never matches the markup, and the evidence object key, recipient user id and payload hash never
appear in the descriptor.

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (generate-contracts, db-generate, db-migrate-dev, check-format, lint, typecheck, broad test
glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 386
pass 363
fail 0
skipped 23

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 23
pass 23
fail 0
  ✔ prisma runtime persists V0-U4 audience-facing verification, one notification and initial performance snapshot under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../U1/U2/U3 identity, ... audience-facing verification with
one PostVerification per calendar post, a deterministic verifier simulator, account/media/caption/
visibility/publish-time checks, bounded attempts, an immutable audience evidence artifact, a manual
live URL journey, one deduplicated completion notification bound to the calendar post, an initial
immutable PerformanceSnapshot anchoring the observation window, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2/U1/U2/U3/U4 local verification passed.
```

The 23 skipped tests in the broad glob are the prisma-runtime proof tests intentionally skipped there
and run by the dedicated verification step immediately after, including the V0-U4 runtime proof
against Supabase. All nine verification phases ran green: generate-contracts, db-generate,
db-migrate-dev, check-format, lint, typecheck, the broad test glob, the prisma-runtime proof and
db-validate.

## Pre-existing regression fixed during U4

A prior-session restructure of the `workspace-store.mjs` import block had dropped
`generateScriptVariants` from the `./script-generation.mjs` named imports (the import still listed
`evaluateScriptVariant` onward but omitted `generateScriptVariants`), so the in-memory and Prisma
`createScriptTournament` paths threw `ReferenceError: generateScriptVariants is not defined` and the
17 S1/S2/script-tournament/workflow integration tests returned a generic `500 Internal server error`.
HEAD `workspace-store.mjs` still imported `generateScriptVariants` (so HEAD passed); the regression
was introduced when the ae/meta/youtube/verify provider import blocks were added. The import was
restored (`generateScriptVariants` added back as the first named import from
`./script-generation.mjs`); all 17 previously-failing tests now pass and the broad glob is green
(363 pass, 0 fail). This is a one-line additive import restoration, not a contract change; no
migration or generated-contract regeneration was required for it.

## Migration evidence

One additive Prisma migration: `packages/db/prisma/migrations/0032_v0_u4_audience_facing_verification_and_one_completion_notification`.
It adds the `verification_status` enum, the `post_verifications` table (unique `calendar_post_id`,
the server-private observed-identity columns, the evidence artifact FK), the `performance_snapshots`
table (immutable metrics, zero-width window, server-side `source_hash`), and the nullable
`notifications.calendar_post_id` column with its index and the `notifications_one_logical_per_payload`
unique index. All new tables inherit workspace-isolation RLS keyed on `app.current_workspace_id`; no
role is granted an RLS bypass. `db-migrate-dev.mjs` applies 0032; `db-validate.mjs` extends its
descriptive success line to name U4 and the audience-facing verification clause. The migration is
additive (no destructive change, no rewrite of historical rows).

The runtime-proof test confirms persistence under RLS:

```text
SELECT count(*)::text || ':' || status::text || ':' || attempts::text || ':' ||
       (account_matched IS TRUE)::text || ':' || (media_sha256_matched IS TRUE)::text || ':' ||
       (caption_matched IS TRUE)::text || ':' || (visibility IS NOT NULL)::text
FROM post_verifications WHERE id = '<pv>' AND workspace_id = '<ws>' AND calendar_post_id = '<post>'
  AND provider = 'verify-simulator'
-- result: 1:VERIFIED:1:true:true:true:true

SELECT count(*)::text FROM notifications WHERE workspace_id = '<ws>' AND calendar_post_id = '<post>'
  AND notification_type = 'publish_completed'
-- result: 1   (one deduplicated completion notification; a replay keeps the count at 1)

SELECT count(*)::text FROM performance_snapshots WHERE workspace_id = '<ws>' AND calendar_post_id = '<post>'
  AND source = 'audience_verification_initial'
-- result: 1   (the initial immutable snapshot)

SELECT retention_class || ':' || schema_version || ':' || status || ':' || (object_key IS NOT NULL)::text
FROM artifacts WHERE id = '<evidence>' AND workspace_id = '<ws>'
-- result: audience-evidence:calendar.verify_evidence.v1:CLEAN:true
-- (the object_key is retained server-side but never returned by publicArtifact)
```

The runtime proof also confirms a cross-workspace verify returns `WORKSPACE_ACCESS_DENIED` (404) with
no owning workspace id leak, that an already-verified post replays with `replay: true` and identical
ids (DB counts stay at 1), that an `identity_mismatch`/`visibility_restricted` observation writes no
notification, and that the `calendar.verification_completed` audit is retained once. Signed URLs,
object keys, secrets, the observed account, the observed media sha256, the observed caption, the
observed published at, the propagation delay, the notification payload hash and recipient user id,
and raw provider payloads never appear in any response; the audience-evidence sha256 is the only
public fingerprint surfaced.

## Downstream contract reference

`docs/V0/V0_API.md` (the `POST /calendar-posts/{id}/verify` route with the no-Idempotency-Key,
Owner/Admin/Client Manager permission, the 202/200/409 outcomes, the public mapper field list and
the cross-workspace hiding prose), `docs/V0/V0_DATA_MODELS.md` (the `PostVerification`,
`Notification` and `PerformanceSnapshot` model descriptions with the one-row-per-post,
one-notification-per-payload-hash and immutable-snapshot constraints), `docs/V0/V0_PRISMA_SCHEMA.md`
(the `PostVerification`, `Notification` and `PerformanceSnapshot` representative model blocks with
the RLS no-bypass note), `docs/V0/V0_STATUS_ENUMS.md` (the "Verification" section with the stored
vs transient states and the `unknown` preservation note), `docs/V0/V0_JOBS.md` (the `verify_post`
narrative with the bounded retry budget, processing-wait handling and one-verification-per-post
exactly-once model), `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md` (the post-detail screen with the
new `verify-loading`, `processing-wait`, `identity-mismatch`, `visibility-restricted`,
`manual-url-required`, `verify-invalid`, `verify-failed`, `forbidden`, `blocked-hidden`,
`duplicate-collapsed`, `evidence-shown` and `notification-shown` states), `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
(the `audience_verification_completed` and `completion_notification_sent` U4 paragraphs and the
initial `PerformanceSnapshot` note), `docs/V0/V0_PERMISSIONS.md` (the
`schedule_publish_approved_media` permission extended to name audience verification and the
Reviewer-deny/no-key/cross-workspace-hiding note), and `docs/V0/V0_ERROR_CATALOG.md` (the
`VERIFY_PROCESSING_WAIT` 202, `VERIFY_IDENTITY_MISMATCH` 409, `VERIFY_VISIBILITY_RESTRICTED` 409
and `VERIFY_MANUAL_URL_REQUIRED` 409 rows alongside `NOTIFICATION_DUPLICATE_BLOCKED` 409) record
the V0-U4 contract. The generated OpenAPI document and generated `v0-client.mjs` carry the
`verifyCalendarPost` client method and the 200/202/409 responses on the verify route.

## Browser state evidence

The web shell renders the verify contract at `/posts/{id}` with the `empty`, `loading`,
`verify-loading`, `processing-wait`, `verified`, `verify-failed`, `identity-mismatch`,
`visibility-restricted`, `manual-url-required`, `blocked-hidden`, `forbidden`, `verify-invalid`,
`unknown` and `error` states. The `verify-workflow` unit suite asserts the rendered verified copy
(verification status, provider, attempts, match flags, evidence sha256, one notification, initial
snapshot source, calendar status), the processing-wait copy (a retry with `data-retry-minutes`, never
claiming verified, no verification record), the manual live URL copy on a manual-export verified
post, the cross-workspace blocked-hidden banner, the unknown-status guard, and that no secret,
signature, signed URL, object key, payload hash, recipient user id, raw observed identity value or
raw provider payload appears in the markup. No live browser screenshot is captured in local
verification; the deterministic state functions and `verifyMarkup` renderer are the browser-state
evidence.

## Scope note

This is local deterministic simulator evidence for V0-U4. It does not claim production audience
verification readiness, real verifier handoff or full V0 acceptance. The `verify-simulator` adapter
refuses a non-`simulator` `VERIFY_MODE` so no unbound live verifier call can escape the simulator
boundary; real audience-facing verification integration is deferred. The bounded automatic
`verify_post` retry job is V0-A1 territory and is not claimed here (the manual endpoint records
each attempt; the budget default of 5 and the 60000 ms retry-after are flagged for owner
confirmation). The permission matrix is unit-asserted for the Reviewer-deny path because the
integration harness only creates OWNER memberships. The `unknown` verification state is preserved as
a real state and never rendered as a success. Verification is not a V0 credit op: no reservation,
capture or release occurs. New revisions never rewrite historical calendar posts, verifications,
evidence, notifications, snapshots or audit records. The Prisma concurrency design mirrors U2/G4:
the runtime proof covers sequential verify, replay, dedupe, mismatch, visibility-restricted,
manual-URL, processing-wait and cross-workspace hiding; the one-verification-per-post race is covered
by the `upsert`-on-`unique(calendarPostId)` and the G4 concurrency precedent. No commit was made:
per the standing constraint, implementation stops at green verification with owning docs and this
evidence doc updated, before any git commit.
