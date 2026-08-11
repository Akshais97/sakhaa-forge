# Product V0 Data Models

## Authority

This is the canonical domain model for standalone Sakhaa Forge. The
implementation mapping is `V0_PRISMA_SCHEMA.md`. Product V2's separate model remains in
`../V2/V2_DATA_MODELS.md`.

## Identity and Tenancy

- `User`: Supabase Auth subject and profile.
- `UserProfile`: optional per-user display and default brand-context fields used by the
  onboarding/profile screens. It stores name, contact email, website URL, industry,
  primary market, language and whether onboarding was skipped; it is user-isolated and
  never contains provider credentials.
- `Workspace`: client/brand tenant and policy boundary.
- `Membership`: user role and status within a workspace.
- `ServiceCredential`: encrypted metadata for provider credentials; secrets stay in a
  secret manager. V0 stores the secret-manager reference, provider, purpose, environment
  and rotation status only. Rotation (V0-A2) is append-style: the prior row is marked
  `REVOKED`, a fresh `ACTIVE` row is created with a new `secret-manager://` reference and
  a stamped `lastRotatedAt`, and one `service_credential.rotated` audit row is retained
  against the prior id. `secretRef` is never echoed for a revoked credential and a
  rotation input carrying a plaintext secret field is rejected.
- `WorkspaceCapability`: workspace-scoped capability switch for unfinished or temporarily
  disabled V0 behaviours. Owner/Admin updates are audited; disabled capabilities do not
  create new downstream job state.
- `BrandContext`: optional workspace-scoped branding context captured during onboarding
  for one user: brand name, website URL, industry, video goal, primary market, language
  and target platforms. A skipped or absent context means extraction uses universal asset
  groups only; selected industry context can request an overlay but never approves brand
  truth.

## Brand Intelligence

- `Brand`: the stable, workspace-owned identity for one recognizable customer brand. It
  owns the display name, slug, canonical website and normalized domain used to resolve
  repeat crawls. Crawl runs, retained assets, candidates and approved profiles carry its
  `brand_id`; downstream video work consumes an exact approved profile belonging to this
  identity rather than an unrelated UUID.
- `BrandProfile`: immutable versioned approved brand memory. One active approved profile
  version is allowed per workspace/brand; corrections create a later version and
  supersede the previous active one for new production use.
- `BrandCrawlRun`: crawl request, normalized public URL, scope, status,
  rights acknowledgement, robots/policy result, optional selected brand type, detected
  brand type, extraction schema version, Firecrawl credit telemetry, queued crawl job
  reference and nullable private artifact references for crawl plan, universal output,
  vertical output, page inventory, asset pack, media inventory and readiness report
  evidence.
- `BrandCandidate`: extracted logo, color, font, summary, USP, CTA, audience,
  product/service/project, social proof, voice, positive claim, prohibited-claim,
  publishing/social, retained-asset or selected/detected vertical-conflict fact with
  confidence, extraction state and source evidence. Candidates remain unapproved until B3.
- `BrandAsset`: uploaded or approved media linked to a `Brand` and a clean `Artifact` with
  retained rights basis, permitted use and usage status. A manual library upload may exist
  before a crawl (`crawl_run_id` is nullable); a crawl-retained asset carries both brand and
  crawl lineage. Browser responses never expose its private object key.
- `BrandApproval`: append-only actor decision that activates, rejects or requests changes
  for an exact profile/version and records actor, timestamp and reason.
- `BrandRule`: approved claim, required phrase, prohibited term or visual restriction
  bound to the exact approved profile version.

No production workflow may use unapproved candidates as approved brand truth.
No new production workflow may use draft, rejected, revoked, missing or superseded brand
profiles. Historical lineage keeps the exact profile version originally used.

## Viral Discovery and Blueprinting

- `ViralCandidate`: Xpoz/source or manual identity, URLs, niche, metadata, deterministic
  rank, selection state, source hash, provenance and source/right warnings.
- `MetricSnapshot`: immutable source metrics at a point in time, with observation time,
  provider, source hash and no in-place mutation.
- `MediaAcquisition`: attempted source retrieval, rights decision, retrieval policy,
  source hash, retained analysis artifact identity when authorised and blocked reason
  when acquisition cannot proceed.
