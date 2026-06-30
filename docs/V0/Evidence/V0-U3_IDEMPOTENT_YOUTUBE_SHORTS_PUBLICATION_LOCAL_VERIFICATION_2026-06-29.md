# V0-U3 Idempotent YouTube Shorts Publication Local Verification — 2026-06-29

## Slice

V0-U3: Idempotent YouTube Shorts Publication.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/Sprints/V0-U3_IDEMPOTENT_YOUTUBE_SHORTS_PUBLICATION_SPRINT.md`
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
- `docs/V0/Source_Notes/V0_SOURCE_CALENDAR_INTEGRATIONS.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Owner decisions on unspecified contract dimensions

The canonical contracts named the V0-U3 outcome (publish the same approved internal publication
contract to YouTube Shorts with quota-aware behaviour and one external post identity) and its
failure contract (quota exhaustion, delayed processing, duplicate retry or account mismatch do not
corrupt the shared publication state), but did not name several operational dimensions. Per
CLAUDE.md §1 and §19, the unspecified dimensions were resolved by owner decision rather than
guesswork:

- Platform string: `youtube-shorts`. The calendar post `platform` is a free `VarChar(40)` (no enum,
  so adding YouTube needs no migration); the publish adapter registry `PUBLISH_PLATFORMS` maps
  `meta` -> `meta-simulator` and `youtube-shorts` -> `youtube-simulator`. The provider is derived
  server-side from `CalendarPost.platform`; the request body carries no `provider` field.
- Quota model: a pre-flight refusal at submit, not a submit outcome. When the YouTube upload quota
  (3 uploads/day per client per `docs/V0/Source_Notes/V0_SOURCE_CALENDAR_INTEGRATIONS.md`) is
  exhausted, the adapter refuses submission BEFORE any network I/O with
  `PUBLISH_QUOTA_EXHAUSTED` (429) and a `retryAfterMs` pointing at the next daily quota window. No
  `PublishOperation` row is written and the provider is never called, so quota failure never creates
  a duplicate or corrupts the Meta/manual paths. The simulator forces exhaustion via
  `V0_YOUTUBE_SIMULATOR_QUOTA=exhausted`; the 3/day rule is the production contract.
- Delayed processing: reuse the existing `PROCESSING` `PublishOperationStatus` value (no new enum).
  A YouTube upload accepted but still being processed keeps the operation `processing` while the
  `CalendarPost` stays `accepted` (the post-level `PublishStatus` has no `processing`). The simulator
  surfaces a `publish.processing` callback (no public URL yet); a later `publish.completed` callback
  or reconciliation drives the operation to `completed` and binds the public short URL.
- Signature header: `x-youtube-signature` for YouTube callbacks (mirroring `x-meta-signature` for
  Meta). The `{provider}` path param selects the adapter, which selects its signature header; the
  controller reads the header via `resolvePublishCallbackAdapter(provider).signatureHeader`.
- Unsupported platform: a platform with no V0 publish adapter (for example `tiktok`; TikTok Direct
  Post is explicitly out of scope per CLAUDE.md §12) is rejected with a new
  `PUBLISH_PLATFORM_UNSUPPORTED` (409) error code before any network I/O and writes no operation row.
  The platform is creatable (free VarChar) but not publishable.
- No Prisma migration: U3 reuses the V0-U2 `publish_operations` table and `publish_operation_status`
  enum unchanged. `provider` is already `VarChar(40)` so `youtube-simulator` fits; `platform` is
  `VarChar(40)` so `youtube-shorts` fits. No schema change, so `db-migrate-dev.mjs` and
  `db-validate.mjs` need no new migration entry (the U2 migration statement checks remain the
  contract anchor); only the db-validate descriptive success line was extended to name U3.

## Behaviour verified

- `POST /calendar-posts/{id}/publish` publishes an approved scheduled calendar post to the provider
  bound to its platform exactly once. The provider is derived server-side from
  `CalendarPost.platform` (`meta` -> `meta-simulator`, `youtube-shorts` -> `youtube-simulator`); the
  request carries no `provider` field. Only Owner, Admin or Client Manager
  (`schedule_publish_approved_media`) may publish; a Reviewer is denied (`PERMISSION_DENIED` 403).
  An `Idempotency-Key` is required; a missing key returns `IDEMPOTENCY_KEY_REQUIRED` (400). The
  response is `202 Accepted`.
