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
  an eligible avatar.
- `GenerationJob`: V0 production aggregate and current workflow state.
- `ProviderOperation`: durable provider request, idempotency key, external ID and
  `submitting/accepted/unknown/completed/failed` state.
- `GeneratedSegment`: retained provider output with hash and timing.
- `GeneratedAsset`: versioned assembled or provider-produced media.

## Composition

- `CompositionInstruction`: user instruction and normalized intent.
- `AePlan`: versioned timeline JSON and supported-capability validation.
- `RenderAttempt`: renderer, input hashes, result, logs reference and cost.
- `FinalVideo`: approved production object, thumbnail, captions and media fingerprint.

## Credits and Payments

- `CreditWallet`: workspace wallet and currency policy; balance is derived and cached.
- `CreditPurchase`: Razorpay/Stripe purchase state and provider references.
- `CreditReservation`: atomic hold for one generation operation.
- `CreditLedgerEntry`: append-only purchase, reserve, capture, release or adjustment.
- `ProviderPriceVersion`: effective rates, currency, source and validity period.

Ledger entries, not mutable balances, are financial truth. Corrections are compensating
entries.

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
  ancestry.
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