- `ThumbnailBlueprint`: OCR, composition, hook hypothesis, director replacement
  guidance, quality and source hash. Low-confidence OCR remains blocked/partial rather
  than becoming ready blueprint input.
- `VideoBlueprint`: immutable scene-level structural analysis with source hash, stage
  states and stage artifact identities for scene detection, transcription, keyframes,
  vision and OCR.
- `BlueprintScene`: timing, formula slot, shot, motion, transcript, OCR/on-screen text
  and brand-safe replacement guidance.
- `FormulaDerivation`: versioned structural formula.
- `DirectorPrompt`: versioned provider-neutral prompt with replacement slots.
- `BlueprintLibraryEntry`: reusable approved blueprint and compatibility metadata.
- `BlueprintRequest`: downstream identity created from one explicit path choice:
  existing blueprint, new viral discovery or approved default formula. It binds the
  exact active approved brand-profile version and objective before P2/P5 continue.
  P5 completes it once into an immutable ready library entry, formula derivation,
  director prompt and common script input contract.

## Script Tournament

- `ScriptTournament`: requested objective, formula derivation, director prompt, ready
  blueprint library entry, brand-profile version, requested and valid variant counts,
  status (`draft`/`generating`/`evaluating`/`ready_for_selection`/`selected`/`failed`/
  `cancelled`), result, prompt/model versions, token/cost telemetry buckets, manifest
  artifact and `script_tournament` job references.
- `ScriptVariant`: generated script with hook type, hook, body, CTA, captions, claims,
  cadence, formula slots, generation provenance (prompt/model version and source hash) and
  status (`generated`/`policy_refused`/`schema_invalid`).
- `ScriptEvaluation`: formula checks, policy checks, brand-rule checks, hook strength,
  timing, pattern interrupts, CTA, claims, captions, tone, model score, optional human
  score, explanation and status (`evaluated`/`policy_violation`/`schema_invalid`).
- `SelectedScript`: one canonical, immutable selection decision per tournament, retaining
  the workspace, tournament, selected variant, approver, version, optional human-override
  attestation and timestamp. Unique `tournament_id` and `variant_id` enforce one selection
  per tournament and one selection per variant; changing the selection requires a new
  tournament and a new selection. Selection never implies generation approval or credit
  reservation.

## Avatars and Generation

- `AvatarProfile`: generic, brand ambassador or real-person avatar metadata, bound
  to one approved brand profile. Carries `kind` (`generic`, `brand_ambassador`,
  `real_person`), `likenessScope` and `voiceScope` (`internal`, `campaign`,
  `limited`), `serviceFulfillmentState` (`not_required`, `pending`, `fulfilled`) and
  a one-to-one `AvatarConsent`. Generic avatars are labelled honestly by kind with
  no performance claims.
- `AvatarConsent`: likeness/voice scope, evidence, expiry and revocation. Evidence
  is held as a secret-manager style `evidenceRef` and never appears in public
  responses or analytics. `expiresAt` and `revokedAt` drive derived eligibility;
  revocation blocks future use immediately while historical audit records remain.
  V0-A2 exposes a real, audited consent-revocation write
  (`POST /avatars/{avatarProfileId}/consent-revocation`) that stamps `revokedAt` and
  `revokedByUserId` and writes one `consent.revoked` audit row; it is monotonic and
  idempotent, so a repeat revocation writes no second audit row, and an avatar with no
  prior consent record is rejected with `AVATAR_CONSENT_REQUIRED`.
- `GenerationEstimate`: provider, route, price version, maximum authorized cost. When
  `avatarProfileId` is supplied it must resolve to an avatar in the same workspace bound
  to the active approved brand profile, and the avatar must be consent-safe; the estimate
  boundary rejects revoked, expired, missing-evidence and service-pending avatars with
  the stable `AVATAR_CONSENT_*` codes and binds a durable `avatar.selected` audit row for
  an eligible avatar. V0-G3 extends the estimate with a server-side `inputHash`
  (SHA-256 over the selected script, avatar and duration; never returned), an `expiresAt`
  from `V0_ESTIMATE_TTL_MS` (default 15 minutes), an optimistic `version` (1 at creation)
  and a `confirmedAt` timestamp. The estimate binds an active `ProviderPriceVersion` for
  the `heygen-simulator` route and INR currency, carries the `durationSeconds` (pilot cap
  30) and starts in `awaiting_confirmation`; it moves to `credits_reserved` on confirmation.