- A durable `PublishOperation` is persisted `SUBMITTING` before the provider network I/O so a crash
  between persistence and the network response leaves a resumable operation, never a blind duplicate.
  The operation binds the workspace, the calendar post, the provider route, the idempotency key and a
  server-side `requestHash` (`sha256` over the canonical bound inputs including the provider, so a
  YouTube publish to the same post+account as a Meta publish is distinguishable). The `requestHash` is
  a server-side binding secret and never appears in any response, audit row, analytics event or
  rendered markup.
- A platform with no V0 publish adapter returns `PUBLISH_PLATFORM_UNSUPPORTED` (409) before any
  network I/O and writes no operation row. An exhausted YouTube upload quota returns
  `PUBLISH_QUOTA_EXHAUSTED` (429) with `retryAfterMs` before any network I/O and writes no operation
  row. The request `account` must equal the calendar post's bound `account`; a mismatch returns
  `PUBLISH_ACCOUNT_MISMATCH` (409) and never calls the provider. A manual-export post returns
  `PUBLISH_NOT_SUBMITTABLE` (409). A malformed provider response returns `PROVIDER_OUTPUT_INVALID`
  (422) and no callback.
- A YouTube upload accepted but still being processed returns the operation `processing` while the
  calendar post stays `accepted`; the simulator surfaces a `publish.processing` callback (no public
  URL yet). A timeout after possible acceptance marks the operation `UNKNOWN` and the calendar post
  stays `submitting`; the response carries `unknown: true` and no callback, and the caller must
  reconcile before any retry. Blind resubmission is prohibited: a same-key replay returns the
  existing operation (`replay: true`), and a fresh key for the same post returns
  `IDEMPOTENCY_INPUT_CONFLICT` (409).
- On success the operation advances to `ACCEPTED` with the external post id bound and the calendar
  post advances to `accepted`; a `publish.state_changed` audit is retained (target type `CalendarPost`,
  reason `accepted`). The public short URL is `null` until the post is live. In simulator mode the
  response carries a signed `callback` envelope (`{envelope, signature}`) for the deterministic test
  to post back; the signature is the simulator's HMAC digest (the same affordance as G2/G4/U2), not a
  credential. A `publish.completed` callback (or reconciliation) drives the operation to `completed`,
  binds the public short URL (`https://youtube.example.test/shorts/<externalId>`) and advances the
  calendar post to `published_unverified`.
- A replay with the same `Idempotency-Key` and the same post + account returns the existing operation
  with `replay: true`; the same key against a different post or account returns
  `IDEMPOTENCY_INPUT_CONFLICT` (409). Exactly one `PublishOperation` exists per `CalendarPost`.
- `POST /calendar-posts/{id}/publish/reconcile` reconciles an uncertain publish operation. It never
  resubmits; it resolves `unknown`/`submitting`/`accepted`/`processing` to a terminal state, records
  `reconciledAt`, and on `completed` binds the public short URL and advances the calendar post to
  `published_unverified`. A terminal operation replays with `replay: true`. A calendar post with no
  publish operation returns `PUBLISH_NOT_SUBMITTABLE` (409); a platform with no V0 publish adapter
  returns `PUBLISH_PLATFORM_UNSUPPORTED` (409). The response is `200 OK`.
- `POST /callbacks/publishing/{provider}` is the signed publishing callback receiver. The `{provider}`
  path selects the adapter and its signature header (`meta` -> `x-meta-signature`, `youtube` ->
  `x-youtube-signature`). The handler verifies the header in constant time
  (`crypto.timingSafeEqual`), windows the timestamp (5-minute window), deduplicates by
  `(workspaceId, source, eventId)` via `inbox_events` (where `source` is the adapter source:
  `meta` or `youtube`), and advances the `PublishOperation` and `CalendarPost` in lockstep. A
  `publish.processing` event keeps the operation `processing` while the post stays `accepted`; the
  public post URL is bound only on `publish.completed`. A bad signature or out-of-window callback
  returns `PROVIDER_CALLBACK_INVALID` (401); a malformed envelope returns `PROVIDER_OUTPUT_INVALID`
  (422); both hide cross-workspace existence behind the same 401/422. A replayed callback returns the
  prior response with `duplicate: true` and never transitions a second time. The response is `200 OK`.
