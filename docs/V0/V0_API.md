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
POST   /generation-jobs
GET    /generation-jobs/{id}
POST   /generation-jobs/{id}/cancel
POST   /composition-plans
POST   /composition-plans/{id}/render
POST   /review-items/{id}/comments
POST   /review-items/{id}/decisions
POST   /calendar-posts
POST   /calendar-posts/{id}/publish
POST   /calendar-posts/{id}/verify
POST   /credit-purchases
GET    /credit-wallets/{id}/ledger
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