- `ProviderPriceVersion`: global provider catalogue row (not tenant-owned, no
  `workspace_id`, no RLS) holding one effective rate per `provider` + `priceVersion`:
  currency, `rateMinorPerSecond` in integer minor units, source and validity period. Seeded
  with the deterministic `heygen-simulator` `v0.local.1` rate (INR 1,600 minor per second,
  valid 2000-2100). The estimate binds the active version; the 30-second pilot cap and the
  48,000 minor-unit authorized maximum are enforced in the domain layer.
- `GenerationJob`: V0 production aggregate and current workflow state, created at estimate
  confirmation. V0-G3 creates it in the `queued` state with the estimate binding
  (`estimateId`, `brandProfileId`, `selectedScriptId`, `avatarProfileId`), the bound
  `inputHash`, `version`, `durationSeconds`, the integer-minor-units
  `maximumAuthorizedMinor`, currency and `priceVersion`, and an `idempotencyKey`. Unique on
  `(workspaceId, idempotencyKey)` for exactly-once creation. Status is the lowercase
  `V0_STATUS_ENUMS.md` Generation contract stored as a string so provider-specific raw
  states map into the documented enum without merge or rename; `unknown` is preserved as a
  real state. V0-G4 drives `queued` → `submitting` → `accepted` → `generating`/`generated`
  via the bound `ProviderOperation`, with `unknown` on timeout after possible acceptance and
  `cancel_requested`/`cancelled` for cancellation during uncertainty. V0-G3 only reserves
  credits and queues the job.
- `ProviderOperation`: V0-G4 durable provider request for one `GenerationJob`, persisted in
  `SUBMITTING` before any provider network I/O so a crash between persistence and the
  network response leaves a resumable operation, never a blind duplicate. Binds
  `workspaceId`, `generationJobId`, `provider` (`heygen-simulator`), `operationType`
  (`provider_generate`), an `idempotencyKey`, a server-side `requestHash` (SHA-256, never
  returned), the bound `priceVersion`, the integer-minor-units `estimatedMaximumMinor` and
  `currency`. Carries the provider `externalId`, `retryAfterMs`, `lastErrorCode`, and the
  `submittedAt`/`acceptedAt`/`completedAt`/`reconciledAt`/`cancelledAt` timestamps. Status
  is the `ProviderOperationStatus` DB enum (`created`, `submitting`, `accepted`, `unknown`,
  `processing`, `completed`, `rejected`, `failed`, `cancelled`); `unknown` marks a timeout
  after possible acceptance and is reconciled (recorded by `reconciledAt`, not a separate
  enum value) before any retry. One operation per `GenerationJob`
  (`unique(generationJobId)`) and exactly-once by key (`unique(workspaceId,
  idempotencyKey)`). Provider payloads stay adapter-private; only the external id, status
  and timestamps are persisted. V0-G5 adds the reconciled integer-minor-units
  `providerTotalMinor` (nullable until settlement) and `settledAt` (ledger settlement
  timestamp, not provider completion); capture/release on terminal states is V0-G5.
- `GeneratedSegment`: V0-G5 retained provider output for one `GenerationJob`, bound to the
  clean retained `Artifact`, the provider `externalId` (not a URL), `durationSeconds`,
  `contentType`, `byteSize` and a SHA-256 `sha256`. The transient provider URL is never
  stored. Unique on `(workspaceId, generationJobId, segmentIndex)`; one clean segment per
  job index.
- `GeneratedAsset`: V0-G5 versioned retained media bound to a segment and a clean `Artifact`,
  with a `kind` (`provider_video` for V0-G5; assembled/rendered kinds are later sprints), a
  positive `version` and a status (`CLEAN`/`REJECTED`/`SUPERSEDED`, default `CLEAN`; returned
  UPPERCASE per the V0-F3 AssetTrustStatus contract). Unique on `(workspaceId,
  generationJobId, version)` so asset creation is exactly-once per version per job.
