# Product V0 API

Base path: `/api/v0`. NestJS validates Supabase JWTs and resolves workspace membership.
Long operations return `202 Accepted` with a canonical job.

## Contract Ownership

- A versioned OpenAPI document under the backend API package is the executable contract.
- NestJS DTOs and validation schemas generate the OpenAPI document.
- The Next.js client is generated from that document; browser code must not duplicate
  request or response types manually.
- Every route defines request, success response, RFC 9457 error responses, authorization
  roles, idempotency behavior and pagination where applicable.
- Contract-diff CI blocks undocumented breaking changes to `/api/v0`.

## Browser API

```text
POST   /workspaces                 Idempotency-Key required
POST   /workspaces/{workspace_id}/capabilities  Owner/Admin capability control
GET    /workspaces/{workspace_id}/operations/metrics  Owner/Admin operational metrics
POST   /workspaces/{workspace_id}/service-credentials  Owner/Admin credential metadata
POST   /workspaces/{workspace_id}/simulator-mode       Local/staging simulator control
POST   /workspaces/{workspace_id}/restore-drills       Owner/Admin restore evidence
POST   /workspaces/{workspace_id}/redaction-scan       Owner/Admin log redaction proof
POST   /brands/crawl-runs       Idempotency-Key required; B1 safe brand intake
GET    /brands/crawl-runs/{crawl_run_id}/candidates
POST   /brands/assets/uploads      Idempotency-Key required
POST   /brands/assets/uploads/{artifact_id}/complete
POST   /artifacts/{artifact_id}/downloads
POST   /jobs/simulated-media-processing  Idempotency-Key required; local deterministic F4 round trip
POST   /jobs/dead-letter          Owner/Admin-visible failed job recovery list
POST   /brands/{brand_id}/approvals
POST   /generation-estimates      Requires active approved brand profile
GET    /blueprints                Bounded reusable blueprint library for an approved brand profile
POST   /blueprints/library-entries  Approved reusable blueprint entry creation
POST   /blueprint-requests        Explicit existing/discovery/default path choice
POST   /blueprint-requests/{blueprint_request_id}/ready-blueprint
POST   /viral-candidates/search
POST   /viral-candidates/{candidate_id}/extract-blueprint
POST   /viral-candidates/{candidate_id}/scene-blueprint
POST   /script-tournaments
POST   /script-tournaments/{id}/select
GET    /avatars
POST   /generation-estimates
POST   /generation-estimates/{id}/confirm   Idempotency-Key required; Owner/Admin/Client Manager
POST   /generation-jobs
GET    /generation-jobs/{id}
POST   /generation-jobs/{id}/submit            Idempotency-Key required; Owner/Admin/Client Manager
POST   /generation-jobs/{id}/reconcile         Idempotency-Key required; Owner/Admin/Client Manager
POST   /generation-jobs/{id}/cancel            Idempotency-Key required; Owner/Admin/Client Manager
POST   /generation-jobs/{id}/settle            Idempotency-Key required; Owner/Admin/Client Manager
POST   /composition-plans
POST   /composition-plans/{id}/render
POST   /review-items/{id}/comments
POST   /review-items/{id}/decisions
POST   /calendar-posts
POST   /calendar-posts/{id}/publish
POST   /calendar-posts/{id}/verify
POST   /credit-purchases                          Idempotency-Key required; Owner/Admin/Client Manager
GET    /credit-wallets/{id}/ledger                Owner/Admin/Client Manager; Owner/Admin reconciliation
POST   /credit-wallets/{id}/adjustments           Idempotency-Key required; Owner/Admin only
GET    /jobs/{id}
GET    /jobs/{id}/events
GET    /jobs/{id}/trace
POST   /jobs/{id}/recover
```

`POST /brands/crawl-runs` creates the V0-B1 durable intake record. The API normalizes a
public `http` or `https` website URL, rejects private, link-local, localhost and metadata
targets with `CRAWL_SSRF_BLOCKED`, requires source rights acknowledgement with
`SOURCE_RIGHTS_REQUIRED`, associates clean uploaded artifacts with retained rights basis
and permitted use, then creates `BrandCrawlRun`, `BrandAsset`, `Job` (`brand_crawl`) and
`OutboxEvent` records in one authenticated tenant-scoped operation.

