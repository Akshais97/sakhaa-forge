# Product V0 Jobs

## Job Types

```text
brand_crawl
brand_asset_validate
viral_candidate_search
media_acquire
thumbnail_decipher
scene_detect
transcribe
keyframe_extract
vision_analyze
ocr_extract
blueprint_merge
formula_derive
director_prompt_generate
script_tournament
provider_generate
ae_plan_validate
ae_render
review_notify
publish_post
verify_post
send_notification
performance_collect
reconcile_provider
reconcile_credit
reconcile_publishing
```

## Canonical State

```text
created -> queued -> leased -> running -> succeeded
                     |          |-> retry_wait -> queued
                     |          |-> failed
                     |          |-> cancel_requested -> cancelled
                     |-> expired -> queued
```

PostgreSQL owns jobs, attempts, dependencies and leases. BullMQ carries opaque wake-ups.
Outbox relay may fail while Redis is unavailable; that failure does not change canonical
job state. The same pending outbox row must relay later without duplicating completion.

`brand_crawl` receives deterministic Firecrawl-like scrape output at worker completion in
simulator mode, or Firecrawl provider output normalised by the server-side adapter into
`brand.extraction.output.v3` in provider mode. The job runs the fixed universal pass from
`Features/Firecrawl/brand-crawl-universal.md` first, then exactly one vertical pass from
`Features/Firecrawl/brand-crawl-verticals.md` using either the user-selected brand type or
the detected `schema_org_type` / `vertical_signals`. The worker payload must include page
source text and any available branding facts needed for later script generation: summary
material, USPs, CTAs, target audiences, prohibited claim language, positive claim
evidence, social proof, voice signals, product/service or project details, colors, fonts,
logo candidates, selected/detected brand type and retained asset references. The Firecrawl
adapter uses bounded crawl scope, `allowExternalLinks:false`, `allowSubdomains:false`,
`ignoreRobotsTxt:false` and the formats specified by the Firecrawl feature guides. The API
stores only evidence-backed `BrandCandidate` rows and private artifacts. Empty, refused,
prompt-injected-without-isolation, malformed or evidence-free output is rejected and
cannot become approved brand truth. A selected/detected brand-type mismatch is retained as
conflict evidence. Raw provider payloads, Firecrawl API keys, object keys, signed URLs,
provider crawl IDs that grant access and prompt material never become job events or
browser responses.

`media_acquire` receives only authorised candidate source references and rights decision
metadata. It may retain a private analysis copy only when the recorded rights decision
allows internal structural analysis. Source-hash mismatch, unsupported retrieval and
reference-only rights are non-retryable blocked states. Low-confidence OCR keeps the
thumbnail stage blocked/partial and stops dependent blueprint stages.

`scene_detect`, `transcribe`, `keyframe_extract`, `vision_analyze` and `ocr_extract`
process the retained P3 analysis copy as independent V0-P4 stages. `transcribe` and
`keyframe_extract` depend on `scene_detect`; `vision_analyze` and `ocr_extract` depend on
`keyframe_extract`. `vision_analyze` uses the GPU resource class; the other P4 stages use
CPU. Each stage output is retained as a private artifact with a schema version and hash.
Empty transcript is `BLUEPRINT_STAGE_INCOMPLETE`; malformed model JSON is
`AI_OUTPUT_SCHEMA_INVALID`; worker timeout and OOM are `BLUEPRINT_STAGE_FAILED`. Partial
or failed stages cannot be promoted to a complete `VideoBlueprint`.

`blueprint_merge`, `formula_derive` and `director_prompt_generate` are V0-P5 canonical
evidence jobs for ready blueprint creation. They validate complete extracted stage
evidence or the approved default formula, derive formula slots and replacement
instructions, and retain a provider-neutral director prompt. Missing required stages
remain `BLUEPRINT_STAGE_INCOMPLETE`; invalid slots remain `BLUEPRINT_FORMULA_INVALID`.