- The web shell implements the publish workflow at `apps/web/src/publish-workflow.mjs` with pure,
  DOM-agnostic state functions unit tested in Node and a `publishMarkup` renderer. The workflow is
  never optimistic for the publishing action: it shows `publish-loading`, calls the API with an
  `Idempotency-Key`, and renders the committed operation (status, provider, external id, public URL
  when live) or a calm error. Banner copy is now provider-aware: `platformLabel` derives `Meta` or
  `YouTube` from `calendarPost.platform` (neutral `the provider` for an unknown platform) so the UI
  reflects backend truth instead of a hardcoded provider name. `publishOperationState` maps the nine
  publish operation statuses and preserves `unknown` (including `processing`). `classifyPublishError`
  maps each publish error to a stable banner state, including the new `quota-exhausted`
  (`PUBLISH_QUOTA_EXHAUSTED`) and `platform-unsupported` (`PUBLISH_PLATFORM_UNSUPPORTED`) states.
  `derivePublishState` threads `retryAfterMs` from the 429 problem onto the `quota-exhausted` banner;
  `publishMarkup` renders a calm retry hint (`Retry in about N minutes, or export manually.`) for a
  quota refusal (no operation or calendar post exists for a pre-flight refusal, so this is the only
  extra line). The rendered markup carries only the operation status, provider, the external post id,
  and the public post URL (only when live); the request hash, workspace id and any raw provider
  payload never appear. The unit suite asserts the FORBIDDEN regex never matches the markup and that
  the request hash key never appears.
- Signed URLs, object keys, secrets, the request hash, the external provider account id, the signed
  callback signature and raw provider payloads never appear in any publish response, audit row,
  analytics event or rendered markup. The public short URL is the only URL surfaced and only once the
  post is live. Cross-workspace and missing posts hide behind `WORKSPACE_ACCESS_DENIED` (404) and
  never leak the owning workspace id; a cross-workspace publish returns the same 404.
- The Meta and manual paths are isolated from YouTube: the YouTube adapter, simulator modes, quota
  gate, processing state and `x-youtube-signature` callback are entirely separate from the Meta
  adapter (`meta-simulator`, `x-meta-signature`, `meta.example.test` URL) and from manual export. A
  YouTube quota refusal, processing delay or duplicate retry never corrupts the Meta or manual paths.
  The integration suite asserts the Meta journey still publishes exactly once with the
  `meta-simulator` provider, `meta_` external id prefix and `https://meta.example.test/p/` public URL
  alongside the YouTube tests.
- Prisma schema unchanged: U3 reuses the V0-U2 `publish_operations` table and
  `publish_operation_status` enum. `provider` (`VarChar(40)`) stores `youtube-simulator`;
  `platform` (`VarChar(40)`) stores `youtube-shorts`; `retryAfterMs` stores the quota retry-after. No
  migration is added; the existing RLS policy `publish_operations_workspace_isolation` covers the
  YouTube rows identically. `db-validate.mjs` continues to pass; its descriptive success line was
  extended to name U3 and "Meta and YouTube Shorts publication".

## Prisma runtime design

The U3 Prisma path reuses the established V0-U2 exactly-once publish pattern, dispatched to the
YouTube adapter via the `PUBLISH_PLATFORMS` registry. The adapter is resolved inside the first
`withActor` transaction from `post.platform` (loaded with a tenant-leading predicate so a
cross-workspace caller cannot learn whether a post they do not own already has a publish
operation): an unknown platform returns `PUBLISH_PLATFORM_UNSUPPORTED` (409) from inside the
transaction (clean commit, no writes); the YouTube quota pre-flight (`checkYouTubeQuota`) returns
`PUBLISH_QUOTA_EXHAUSTED` (429) with `retryAfterMs` from inside the transaction when
`V0_YOUTUBE_SIMULATOR_QUOTA=exhausted` (clean commit, no operation row written — quota failure is a
pre-flight, never a submit outcome). The `requestHash` is computed with the adapter `provider` so a
YouTube publish is distinguishable from a Meta publish to the same post+account. The YouTube network
I/O (`submitYouTubePost`) runs outside the transaction; a `processing` outcome advances the operation
to `PROCESSING` (post stays `ACCEPTED`) and the simulator surfaces a `publish.processing` callback
envelope; a `timeout` outcome is `UNKNOWN` (never a blind resubmit); a `malformed` outcome is
`PROVIDER_OUTPUT_INVALID`. The second transaction applies the outcome. `applyPrismaPublishOutcome`
binds `publicUrl` only on `completed` and advances the post to `published_unverified`; the
`processing` branch records `acceptedAt` if unset. `processPublishingCallback` runs under
`withCallbackWorkspace` (system-actor context), resolves the callback adapter from the `{provider}`
path param, verifies the adapter-specific signature in constant time, deduplicates via
`inbox_events` (`source: adapter.source` — `meta` or `youtube`, `idempotencyKey: eventId`), and writes
the inbox event with the adapter source in both the terminal and non-terminal branches. The
`requestHash` is retained on the row but never returned (`publicPublishOperation` omits it and
`workspaceId`). The controller `handlePublishingCallback` reads the signature header via
`resolvePublishCallbackAdapter(provider).signatureHeader` so a single route serves both providers.