`GET /brands/crawl-runs/{crawl_run_id}/candidates` returns V0-B2 extracted candidates
for one crawl run. Candidates are not approved brand truth. Each candidate keeps
`fieldType`, `value`, `confidence`, `decision: candidate`, `extractionState` and
`sourceEvidence`. Worker completion for `brand_crawl` accepts deterministic Firecrawl-like
scrape output containing page text plus branding facts such as colors, typography, logo
candidates, page title, target audience, CTA and USP text. Refused, empty, schema-invalid
or evidence-free extraction output is rejected with `PROVIDER_OUTPUT_INVALID`.

`POST /brands/{brand_id}/approvals` creates V0-B3 approved brand truth. The request must
name the workspace, crawl run, optimistic profile version, complete required brand
fields, rights attestation and required/prohibited rules. Owner, Admin and Client Manager
may approve. Approval creates immutable `BrandProfile`, `BrandApproval`, `BrandRule` and
`AuditEvent` rows in one tenant-scoped operation, superseding any prior active profile.
Stale optimistic versions return `RESOURCE_VERSION_STALE`, which prevents concurrent
approvals from creating two active profiles.

`POST /generation-estimates` is the first downstream production guard for B3. It accepts
only the active approved brand-profile version for the workspace. Draft, rejected,
revoked, missing or superseded profile IDs return `BRAND_PROFILE_NOT_APPROVED`; historical
lineage may still reference old profiles, but new production cannot use them.

`POST /generation-estimates` is also the V0-G1 consent-safe avatar guard. When the request
supplies an `avatarProfileId`, the API materializes the brand-bound avatar catalogue,
loads the avatar by `workspaceId` and `brandProfileId`, and derives consent eligibility
with the same server logic as `GET /avatars` — the UI disabled state is never trusted. A
missing, nonexistent or cross-workspace avatar is hidden behind
`WORKSPACE_ACCESS_DENIED` (404), never a 409 that leaks existence. A revoked, expired,
missing-evidence or service-pending avatar is rejected with the stable consent codes
`AVATAR_CONSENT_REVOKED`, `AVATAR_CONSENT_EXPIRED` or `AVATAR_CONSENT_REQUIRED`. The
catalogue defines no dedicated service-pending code, so a custom avatar whose service
fulfillment is still pending surfaces as `AVATAR_CONSENT_REQUIRED`: valid likeness and
voice consent is not yet in place. An eligible avatar that enters an estimate writes a
durable `avatar.selected` audit row (target type `AvatarProfile`) retained as selection
lineage; a rejected avatar writes no estimate and no audit. No audit carries consent
evidence. When no `avatarProfileId` is supplied, the estimate is created without an avatar
and no avatar guard or audit applies, preserving the pre-G1 estimate contract.

`GET /blueprints` returns the V0-P1 reusable blueprint library for one workspace and one
active approved brand profile. Results are bounded by `limit` with a cursor, include
compatibility metadata and expose an empty state that requires the user to choose either
new discovery or the approved default formula. Cross-workspace resources use
existence-hiding `WORKSPACE_ACCESS_DENIED`.

`POST /blueprints/library-entries` creates an approved reusable blueprint entry that can
be selected explicitly by an authorised Owner, Admin or Client Manager. The entry stores
workspace, approved brand-profile binding, status and compatibility metadata. Archived
entries are retained but are not eligible for new downstream requests.

`POST /blueprint-requests` creates the downstream request identity for exactly one
explicit path: `existing_blueprint`, `new_discovery` or `default_formula`. Every path
binds the same `workspaceId`, active `brandProfileId`, exact `brandProfileVersion`,
objective type and objective. Existing-blueprint requests reject archived,
incompatible or cross-workspace entries with `BLUEPRINT_INCOMPATIBLE` or hidden 404.
Stale brand-profile versions return `RESOURCE_VERSION_STALE`.

`POST /viral-candidates/search` implements V0-P2 viral candidate discovery for a
`new_discovery` blueprint request. The Xpoz provider is behind a deterministic simulator;
raw provider payloads stay adapter-private. Successful searches return bounded ranked
`ViralCandidate` records, source/right warnings and immutable `MetricSnapshot` records
with observation timestamps and source hashes. Provider timeout, outage, empty result or
malformed payload returns `DISCOVERY_PROVIDER_UNAVAILABLE` and creates no fabricated
candidates. Manual fallback creates a candidate only when provenance, source URL, metrics
and rights basis are provided.