`ae_plan_validate` and `ae_render` are V0-C1/V0-C2 composition jobs. `ae_plan_validate`
validates a composition plan against the deterministic AE capability registry and retains a
CLEAN plan artifact (`validated` or `validation_failed`). `ae_render` renders a validated
plan through the deterministic AE worker simulator: a `RenderAttempt` is persisted `running`
(with a CLEAN render-logs artifact and a `composition.render_started` audit) before the
worker runs, then `succeeded` (a new `current` `FinalVideo` and four CLEAN artifacts —
final-video, final-thumbnail, final-captions, render-logs — retained, golden output hash
set, `composition.render_succeeded` audit) or `failed` (`composition.render_failed` audit).
A new revision supersedes the prior `current` `FinalVideo` without overwriting it
(`composition.video_superseded` audit). A worker crash leaves the attempt `running`; a
same-idempotency-key resume completes the render exactly once, and a fresh attempt during
the crash window is refused with `DEPENDENCY_UNAVAILABLE`. Capability drift is
`AE_CAPABILITY_UNAVAILABLE`; an incompatible worker output is `AE_RENDER_FAILED`; a
non-validated plan is `AE_PLAN_SCHEMA_INVALID`. The AE worker receives no PostgreSQL or
Redis credentials and runs as a deterministic simulator in V0.

## Paid Provider State

```text
created -> submitting -> accepted -> processing -> completed
               |            |             |-> failed
               |            |-> unknown -> reconciled
               |-> unknown
```

Persist the operation and reserve credits before network I/O. A timeout after submission
becomes `unknown`; reconciliation queries by external ID, request hash or original
idempotency key. Blind resubmission is prohibited.

V0-G4 implements this state machine for the `heygen-simulator` route. A durable
`ProviderOperation` is persisted in `SUBMITTING` inside a first short database transaction
**before** the provider network call; the network call runs outside the transaction; a
second short transaction applies the outcome. A simulator `success` outcome advances
`SUBMITTING` → `ACCEPTED` (job `accepted`); a `timeout` outcome advances
`SUBMITTING` → `UNKNOWN` (job `unknown`) and the caller must reconcile before any retry. A
`malformed` outcome returns `PROVIDER_OUTPUT_INVALID` and leaves the operation
`SUBMITTING` for reconciliation. Reconciliation (`reconcile_provider`) re-reads the
provider without blind retry and resolves `UNKNOWN` to `accepted`/`processing`/`completed`/
`failed`/still-`pending`; a verified `video.completed` HeyGen callback
(`POST /callbacks/heygen`, signature-verified, windowed, deduplicated by `eventId`)
advances the operation to `COMPLETED` and the job to `generated` exactly once;
`video.failed` advances to `FAILED`. Cancellation during uncertainty sets the job to
`cancel_requested` and the operation stays `UNKNOWN` for reconcile. The
`heygen-simulator` concurrency limit defaults to 10 (`V0_HEYGEN_CONCURRENCY_LIMIT`, env
1–10); exceeding it returns `PROVIDER_RATE_LIMITED` (429, retryable) with `retryAfterMs`.

V0-G5 settles a terminal paid generation through `reconcile_credit` once the provider
operation is `completed`, `failed`, `rejected` or `cancelled`. Settlement is a billing
action on an already-authorized reservation, not a generation state change: the job stays
`generated`/`failed`. The settle step fetches the completed provider media through the
adapter only, quarantines and validates it, promotes the `Artifact` to `CLEAN`, and binds a
`GeneratedSegment`, a versioned `GeneratedAsset` and a `CreativeLineage` row. The reconciled
`providerTotalMinor` is checked against `estimatedMaximumMinor` before any credit movement:
a `completed` operation captures the unused remainder once (`CAPTURE`, 0 when the actual
total equals the maximum) and moves the reservation to `captured`; a failed/rejected/
cancelled operation releases the full reservation once (`RELEASE`, wallet restored) and
moves it to `released`. The `CAPTURE`/`RELEASE` ledger entries carry job-derived idempotency
keys so a crash between media retention and ledger settlement is recovered once without
orphaned capture or duplicate release. Replay is detected by reservation status, not by the
caller's idempotency key. A cost mismatch refuses settlement
(`PROVIDER_COST_EXCEEDS_AUTHORIZATION`) and corrupt media refuses settlement
(`ASSET_MEDIA_MALFORMED`); neither moves credits. `DEPENDENCY_UNAVAILABLE` (503) marks the
recoverable crash window.

## Publishing State (V0-U2)

```text
created -> submitting -> accepted -> processing -> completed
               |            |             |-> failed
               |            |-> unknown -> reconciled
               |-> unknown
```