- `CreativeLineage`: the immutable ancestry of a retained media object. A V0-G5
  generation-job lineage row ties a generated asset back through the approved `BrandProfile`,
  `SelectedScript` (nullable), consent-safe `AvatarProfile`, `GenerationEstimate`,
  `ProviderOperation` and bound `priceVersion` (`v0.local.1`); it is identified by
  `generationJobId` (one row per `GenerationJob`, `unique(workspaceId, generationJobId)`,
  `generationJobId` set, `finalVideoId` null). A V0-C2 render-level lineage row ties a final
  video back through the `CompositionInstruction`, `AePlan` and `RenderAttempt` that produced it,
  copying the G5 generated-asset ancestry in-row (`generatedAssetId`, `brandProfileId`,
  `estimateId`, `provider`, `providerOperationId`, `priceVersion`); it is identified by
  `finalVideoId` (one row per `FinalVideo`, `unique(workspaceId, finalVideoId)`,
  `generationJobId` null, `finalVideoId` set). Both row kinds are append-only; a V0-C2 revision
  creates a new render-level lineage row for the new final video and never overwrites the prior
  row. SQL treats NULLs as distinct, so each unique constraint scopes only its non-null row kind.

## Composition

- `CompositionInstruction`: user instruction and normalized intent. V0-C1 binds a retained
  CLEAN generated asset (`generationAssetId`) to structured composition direction
  (`inputMode`, `rawDirection`) and normalizes it into a versioned AE timeline. Status is the
  lowercase `V0_STATUS_ENUMS.md` Composition contract; V0-C1 reaches `planning`,
  `validation_failed` and `validated`, and V0-C2 reaches `rendered` on a succeeded render
  (rendering/failed are later sprints; superseded is reached by a prior final video on a new
  revision). `generationAssetId` is a plain UUID, not a FK: the application layer
  (`resolveAsset`) is the sole validator of asset existence, workspace ownership and CLEAN
  status, and a `validation_failed` plan for a missing or cross-workspace asset must still be
  retained. The raw direction is internal context and never returned to the browser.
- `AePlan`: versioned timeline JSON and supported-capability validation. V0-C1 validates the
  timeline against the deterministic AE capability registry (`aeCapabilityRegistry`,
  capability version `ae.local.1`, schema version `ae.plan.v1`): a valid plan is `validated`
  with a CLEAN plan artifact (`Artifact` row, `application/json`, retention class
  `plan-artifact`, producer `composition:{instructionId}`, schema version `ae.plan.v1`); a
  malformed plan or capability mismatch is `validation_failed` with every unsupported item
  explained in `unsupportedItems` (`{ code, field, detail }`). The primary error code follows
  the catalog priority `AE_PLAN_SCHEMA_INVALID` > `AE_CAPABILITY_UNAVAILABLE` >
  `AE_ASSET_MISSING` > `AE_TIMELINE_INVALID`. The timeline JSON, plan artifact sha256
  (canonical timeline hash) and referenced asset ids are retained server-side only; the
  public mapper surfaces status, capability version, schema version, plan version, the plan
  artifact id and the explained unsupported items.
- `RenderAttempt`: the durable record of one AE render of a validated plan. V0-C2 persists it
  `running` (with a CLEAN render-logs `Artifact`, `retentionClass` `render-logs`, and a
  `composition.render_started` audit) before the AE worker runs — the external side-effect
  operation is persisted before the work — then `succeeded` (final media retained, `outputHash`
  set to the deterministic golden render hash) or `failed` (capability drift, incompatible
  worker output, or an unrecovered crash; a `composition.render_failed` audit retains the
  failure code as its reason). It carries the renderer, the plan canonical timeline hash
  (`inputHash`), the referenced generated-asset sha256s (`inputAssetHashes`), the worker
  capability version, the `aePlanId` it rendered, the logs artifact id, the cost in integer
  minor units, the idempotency key and the `idempotencyInputHash` (a sha256 of the canonical
  render request: `compositionInstructionId`, `aePlanId`, `planCanonicalHash`,
  `inputAssetHashes` and `capabilityVersion`). One `running` attempt per composition instruction
  (partial unique index) is the concurrency guard; render idempotency is input-bound, not
  key-bound — the same `Idempotency-Key` replays or resumes only when the render request hashes
  to the same `idempotencyInputHash` for the same composition, and the same key against a
  different composition, plan, input assets or capability version returns
  `IDEMPOTENCY_INPUT_CONFLICT` (409) without creating a final video or attempt. A worker crash
  leaves the attempt `running` and the caller resumes with the same idempotency key and input;
  `running` is a real state. The input hash, asset hashes and input idempotency hash are
  server-side validation bindings; the public mapper (`publicRenderAttempt`) surfaces status,
  version, renderer, worker capability version and the output hash (the golden render
  fingerprint).