`POST /viral-candidates/{candidate_id}/extract-blueprint` implements V0-P3 media
acquisition and thumbnail deciphering. The request must name the workspace, rights
decision, approved retrieval policy and expected source hash. When rights permit a
retained analysis copy, the API creates `MediaAcquisition`, private clean `Artifact`,
`ThumbnailBlueprint`, `media_acquire` job and audit rows. Reference-only rights,
unsupported retrieval, source-hash mismatch and low-confidence OCR return the stable
blocked errors from the catalog and do not mark blueprint input ready.

`POST /viral-candidates/{candidate_id}/scene-blueprint` implements V0-P4 multimodal
scene blueprinting after a successful authorised P3 extraction. The request names the
workspace, media acquisition, thumbnail blueprint and expected source hash. The API
creates separate `scene_detect`, `transcribe`, `keyframe_extract`, `vision_analyze` and
`ocr_extract` stage jobs, dependency edges, stage artifacts with hashes and scene-level
`VideoBlueprint`/`BlueprintScene` records. Empty transcript returns
`BLUEPRINT_STAGE_INCOMPLETE`; malformed model JSON returns `AI_OUTPUT_SCHEMA_INVALID`;
worker timeout or OOM returns `BLUEPRINT_STAGE_FAILED`. These states include the stage
evidence and never report a complete blueprint.

`POST /blueprint-requests/{blueprint_request_id}/ready-blueprint` implements V0-P5
ready blueprint creation. The request names the workspace and either an extracted
`VideoBlueprint`, an existing ready library entry or the approved default formula path.
Extracted sources must have all required P4 stages succeeded and valid formula slots.
Default and extracted paths return the same `v0.script-input.1` contract with immutable
`BlueprintLibraryEntry`, `FormulaDerivation` and `DirectorPrompt` identities plus
`blueprint_merge`, `formula_derive` and `director_prompt_generate` job evidence. Missing
stage evidence returns `BLUEPRINT_STAGE_INCOMPLETE`; invalid or incomplete formula slots
return `BLUEPRINT_FORMULA_INVALID`; a second ready creation for the same request returns
`RESOURCE_VERSION_STALE`.

`POST /script-tournaments` implements V0-S1 auditable script tournament creation. The
request names the workspace and a P5-ready blueprint request, an optional 10-20
`variantCount` (default 10) and a deterministic `simulatorMode`. Generation binds to the
approved brand profile, formula derivation and provider-neutral director prompt bound to
that ready blueprint; an unapproved brand profile or a draft blueprint returns
`BRAND_PROFILE_NOT_APPROVED` or `BLUEPRINT_STAGE_INCOMPLETE`. The deterministic simulator
generates 10-20 variants and evaluates hook strength, timing, pattern interrupts, CTA,
claims, captions and tone against brand rules and universal prohibited-claim policy,
preserving prompt/model versions, provenance source hashes, a manifest artifact and a
`script_tournament` job. The response exposes every variant, evaluation, job, audit and
bucketed `script_tournament_started`/`script_tournament_completed` analytics; raw prompts and
script text never enter analytics. Fewer than ten valid variants return
`SCRIPT_VARIANT_COUNT_INSUFFICIENT` (409); a policy refusal returns `AI_REQUEST_REFUSED` and
schema-invalid simulator output returns `AI_OUTPUT_SCHEMA_INVALID` (422). No failed
tournament silently advances to selection. The endpoint requires an `Idempotency-Key` and
the `select_blueprint_and_run_scripts` capability.

