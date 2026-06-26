# Product V0 Data Models

## Authority

This is the canonical domain model for standalone Sakhaa Forge. The
implementation mapping is `V0_PRISMA_SCHEMA.md`. Product V2's separate model remains in
`../V2/V2_DATA_MODELS.md`.

## Identity and Tenancy

- `User`: Supabase Auth subject and profile.
- `Workspace`: client/brand tenant and policy boundary.
- `Membership`: user role and status within a workspace.
- `ServiceCredential`: encrypted metadata for provider credentials; secrets stay in a
  secret manager. V0 stores the secret-manager reference, provider, purpose, environment
  and rotation status only.
- `WorkspaceCapability`: workspace-scoped capability switch for unfinished or temporarily
  disabled V0 behaviours. Owner/Admin updates are audited; disabled capabilities do not
  create new downstream job state.

## Brand Intelligence

- `BrandProfile`: immutable versioned approved brand memory. One active approved profile
  version is allowed per workspace/brand; corrections create a later version and
  supersede the previous active one for new production use.
- `BrandCrawlRun`: crawl request, normalized public URL, scope, status,
  rights acknowledgement, robots/policy result and queued crawl job reference.
- `BrandCandidate`: extracted logo, color, font, summary, USP, CTA, audience,
  prohibited-claim or document fact with confidence, extraction state and source
  evidence. Candidates remain unapproved until B3.
- `BrandAsset`: uploaded or approved media linked to a clean `Artifact` with retained
  rights basis, permitted use and usage status.
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
- `CreativeLineage`: V0-G5 immutable ancestry of a generated asset from the approved
  `BrandProfile`, `SelectedScript` (nullable), consent-safe `AvatarProfile`, `GenerationEstimate`,
  `ProviderOperation` and bound `priceVersion` (`v0.local.1`). One lineage row per
  `GenerationJob` (`unique(workspaceId, generationJobId)`).

## Composition

- `CompositionInstruction`: user instruction and normalized intent.
- `AePlan`: versioned timeline JSON and supported-capability validation.
- `RenderAttempt`: renderer, input hashes, result, logs reference and cost.
- `FinalVideo`: approved production object, thumbnail, captions and media fingerprint.

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
- `ReviewDecision`: approve, reject or request changes with actor and reason.
- `CalendarPost`: platform, account, caption, schedule and approved media version.
- `PublishOperation`: idempotent platform submission and external post identity.
- `PostVerification`: audience-facing checks, attempts, evidence and final result.
- `Notification`: idempotent processing, success or failure message.

## Performance and Lineage

- `PerformanceSnapshot`: immutable platform metrics and observation window.
- `CreativeLineage`: brand, blueprint, formula, script, avatar, provider and final-video
  ancestry. V0-G5 writes the lineage row binding a generated asset to the approved brand
  profile, selected script, consent-safe avatar, estimate, provider operation and price
  version; one row per generation job.
- `Artifact`: any immutable file with schema, hash, producer and retention class.
- `AuditEvent`: append-only security, billing, review and production event. V0-G1
  retains an `avatar.selected` audit event (target type `AvatarProfile`) when an eligible
  avatar enters a generation estimate, so avatar selection is durable lineage rather than
  local UI state; rejected avatars write no audit.
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
- Captured generation credits require a policy-defined successful provider/output state.

## Deletion

Soft-delete records needed for financial, review or production lineage. Revoke access
immediately, then purge binaries according to retention policy. Consent revocation stops
future avatar/asset use even where historical audit records must remain.