- `FinalVideo`: the approved production object retained from a succeeded render, with
  thumbnail, captions and a media fingerprint (sha256). V0-C2 retains exactly one `current`
  `FinalVideo` per composition instruction (partial unique index); a new revision creates a new
  row (version N+1, `current`) and supersedes the prior `current` row (set to `superseded`,
  `composition.video_superseded` audit) without overwriting it, preserving the immutable
  revision lineage. It carries the duration, resolution (`1080x1920`), codec (`h264`), the
  deterministic golden render sha256 (so the same plan renders to the same hash across
  revisions), byte size, capability version (`ae.local.1`) and schema version (`ae.render.v1`),
  and binds the retained CLEAN final-video (`final-video`), thumbnail (`final-thumbnail`) and
  captions (`final-captions`) artifacts. The artifact ids are server-side bindings; the public
  mapper (`publicFinalVideo`) surfaces status, version, duration, resolution, codec, capability
  and schema versions and the golden render hash.

## Credits and Payments

- `CreditWallet`: one workspace wallet per currency; `balanceMinor` is integer minor units,
  derived from the ledger and cached. Unique on `(workspaceId, currency)`.
- `CreditPurchase`: Razorpay (`razorpay`, INR) or Stripe (`stripe`, non-INR) purchase state
  and provider reference. Status is the lowercase `V0_STATUS_ENUMS.md` contract
  (`initiated`, `pending`, `succeeded`, `failed`, `refunded`, `disputed`). Unique on
  `(workspaceId, idempotencyKey)` and `(workspaceId, provider, providerReference)`.
  Payment instrument details are never stored.
- `CreditReservation`: atomic hold for one generation operation, created at V0-G3
  estimate confirmation. One active reservation per `GenerationJob`; the partial unique
  index `credit_reservations_one_active_per_job_idx` (`status = 'ACTIVE'`) is the
  database-side concurrency guard against double-click, retry and worker crash.
  `amountMinor` is the held amount in integer minor units (positive); the matching
  `RESERVE` ledger entry is the negative debit. Status is the lowercase
  `V0_STATUS_ENUMS.md` Reservation contract (`active`, `captured`, `released`, `expired`,
  `adjusted`; `active` in V0-G3, `captured`/`released` in V0-G5). Unique on `(workspaceId,
  idempotencyKey)`. Capture and release are settled in V0-G5.
- `CreditLedgerEntry`: append-only `PURCHASE`, `REFUND`, `ADJUSTMENT`, `RESERVE`, `CAPTURE`
  or `RELEASE` row in integer minor units with a per-entry running balance and
  `idempotencyKey` exactly-once guard. V0-G3 writes the `RESERVE` type as a negative signed
  debit that binds the `generationJobId`. V0-G5 writes `CAPTURE` (amount
  `estimatedMaximumMinor - providerTotalMinor`, 0 when the actual provider total equals the
  maximum) on a successful settlement and `RELEASE` (full reservation amount, wallet
  restored) on a failed settlement; both carry job-derived idempotency keys
  (`g5-capture-{jobId}` / `g5-release-{jobId}`) so crash recovery writes each entry once.
  V0-G2 writes only `PURCHASE`, `REFUND` and `ADJUSTMENT`. Corrections are compensating
  entries; history is never edited. Unique on `(workspaceId, idempotencyKey)`.
- `ProviderPriceVersion`: effective rates, currency, source and validity period.

Ledger entries, not mutable balances, are financial truth. Money is integer minor units or
provider-native credit micros; floating point is never used. Payment callbacks are
signature-verified, replay-protected and reconciled against amount, currency, provider
reference and workspace before any credit movement. A timeout after possible provider
acceptance is `unknown` and reconciled before retry. Compensating adjustments are restricted
to Owner/Admin.

## Review and Publishing