`POST /script-tournaments/{id}/select` implements V0-S2 immutable selected script
creation. The request names the workspace, tournament, an eligible `variantId` and the
`optimisticTournamentVersion` captured by the comparison tab; an optional `humanOverride`
boolean attests a human choice. The path `{id}` is the authoritative tournament; if the
request body carries a `tournamentId` it must match the path, otherwise the request fails
with `VALIDATION_FAILED` (422) so a malformed or buggy client cannot select tournament B
from tournament A's URL. Selection is a synchronous durable decision: one canonical,
immutable `SelectedScript` is retained per tournament with the actor, tournament, variant,
version and timestamp. The response exposes the selected script, tournament, variant,
evaluation, audit and a bucketed `script_selected` analytics event
(`variant_rank_bucket`, `human_overrode_top_score`); raw script text never enters analytics.
Selection never implies generation approval or credit reservation. A stale comparison tab
returns `RESOURCE_VERSION_STALE` (409); an unevaluated, refused, superseded or foreign
variant returns `SCRIPT_SELECTION_INVALID` (409); a tournament that already has a selected
script returns `SCRIPT_ALREADY_SELECTED` (409) before the stale-version guard, so a retried
tab never overwrites a selection; a cross-workspace tournament is hidden with
`WORKSPACE_ACCESS_DENIED` (404). The claim is concurrency-safe: the tournament is atomically
advanced from `ready_for_selection` to `selected`, so two concurrent selections with
different `Idempotency-Key` values retain exactly one selected script and return
`SCRIPT_ALREADY_SELECTED` to the other, never a duplicate or a 500. Retries with the same
`Idempotency-Key` return the same selection. The endpoint requires an `Idempotency-Key` and the
`select_blueprint_and_run_scripts` capability.

`GET /avatars` returns the V0-G1 consent-safe avatar catalogue for one workspace and
one active approved brand profile. Results are bounded by `limit` with a cursor and
expose generic, brand-ambassador and real-person avatars bound to that brand profile.
Each avatar carries a derived `eligibility` object (`eligible`, `reason`,
`consentExpiresAt`, `consentRevokedAt`) computed from the linked `AvatarConsent`
(evidence, expiry, revocation) and the avatar's service-fulfillment state; eligibility
is never stored as a separate enum. Revoked, expired, missing-evidence or
service-pending avatars are returned with `eligible: false` and a stable reason
(`consent_revoked`, `consent_expired`, `consent_required`, `service_pending`) so the
UI can show why an avatar is unavailable without exposing consent evidence, which is
sensitive and never appears in the response or analytics. A missing or cross-workspace
brand profile is hidden behind `WORKSPACE_ACCESS_DENIED` (404), never a 409 that leaks
existence. The endpoint requires the `manage_avatars_consent` capability (Owner, Admin,
Client Manager). The deterministic consent simulator idempotently materializes the
brand-bound catalogue on first read; V0 defines no public avatar creation or
revocation endpoint, so no client can mutate consent state through `/api/v0`.
The catalogue is the source of truth for the downstream consent guard: `POST /generation-estimates`
loads the supplied `avatarProfileId` from this brand-bound catalogue and rejects
revoked, expired, missing-evidence and service-pending avatars with the stable
`AVATAR_CONSENT_*` codes, so an avatar that is unavailable in the catalogue cannot
enter a paid generation step.

## Credit Wallet, Verified Purchase And Ledger (V0-G2)

`POST /credit-purchases` initiates a verified credit purchase for the deterministic
Razorpay (India, INR) or Stripe (international, non-INR) simulator. The request requires
an `Idempotency-Key` and the `purchase_credits_and_view_wallet_ledger` capability (Owner,
Admin, Client Manager). Provider currency policy is enforced: Razorpay accepts INR only
and Stripe accepts a non-INR currency only; a violation returns `VALIDATION_FAILED` (422).
The API creates one workspace wallet per currency (idempotent on `(workspaceId, currency)`),
a `CreditPurchase` row in the `initiated` state with a simulator `providerReference`, and
responds `202 Accepted` with a signed `checkout` envelope and signature. No payment
instrument detail is ever stored or returned.

`POST /callbacks/razorpay` and `POST /callbacks/stripe` are the authenticated, deduplicated,
replay-protected payment callbacks. The handler verifies the HMAC-SHA256 signature over the
stable envelope with the simulator secret (`PAYMENT_SIGNATURE_INVALID` 401 on mismatch),
rejects replays outside a five-minute timestamp window and deduplicates by
`(workspaceId, provider, providerReference)` via `InboxEvent`. A verified callback
reconciles amount, currency, provider reference and workspace against the initiated
purchase; a mismatch returns `PAYMENT_AMOUNT_MISMATCH` (409) and credits nothing. A matched
callback transitions the purchase to `succeeded`, appends exactly one `PURCHASE` ledger
entry in integer minor units, and credits the wallet. Refund and dispute callbacks append
`REFUND` ledger entries that debit the wallet; the purchase moves to `refunded` or
`disputed`. Ledger entries are append-only; corrections are compensating entries, never
edits to history. A timeout after possible provider acceptance is treated as `unknown` and
reconciled before any retry; uncertain paid operations are never blindly retried.

