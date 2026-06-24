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
  secret manager.

## Brand Intelligence

- `BrandProfile`: versioned approved brand memory.
- `BrandCrawlRun`: crawl request, scope, status, robots/policy result and evidence.
- `BrandCandidate`: extracted logo, color, font, copy, CTA, social link or document.
- `BrandAsset`: uploaded or approved media with object hash and usage status.
- `BrandApproval`: actor decision that activates a profile/version.
- `BrandRule`: approved claim, required phrase, prohibited term or visual restriction.

No production workflow may use unapproved candidates as approved brand truth.

## Viral Discovery and Blueprinting

- `ViralCandidate`: Xpoz/source identity, URLs, niche, metadata and current selection state.
- `MetricSnapshot`: immutable source metrics at a point in time.
- `MediaAcquisition`: attempted source retrieval and retained-object identity.
- `ThumbnailBlueprint`: OCR, composition, hook hypothesis and quality.
- `VideoBlueprint`: immutable scene-level structural analysis.
- `BlueprintScene`: timing, formula slot, shot, motion, transcript, OCR and replacements.
- `FormulaDerivation`: versioned structural formula.
- `DirectorPrompt`: versioned provider-neutral prompt with replacement slots.
- `BlueprintLibraryEntry`: reusable approved blueprint and compatibility metadata.

## Script Tournament

- `ScriptTournament`: requested objective, formula, brand-profile version and policy.
- `ScriptVariant`: generated script, hook type, body, CTA and generation provenance.
- `ScriptEvaluation`: formula checks, policy checks, model/human score and explanation.
- `SelectedScript`: immutable selection decision and approver.

## Avatars and Generation

- `AvatarProfile`: generic, brand ambassador or real-person avatar metadata.
- `AvatarConsent`: likeness/voice scope, evidence, expiry and revocation.
- `GenerationEstimate`: provider, route, price version, maximum authorized cost.
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
- `AuditEvent`: append-only security, billing, review and production event.
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

## Required Constraints

- Every tenant row contains `workspace_id`.
- Unique `(workspace_id, operation, idempotency_key)`.
- Pre-workspace externally visible mutations also carry unique
  `(actor_user_id, operation, idempotency_key)` until a workspace boundary exists.
- Unique provider operation by provider plus idempotency key.
- One active credit reservation per generation job.
- One active lease per job.
- One active approved brand-profile version per workspace/brand.
- Immutable final-video, blueprint, script and ledger records after publication/capture.
- Domain mutation and outbox event commit together.
- Published success requires a verified `PostVerification`.
- Captured generation credits require a policy-defined successful provider/output state.

## Deletion

Soft-delete records needed for financial, review or production lineage. Revoke access
immediately, then purge binaries according to retention policy. Consent revocation stops
future avatar/asset use even where historical audit records must remain.