## Red evidence

Command:

```text
node --test tests\integration\calendar-u3.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.publishCalendarPost is not a function
```

The ten U3 integration tests failed before the YouTube adapter, the `PUBLISH_PLATFORMS` registry,
the provider-aware store/controller/client wiring, the `quota-exhausted`/`platform-unsupported` web
states and the `PUBLISH_PLATFORM_UNSUPPORTED` error code existed. The Prisma runtime proof
additionally failed before the non-terminal callback branch was made adapter-source-aware (the
YouTube replay callback returned `duplicate: false` because the first YouTube callback wrote its
inbox event with `source: "meta"` instead of `source: "youtube"`); fixed by writing
`source: adapter.source` in both callback branches.

## Green evidence

Command:

```text
node --test tests/integration/calendar-u3.test.mjs
```

Outcome:

```text
✔ U3 publishes an approved scheduled calendar post to YouTube Shorts exactly once and a verified callback drives it to published_unverified
✔ U3 rejects an upload-quota-exhausted publish with PUBLISH_QUOTA_EXHAUSTED and a retry-after and writes no operation
✔ U3 models delayed upload processing: accepted -> processing -> completed via callback and reconcile
✔ U3 rejects a wrong-account YouTube publish with PUBLISH_ACCOUNT_MISMATCH and never calls the provider
✔ U3 treats a YouTube timeout after possible acceptance as unknown and reconciles before any retry
✔ U3 replays the YouTube publish by idempotency key and rejects a same-key different-input conflict
✔ U3 rejects an unsupported platform publish with PUBLISH_PLATFORM_UNSUPPORTED
✔ U3 keeps the Meta publication path isolated from YouTube and publishes to Meta exactly once
✔ U3 hides a cross-workspace YouTube publish behind WORKSPACE_ACCESS_DENIED
✔ U3 rejects a malformed, bad-signature and out-of-window YouTube callback without leaking existence
tests 10
pass 10
fail 0
```

Unit test command and outcome:

```text
node --test tests/unit/publish-workflow.test.mjs
tests 18
pass 18
fail 0
```

The workflow unit suite now covers the U3 additions: `classifyPublishError` maps
`PUBLISH_QUOTA_EXHAUSTED` -> `quota-exhausted` and `PUBLISH_PLATFORM_UNSUPPORTED` ->
`platform-unsupported`; `derivePublishState` uses the `YouTube` provider label in the accepted and
processing banners; the `publish-processing` descriptor carries no public URL while processing; the
`published-unverified` descriptor binds the YouTube public short URL; the `quota-exhausted` banner
carries the `retryAfterMs` and the markup renders the retry hint; the `platform-unsupported` banner
renders the calm export-manually copy; and the processing YouTube operation renders without leaking
secrets. The pre-existing U2 assertions (Meta provider label, accepted/published-unverified/
unknown-checking/publish-failed/blocked-hidden states, FORBIDDEN regex, request-hash absence) still
pass.

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 353
pass 331
fail 0
skipped 22

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 22
pass 22
fail 0
  ✔ prisma runtime persists V0-U3 idempotent YouTube Shorts publication, quota, processing and reconcile under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../R2/U1/U2/U3 identity, ... idempotent Meta and YouTube Shorts