`GET /credit-wallets/{id}/ledger` returns the append-only wallet ledger in integer minor
units with a running balance per entry, bounded by `limit` (1-50) with a cursor. The
endpoint requires the `purchase_credits_and_view_wallet_ledger` capability. Owner and Admin
also receive a `reconciliation` summary that matches ledger purchase and refund totals
against the deterministic simulator paid totals (`matched`, `mismatched`, or `unknown`);
Client Manager receives the ledger without the reconciliation summary. A missing or
cross-workspace wallet is hidden behind `WORKSPACE_ACCESS_DENIED` (404), never a 409 that
leaks existence, and the other workspace id never appears in the error body.

`POST /credit-wallets/{id}/adjustments` records a compensating credit adjustment as an
append-only `ADJUSTMENT` ledger entry. The request requires an `Idempotency-Key` and the
`adjust_credits` capability (Owner, Admin only; Client Manager is denied with
`PERMISSION_DENIED` 403). A `debit` debits the wallet and a `credit` credits it; the
adjustment never edits history and is reversible only by a further compensating entry. The
public purchase status is normalized to the lowercase `V0_STATUS_ENUMS.md` contract
(`initiated`, `pending`, `succeeded`, `failed`, `refunded`, `disputed`); the ledger `type`
is uppercase (`PURCHASE`, `REFUND`, `ADJUSTMENT`; `RESERVE`, `CAPTURE`, `RELEASE` are
reserved for V0-G3 atomic credit reservation and are not written in V0-G2).

## Versioned Generation Estimate And Atomic Reservation (V0-G3)

`POST /generation-estimates` (extended in V0-G3) binds the estimate to an active
`ProviderPriceVersion` for the `heygen-simulator` route and INR currency, records a
SHA-256 `inputHash` over the selected script, avatar and duration, sets an `expiresAt`
from `V0_ESTIMATE_TTL_MS` (default 15 minutes) and an optimistic `version` of 1, and
returns the price version, the integer-minor-units `maximumAuthorizedMinor`
(48,000 for the 30-second pilot cap), the duration and the expiry. The `inputHash` is a
server-side validation secret and is never returned. The estimate starts in
`awaiting_confirmation`; reservation does not imply provider submission, which is V0-G4.

`POST /generation-estimates/{estimateId}/confirm` is the V0-G3 atomic credit reservation.
The request requires an `Idempotency-Key` and the `confirm_paid_generation` capability
(Owner, Admin, Client Manager), and must echo the `workspaceId`, the estimate `version`,
the `selectedScriptId`, `avatarProfileId` and `durationSeconds` the user saw. The API
rejects, in order, an estimate that is no longer `awaiting_confirmation`
(`CREDIT_RESERVATION_CONFLICT` 409), an optimistic-version mismatch
(`RESOURCE_VERSION_STALE` 409), a changed script/avatar/duration (`ESTIMATE_INPUT_CHANGED`
409, retryable), an expired estimate (`ESTIMATE_EXPIRED` 409, retryable) and a wallet
balance below the authorized maximum (`CREDIT_BALANCE_INSUFFICIENT` 409). A passing
confirmation creates exactly one `GenerationJob` in the `queued` state, one active
`CreditReservation` for the authorized maximum, and exactly one `RESERVE` ledger entry
that debits the wallet in integer minor units, all inside one short database transaction
and before any provider network I/O. The estimate transitions to `credits_reserved` with a
`confirmedAt` timestamp, and a durable `generation.confirmed` audit row (target type
`GenerationJob`) is retained. The response is `202 Accepted` with the estimate, job,
reservation, ledger entry and updated wallet. A replay with the same `Idempotency-Key`
returns the original confirmation and never reserves a second time; a replay with
different details returns `IDEMPOTENCY_INPUT_CONFLICT` (409). Double-click and concurrent
confirmation of the same estimate are guarded by the estimate status check in the
in-memory store and by the partial unique index
`credit_reservations_one_active_per_job_idx` (`status = 'ACTIVE'`) in Postgres, so credits
cannot be reserved twice for one job. A missing or cross-workspace estimate or job is
hidden behind `WORKSPACE_ACCESS_DENIED` (404), never a 409 that leaks existence, and the
other workspace id never appears in the error body.

