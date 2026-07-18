# Product V0 API

Base path: `/api/v0`. NestJS validates Supabase JWTs and resolves workspace membership.
Long operations return `202 Accepted` with a canonical job.

## Contract Ownership

For the brand crawl payload content produced behind these API routes,
`Features/Firecrawl/brand-crawl-universal.md` and
`Features/Firecrawl/brand-crawl-verticals.md` are the current sources of truth for passes,
prompts, schemas, fields, asset harvesting and output shapes. This API document owns the
public transport, authentication, authorisation, idempotency, redaction and error contract.

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
POST   /workspaces/{workspace_id}/service-credentials/{credentialId}/rotate  Owner/Admin credential rotation (V0-A2)
POST   /workspaces/{workspace_id}/simulator-mode       Local/staging simulator control
POST   /workspaces/{workspace_id}/restore-drills       Owner/Admin restore evidence
POST   /workspaces/{workspace_id}/redaction-scan       Owner/Admin log redaction proof
POST   /workspaces/{workspace_id}/b2-benchmark         Owner/Admin India-to-B2 transfer benchmark (V0-A2)
POST   /workspaces/{workspace_id}/backlog-simulation   Owner/Admin two-hour load-shaped backlog simulation (V0-A2)
POST   /workspaces/{workspace_id}/incident-rehearsal   Owner/Admin incident/runbook rehearsal record (V0-A2)
GET    /workspaces/{workspace_id}/operations/alerts    Owner/Admin operational alert states (V0-A2)
POST   /brands/crawl-runs       Idempotency-Key required; B1 safe brand intake
GET    /workspaces/{workspace_id}/brands  Bounded recognizable brand library
GET    /brands/{brand_id}/assets           Clean retained assets for one brand
GET    /brands/crawl-runs/{crawl_run_id}
GET    /brands/crawl-runs/{crawl_run_id}/asset-pack
GET    /brands/crawl-runs/{crawl_run_id}/candidates
POST   /brands/crawl-runs/{crawl_run_id}/candidates/{candidate_id}/status
POST   /brands/assets/uploads      Idempotency-Key required
PUT    /brands/assets/uploads/{artifact_id}/content  Local/test signed-upload simulator only
POST   /brands/assets/uploads/{artifact_id}/complete
GET    /users/me/profile
PATCH  /users/me/profile
GET    /onboarding/brand-context
POST   /onboarding/brand-context
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
POST   /avatars/{avatarProfileId}/consent-revocation  Owner/Admin/Client Manager consent revocation (V0-A2)
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
POST   /review-items                            Idempotency-Key required; Owner/Admin/Client Manager
GET    /review-items                             Owner/Admin/Client Manager
GET    /review-items/{id}                        Owner/Admin/Client Manager/Reviewer
POST   /review-items/{id}/comments               Idempotency-Key required; Owner/Admin/Client Manager/Reviewer
GET    /review-items/{id}/comments                Owner/Admin/Client Manager/Reviewer
POST   /review-items/{id}/decisions               Idempotency-Key required; Owner/Admin/Client Manager
POST   /calendar-posts                            Idempotency-Key required; Owner/Admin/Client Manager (V0-U1)
PATCH  /calendar-posts/{id}                       Idempotency-Key required; Owner/Admin/Client Manager (V0-U1 edit)
POST   /calendar-posts/{id}/publish               Idempotency-Key required; Owner/Admin/Client Manager (V0-U2, V0-U3)
POST   /calendar-posts/{id}/publish/reconcile     Idempotency-Key required; Owner/Admin/Client Manager (V0-U2, V0-U3)
POST   /calendar-posts/{id}/verify                 No Idempotency-Key; Owner/Admin/Client Manager (V0-U4)
GET    /lineage/{finalVideoId}                     Owner/Admin/Client Manager (V0-A1); NOT Reviewer
POST   /calendar-posts/{id}/performance-collect     Idempotency-Key required; Owner/Admin/Client Manager (V0-A1)
GET    /calendar-posts/{id}/performance             Owner/Admin/Client Manager (V0-A1); NOT Reviewer
POST   /credit-purchases                          Idempotency-Key required; Owner/Admin/Client Manager
GET    /credit-wallets/{id}/ledger                Owner/Admin/Client Manager; Owner/Admin reconciliation
POST   /credit-wallets/{id}/adjustments           Idempotency-Key required; Owner/Admin only
GET    /jobs/{id}
GET    /jobs/{id}/events
GET    /jobs/{id}/trace
POST   /jobs/{id}/recover
```

`POST /brands/crawl-runs` resolves or creates the workspace-owned `Brand` by normalized
domain, returns that stable identity and creates the V0-B1 durable intake record. The API normalizes a
public `http` or `https` website URL, rejects private, link-local, localhost and metadata
targets with `CRAWL_SSRF_BLOCKED`, requires source rights acknowledgement with
`SOURCE_RIGHTS_REQUIRED`, accepts an optional `brandType` from the documented V0 brand
type set, associates clean uploaded artifacts with retained rights basis and permitted
use, then creates `BrandCrawlRun`, `BrandAsset`, `Job` (`brand_crawl`) and `OutboxEvent`
records in one authenticated tenant-scoped operation. Unsupported brand types return
`VALIDATION_FAILED`; the selected type changes the vertical Firecrawl pass only and does
not approve brand truth. Returned `BrandAsset` rows include the retained artifact ID plus
review-safe display metadata (`name`, `category`, `locator` as `artifact:{artifact_id}`),
rights basis and permitted use; they do not include object keys or signed URLs. Every
created crawl run, asset and candidate carries the resolved `brandId`.

`POST /brands/assets/uploads` returns a short-lived private upload destination. The browser
must `PUT` the actual bytes before calling completion. Completion reads the retained object,
verifies byte size and SHA-256, then promotes it from the quarantine bucket to the clean
media bucket; a declaration without retained bytes is rejected. When an existing
`brandId`, rights basis and permitted use are supplied, the clean artifact is addressable
from that brand library without requiring another crawl. The `PUT .../content` route is
only the deterministic local/test signed-upload simulator; B2 deployments return an S3
compatible signed URL.

`GET /workspaces/{workspace_id}/brands` returns at most 100 active recognizable brands for
the authorised workspace. `GET /brands/{brand_id}/assets` returns at most 200 active clean
asset references for that brand. Both routes enforce tenant isolation and return no object
keys, provider payloads or storage credentials. Browser clients treat returned
`artifact:{artifact_id}` locators as opaque references. To render a clean private asset,
the generated client calls `POST /artifacts/{artifact_id}/downloads` with the workspace
context and assigns only the returned short-lived URL to media `src` or download `href`.
The media component may request one fresh URL after an expired or failed retrieval; a
second failure ends in an unavailable state rather than exposing the opaque locator.
Cross-workspace, missing and non-clean artifacts retain the tenant-hiding 404 response.

`GET /brands/crawl-runs/{crawl_run_id}` is the refresh-safe detail read used by
`/app/branding?crawlRunId=<uuid>` and workspace crawl-run detail pages. It returns the
canonical crawl run, job status, redacted crawl progress, sanitized policy warnings and
artifact reference IDs only when the actor is authorised for the workspace. It never
returns Firecrawl raw payloads, provider credentials, signed URLs, object keys, prompts
or worker lease tokens. It also returns associated `brandAssets` with the same review-safe
display metadata used by the intake response so direct uploads can appear in the asset
review surface before or after extraction.

`GET /brands/crawl-runs/{crawl_run_id}/asset-pack` returns grouped candidate summaries for
the branding UI: brand identity, universal visual identity, messaging, offers,
trust/proof, media inventory, voice, selected/detected brand type, vertical assets,
compliance/rights, missing assets and readiness. The response is a review surface only;
it does not approve brand truth and does not expose raw provider payloads.

`POST /brands/crawl-runs/{crawl_run_id}/candidates/{candidate_id}/status` retains an
`approved` or `rejected` review decision for the authenticated crawl-run tuple. A `404`
intentionally covers both a missing tuple and a tuple hidden by workspace isolation; the
response must not reveal whether the candidate exists in another workspace or crawl run.
The browser does not update the visible candidate decision before a successful generated
client response. A tenant-hidden 404 leaves the prior state intact and asks the actor to
reload the current crawl session.

`GET /users/me/profile`, `PATCH /users/me/profile`, `GET /onboarding/brand-context` and
`POST /onboarding/brand-context` are V0 branding-context helpers for optional onboarding
and profile state. Skipped or absent onboarding means brand extraction applies universal
asset groups only. Selected industry context may request the relevant overlay, but the
server still treats extracted values as candidates until approval.

`GET /brands/crawl-runs/{crawl_run_id}/candidates` returns V0-B2 extracted candidates
for one crawl run. Candidates are not approved brand truth. Each candidate keeps
`fieldType`, `value`, `confidence`, `decision: candidate`, `extractionState` and
`sourceEvidence`. Worker completion for `brand_crawl` accepts deterministic Firecrawl-like
scrape output, or Firecrawl adapter output normalised to `brand.extraction.output.v3`.
The v3 output contains the fixed universal pass from
`Features/Firecrawl/brand-crawl-universal.md`, one vertical pass from
`Features/Firecrawl/brand-crawl-verticals.md`, selected and detected brand type evidence,
retained asset references, page text and branding facts such as colors, typography, logo
candidates, page title, target audience, CTA, USP, social proof, voice, product/service
details and claim evidence. Refused, empty, schema-invalid or evidence-free extraction
output is rejected with `PROVIDER_OUTPUT_INVALID`. A selected/detected brand-type
disagreement creates a conflict candidate and does not silently override either value.

`POST /brands/{brand_id}/approvals` creates V0-B3 approved brand truth. The request must
name the workspace, crawl run, optimistic profile version, complete required brand
fields, rights attestation and required/prohibited rules. Owner, Admin and Client Manager
may approve. Approval creates immutable `BrandProfile`, `BrandApproval`, `BrandRule` and
`AuditEvent` rows in one tenant-scoped operation, superseding any prior active profile.
Stale optimistic versions return `RESOURCE_VERSION_STALE`, which prevents concurrent
approvals from creating two active profiles. The browser submits this operation through
the generated authenticated client and shows approved state only after the canonical 201
response supplies the retained profile, approval, rules and audit records. It does not
invent an approval hash or infer approval from an in-flight request.

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
brand-bound catalogue on first read; V0 defines no public avatar creation endpoint,
so no client can synthesize an avatar through `/api/v0`.
The catalogue is the source of truth for the downstream consent guard: `POST /generation-estimates`
loads the supplied `avatarProfileId` from this brand-bound catalogue and rejects
revoked, expired, missing-evidence and service-pending avatars with the stable
`AVATAR_CONSENT_*` codes, so an avatar that is unavailable in the catalogue cannot
enter a paid generation step.

`POST /avatars/{avatarProfileId}/consent-revocation` (V0-A2) records a real consent
revocation for one avatar, bounded by the avatar's workspace and brand profile. The
request requires the `manage_avatars_consent` capability (Owner, Admin, Client Manager)
and a non-empty `reason` (≤ 500 chars). Revocation is monotonic and idempotent: the first
call stamps `revokedAt` and `revokedByUserId`, returns the avatar with
`eligibility.reason: "consent_revoked"`, and writes one `consent.revoked` audit row; a
repeat call against an already-revoked avatar returns the same state and writes no
additional audit row. An avatar without a prior consent record is rejected with
`AVATAR_CONSENT_REQUIRED` (409). A revoked avatar is immediately blocked at
`POST /generation-estimates` with `AVATAR_CONSENT_REVOKED` (409), with no evidence ref
or consent URL surfaced. A missing, non-owned or cross-workspace avatar or brand profile
is hidden behind `WORKSPACE_ACCESS_DENIED` (404); the response never echoes the
workspace or brand identifiers of the denied object.

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

## Validated Composition Intent And AE Plan (V0-C1)

`POST /composition-plans` synchronously validates a composition intent bound to a retained
generated asset against the deterministic AE capability registry. Composition planning is
not a paid or externally visible mutation, so no `Idempotency-Key` is required and no credit
ledger entry is written. The caller supplies the workspace, the retained generated asset id,
the input mode (`structured`) and optional raw direction, plus a versioned timeline
(`schemaVersion` `ae.plan.v1`, `capabilityVersion` `ae.local.1`, `durationSeconds`,
`resolution`, `tracks`, `overlays`, `effects`, `fonts`, `plugins`, `templates`). The
registry is the only source of supported fonts, plugins, templates, effects, codecs, safe
zones, duration bounds, resolutions and the AE worker capability version; the LLM cannot
invent assets, fonts, plugins or effects.

A valid plan is retained as `validated` with a CLEAN plan artifact (`Artifact` row,
`application/json`, retention class `plan-artifact`, producer `composition:{instructionId}`,
schema version `ae.plan.v1`). The response carries the composition instruction, the AE plan
(status, capability version, schema version, plan version, plan artifact id, explained
unsupported items), the plan artifact (status, content type, sha256, retention class) and a
`composition.plan_validated` audit. A malformed plan or capability mismatch is retained as
`validation_failed` with every unsupported item explained; the response is an RFC 9457
problem with the primary error code, `planStatus: "validation_failed"`, `compositionId`,
`planId` and the full `unsupported` list, plus a `composition.validation_failed` audit. The
primary error code follows the catalog priority `AE_PLAN_SCHEMA_INVALID` (422) >
`AE_CAPABILITY_UNAVAILABLE` (409) > `AE_ASSET_MISSING` (422) > `AE_TIMELINE_INVALID` (422).
A referenced asset that is missing, cross-workspace or not clean is reported as
`AE_ASSET_MISSING` so cross-workspace existence never leaks; a missing workspace is hidden
behind `WORKSPACE_ACCESS_DENIED` (404). Only Owner, Admin or Client Manager
(`select_blueprint_and_run_scripts`) may create a plan. The timeline JSON, plan artifact
sha256 and referenced asset ids are retained server-side only and never appear in the
response.

`POST /composition-plans/{id}/render` renders a validated composition plan into one retained
9:16 final MP4, thumbnail and captions through the deterministic AE worker. Render is a costly
mutation producing retained artifacts, so an `Idempotency-Key` is required and the
`RenderAttempt` is persisted `running` (with a CLEAN render-logs `Artifact` and a
`composition.render_started` audit) before the worker runs — the external side-effect operation
is persisted before the work. Render idempotency is input-bound, not key-bound: the request is
hashed over `compositionInstructionId`, `aePlanId`, the plan canonical hash, the input asset
hashes and the capability version, and the same `Idempotency-Key` replays or resumes only when it
hashes to the same input for the same composition; the same key against a different composition,
plan, input assets or capability version returns `IDEMPOTENCY_INPUT_CONFLICT` (409) and creates
no final video and no attempt. The worker output is validated against the plan (capability
version, plan input hash, codec, resolution, duration, deterministic golden output hash) before
any final media is retained. A succeeded render retains a versioned `FinalVideo` (`current`)
with an immutable revision lineage: a new revision creates a new row (version N+1, `current`)
and supersedes the prior `current` row (set to `superseded`) without overwriting it, with a
`composition.video_superseded` audit; the final-video sha256 is the deterministic golden render
hash, so the same plan renders to the same hash across revisions. A succeeded render also
retains a V0-C2 render-level `CreativeLineage` row that binds the final video back through the
composition instruction, AE plan and render attempt that produced it (copying the V0-G5
generated-asset ancestry in-row); a revision creates a new render-level lineage row for the new
final video and never overwrites the prior row. The render response carries the render attempt
(status, version, output hash), the final video (status, version, resolution, codec, duration,
capability/schema version, golden render hash), the render-level creative lineage (generation
job id null, composition instruction id, AE plan id, render attempt id, final video id), the
composition (status `rendered`), the four CLEAN artifacts (final-video `video/mp4`,
final-thumbnail `image/jpeg`, final-captions `text/vtt`, render-logs `application/json`), the
`composition.render_succeeded` audit, and for a revision the superseded final video and
`composition.video_superseded` audit. The plan input hash, input asset hashes, idempotency input
hash, artifact object keys, signed URLs, the render-logs payload contents and raw worker
payloads never appear in the response; artifact ids and sha256s are surfaced as public content
fingerprints, and the golden render hash is surfaced as the final-video sha256 and the render
attempt output hash. A worker crash returns `DEPENDENCY_UNAVAILABLE` (503, retryable) with the
`running` attempt persisted; a second call with the same idempotency key and input resumes and
completes, and a further replay returns the same final video, attempt and lineage. Capability
drift returns `AE_CAPABILITY_UNAVAILABLE` (409) and incompatible worker output returns
`AE_RENDER_FAILED` (422); neither retains a final video, both report `attemptStatus: "failed"`
with `compositionId` and `attemptId`. A non-validated plan returns `AE_PLAN_SCHEMA_INVALID`
(422). Cross-workspace and missing workspaces hide behind `WORKSPACE_ACCESS_DENIED` (404). Only
Owner, Admin or Client Manager (`select_blueprint_and_run_scripts`) may render a plan. A
missing `Idempotency-Key` returns `IDEMPOTENCY_KEY_REQUIRED` (400).

## Exact-Version Review And Comments (V0-R1)

`POST /review-items` opens a review item bound to one exact final-video version, capturing
`finalVideoId`, `finalVideoSha256`, `finalVideoVersion` and `compositionInstructionId` from the
retained `FinalVideo` at open time. The bound final video must be `current`; an
already-superseded final video returns `REVIEW_VERSION_STALE` (409) and opens no review item.
One review item exists per workspace + final video: the create is resource-bound find-or-create,
so a second open for the same exact version with a fresh `Idempotency-Key` replays the same
review item and the retained `review.created` audit rather than creating a second item. The open
mutation is also key-bound (input-bound) through `runIdempotent` with operation
`review.item.create`: the idempotency input is `workspaceId` + `finalVideoId` + `reviewStage`, so
the same `Idempotency-Key` with the same input replays the same review item, and the same
`Idempotency-Key` with different input (a different `finalVideoId` or `reviewStage`) returns
`IDEMPOTENCY_INPUT_CONFLICT` (409) and opens no review item. The resource-level
one-review-item-per-final-video replay and the key-bound replay compose: a fresh key for the same
final video replays the one review item, while a reused key with a different final video is
rejected before any review item is written. The
review stage is `internal_review` or `client_review` and becomes the initial review item
status. The response carries the review item (id, status, review stage, final video id/sha256/
version, composition instruction id, created-by user id) and the `review.created` audit (target
type `ReviewItem`). An `Idempotency-Key` is required; a missing key returns
`IDEMPOTENCY_KEY_REQUIRED` (400) and an invalid review stage returns `VALIDATION_FAILED` (422).

`POST /review-items/{id}/comments` adds a timestamped append-only comment (1–2000 characters,
`timestampMs` ≥ 0). Comment idempotency is key-bound: the same `Idempotency-Key` with the same
input replays the same comment and notification, and with different input returns
`IDEMPOTENCY_INPUT_CONFLICT` (409). A comment against a review item whose bound final video is no
longer `current` (superseded) returns `REVIEW_VERSION_STALE` (409), archives the review item
idempotently under RLS, and preserves prior comments; the rejected comment is not appended. A
second open for an already-superseded final video is also `REVIEW_VERSION_STALE`. Repeated
comment activity on one review item collapses to one logical notification, unique by workspace +
payload hash (over `workspaceId`, `reviewItemId`, `notificationType`, `recipientUserId`): the
first comment creates the notification (`duplicateCollapsed` false), and any subsequent comment
collapses to the same notification (`duplicateCollapsed` true) with no second notification row.
The response carries the comment (author user id, body, timestamp ms, thread id), the review
item, the notification (id, notification type, channel, status, `duplicateCollapsed`), and the
`review.comment_added` audit (target type `ReviewItem`). Only Owner, Admin, Client Manager or
Reviewer (`submit_review_comments`) may comment.

`GET /review-items/{id}` returns the review item, a preview of the bound final video and its
CLEAN artifacts (final-video, thumbnail, captions as public artifacts), and the preserved
comments in creation order. `GET /review-items` lists review items for a workspace newest first
with cursor pagination. `GET /review-items/{id}/comments` lists the append-only comments in
creation order with cursor pagination. All three require `submit_review_comments` except
`GET /review-items`, which requires `select_blueprint_and_run_scripts`.

`POST /review-items/{id}/decisions` records one terminal, auditable approval decision bound to
the exact final-video version captured when the review item was opened
(`finalVideoSha256`, `finalVideoVersion`). Only Owner, Admin or Client Manager
(`approve_reject_final_video`) may record a decision; a Reviewer is denied. The decision is one
of `approve`, `reject` or `request_changes` (`normalizeApprovalDecision` rejects anything else
with `VALIDATION_FAILED` 422) and an optional `reason` (≤ 2000 characters). An
`Idempotency-Key` is required; a missing key returns `IDEMPOTENCY_KEY_REQUIRED` (400).
Decision idempotency is key-bound: the same `Idempotency-Key` with the same input replays the
same decision and audit, and with different input returns `IDEMPOTENCY_INPUT_CONFLICT` (409).
A second fresh-key decision on the same review item returns
`REVIEW_DECISION_ALREADY_RECORDED` (409); one terminal decision exists per review item
(`review_decisions_one_per_review_item_idx`). A decision whose `expectedFinalVideoVersion` does
not match the captured `finalVideoVersion`, or whose bound final video is no longer `current`
(superseded), returns `REVIEW_VERSION_STALE` (409) and archives the review item idempotently
under RLS; no decision is recorded against a superseded version. `approve` moves the review item
to `approved`, `reject` to `rejected` and `request_changes` to `change_requested`. Only `approve`
mints a deterministic approval token (`sha256("review-approval:{workspaceId}:{reviewItemId}:
{finalVideoId}:{finalVideoVersion}")`), persisted as the `approvalReference` for downstream
scheduling; `reject` and `request_changes` mint no token and persist `approval_token` `NULL`.
Token uniqueness is enforced only over non-null tokens. The response carries the decision
(id, decision, reason, final-video id/sha256/version, decided-by user id, created at), the
`approvalReference` (approve only: token, review item id, final-video id/sha256/version, decided
by/at) and the `review.decision_recorded` audit (target type `ReviewItem`). The response is
`202 Accepted`. The approval token is a public deterministic reference, not a secret; it is
surfaced for scheduling and is never a signed URL or provider payload.

Signed URLs, object keys, recipient user ids, notification payload hashes, raw provider
payloads and secrets never appear in any review response; the final-video sha256 is a public
content fingerprint and is surfaced as the bound golden render hash. Cross-workspace and missing
workspaces hide behind `WORKSPACE_ACCESS_DENIED` (404) and never leak the owning workspace id.

`POST /calendar-posts` creates one calendar post bound to one approved exact final-video version
(`finalVideoId` + captured `finalVideoSha256` + `finalVideoVersion` + the R2 `approvalToken`).
Only Owner, Admin or Client Manager (`schedule_publish_approved_media`) may create a post; a
Reviewer is denied. The body carries `platform` (≤ 40), `account` (≤ 240), `caption` (≤ 2000),
`timezone` (IANA, defaults to `Asia/Kolkata` for display only), `manualExport` (boolean) and, for a
scheduled post, `scheduledAt`. An `Idempotency-Key` is required; a missing key returns
`IDEMPOTENCY_KEY_REQUIRED` (400). Create idempotency is key-bound: the same `Idempotency-Key` with
the same input replays the same post, and with different input returns `IDEMPOTENCY_INPUT_CONFLICT`
(409). A scheduled post (`manualExport` false) requires a valid future `scheduledAt` as an
ISO-8601 instant with an explicit UTC offset; a past, malformed or offset-less value, or a
`scheduledAt` supplied on a manual export, returns `PUBLISH_SCHEDULE_INVALID` (422). The bound
final video must still be `current`; a superseded version returns `PUBLISH_MEDIA_STALE` (409). The
`approvalToken` must match a recorded `approve` decision bound to the exact version, else
`REVIEW_APPROVAL_REQUIRED` (409). A schedule conflict — a second scheduled post for the same
`workspaceId` + `platform` + `account` whose `scheduledAt` falls within the 60-second conflict
window — returns `PUBLISH_SCHEDULE_INVALID` (422). The conflict check is database-protected: the
create runs inside a PostgreSQL transaction that first acquires a transaction-scoped
`pg_advisory_xact_lock` keyed by `{workspaceId}:{platform}:{account}`, so concurrent creates for
the same account serialise and the 60-second window check is authoritative under concurrency
(the lock is never persisted and `hashtext` collisions only cause harmless false serialisation).
A scheduled post is created `SCHEDULED` with the offset-respected UTC
`scheduledAt`; a manual-export post (`manualExport` true) is created `APPROVED` with no
`scheduledAt` and produces a retained manual-export `Artifact` whose `sha256` is the deterministic
package hash (`sha256("manual-export:{workspaceId}:{finalVideoId}:{finalVideoVersion}:
{approvalToken}:{platform}:{account}:{caption}")`), `retentionClass` `manual-export`,
`schemaVersion` `calendar.manual_export.v1` and `status` `CLEAN`; `manualLiveUrl` is left null for
the later verification path. A `calendar.post_created` audit is retained (target type
`CalendarPost`, reason `scheduled` or `manual_export`). The response carries the `calendarPost`
(id, platform, account, caption, bound final-video id/sha256/version, approval token, scheduledAt
or null, timezone, manualExport, manualLiveUrl, exportArtifactId, status, created-by user id,
version, timestamps), the `exportArtifact` (manual export only, omitting the object key) and the
audit. The response is `202 Accepted`. The approval token is a public deterministic reference and
the export artifact `sha256` is a public content hash; neither is a secret, signed URL or provider
payload, and the export artifact object key never reaches the browser. Cross-workspace and missing
workspaces (including a `finalVideoId` from another workspace) hide behind
`WORKSPACE_ACCESS_DENIED` (404) and never leak the owning workspace id.

`PATCH /calendar-posts/{id}` edits an existing calendar post before it is submitted. Only Owner,
Admin or Client Manager (`schedule_publish_approved_media`) may edit; a Reviewer is denied. The
body carries the integer `expectedVersion` (optimistic concurrency against `CalendarPost.version`)
and an optional patch of `caption`, `platform`, `account`, `timezone`, `manualExport` and, for a
scheduled post, `scheduledAt`; omitted fields keep their current value. An `Idempotency-Key` is
required; a missing key returns `IDEMPOTENCY_KEY_REQUIRED` (400). Edit idempotency is key-bound
exactly as create: same key + same input replays, same key + different input returns
`IDEMPOTENCY_INPUT_CONFLICT` (409). An edit is only allowed on an editable pre-publish post
(status `scheduled` or `approved`); a post that already has a `PublishOperation`, a supplied
`manualLiveUrl`, or a terminal/processing status is locked and returns `PUBLISH_POST_LOCKED`
(409). A stale `expectedVersion` returns `RESOURCE_VERSION_STALE` (409). The bound final video is
immutable on edit but is re-checked for `current`; a superseded version returns
`PUBLISH_MEDIA_STALE` (409). The merged full state is validated with the same rules as create, so
an invalid `scheduledAt`, a `scheduledAt` supplied on a manual export, or an over-length field
returns `PUBLISH_SCHEDULE_INVALID` (422) or `VALIDATION_FAILED` (422), and a schedule conflict
returns `PUBLISH_SCHEDULE_INVALID` (422) with the same advisory-lock protection as create (the
post's own row is excluded from conflict candidates). On success the post's `version` is
incremented, `status` is recomputed (`APPROVED` for a manual export, else `SCHEDULED`), a
manual-export post regenerates the retained manual-export `Artifact` with a versioned file name
and object key (the prior row is retained as evidence), and a switch back to scheduled clears
`exportArtifactId`. A `calendar.post_updated` audit is retained (target type `CalendarPost`,
reason a comma-joined list of changed fields or `no_change`). The response carries the updated
`calendarPost`, the `exportArtifact` (manual export only) and the audit, and is `202 Accepted`.
Cross-workspace edits hide behind `WORKSPACE_ACCESS_DENIED` (404).

## Idempotent Platform Publication (V0-U2, V0-U3)

`POST /calendar-posts/{id}/publish` publishes an approved scheduled calendar post to the provider
bound to its platform exactly once. The provider is derived server-side from the calendar post's
`platform` (`meta` -> `meta-simulator`, `youtube-shorts` -> `youtube-simulator`); the request body
carries no `provider` field. Only Owner, Admin or Client Manager (`schedule_publish_approved_media`)
may publish; a Reviewer is denied. The body carries `workspaceId` and `account`. An
`Idempotency-Key` is required; a missing key returns `IDEMPOTENCY_KEY_REQUIRED` (400). A durable
`PublishOperation` is persisted `SUBMITTING` before the provider network I/O so a crash between
persistence and the network response leaves a resumable operation, never a blind duplicate. The
operation binds the workspace, the calendar post, the provider route, the idempotency key and a
server-side `requestHash` (`sha256` over the canonical bound inputs including the provider); the
`requestHash` is a server-side binding secret and never appears in any response. One
`PublishOperation` exists per `CalendarPost` (one operation per post). The request `account` must
equal the calendar post's bound `account`; a mismatch returns `PUBLISH_ACCOUNT_MISMATCH` (409) and
never calls the provider. A manual-export post (`manualExport` true) cannot be submitted to a
provider and returns `PUBLISH_NOT_SUBMITTABLE` (409). A platform with no V0 publish adapter (for
example `tiktok`; Direct Post is out of scope) returns `PUBLISH_PLATFORM_UNSUPPORTED` (409) before
any network I/O and never calls the provider. A platform with an upload-quota gate (YouTube: 3
uploads/day per client) refuses submission when the quota is exhausted: it returns
`PUBLISH_QUOTA_EXHAUSTED` (429) with a `retryAfterMs` BEFORE any network I/O, writes no
`PublishOperation` row, and never calls the provider; the user retries at the shown time or exports
manually. A timeout after possible acceptance marks the operation `UNKNOWN` and the calendar post
stays `submitting`; the response carries `unknown: true` and no callback, and the caller must
reconcile before any retry. A malformed provider response returns `PROVIDER_OUTPUT_INVALID` (422)
and no callback. On success the operation advances to `ACCEPTED` with the external post id bound and
the calendar post advances to `accepted`; a `publish.state_changed` audit is retained (target type
`CalendarPost`, reason `accepted`); the public post URL is `null` until the post is live. A YouTube
upload that is accepted but still being processed returns the operation `processing` while the
calendar post stays `accepted`; the simulator surfaces a `publish.processing` callback (no public
URL yet) and a later `publish.completed` callback or reconciliation drives the operation to
`completed`. The response is `202 Accepted` and carries the `calendarPost`, the `operation` (id,
provider, calendarPostId, operationType, status, externalId, publicUrl, timestamps; omitting
`requestHash` and `workspaceId`), and, in simulator mode, a signed `callback` envelope
(`{envelope, signature}`) carrying the public post URL for the deterministic test to post back. A
replay with the same `Idempotency-Key` and the same post + account returns the existing operation
with `replay: true`; the same key against a different post or account returns
`IDEMPOTENCY_INPUT_CONFLICT` (409). Cross-workspace and missing posts hide behind
`WORKSPACE_ACCESS_DENIED` (404) and never leak the owning workspace id. No secret, signed URL,
object key, request hash or raw provider payload reaches the response; the public post URL is the
only URL surfaced and only once the post is live.

`POST /calendar-posts/{id}/publish/reconcile` reconciles an uncertain publish operation. Only
Owner, Admin or Client Manager (`schedule_publish_approved_media`) may reconcile; a Reviewer is
denied. The body carries `workspaceId` and an optional `reconcileOutcome` (simulator override). An
`Idempotency-Key` is required. Reconciliation never resubmits; it resolves `unknown`/`submitting`/
`accepted`/`processing` to a terminal state, records `reconciledAt`, and on `completed` binds the
public post URL and advances the calendar post to `published_unverified`. A terminal operation
replays with `replay: true`. A calendar post with no publish operation returns
`PUBLISH_NOT_SUBMITTABLE` (409); a platform with no V0 publish adapter returns
`PUBLISH_PLATFORM_UNSUPPORTED` (409). The response is `200 OK` and carries the `calendarPost` and
`operation`. Cross-workspace and missing posts hide behind `WORKSPACE_ACCESS_DENIED` (404).

`POST /calendar-posts/{id}/verify` independently verifies the audience-facing live post against
the approved calendar post before any publication is claimed as done. Only Owner, Admin or Client
Manager (`schedule_publish_approved_media`) may verify; a Reviewer is denied. No `Idempotency-Key`
is required: exactly-once here is the one-`PostVerification`-row-per-post rule, not a request key.
The body carries `workspaceId`, an optional simulator `mode`, and for a manual-export post an
optional `manualLiveUrl`. The deterministic verifier simulator independently observes the live
post and reports whether the target account, media identity (the approved final-video sha256),
caption, visibility and publish time match; raw provider payloads stay adapter-private and never
reach the response. A provider post that is not yet live (`accepted`/`submitting`/`processing`) is
not yet verifiable: provider acknowledgement alone never becomes success, so the response is
`202 Accepted` with a `VERIFY_PROCESSING_WAIT` body, a `retryAfterMs` and no verification record.
A still-processing observation on a live post also returns `202` with a `processing_wait`
`PostVerification` row. A `verified` observation advances the calendar post to
`published_verified`, retains an immutable audience-evidence `Artifact` (a public sha256
fingerprint; the object key is never surfaced), sends exactly one deduplicated
`publish_completed` `in_app` notification (a second verify collapses into the existing
notification with `duplicateCollapsed: true` and never sends a duplicate), anchors an initial
immutable `PerformanceSnapshot` (source `audience_verification_initial`, empty metrics, zero-width
window) and records `calendar.verification_completed`. An `identity_mismatch` observation
(wrong account and/or media) returns `VERIFY_IDENTITY_MISMATCH` (409), retains the evidence and a
`identity_mismatch` row, records `calendar.verification_failed` and sends no notification. A
`visibility_restricted` observation returns `VERIFY_VISIBILITY_RESTRICTED` (409) and likewise sends
no notification. A manual-export post without a live URL returns `VERIFY_MANUAL_URL_REQUIRED`
(409) until one is supplied; the supplied URL is then bound and verified in the same call. An
already-`published_verified` post replays the existing verification, evidence, notification and
snapshot with `replay: true`. The public `PostVerification` carries `status` (lowercased),
`attempts`, `accountMatched`, `mediaSha256Matched`, `captionMatched`, `visibility`,
`evidenceArtifactId` and `verifiedAt`; the raw observed account, observed media sha256, observed
caption, observed published at, propagation delay and last error code stay server-side. The
`200 OK` response carries `calendarPost`, `verification`, `evidenceArtifact`, `notification` and
`performanceSnapshot`. Cross-workspace and missing posts hide behind `WORKSPACE_ACCESS_DENIED`
(404).

`GET /lineage/{finalVideoId}` exports the complete creative ancestry of one final video as a
bounded, redacted, hash-manifested record (V0-A1). Only Owner, Admin or Client Manager
(`view_lineage_and_performance`) may export; a Reviewer is denied. The `{finalVideoId}` path
parameter and `workspaceId` query select the final video; a cross-workspace or missing final
video hides behind `WORKSPACE_ACCESS_DENIED` (404) so the owning workspace id never leaks. The
export traverses the immutable ancestry anchored on the `CreativeLineage` row
(brandProfile -> selectedScript -> avatarProfile -> estimate -> providerOperation ->
generatedAsset -> compositionInstruction -> aePlan -> renderAttempt -> finalVideo) and extends it
through the publication and observation ancestry for the bound calendar post
(calendarPost -> postVerification -> performanceSnapshotInitial). The `status` is `complete` when
every ancestry kind is retained, `incomplete` when one or more kinds are missing (named in
`missing`), or `blocked` when a final-video sha256 does not equal its render-attempt output hash
(named in `mismatches`); an unrecognised body maps to `unknown`. The `entries` list is bounded and
each artifact entry carries only its public content `sha256`, `contentType` and `version`; the
object key never surfaces. The `cost` attribution surfaces `providerTotalMinor`,
`estimatedMaximumMinor`, `currency` and `priceVersion` as observations. The `providerTimestamps`
surface `submittedAt`, `acceptedAt` and `completedAt`. The `manifestSha256` is the sha256 over the
stable JSON of the entries sorted by `{kind, id}` and is stable across reads. The `200 OK`
response carries `workspaceId`, `finalVideoId`, `status`, `missing`, `mismatches`,
`manifestSha256`, `generatedAt`, `cost`, `providerTimestamps` and `entries`. No secret, signed URL,
object key, raw provider payload, request hash or cross-workspace reference leaks; the export is a
record of what was produced, not a prediction of reach, virality, conversion or causal performance.

`POST /calendar-posts/{id}/performance-collect` collects a fresh observed platform performance
snapshot for one calendar post (V0-A1). Only Owner, Admin or Client Manager
(`schedule_publish_approved_media`) may collect; a Reviewer is denied. An `Idempotency-Key` is
required: a replay with the same key returns the same `PerformanceSnapshot` with `replay: true` and
never writes a second row; changed input returns `IDEMPOTENCY_INPUT_CONFLICT` (409). A post that is
not yet `published_verified` is not observable and returns `PERFORMANCE_NOT_OBSERVABLE` (409). The
deterministic performance simulator observes the post and reports observed metrics only (views,
likes, comments, shares, saves); the source hash and any platform account id stay adapter-private.
A `processing_wait` observation returns `202 Accepted` with `PERFORMANCE_PROCESSING_WAIT`,
`retryAfterMs` and no snapshot. An `observed` observation retains a NEW immutable
`PerformanceSnapshot` (source `performance_collect_simulator`, observation `simulated`, a widened
observation window and populated `metrics`) and never mutates the initial snapshot anchored at
verification. The `200 OK` response carries `performanceSnapshot`; a replay also carries `replay:
true`. Cross-workspace and missing posts hide behind `WORKSPACE_ACCESS_DENIED` (404). The metrics
are observations of past platform state only, never a prediction, forecast or promise of reach,
virality, conversion or causal performance.

`GET /calendar-posts/{id}/performance` reads every immutable `PerformanceSnapshot` for one calendar
post (V0-A1). Only Owner, Admin or Client Manager (`view_lineage_and_performance`) may read; a
Reviewer is denied. The `{calendarPostId}` path parameter and `workspaceId` query select the post; a
cross-workspace or missing post hides behind `WORKSPACE_ACCESS_DENIED` (404). The read returns the
`calendarPost` (with its `status`) and the bounded `snapshots` list, each carrying `id`, `source`,
`observation`, `observationWindowStart`, `observationWindowEnd`, a `stale` flag (true when the post
is no longer `published_verified`) and the observed `metrics`. The initial
`audience_verification_initial` snapshot keeps empty metrics forever; later
`performance_collect_simulator` snapshots carry the observed counts. No secret, signed URL, object
key, source hash, account id or predictive claim (reach/virality/conversion) leaks.

`POST /callbacks/publishing/{provider}` is the signed publishing callback receiver. The `{provider}`
path selects the signature header (`meta` -> `x-meta-signature`, `youtube` ->
`x-youtube-signature`). The handler verifies the header in constant time, windows the timestamp,
deduplicates by `(workspaceId, source, eventId)` via `inbox_events`, and advances the
`PublishOperation` and `CalendarPost` in lockstep. A `publish.processing` event keeps the operation
`processing` while the post stays `accepted`; the public post URL is bound only on
`publish.completed`. A bad signature or out-of-window callback returns `PROVIDER_CALLBACK_INVALID`
(401); a malformed envelope returns `PROVIDER_OUTPUT_INVALID` (422); both hide cross-workspace
existence. A replayed callback returns the prior response with `duplicate: true` and never
transitions a second time. The response is `200 OK`.

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
- V0-A2 credential rotation (`POST /workspaces/{workspace_id}/service-credentials/{credentialId}/rotate`)
  requires the `manage_provider_credentials` capability (Owner, Admin). It marks the
  prior credential `REVOKED`, creates a fresh `ACTIVE` credential row carrying the new
  `secret-manager://` reference, stamps `lastRotatedAt`, and writes one
  `service_credential.rotated` audit row bound to the prior credential id. The response
  returns the new credential and a `previous` summary (`id`, `rotationStatus: "REVOKED"`,
  `lastRotatedAt`, `updatedAt`) that never echoes `secretRef`. A rotation input carrying
  a plaintext secret field (`secretValue`, `apiKey`, `password`, etc.) is rejected with
  `VALIDATION_FAILED` (422). A missing or non-owned credential is hidden behind
  `WORKSPACE_ACCESS_DENIED` (404).
- V0-A2 hardening drills (`POST /workspaces/{workspace_id}/b2-benchmark`,
  `POST /workspaces/{workspace_id}/backlog-simulation`,
  `POST /workspaces/{workspace_id}/incident-rehearsal`,
  `GET /workspaces/{workspace_id}/operations/alerts`) require the `run_restore_drills`
  capability for the three drill endpoints and `view_operations` for the alerts endpoint
  (Owner, Admin). They run against the deterministic simulators only; a non-simulator
  provider mode refuses with a 503 `*_UNAVAILABLE` problem and writes no audit. The B2
  benchmark returns a visibly `simulated` India-to-B2 latency within the owner-pinned budget
  and an integer minor-unit egress cost, and retains one `benchmark.b2_recorded` audit row.
  The backlog simulation returns a deterministic two-hour growth-then-drain curve with an
  SLO breach and the `duplicatePaidWork: false` / `silentJobLoss: false` invariants, and
  retains one `backlog.simulation_recorded` audit row. The incident rehearsal records one
  owner-pinned scenario as a deterministic script of recovery steps with a `forward` or
  `rollback` recovery type and retains one `incident.rehearsal_recorded` audit row bound to
  the run id. The alerts endpoint is read-only and derives deterministic alert states
  (queue-age SLO breach, dead letters, lease-expiry spike, retry storm) from the operational
  metrics against owner-pinned thresholds; it writes no audit. An invalid drill input is
  rejected with `VALIDATION_FAILED` (422); a missing, non-owned or cross-workspace target is
  hidden behind `WORKSPACE_ACCESS_DENIED` (404); an unauthenticated call is rejected with 401.
- V0-B3 approval endpoints require human approval, optimistic version checks and one
  active approved brand profile per workspace/brand before downstream production use.
- Request body size, upload size, string length, enum and provider-specific limits are
  explicit in validation schemas.
- V0 APIs do not require a V1 or V2 endpoint.