- `ReviewItem`: final-video version submitted to internal/client review.
- `ReviewComment`: thread or timestamped feedback.
- `ReviewDecision`: one terminal `approve`, `reject` or `request_changes` bound to one exact
  final-video version (`finalVideoSha256`, `finalVideoVersion`) with actor, reason and a
  deterministic approval token (`approvalToken`, nullable) minted only on `approve`; `reject` and
  `request_changes` store `NULL`. Token uniqueness is enforced only over non-null tokens (partial
  unique index `review_decisions_one_approval_token_idx ... WHERE approval_token IS NOT NULL`), so
  many non-approve decisions coexist without collision. One decision per review item.
- `CalendarPost`: one calendar post bound to one approved exact final-video version
  (`finalVideoId`, `finalVideoSha256`, `finalVideoVersion`, R2 `approvalToken`), with `platform`,
  `account`, `caption`, `timezone`, `scheduledAt` (nullable), `manualExport`, `manualLiveUrl`
  (nullable, supplied later by verification), `exportArtifactId` (nullable, the manual-export
  `Artifact`), `status` (`PublishStatus`) and `createdByUserId`. A scheduled post is created
  `SCHEDULED` with the offset-respected UTC `scheduledAt`; a manual-export post is created
  `APPROVED` with no `scheduledAt` and a retained manual-export `Artifact` whose `sha256` is the
  deterministic package hash; `manualLiveUrl` is null until the later verification path supplies it.
  `CalendarPost.version` (integer, default 1) supports optimistic-concurrency edits via
  `PATCH /calendar-posts/{id}` (caller supplies `expectedVersion`); a successful edit increments
  `version`. An edit is only allowed on an editable pre-publish post (`scheduled` or `approved`);
  a post with a `PublishOperation`, a supplied `manualLiveUrl`, or a terminal/processing status is
  locked (`PUBLISH_POST_LOCKED`). The 60-second schedule-conflict window is database-protected by a
  transaction-scoped `pg_advisory_xact_lock` keyed by `{workspaceId}:{platform}:{account}` on both
  create and edit (the post's own row is excluded on edit).
- `PublishOperation`: V0-U2/V0-U3 idempotent platform submission and external post identity for one
  `CalendarPost` (one operation per post). Binds `workspaceId`, `calendarPostId`, `provider`
  (`meta-simulator` for `meta`, `youtube-simulator` for `youtube-shorts`; derived server-side from
  the `CalendarPost.platform`), `operationType` (`publish_post`), `idempotencyKey` and a server-side
  `requestHash` (`sha256` over the canonical bound inputs including the provider; never returned),
  with `status` (`PublishOperationStatus`), `externalId` (bound on acceptance), `publicUrl` (bound
  only on completion), `retryAfterMs` (set on a quota-exhausted refusal; otherwise null),
  `lastErrorCode`, and `submittedAt`/`acceptedAt`/`completedAt`/`reconciledAt`/`cancelledAt`
  timestamps. Persisted `SUBMITTING` before the provider network I/O so a crash leaves a resumable
  operation, never a blind duplicate. A timeout after possible acceptance is `UNKNOWN` and
  reconciled before any retry; a YouTube upload that is accepted but still processing is
  `PROCESSING` while the `CalendarPost` stays `accepted`, then a verified `publish.processing`/
  `publish.completed` callback or reconciliation drives `completed` and binds the `publicUrl`,
  advancing the `CalendarPost` to `published_unverified` in lockstep. A platform with no V0 publish
  adapter is rejected (`PUBLISH_PLATFORM_UNSUPPORTED`) before any row is written; an exhausted
  upload quota is a pre-flight refusal (`PUBLISH_QUOTA_EXHAUSTED`) that writes no row. Publishing is
  not a V0 credit op, so there is no price, currency, estimated maximum or settlement.
- `PostVerification`: the audience-facing verification record for one `CalendarPost`, exactly one
  row per post (unique `calendarPostId`). Binds `workspaceId`, `calendarPostId`, `provider`
  (`verify-simulator`, derived server-side), `status` (`VerificationStatus`: `processing_wait`,
  `verified`, `identity_mismatch`, `visibility_restricted`, `manual_url_required` is a transient
  pre-row guard, not a stored status), `attempts` (incremented per observation), the match flags
  `accountMatched`/`mediaSha256Matched`/`captionMatched` (booleans for an observed result, null
  while `processing_wait`), `visibility` (the observed audience visibility), the server-private
  observed identity (`observedAccount`, `observedMediaSha256`, `observedCaption`,
  `observedPublishedAt`, never surfaced in API responses), `propagationDelayMs`, `lastErrorCode`
  (`VERIFY_IDENTITY_MISMATCH`/`VERIFY_VISIBILITY_RESTRICTED` for the non-success results, null when
  verified), the retained `evidenceArtifactId` (the audience-evidence `Artifact`), and
  `verifiedAt` (set only on a verified result). Provider acknowledgement alone never produces a
  verified row: a not-yet-live post returns `VERIFY_PROCESSING_WAIT` with no row, and a
  still-processing live observation writes a `processing_wait` row that a later verified
  observation advances in place. Wrong media/account (`identity_mismatch`) and restricted
  visibility (`visibility_restricted`) are stored non-successes that retain the evidence and write
  `calendar.verification_failed`; they send no notification. Only a `verified` row advances the
  `CalendarPost` to `published_verified`.
- `Notification`: idempotent, deduplicated delivery of one logical message to one recipient.
  Binds `workspaceId`, `notificationType` (V0-U4 `publish_completed`), `channel` (`in_app`),
  `recipientUserId`, a server-side `payloadHash` (`sha256` over the stable
  `workspaceId`+`calendarPostId`+`notificationType`+`recipientUserId` tuple; never surfaced), the
  nullable `reviewItemId` (review-channel notifications) and the nullable `calendarPostId`
  (publish-completion notifications, V0-U4), `status` (`SENT`) and `sentAt`. One logical
  notification per `(workspaceId, payloadHash)`: a second verify of the same post collapses into
  the existing notification (`duplicateCollapsed: true`) and never sends a duplicate. The
  `payloadHash` and `recipientUserId` are storage secrets and never appear in the API response or
  rendered UI.

## Performance and Lineage

- `PerformanceSnapshot`: immutable platform metrics and observation window. V0-U4 anchors the
  initial snapshot at the verified instant (source `audience_verification_initial`, empty `metrics`
  object, zero-width window bounded by `verifiedAt`); the public surface carries `id`,
  `calendarPostId`, `platform`, `source`, `observation` (derived from `source`: `simulated` for a
  collect-simulator snapshot, null for the initial snapshot — the table has no `observation`
  column), `observationWindowStart`, `observationWindowEnd`, a read-time `stale` flag (true when the
  post is no longer `published_verified`) and the observed `metrics` (views, likes, comments,
  shares, saves), while the server-side `sourceHash` and any platform account id stay private.
  V0-A1 `POST /calendar-posts/{id}/performance-collect` appends a fresh immutable snapshot (source
  `performance_collect_simulator`, observation `simulated`, a widened window and populated
  `metrics`) and never mutates the initial snapshot; a replay with the same `Idempotency-Key`
  returns the same row with `replay: true`. V0-A1 `GET /calendar-posts/{id}/performance` returns
  the bounded snapshot list. The metrics are observations of past platform state only, never a
  prediction, forecast or promise of reach, virality, conversion or causal performance.
- `CreativeLineage`: brand, blueprint, formula, script, avatar, provider and final-video
  ancestry. V0-G5 writes the lineage row binding a generated asset to the approved brand
  profile, selected script, consent-safe avatar, estimate, provider operation and price
  version; one row per generation job. V0-C2 extends the row with the composition instruction, AE
  plan, render attempt and final video (one row per final video via the unique
  `(workspaceId, finalVideoId)` constraint). V0-A1 `GET /lineage/{finalVideoId}` exports the
  immutable ancestry as a bounded, redacted, hash-manifested record: `status`
  (`complete`/`incomplete`/`blocked`/`unknown`), the named `missing` and `mismatches` lists, the
  `manifestSha256` (sha256 over the stable JSON of the entries sorted by `{kind, id}`), the `cost`
  attribution (`providerTotalMinor`, `estimatedMaximumMinor`, `currency`, `priceVersion`), the
  `providerTimestamps` (`submittedAt`, `acceptedAt`, `completedAt`) and the redacted `entries`
  (each artifact entry carries only its public content `sha256`, `contentType` and `version`; the
  object key never surfaces). The export extends the row ancestry through the bound calendar post
  (`calendar_post`, `post_verification`, `performance_snapshot_initial`). The export is a record of
  what was produced, not a prediction of reach, virality, conversion or causal performance.
- `Artifact`: any immutable file with schema, hash, producer and retention class.
- `AuditEvent`: append-only security, billing, review and production event. V0-G1
  retains an `avatar.selected` audit event (target type `AvatarProfile`) when an eligible
  avatar enters a generation estimate, so avatar selection is durable lineage rather than
  local UI state; rejected avatars write no audit. V0-A2 retains three hardening-drill audit
  rows against the deterministic simulators: `benchmark.b2_recorded` (target type
  `Workspace`) for an India-to-B2 transfer benchmark, `backlog.simulation_recorded` (target
  type `Workspace`) for a two-hour load-shaped backlog simulation, and
  `incident.rehearsal_recorded` (target type `IncidentRehearsal`, target id = the run id) for
  an incident/runbook rehearsal. Each carries the actor and a bounded `reason` and never
  persists the simulated latency, cost, curve, recovery script or recovered entity ids; the
  operational alerts endpoint is read-only and writes no audit.
- `IdempotencyRecord`: request hash and stable response for costly mutations.
- `OutboxEvent`: committed event awaiting internal/future delivery.
- `InboxEvent`: consumed callback/event used for de-duplication.

V0 may create export-ready events, but delivery to V2 is not required for V0 acceptance.

## Job Infrastructure

- `Job`: work type, canonical state, priority, resource class, input hash and retained
  last error code for dead-letter recovery.
- `JobAttempt`: worker lease, heartbeat, retry and error.
- `JobDependency`: parent/child edge.
- `JobEvent`: append-only progress and transitions.

## F5 Operations

- Job traces are derived from `Job`, `OutboxEvent`, `JobAttempt`, `JobEvent` and retained
  `Artifact` rows using propagated `requestId` and trace IDs.
- Queue-age, retry, lease-expiry, dead-letter and artifact-validation metrics are derived
  from canonical PostgreSQL state.
- Restore drills are retained as audit/evidence records and must verify RLS and artifact
  references.
- Simulator modes are local/staging operational controls and do not create production
  provider dependencies.

## Required Constraints

- Every tenant row contains `workspace_id`.
- Unique `(workspace_id, operation, idempotency_key)`.
- Pre-workspace externally visible mutations also carry unique
  `(actor_user_id, operation, idempotency_key)` until a workspace boundary exists.
- Unique provider operation by provider plus idempotency key.
- One active credit reservation per generation job.
- One active lease per job.
- One active approved brand-profile version per workspace/brand.
- Existing-blueprint requests reference only compatible, ready, same-workspace library
  entries; discovery and default requests do not carry a blueprint-library entry ID.
- Viral discovery can create candidates only for same-workspace `new_discovery`
  blueprint requests. Provider outage, empty result, malformed result and timeout do not
  fabricate candidate rows. Manual fallback keeps actor/source provenance and rights basis.
- Metric snapshots are immutable; later observations create new rows rather than editing
  existing metric evidence.
- Media acquisition creates retained analysis artifacts only when rights allow internal
  structural analysis. Reference-only sources, unsupported retrieval, source-hash mismatch
  and low-confidence OCR block dependent blueprint stages with visible evidence.
- Scene blueprints cannot become complete when any required stage is empty, malformed,
  timed out, OOM-killed or missing. Each stage keeps an independent job, dependency edge,
  artifact hash and stage state; blocked or failed stages remain visible.
- Ready blueprint creation requires either a complete extracted scene blueprint or the
  approved default formula. Extracted and default paths must produce the same
  `v0.script-input.1` contract shape. Formula and director-prompt records are immutable;
  creating readiness twice for the same blueprint request is rejected.
- Immutable final-video, blueprint, script and ledger records after publication/capture.
- Domain mutation and outbox event commit together.
- Published success requires a verified `PostVerification`.
- Exactly one `PostVerification` row per `CalendarPost`; one logical completion notification per
  `(workspaceId, payloadHash)`. Wrong media/account and restricted visibility are non-successes
  that send no notification.
- Captured generation credits require a policy-defined successful provider/output state.

## Deletion

Soft-delete records needed for financial, review or production lineage. Revoke access
immediately, then purge binaries according to retention policy. Consent revocation stops
future avatar/asset use even where historical audit records must remain.