`GET /generation-jobs/{jobId}` returns the queued generation job and its active
reservation for the workspace. The endpoint requires the `confirm_paid_generation`
capability. A missing or cross-workspace job is hidden behind
`WORKSPACE_ACCESS_DENIED` (404). The job status is the lowercase `V0_STATUS_ENUMS.md`
Generation contract (`queued` in V0-G3); the reservation status is the lowercase
Reservation contract (`active`, `captured`, `released`, `expired`, `adjusted`). Money is
integer minor units everywhere; the input hash, signed URLs, provider payloads and secrets
are never returned.

## Exactly-Once HeyGen Submission (V0-G4)

`POST /generation-jobs/{jobId}/submit` submits a `queued` generation job to the
`heygen-simulator` provider exactly once. The request requires an `Idempotency-Key` and the
`confirm_paid_generation` capability (Owner, Admin, Client Manager), and must echo the
`workspaceId`. The API rejects, in order, a missing or cross-workspace job
(`WORKSPACE_ACCESS_DENIED` 404, before any per-job conflict is observable so cross-tenant
existence never leaks), a job that is not `queued` (`GENERATION_JOB_NOT_SUBMITTABLE` 409),
a second idempotency key for a job that already has a provider operation
(`IDEMPOTENCY_INPUT_CONFLICT` 409), and a workspace at the provider concurrency limit
(`PROVIDER_RATE_LIMITED` 429, retryable, with `retryAfterMs`). A missing `Idempotency-Key`
returns `IDEMPOTENCY_KEY_REQUIRED` (400).

A passing submission persists a durable `ProviderOperation` in `SUBMITTING` inside a first
short database transaction **before** any provider network I/O, so a crash between
persistence and the network response leaves a resumable operation, never a blind duplicate.
The operation binds the workspace, generation job, provider route, idempotency key, a
SHA-256 `requestHash` (server-side binding secret, never returned), the bound price version
and the integer-minor-units `estimatedMaximumMinor`. The provider network call runs outside
the transaction; a second short transaction then applies the outcome. A simulator `success`
outcome advances the operation to `ACCEPTED` with the provider `externalId` and the job to
`accepted`, and the response is `202 Accepted` with the job, the operation and a
simulator-only `callback` envelope (no media URL) the deterministic test harness signs and
posts back. A simulator `timeout` outcome advances the operation to `UNKNOWN` and the job to
`unknown`; the response is `202 Accepted` with `unknown: true` and a `callback: null`, and
the caller must reconcile before any retry. A simulator `malformed` outcome returns
`PROVIDER_OUTPUT_INVALID` (422) and leaves the operation in `SUBMITTING` for reconciliation;
no callback is surfaced. The `requestHash`, provider payloads, signed URLs and secrets are
never returned; the surfaced `callback.signature` is the deterministic simulator's HMAC
digest (the same affordance as G2 `checkout.signature`), not a credential.

`POST /generation-jobs/{jobId}/reconcile` re-reads the provider for an `UNKNOWN` (or
`SUBMITTING`/`ACCEPTED`) operation and advances it to the resolved state without blind
retry. The request requires an `Idempotency-Key`, the `confirm_paid_generation` capability
and the `workspaceId`. A reconcile of an operation that the simulator reports `accepted`
returns the existing `ACCEPTED` operation; a `processing` report advances to `PROCESSING`;
a `completed` report advances to `COMPLETED` and the job to `generated`; a `failed` report
advances to `FAILED` and the job to `failed`; a still-`pending` report leaves the operation
`UNKNOWN` and the response carries `unknown: true`. A missing or cross-workspace job returns
`WORKSPACE_ACCESS_DENIED` (404). The response is `200 OK` (or `202 Accepted` while still
unknown).