V0-U2 implements this state machine for the `meta-simulator` publish route, and V0-U3 reuses the
same state machine for the `youtube-simulator` route, mirroring the V0-G4 provider-operation pattern
but bound to a `CalendarPost` (one `PublishOperation` per post), with no credit reservation or
settlement (publishing is not a V0 credit op). The provider is derived server-side from the calendar
post's `platform` (`meta` -> `meta-simulator`, `youtube-shorts` -> `youtube-simulator`); the request
carries no provider field. The publish is API-driven: a durable `PublishOperation` is persisted
`SUBMITTING` inside a first short database transaction **before** the provider network call; the
network call runs outside the transaction; a second short transaction applies the outcome. The
request `account` must equal the calendar post's bound `account` (`PUBLISH_ACCOUNT_MISMATCH`); a
manual-export post cannot be submitted (`PUBLISH_NOT_SUBMITTABLE`); a platform with no V0 publish
adapter is rejected (`PUBLISH_PLATFORM_UNSUPPORTED`); an exhausted platform upload quota (YouTube:
3 uploads/day per client) is a pre-flight refusal (`PUBLISH_QUOTA_EXHAUSTED`, 429 with
`retryAfterMs`) that runs before any network I/O and writes no operation row — all four checks run
before any provider call. A `success` outcome advances `SUBMITTING` → `ACCEPTED` (post `accepted`)
and binds the external post id; a YouTube `processing` outcome advances `SUBMITTING` → `PROCESSING`
(post stays `accepted`) pending a later `publish.processing`/`publish.completed` callback or
reconciliation; a `timeout` outcome advances `SUBMITTING` → `UNKNOWN` (post stays `submitting`) and
the caller must reconcile before any retry; a `malformed` outcome returns `PROVIDER_OUTPUT_INVALID`
and leaves the operation for reconciliation. Reconciliation (`reconcile_publishing`) re-reads the
provider without blind retry and resolves `UNKNOWN`/`PROCESSING` to
`accepted`/`processing`/`completed`/`failed`/still-`pending`, recording `reconciledAt`; on
`completed` the public post URL is bound and the calendar post advances to `published_unverified`.
A verified `publish.processing` or `publish.completed` callback
(`POST /callbacks/publishing/{provider}`, `x-meta-signature` or `x-youtube-signature` verified in
constant time, windowed, deduplicated by `(workspaceId, source, eventId)` via `inbox_events`)
advances the operation to `PROCESSING`/`COMPLETED` and the post to `accepted`/`published_unverified`
exactly once; `publish.failed` advances to `FAILED`. The `requestHash` is a server-side binding
secret and never appears in a response, job event or callback; the public post URL is the only URL
surfaced and only once the post is live. The Meta and YouTube paths share the contract and stay
isolated: a YouTube quota refusal or processing delay never corrupts the Meta or manual paths.

`verify_post` is the V0-U4 audience-facing verification path. In V0 it is driven by the manual
`POST /calendar-posts/{id}/verify` endpoint (an authorised Owner/Admin/Client Manager; a Reviewer
is denied); the bounded automatic retry job belongs to V0-A1. The deterministic verifier simulator
independently observes the audience-facing live post and reports whether the target account, media
identity (the approved final-video sha256), caption, visibility and publish time match the approved
calendar post. Provider acknowledgement alone never becomes success: a not-yet-live provider post
returns `VERIFY_PROCESSING_WAIT` (202) with no `PostVerification` row, and a still-processing live
observation writes a `processing_wait` row that a later verified observation advances in place.
A `verified` observation advances the `CalendarPost` to `published_verified`, retains an immutable
audience-evidence `Artifact` (a public sha256 fingerprint; the object key is never surfaced), sends
exactly one deduplicated `publish_completed` `in_app` notification, and anchors an initial immutable
`PerformanceSnapshot` (source `audience_verification_initial`, empty metrics, zero-width window).
`identity_mismatch` (wrong account and/or media) and `visibility_restricted` (not visible to the
required audience) are stored non-successes that retain the evidence, write `calendar.verification_failed`,
and send no notification; a manual-export post without a live URL is `VERIFY_MANUAL_URL_REQUIRED`
(409) until one is supplied. The raw observed account, observed media sha256, observed caption,
observed published at, propagation delay and last error code stay server-private. The bounded retry
budget is resolved from `V0_VERIFY_MAX_ATTEMPTS` (default 5) and the retry-after is
`VERIFY_PROCESSING_RETRY_AFTER_MS` (default 60000 ms); the contract does not name these values and
they are flagged in the U4 evidence scope note for owner confirmation. Exactly-once here is the
one-`PostVerification`-row-per-post rule, not a request idempotency key; the manual verify endpoint
requires no `Idempotency-Key`.

## Performance Collection (V0-A1)