publication with one publish operation per calendar post, a pre-network durable row, a server-side
request hash, a public post URL stored only once live, signature-verified windowed deduplicated
callbacks and unknown-after-timeout reconciliation, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2/U1/U2/U3 local verification passed.
```

The 22 skipped tests in the broad glob are the prisma-runtime proof tests intentionally skipped there
and run by the dedicated verification step immediately after, including the V0-U3 runtime proof
against Supabase. All nine verification phases ran green: generate-contracts, db-generate,
db-migrate-dev, check-format, lint, typecheck, the broad test glob, the prisma-runtime proof and
db-validate.

## Migration evidence

No migration. U3 reuses the V0-U2 `publish_operations` table and `publish_operation_status` enum
unchanged. `provider` is `VarChar(40)` so `youtube-simulator` fits; `platform` is `VarChar(40)` so
`youtube-shorts` fits; `retryAfterMs` already exists for the quota retry-after. The existing RLS
policy `publish_operations_workspace_isolation` covers YouTube rows identically. No
`db-migrate-dev.mjs` or `db-validate.mjs` migration-list entry was added (those lists are extended
only when a new migration is added; U3 adds none). The `db-validate.mjs` descriptive success line
was extended to name U3 and "Meta and YouTube Shorts publication" for honest traceability.

The runtime-proof test confirms persistence under RLS:

```text
SELECT count(*)::text || ':' || status::text || ':' || (external_id IS NOT NULL)::text || ':' ||
       (request_hash IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text || ':' || (accepted_at IS NOT NULL)::text
FROM publish_operations WHERE id = '<op>' AND workspace_id = '<ws>' AND calendar_post_id = '<post>'
  AND provider = 'youtube-simulator' AND operation_type = 'publish_post'
GROUP BY status, external_id, request_hash, public_url, accepted_at
-- result: 1:ACCEPTED:true:true:false:true

SELECT status FROM calendar_posts WHERE id = '<post>' AND workspace_id = '<ws>'
-- result: ACCEPTED   (raw DB returns the uppercase publish_status enum label; the API
--                     response lowercases it to "accepted" via publicCalendarPost)

SELECT status::text || ':' || (completed_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text
FROM publish_operations WHERE id = '<op>' AND workspace_id = '<ws>'
-- result: COMPLETED:true:true   (after the verified YouTube callback; public_url starts with
--                                https://youtube.example.test/shorts/)

SELECT count(*)::text FROM inbox_events WHERE workspace_id = '<ws>' AND source = 'youtube'
  AND idempotency_key = '<eventId>'
-- result: 1   (a replayed YouTube callback is deduplicated to one inbox event with source 'youtube')

SELECT count(*)::text FROM publish_operations WHERE workspace_id = '<ws>'
  AND calendar_post_id = '<quota-post>'
-- result: 0   (a pre-flight quota refusal writes no operation)

SELECT status::text || ':' || (external_id IS NOT NULL)::text || ':' || (accepted_at IS NOT NULL)::text
  || ':' || (public_url IS NOT NULL)::text
FROM publish_operations WHERE id = '<processing-op>' AND workspace_id = '<ws>' AND provider = 'youtube-simulator'
-- result: PROCESSING:true:true:false   (accepted but still processing; no public URL yet)

SELECT status::text || ':' || (reconciled_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text
FROM publish_operations WHERE id = '<processing-op>' AND workspace_id = '<ws>'
-- result: COMPLETED:true:true   (reconcile resolves processing to completed without resubmitting)

SELECT count(*)::text FROM publish_operations WHERE workspace_id = '<ws>'
  AND calendar_post_id = '<tiktok-post>'
-- result: 0   (a rejected unsupported-platform publish writes no operation)
```

The runtime proof also confirms a cross-workspace YouTube publish returns
`WORKSPACE_ACCESS_DENIED` (404) with no owning workspace id leak, that the `publish.state_changed`
audit is retained once, that a replayed publish key returns `replay: true` with exactly one
operation row, that a replayed YouTube callback returns `duplicate: true` with exactly one inbox
event (source `youtube`), that a quota refusal writes no operation, that a processing upload
reconciles to `completed` with `reconciledAt` recorded, and that an unsupported-platform publish
writes no operation. Signed URLs, object keys, secrets, the request hash, the external provider
account id, the signed callback signature and raw provider payloads never appear in any response;
the public short URL is the only URL surfaced and only once the post is live.

## Downstream contract reference

`docs/V0/V0_API.md` (the `POST /calendar-posts/{id}/publish`, `POST /calendar-posts/{id}/publish/reconcile`
and `POST /callbacks/publishing/{provider}` routes retitled "Idempotent Platform Publication
(V0-U2, V0-U3)" with the provider-derived-from-platform, quota, processing and
`PUBLISH_PLATFORM_UNSUPPORTED` prose), `docs/V0/V0_DATA_MODELS.md` (the `PublishOperation` model with
the `youtube-simulator` provider, `retryAfterMs` and processing note), `docs/V0/V0_PRISMA_SCHEMA.md`
(the `PublishOperation` comment with the platform->provider derivation and no-migration note),
`docs/V0/V0_STATUS_ENUMS.md` (the "Publish Operation" section updated to cover YouTube reuse of the
same enum and the no-row quota/unsupported-platform refusals), `docs/V0/V0_JOBS.md` (the publishing
state machine updated for the `youtube-simulator` route, quota pre-flight, `processing` outcome and
`publish.processing` callback), `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md` (the post-detail screen
with the new `publish-processing`, `quota-exhausted`, `platform-unsupported` and
`idempotency-conflict` states), `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md` (the `publish_state_changed`
event updated for the YouTube route, `processing` advance and quota/unsupported refusals),
`docs/V0/V0_ERROR_CATALOG.md` (the new `PUBLISH_PLATFORM_UNSUPPORTED` 409 row alongside the existing
`PUBLISH_QUOTA_EXHAUSTED` 429) and `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` (the new
`YOUTUBE_WEBHOOK_SECRET`, `YOUTUBE_MODE`, `V0_YOUTUBE_SIMULATOR_SECRET`,
`V0_YOUTUBE_SIMULATOR_MODE`, `V0_YOUTUBE_SIMULATOR_QUOTA` and `V0_YOUTUBE_SIMULATOR_RECONCILE` rows in
the Publishing section) record the V0-U3 contract. The generated OpenAPI document and generated
`v0-client.mjs` carry the provider-aware callback header (`x-meta-signature` or `x-youtube-signature`)
and the new 429 quota response on the publish route.

## Browser state evidence

The web shell renders the publish contract at `/posts/{id}` with the `publish-loading`,
`publish-accepted`, `publish-submitting`, `publish-processing`, `unknown-checking`, `reconcile-loading`,
`publish-failed`, `account-mismatch`, `not-submittable`, `quota-exhausted`, `platform-unsupported`,
`callback-invalid`, `post-invalid`, `idempotency-conflict`, `missing-idempotency`, `forbidden`,
`blocked-hidden` and `error` states. Banner copy is provider-aware (`Meta`/`YouTube`/`the provider`
from `calendarPost.platform`). The `publish-workflow` unit suite asserts the rendered
accepted-operation copy (status, provider, external post id, no public URL until live), the
published-unverified copy (YouTube public short URL bound), the processing copy (no public URL while
processing, YouTube provider label), the quota-exhausted copy (retry hint with `data-retry-minutes`),
the platform-unsupported copy, the calm error banners for every publish guard code, the
unknown-status guard, the cross-workspace blocked-hidden banner, and that no secret, signature,
signed URL, object key, request hash or raw provider payload appears in the markup. No live browser
screenshot is captured in local verification; the deterministic state functions and `publishMarkup`
renderer are the browser-state evidence.

## Scope note

This is local deterministic simulator evidence for V0-U3. It does not claim production publication
readiness, real YouTube handoff or full V0 acceptance. The `youtube-simulator` adapter refuses a
non-`simulator`/non-`api` `YOUTUBE_MODE` so no unbound live YouTube call can escape the simulator
boundary; real YouTube integration (and the 3 uploads/day quota enforcement against a real API) is
deferred. The simulator surfaces a signed callback envelope as a test affordance (the same pattern as
G2/G4/U2); the `x-youtube-signature` is the deterministic simulator's HMAC digest, not a credential.
Audience-facing verification is V0-U4 and later and is not claimed here. The permission matrix is
unit-asserted for the Reviewer-deny path because the integration harness only creates OWNER
memberships. The 5-minute callback window, the simulator-only credential model, the one-operation-
per-post unique constraint, the 3/day quota model (simulator-forced via
`V0_YOUTUBE_SIMULATOR_QUOTA=exhausted`) and the `PUBLISH_PLATFORM_UNSUPPORTED` set (V0 supports
`meta` and `youtube-shorts`; `tiktok` is out of scope) are flagged for owner confirmation.
Publishing is not a V0 credit op: no reservation, capture or release occurs. New revisions never
rewrite historical calendar posts, review or lineage records. The Prisma concurrency design mirrors
U2/G4: the runtime proof covers sequential YouTube publish, callback, replay, dedupe, quota refusal,
processing→reconcile, unsupported-platform and cross-workspace hiding; a full multi-process
concurrency proof for the rare one-operation-per-post race is covered by the
`reconcilePrismaPublishRace` path and the G4 concurrency precedent. No commit was made: per the
standing constraint, implementation stops at green verification with owning docs and this evidence
doc updated, before any git commit.