`POST /generation-jobs/{jobId}/cancel` requests cancellation of a submitted generation. The
request requires an `Idempotency-Key`, the `confirm_paid_generation` capability and the
workspaceId. A cancel of an `UNKNOWN` operation sets the job to `cancel_requested` and the
operation stays `UNKNOWN` for reconcile (cancellation during uncertainty is uncertain); the
response is `202 Accepted` with `uncertain: true`. A cancel of an `ACCEPTED`/`PROCESSING`
operation that the simulator reports still `pending` sets the job to `cancel_requested`; a
`completed` report rejects cancellation as `GENERATION_JOB_NOT_SUBMITTABLE` (409). A missing
or cross-workspace job returns `WORKSPACE_ACCESS_DENIED` (404). Credit capture and release
on terminal states is V0-G5.

`POST /callbacks/heygen` is the HeyGen webhook receiver. The handler verifies the
`x-heygen-signature` HMAC-SHA256 in constant time over the canonical envelope, enforces a
timestamp window (`V0_HEYGEN_CALLBACK_WINDOW_MS`, default 5 minutes), deduplicates by an
`inbox_events` row keyed `(workspaceId, 'heygen', eventId)`, and rejects a malformed,
bad-signature, stale or unreconcilable callback with `PROVIDER_CALLBACK_INVALID` (401)
without leaking whether the target operation exists. A verified `video.completed` event
advances the operation to `COMPLETED` and the job to `generated` exactly once; a replay
acknowledges the original transition with `duplicate: true` and never transitions twice. A
`video.failed` event advances to `FAILED`. The response is `200 OK`. Provider payloads stay
adapter-private; only the bound external id, status and timestamps are persisted.

## Retained Generated Media And Settled Credits (V0-G5)

`POST /generation-jobs/{jobId}/settle` settles a terminal paid generation by retaining the
completed provider media into private V0 storage through the adapter only, validating and
hashing it, and capturing or releasing the reserved credits exactly once. The request
requires an `Idempotency-Key`, the `confirm_paid_generation` capability (Owner, Admin,
Client Manager) and the `workspaceId`. The response is `202 Accepted`. Settlement never
changes the generation job status (the job stays `generated`/`failed`); it changes the
reservation, the credit ledger and the retained media.

The API rejects, in order, a missing or cross-workspace job (`WORKSPACE_ACCESS_DENIED` 404,
before any per-job state is observable so cross-tenant existence never leaks), a job whose
provider operation is not terminal (`GENERATION_JOB_NOT_SUBMITTABLE` 409), and a missing
`Idempotency-Key` (`IDEMPOTENCY_KEY_REQUIRED` 400). Replay is detected by reservation status
(`captured`/`released`), not by the caller's `Idempotency-Key`, so a replay with a different
key returns `replay: true` and never settles a second time.

For a `completed` operation the store fetches the provider media through the HeyGen adapter
only. The transient provider URL is never retained: the adapter returns only `externalId`,
`sha256`, `durationSeconds`, `contentType`, `byteSize`, `resolution` and
`providerTotalMinor`, and raw provider payloads stay adapter-private. The media is
quarantined into a `QUARANTINED` `Artifact`, validated (SHA-256 hash, non-zero byte size,
positive duration, supported content type, non-negative provider total), then promoted to
`CLEAN` with retention class `clean-media`, producer `job:{jobId}` and schema version
`artifact.generated.v1`. A `GeneratedSegment`, a versioned `GeneratedAsset` (version 1, kind
`provider_video`, status `CLEAN`) and a `CreativeLineage` row are created. The reconciled
`providerTotalMinor` is written onto the provider operation.

The provider total is reconciled against the authorized maximum before any capture. If
`providerTotalMinor > estimatedMaximumMinor` the settlement is refused with
`PROVIDER_COST_EXCEEDS_AUTHORIZATION` (409) and no capture or release is written; the
reservation stays `active` and the wallet is untouched. If the provider media is unreadable
or fails validation the settlement is refused with `ASSET_MEDIA_MALFORMED` (422) and no
capture is written. Media is not clean until artifact validation passes.

Credit settlement is idempotent and append-only. On success a single `CAPTURE` ledger entry
is written with amount `(estimatedMaximumMinor - providerTotalMinor)` in integer minor units
(0 when the actual provider total equals the maximum); the reservation moves to `captured`.
On failure (`failed`/`rejected`/`cancelled` operation) a single `RELEASE` ledger entry is
written with the full reservation amount, the wallet is restored, and the reservation moves
to `released`; no media is retained for a failed operation. The CAPTURE/RELEASE entries carry
job-derived idempotency keys (`g5-capture-{jobId}` / `g5-release-{jobId}`) so crash recovery
re-uses the same key and the store checks for an existing entry before writing, preventing
orphaned capture or duplicate release.