`POST /calendar-posts/{id}/performance-collect` is a synchronous, idempotent API write (not a
queued BullMQ job): the deterministic performance simulator observes the verified live post in the
request path and appends one immutable `PerformanceSnapshot` (source
`performance_collect_simulator`, observation `simulated`, a widened observation window and populated
observed metrics). Exactly-once is key-bound: a same-`Idempotency-Key` replay returns the same
snapshot with `replay: true` and writes no second row; a same-key+different-input attempt returns
`IDEMPOTENCY_INPUT_CONFLICT` (409). A not-yet-`published_verified` post returns
`PERFORMANCE_NOT_OBSERVABLE` (409) and writes no snapshot. A `processing_wait` observation returns
`202 Accepted` with `PERFORMANCE_PROCESSING_WAIT`, a `retryAfterMs`
(`PERFORMANCE_PROCESSING_RETRY_AFTER_MS`, default 60000 ms) and no snapshot. The initial
`audience_verification_initial` snapshot anchored at verification is never mutated. The observed
metrics are observations of past platform state only, never a prediction, forecast or promise of
reach, virality, conversion or causal performance. `GET /calendar-posts/{id}/performance` is a
read-only bounded list of every immutable snapshot for the post; a snapshot is flagged `stale` when
the post is no longer `published_verified`.

## Creative Lineage Export (V0-A1)

`GET /lineage/{finalVideoId}` is a read-only export of the immutable ancestry of one final video
(not a queued job). It traverses the `CreativeLineage` row and the publication/observation ancestry
and returns a bounded, redacted, hash-manifested record: `status`
(`complete`/`incomplete`/`blocked`/`unknown`), named `missing`/`mismatches`, the stable
`manifestSha256`, the `cost` attribution, the `providerTimestamps` and the redacted `entries`
(public content sha256 only; object key never surfaces). The export is a record of what was
produced, not a prediction of reach, virality, conversion or causal performance. A cross-workspace
or missing final video hides behind `WORKSPACE_ACCESS_DENIED` (404).

## Pipeline Rules

- Brand approval is a dependency for every production script/generation job.
- Formula derivation requires a valid blueprint or the approved default formula.
- Generation requires a selected script, avatar/route and active credit reservation.
- AE rendering requires a validated plan.
- Review approval requires the exact final-video version.
- Publishing requires approval and schedule/account authorization.
- Completion notification requires audience verification.

## Capacity and Resource Controls

- Concurrency, timeout, retry and maximum payload settings are versioned configuration
  per job type and resource class.
- HeyGen submission respects the configured account limit and `Retry-After`; the current
  pay-as-you-go reference limit is 10 concurrent asynchronous jobs.
- AE rendering defaults to one job per compatible licensed worker until load evidence
  supports a higher value.
- CPU, GPU and AE jobs use separate queues so one resource class cannot starve another.
- Queue-age and oldest-runnable-job metrics alert before the user-facing SLO is breached.
- V0-A2 load-shaped hardening adds four Owner/Admin operational drills behind the
  deterministic simulators. `POST /workspaces/{workspace_id}/b2-benchmark` records a visibly
  `simulated` India-to-B2 transfer latency within the owner-pinned budget and an integer
  minor-unit egress cost. `POST /workspaces/{workspace_id}/backlog-simulation` models a
  deterministic two-hour growth-then-drain backlog curve with a queue-age SLO breach and the
  `duplicatePaidWork: false` / `silentJobLoss: false` invariants; those invariants are
  additionally proven against real queue state by the outbox-relay, lease-expiry and
  dead-letter recovery tests. `POST /workspaces/{workspace_id}/incident-rehearsal` records
  one owner-pinned scenario as a deterministic recovery script with a `forward` or
  `rollback` recovery type. `GET /workspaces/{workspace_id}/operations/alerts` derives
  deterministic alert states — queue-age SLO breach (critical), dead letters (critical),
  lease-expiry spike (warning), retry storm (warning) — from the operational metrics against
  owner-pinned thresholds. A non-simulator provider mode refuses with a 503
  `*_UNAVAILABLE` problem and writes no audit.

## Failure Handling

- Retry only classified transient errors with bounded exponential backoff and jitter.
- Invalid media, policy failure and insufficient credits are non-retryable.
- Lease expiry allows recovery but never two active workers.
- A stale worker lease cannot complete or fail a requeued job.
- Cancellation stops new children; uncertain provider operations reconcile first.
- Unreferenced artifacts are lifecycle-cleaned.
- Exhausted or non-retryable jobs move to `failed`, retain `last_error_code`, emit
  `job.dead_lettered` and remain visible with an Owner/Admin action and audit trail.