A crash between media retention and ledger settlement is recovered once. In the
`crash_after_retain` simulator mode (`V0_G5_SIMULATOR_MODE`) the first call retains the media
(commits the segment/asset/lineage/artifact and writes `providerTotalMinor`) then returns
`DEPENDENCY_UNAVAILABLE` (503) before the ledger entry; the second call detects the existing
segment, completes the CAPTURE ledger exactly once, and never re-retains or double-captures.
The `requestHash`, provider payloads, transient media URLs, signed URLs and secrets are never
returned; the retained segment `externalId` is the bound provider id, not a URL. Money is
integer minor units everywhere; the artifact trust status is returned UPPERCASE (`CLEAN`/
`REJECTED`) per the V0-F3 AssetTrustStatus contract, the reservation status is lowercase
(`active`/`captured`/`released`) per `V0_STATUS_ENUMS.md`, and the ledger `type` is UPPERCASE
(`CAPTURE`/`RELEASE`).

## Provider Callbacks

```text
POST /callbacks/heygen
POST /callbacks/razorpay
POST /callbacks/stripe
POST /callbacks/publishing/{provider}
```

Handlers preserve raw bytes where signature verification requires them, acknowledge
quickly, persist an inbox record and process asynchronously. Duplicate callbacks produce
one transition.

## Internal Worker API

```text
POST /internal/jobs/{job_id}/claim
POST /internal/jobs/{job_id}/heartbeat
POST /internal/jobs/{job_id}/complete
POST /internal/jobs/{job_id}/fail
POST /internal/jobs/leases/expire
POST /internal/outbox/relay
POST /internal/reconciliation/provider-operations
POST /internal/reconciliation/credits
POST /internal/reconciliation/publishing
```

Workers authenticate with dedicated service identity. Completion supplies expected
object keys, hashes, schemas, byte sizes and lineage. A queue message alone never
authorizes work.

## Standards

- `Idempotency-Key` is required for paid, publishing and costly mutations.
- `Idempotency-Key` is also required for externally visible tenant mutations introduced by
  V0-F2, including `POST /workspaces`, so duplicate submissions replay the original durable
  response and changed input returns `IDEMPOTENCY_INPUT_CONFLICT`.
- RFC 9457 problem details use stable error codes.
- Cursor pagination is mandatory for collections.
- Signed URLs never reveal bucket credentials.
- V0-F3 upload and download contracts are short-lived, workspace-scoped and never logged
  or exposed in cross-workspace error responses.
- Provider payloads are translated into internal contracts.
- Authorization is rechecked when a job is claimed, not only when it is created.
- V0-F4's deterministic simulated media-processing job creates a canonical job and outbox
  row, returns `202 Accepted`, and completes only through authenticated internal worker
  endpoints with validated output hash, object key, byte size and schema version.
- V0-F4 outbox relay treats Redis as wake-up delivery only. Redis loss returns
  `DEPENDENCY_UNAVAILABLE` while PostgreSQL job and outbox rows remain canonical and
  relayable later.
- V0-F4 lease expiry requeues canonical work, rejects stale worker completion and records
  job events. Exhausted or non-retryable worker failure remains visible in the dead-letter
  list with a stable error code.
- V0-F5 workspace capability controls let Owner/Admin disable unfinished or temporarily
  unavailable capabilities such as `media_processing`; disabled capabilities return
  `CAPABILITY_DISABLED` with hidden 404 semantics and create no new job state.
- V0-F5 operations endpoints are Owner/Admin protected. Job trace links request, outbox,
  worker attempts, job events and retained artifacts. Recovery requeues failed canonical
  jobs only when no completion artifact exists. Credential endpoints retain secret-manager
  references, never plaintext secret values. Simulator controls are limited to local,
  test and staging environments. Redaction scans must redact API keys and signed URLs.
- V0-B3 approval endpoints require human approval, optimistic version checks and one
  active approved brand profile per workspace/brand before downstream production use.
- Request body size, upload size, string length, enum and provider-specific limits are
  explicit in validation schemas.
- V0 APIs do not require a V1 or V2 endpoint.
