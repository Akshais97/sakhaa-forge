# Product V0 Vertical Outcome Slice Specification

> **For agentic workers:** Implement one slice at a time using
> `superpowers:test-driven-development`, then use
> `superpowers:verification-before-completion`. Do not begin a dependent slice until the
> predecessor evidence is retained.

**Goal:** Deliver standalone Product V0, Sakhaa Forge, as a sequence of
small, demonstrable user and administrator outcomes.

**Architecture:** Next.js uses a generated client for the NestJS/Fastify control plane.
Prisma-managed Supabase PostgreSQL owns domain, job and financial truth. BullMQ carries
opaque wake-ups to NestJS processors, private workers return artifacts through
authenticated APIs, and Backblaze B2 stores private media and evidence.

**Scope:** Product V0 only. V1 and V2 are excluded.

---

## Source Basis And Reasoning Standard

This specification is derived from the current documents under `docs/V0/` and
`docs/Project/`. The canonical implementation sources are the V0 product, API, status,
permissions, data, Prisma, jobs, testing, security, deployment, design, analytics,
screen/state and guardrail documents. Source notes remain historical unless a canonical
document explicitly promotes them.

Every slice must be planned from first principles:

- identify the user or administrator outcome before choosing implementation layers;
- trace every requirement to an owning document, status, permission, route, model, job,
  screen state or evidence artifact;
- write tests against observable behaviour and contract boundaries, not internal
  convenience functions;
- document assumptions as assumptions and block decisions that require missing authority;
- provide auditable rationale in plans and PRs without relying on hidden chain of thought;
- never implement by analogy when a contract exists.

## 1. How To Use This Specification

Each slice contains:

- **Outcome:** the behavior a user or administrator can demonstrate;
- **Includes:** the minimum end-to-end capability;
- **Primary records:** the domain records introduced or completed;
- **Contracts/jobs:** API, callback or worker surfaces involved;
- **Failure contract:** the highest-risk negative behavior;
- **Evidence:** proof required to close the slice;
- **Depends on:** predecessor slices;
- **Gate:** the V0 build gate advanced by the slice.

The named repository areas are ownership boundaries from
`../Project/Architecture/PROJECT_ARCHITECTURE_REPOSITORY_STRUCTURE.md`. Exact source
filenames are chosen during the task-level implementation plan after the repository
scaffold exists.

## 2. Universal Slice Definition Of Done

Every slice must satisfy all applicable requirements:

- TDD red, green and nearby regression evidence;
- an explicit list of source documents read for the behaviour;
- a requirement trace from user outcome to API, data, job, UI, status and evidence;
- public behavior tested through generated contracts;
- tenant membership and permission enforced in NestJS;
- tenant-leading query and RLS policy verified;
- stable RFC 9457 error codes;
- idempotency for costly or externally visible mutations;
- immutable audit and lineage evidence for sensitive decisions;
- deterministic provider/worker simulator coverage;
- success, nil, empty, malformed, unauthorized, duplicate, stale, timeout and crash
  behavior;
- loading, empty, progress, retry, failure and recovery UI states;
- keyboard, focus, screen-reader and contrast basics;
- structured logs, traces and relevant metrics without secrets or signed URLs;
- additive Prisma migration with compatibility, RLS and restore verification;
- rollback or forward-recovery procedure;
- no V1/V2 contract, runtime call, table or feature flag.

Each task-level implementation plan must name:

- **Slice and behaviour:** the smallest demonstrable outcome being changed;
- **Owning contracts:** exact V0 and Project documents used as authority;
- **First failing test:** the public behaviour expected to fail before implementation;
- **State and permission model:** statuses, roles, RLS and sensitive actions involved;
- **Data and side effects:** records, jobs, outbox/inbox events, artifacts and providers;
- **Evidence package:** command output, screenshots, IDs, hashes, logs, traces and recovery
  records required to close the behaviour.

## 3. Foundational Slices

These slices are implemented first. They provide a real end-to-end path used by every
later V0 outcome.

### V0-F0: Runnable Walking Skeleton

**Outcome:** A developer can start the V0 web, API, PostgreSQL, Redis, a deterministic
local storage simulator, queue processor and fake worker with one documented command; an
authenticated health page shows each dependency state.

**Includes:**

- monorepo structure for `apps/web`, `apps/api`, `workers/queue`, `workers/python`,
  `packages/contracts`, `packages/db`, `packages/config`, `tests` and `infra`;
- typed environment validation with redacted examples;
- health, readiness and build/version endpoints;
- local Supabase-compatible PostgreSQL/Auth setup or deterministic local auth adapter;
- Redis and a filesystem-backed local storage simulator;
- fake worker and fake provider process;
- CI entrypoints for format, typecheck, unit and contract tests.

**Primary records:** Schema migration metadata only. No speculative product tables.

**Contracts/jobs:** `GET /health`, `GET /ready`, versioned build metadata.

**Failure contract:** Readiness fails with the exact unavailable dependency while
liveness remains usable; secrets and connection strings are never returned.

**Evidence:**

- clean-machine startup transcript;
- readiness success and one dependency-failure test;
- web-to-API generated-client smoke test;
- documented shutdown and cleanup.

**Depends on:** None.  
**Gate:** V0-G0.

### V0-F1: Tenant-Safe Sign-In And Workspace Selection

**Outcome:** A user signs in, creates or selects a workspace, sees their role, and cannot
read or mutate another workspace by changing an ID.

**Includes:**

- Supabase Auth JWT validation;
- `User`, `Workspace`, `Membership` and role mapping;
- workspace creation and membership resolution;
- transaction-local workspace context;
- RLS policies and restricted runtime/migration roles;
- workspace switcher and unauthorized/not-found states;
- audit event for workspace creation and membership-sensitive actions.

**Primary records:** `User`, `Workspace`, `Membership`, `AuditEvent`.

**Contracts/jobs:** `POST /workspaces`; workspace-scoped request context.

**Failure contract:** Cross-workspace access is denied without revealing whether the
target resource exists. A missing or stale membership invalidates the request.

**Evidence:**

- two-workspace RLS integration suite;
- direct-object-reference attack test;
- role matrix tests from `V0_PERMISSIONS.md`;
- browser journey for sign-in, workspace creation and switching.

**Depends on:** V0-F0.  
**Gate:** V0-G0.

### V0-F2: Executable Contracts, Errors And Idempotency

**Outcome:** The web calls `/api/v0` only through a generated TypeScript client; a
duplicate costly request returns the original durable response and malformed input
returns a stable actionable error.

**Includes:**

- generated OpenAPI document and TypeScript client;
- shared request/response schemas without hand-maintained browser duplicates;
- RFC 9457 problem details and stable error registry;
- `IdempotencyRecord` with request-hash conflict detection;
- cursor envelope and deterministic ordering contract;
- contract-diff CI;
- request, actor, workspace, operation and trace correlation.

**Primary records:** `IdempotencyRecord`, `AuditEvent`.

**Contracts/jobs:** OpenAPI generation; one simulated costly mutation used to prove
idempotency.

**Failure contract:** Reusing an idempotency key with different input is rejected;
validation errors do not create domain state.

**Evidence:**

- reproducible OpenAPI and client generation;
- breaking-contract CI test;
- duplicate-same-input and duplicate-different-input integration tests;
- field-level browser error demonstration.

**Depends on:** V0-F0, V0-F1.  
**Gate:** V0-G0.

### V0-F3: Private Artifact Upload, Quarantine And Authorized Retrieval

**Outcome:** A workspace user uploads a test media file, watches it move from quarantine
to clean or rejected, and can retrieve only the authorized retained object.

**Includes:**

- private quarantine, clean-media and private-artifact areas;
- signed upload/download contracts scoped by workspace, key, method and expiry;
- content-type, extension, size, hash and media-container validation;
- isolated fake scanner/media validator;
- `Artifact` ownership, producer, schema, hash and retention class;
- lifecycle cleanup for unreferenced objects;
- B2-compatible adapter and local object-store simulator.

**Primary records:** `Artifact`, `InboxEvent`, `AuditEvent`.

**Contracts/jobs:** signed upload initiation/completion; `brand_asset_validate` as the
first worker-shaped validation job.

**Failure contract:** Cross-tenant keys, hash mismatch, active content, malformed media,
oversized payload and expired signed URLs are rejected.

**Evidence:**

- upload-to-clean and upload-to-rejected browser journeys;
- cross-tenant signed URL tests;
- object substitution/hash mismatch test;
- local/B2 adapter contract fixtures.

**Depends on:** V0-F1, V0-F2.  
**Gate:** V0-G0.

### V0-F4: Durable Job, Outbox And Private Worker Round Trip

**Outcome:** A user starts simulated media processing, receives `202` plus a canonical
job, watches progress, and receives a retained artifact even after duplicate delivery or
a worker crash.

**Includes:**

- `Job`, `JobAttempt`, `JobDependency`, `JobEvent` and `OutboxEvent`;
- transactionally committed domain mutation plus outbox;
- BullMQ opaque wake-up;
- atomic lease, heartbeat, expiry and retry;
- authenticated internal claim/heartbeat/complete/fail endpoints;
- input/output hash, object key, size and schema validation;
- CPU, GPU and AE resource-class queues;
- dead-letter state and cancellation foundation.

**Primary records:** `Job`, `JobAttempt`, `JobDependency`, `JobEvent`, `OutboxEvent`,
`Artifact`.

**Contracts/jobs:** `/jobs/{id}`, `/jobs/{id}/events`, internal worker API; simulated
media-processing job.

**Failure contract:** Redis loss, duplicate wake-up, lease expiry and crash after artifact
upload do not lose canonical work, create two completions or accept substituted output.

**Evidence:**

- happy-path job browser journey;
- Redis-loss recovery;
- duplicate-delivery test;
- worker-crash and completion-replay test;
- dead-letter visibility demonstration.

**Depends on:** V0-F1, V0-F2, V0-F3.  
**Gate:** V0-G0.

### V0-F5: Traceable Operations, Restore And Feature Capability Control

**Outcome:** An Owner or Admin can trace a request across API, outbox, queue, worker and
artifact; inspect failed jobs; disable a capability; and recover canonical state after a
restore drill.

**Includes:**

- OpenTelemetry trace propagation;
- structured logs and metrics for request rate, errors, queue age, retries, leases,
  dead letters and artifact validation;
- `ServiceCredential` metadata, secret-manager references, rotation status and
  environment/workspace ownership without storing secret values in PostgreSQL;
- protected Owner/Admin views or endpoints for job history and recovery actions;
- workspace capability configuration for unfinished slices;
- backup/PITR and object-reference restore procedure;
- local provider simulators with success, timeout, duplicate, malformed and bad-signature
  modes;
- secret redaction and log tests.

**Primary records:** `ServiceCredential`, `AuditEvent`, `JobEvent`, capability
configuration and restore evidence artifacts.

**Contracts/jobs:** protected operational read/retry actions; simulator controls limited
to local/staging environments.

**Failure contract:** Recovery actions cannot bypass authorization, duplicate external
side effects or mutate immutable financial/lineage state.

**Evidence:**

- end-to-end trace screenshot/record;
- queue-age and failure alert test;
- capability-disable test;
- PostgreSQL restore preserving RLS and artifact references;
- secret/signed-URL log scan.

**Depends on:** V0-F4.  
**Gate:** Completes V0-G0.

## 4. Brand Intelligence Slices

### V0-B1: Safe Brand Intake

**Outcome:** A client manager submits a website URL and approved files, sees crawl/upload
scope before execution, and receives a durable intake run.

**Includes:** URL normalization, crawl scope, robots/policy recording, SSRF protection,
safe redirects, upload association, rights declarations and intake status UI.

**Primary records:** `BrandCrawlRun`, `BrandAsset`, `Artifact`, `Job`.

**Contracts/jobs:** `POST /brands/crawl-runs`, `POST /brands/assets/uploads`;
`brand_crawl`, `brand_asset_validate`.

**Failure contract:** Private/link-local/metadata targets, unsafe redirects, unsupported
files and missing rights acknowledgement become blocked states.

**Evidence:** SSRF suite, malformed-file suite, crawl-scope audit and browser intake
journey.

**Depends on:** V0-F5.  
**Gate:** V0-G1.

### V0-B2: Evidence-Backed Brand Candidate Extraction

**Outcome:** The user sees extracted logo, color, font, tone, offer, USP, CTA, audience
and prohibited-claim candidates with confidence and source evidence.

**Includes:** crawl parsing, CSS/font/color analysis, copy extraction, prompt-injection
isolation, candidate provenance, partial results and explicit low-confidence states.

**Primary records:** `BrandCandidate`, `BrandAsset`, `Artifact`, `JobEvent`.

**Contracts/jobs:** candidate retrieval added to the brand contract; extraction children
of `brand_crawl`.

**Failure contract:** Malformed, empty, refused or schema-invalid AI/parser output cannot
become approved brand truth.

**Evidence:** deterministic site/document fixtures, prompt-injection test, partial-result
UI and candidate-source trace.

**Depends on:** V0-B1.  
**Gate:** V0-G1.

### V0-B3: Human-Approved Versioned Brand Memory

**Outcome:** A client manager edits candidates, records required/prohibited rules, approves
one exact profile version, and production APIs reject every unapproved or superseded
version.

**Includes:** review UI, version diff, approval/rejection, one-active-version constraint,
brand rules, approval audit and downstream brand-version contract.

**Primary records:** `BrandProfile`, `BrandApproval`, `BrandRule`, approved `BrandAsset`.

**Contracts/jobs:** `POST /brands/{brand_id}/approvals`.

**Failure contract:** Concurrent approvals cannot create two active profiles; revocation
or supersession prevents new production use without rewriting historical lineage.

**Evidence:** concurrent-approval test, downstream rejection test, version-diff browser
journey and approval audit.

**Depends on:** V0-B2.  
**Gate:** Completes V0-G1.

## 5. Blueprint Slices

### V0-P1: Explicit Blueprint Path Selection

**Outcome:** A client manager chooses either an approved existing blueprint or new viral
discovery; both paths create the same downstream blueprint-request contract.

**Includes:** library list with bounded pagination, compatibility metadata, empty library
state, explicit path choice and selected brand-profile version.

**Primary records:** `BlueprintLibraryEntry`, blueprint request identity.

**Contracts/jobs:** `GET /blueprints`.

**Failure contract:** The system never silently changes paths or uses an incompatible,
archived or cross-workspace blueprint.

**Evidence:** both-path contract test, empty-state browser journey and stale-selection
test.

**Depends on:** V0-B3.  
**Gate:** V0-G2.

### V0-P2: Viral Candidate Discovery And Immutable Metrics

**Outcome:** A client manager searches a real-estate niche, reviews ranked candidates and
selects one candidate with source/right warnings and frozen metric evidence.

**Includes:** Xpoz adapter, recorded fixtures, manual candidate fallback, bounded ranking,
metric observation time, rights warning and provider outage state.

**Primary records:** `ViralCandidate`, `MetricSnapshot`.

**Contracts/jobs:** `POST /viral-candidates/search`; `viral_candidate_search`.

**Failure contract:** Provider changes, empty results, malformed payloads and timeouts do
not fabricate candidates; manual fallback preserves provenance.

**Evidence:** adapter contract fixtures, ranking determinism test, provider-outage UI and
immutable snapshot proof.

**Depends on:** V0-P1.  
**Gate:** V0-G2.

### V0-P3: Rights-Aware Media Acquisition And Thumbnail Blueprint

**Outcome:** The selected candidate either produces an authorized retained analysis copy
and thumbnail blueprint or clearly blocks with the acquisition reason.

**Includes:** acquisition priority, approved retrieval policy, quarantine, thumbnail OCR,
composition, hook hypothesis, director translation and source hash.

**Primary records:** `MediaAcquisition`, `ThumbnailBlueprint`, `Artifact`.

**Contracts/jobs:** `POST /viral-candidates/{candidate_id}/extract-blueprint`;
`media_acquire`, `thumbnail_decipher`, `ocr_extract`.

**Failure contract:** Unavailable rights, unsupported retrieval, hash mismatch and
low-confidence OCR remain visible and stop dependent stages when required.

**Evidence:** authorized/blocked fixture journeys, thumbnail artifact schema validation
and source-hash trace.

**Depends on:** V0-P2.  
**Gate:** V0-G2.

### V0-P4: Multimodal Scene Blueprint

**Outcome:** The user watches scene detection, transcription, keyframes, vision and OCR
progress independently and receives a scene-level blueprint with partial/blocked states.

**Includes:** separate stage jobs, dependency graph, timestamp validation, transcript,
shots, motion, on-screen text, replacement guidance and resource-class isolation.

**Primary records:** `VideoBlueprint`, `BlueprintScene`, stage `Artifact` records.

**Contracts/jobs:** `scene_detect`, `transcribe`, `keyframe_extract`, `vision_analyze`,
`ocr_extract`.

**Failure contract:** Empty transcript, malformed model JSON, worker timeout, OOM and
partial stage failure cannot be reported as a complete blueprint.

**Evidence:** per-stage fixtures, malformed/empty AI-output tests, partial-state UI and
worker resource-isolation test.

**Depends on:** V0-P3.  
**Gate:** V0-G2.

### V0-P5: Immutable Blueprint, Formula And Director Prompt

**Outcome:** The user receives one immutable ready blueprint, derived structural formula
and provider-neutral director prompt; when extraction is not selected, the approved
default formula produces the same script input contract.

**Includes:** merge validation, formula slots, default formula, prompt version, replacement
instructions, compatibility metadata and library entry.

**Primary records:** `VideoBlueprint`, `FormulaDerivation`, `DirectorPrompt`,
`BlueprintLibraryEntry`.

**Contracts/jobs:** `blueprint_merge`, `formula_derive`, `director_prompt_generate`.

**Failure contract:** Missing required stages, inconsistent durations or invalid formula
slots block readiness. Ready records cannot be edited in place.

**Evidence:** extracted/default convergence contract test, immutability test, complete
lineage and ready-blueprint browser demo.

**Depends on:** V0-P1 and either V0-P4 or the default-formula path.  
**Gate:** Completes V0-G2.

## 6. Script Slices

### V0-S1: Auditable Script Tournament

**Outcome:** A client manager requests 10-20 brand/formula-constrained scripts and sees every
variant with hook, cadence, CTA, claims, captions, provenance and evaluation.

**Includes:** prompt/model versions, deterministic simulator, policy checks, brand-rule
checks, formula checks, refusal/malformed handling, progress and token/cost telemetry.

**Primary records:** `ScriptTournament`, `ScriptVariant`, `ScriptEvaluation`, artifacts.

**Contracts/jobs:** `POST /script-tournaments`; `script_tournament`.

**Failure contract:** Fewer than the required valid variants, policy violations or
schema-invalid output cannot silently advance to selection.

**Evidence:** variant-count boundary tests, prohibited-claim test, malformed/refusal tests
and tournament browser journey.

**Depends on:** V0-P5, V0-B3.  
**Gate:** V0-G3.

### V0-S2: Immutable Selected Script

**Outcome:** The client manager compares evaluated variants and selects one exact immutable
script version for generation.

**Includes:** comparison UI, explicit selection, approver identity, optimistic-version
check and downstream selected-script reference.

**Primary records:** `SelectedScript`.

**Contracts/jobs:** `POST /script-tournaments/{id}/select`.

**Failure contract:** Stale, unevaluated, rejected, cross-workspace or already superseded
variants cannot be selected; retries return the same selection.

**Evidence:** stale/double-select tests, immutable identity proof and selection audit.

**Depends on:** V0-S1.  
**Gate:** Completes V0-G3.

## 7. Avatar, Billing And Generation Slices

### V0-G1: Consent-Safe Avatar Selection

**Outcome:** The user selects an eligible generic, brand-ambassador or consented
real-person avatar and sees why an expired, revoked or out-of-scope avatar is unavailable.

**Includes:** avatar catalog, consent evidence, likeness/voice scope, expiry, revocation,
brand/workspace eligibility and service-fulfillment status where applicable.

**Primary records:** `AvatarProfile`, `AvatarConsent`, `Artifact`, `AuditEvent`.

**Contracts/jobs:** `GET /avatars`.

**Failure contract:** Revoked, expired, missing-evidence or wrong-workspace avatars cannot
enter a generation estimate or job.

**Evidence:** revocation/expiry tests, cross-workspace test and avatar-selection journey.

**Depends on:** V0-F5, V0-B3.  
**Gate:** V0-G4.

### V0-G2: Creator Wallet And Verified Credit Purchase

**Outcome:** A workspace purchases creator credits through Razorpay in India or Stripe
internationally and sees an append-only reconciled ledger.

**Includes:** wallet creation, price/currency policy, checkout initiation, signed callback
inbox, duplicate callback handling, purchase/refund/dispute status, Owner/Admin
adjustments, compensating ledger entries and wallet ledger view.

**Primary records:** `CreditWallet`, `CreditPurchase`, `CreditLedgerEntry`, `InboxEvent`.

**Contracts/jobs:** `POST /credit-purchases`, payment callbacks,
`GET /credit-wallets/{id}/ledger`.

**Failure contract:** Forged/replayed callbacks, amount/currency mismatch and duplicate
success never create duplicate credit. Refunds, disputes and adjustments never edit or
delete prior ledger entries.

**Evidence:** signed callback fixtures, replay test, purchase/refund/dispute reconciliation
tests, Admin adjustment permission test and purchase browser journey using simulators.

**Depends on:** V0-F5.  
**Gate:** V0-G4.

### V0-G3: Versioned Generation Estimate And Atomic Reservation

**Outcome:** The user sees the exact HeyGen route, configured price version, estimated
cost and maximum authorization, confirms once, and receives one active reservation.

**Includes:** duration/input validation, provider limits, estimate expiry, price version,
balance check, confirmation UI and transactional reservation.

**Primary records:** `ProviderPriceVersion`, `GenerationEstimate`, `GenerationJob`,
`CreditReservation`, `CreditLedgerEntry`.

**Contracts/jobs:** `POST /generation-estimates`, `POST /generation-jobs`.

**Failure contract:** Stale estimate, changed input, insufficient balance, double-click or
concurrent confirmation cannot over-reserve or create two generation jobs.

**Evidence:** concurrent reservation test, stale-price test, insufficient-credit UI and
one-reservation ledger proof.

**Depends on:** V0-S2, V0-G1, V0-G2.  
**Gate:** V0-G4.

### V0-G4: Exactly-Once HeyGen Submission

**Outcome:** A confirmed generation becomes one durable HeyGen operation, visibly moves
through queued/submitting/accepted/generating states and never blindly resubmits after an
uncertain timeout.

**Includes:** durable operation before network I/O, request hash, external ID,
`Retry-After`, concurrency limit, callback signature/inbox, polling and `unknown` state.

**Primary records:** `ProviderOperation`, `GenerationJob`, `Job`, `InboxEvent`.

**Contracts/jobs:** HeyGen callback, `provider_generate`, `reconcile_provider`,
generation status/cancel APIs.

**Failure contract:** Timeout after possible acceptance becomes `unknown`; duplicate
callback/submission and cancellation during uncertainty reconcile without a second paid
operation.

**Evidence:** crash-window test, timeout/unknown test, callback replay test, concurrency
test and provider-operation audit.

**Depends on:** V0-G3.  
**Gate:** V0-G4.

### V0-G5: Retained Generated Media And Settled Credits

**Outcome:** Completed HeyGen media is copied into private V0 storage, validated and
hashed; successful policy state captures credits once and failure releases them once.

**Includes:** transient provider URL acquisition, quarantine/validation, generated
segments/assets, provider cost reconciliation, capture/release and cancellation outcome.

**Primary records:** `GeneratedSegment`, `GeneratedAsset`, `Artifact`,
`CreditReservation`, `CreditLedgerEntry`, `CreativeLineage`.

**Contracts/jobs:** worker completion, `reconcile_credit`.

**Failure contract:** Missing/corrupt output, charge mismatch or crash between media
retention and ledger settlement is recoverable without orphaned capture or duplicate
release.

**Evidence:** success capture, failure release, crash-window reconciliation, media hash
and provider-total comparison.

**Depends on:** V0-G4.  
**Gate:** Completes V0-G4.

## 8. Composition Slices

### V0-C1: Validated Composition Intent And AE Plan

**Outcome:** The user supplies natural-language or structured composition direction and
receives a versioned timeline plan that either validates against the available capability
registry or explains every unsupported item.

**Includes:** normalized intent, selected assets only, timeline JSON schema, duration,
overlap, safe zones, captions, effects, fonts, plugins, templates and capability version.

**Primary records:** `CompositionInstruction`, `AePlan`, plan artifact.

**Contracts/jobs:** `POST /composition-plans`; `ae_plan_validate`.

**Failure contract:** The LLM cannot invent assets, fonts, plugins or effects; malformed
plans and capability mismatches remain `validation_failed`.

**Evidence:** schema fixtures, invented-asset test, overlap/safe-zone tests and plan
review browser journey.

**Depends on:** V0-G5, V0-F5 AE capability foundation.  
**Gate:** V0-G5.

### V0-C2: Reproducible Final Branded Render

**Outcome:** A validated AE plan renders one retained 9:16 final MP4, thumbnail and
captions with exact input hashes and capability version; the user can request a new
revision without overwriting the prior render.

**Includes:** licensed AE worker readiness, one-job default concurrency, golden render,
render attempt logs, output validation, fingerprint and revision lineage.

**Primary records:** `RenderAttempt`, `FinalVideo`, `Artifact`, `CreativeLineage`.

**Contracts/jobs:** `POST /composition-plans/{id}/render`; `ae_render`.

**Failure contract:** License, template, font, plugin, codec, worker crash and output-hash
failures are classified; incompatible workers never claim the job.

**Evidence:** golden-video comparison, capability-drift test, worker-crash recovery,
immutable prior revision and final-media hash.

**Depends on:** V0-C1.  
**Gate:** Completes V0-G5.

## 9. Review Slices

### V0-R1: Exact-Version Review And Comments

**Outcome:** Internal and client reviewers inspect video, thumbnail, caption and script,
add timestamped comments and request changes against one exact final-video version.

**Includes:** review item, role-limited access, comment threads, notification, version
display, loading/processing states and archived history.

**Primary records:** `ReviewItem`, `ReviewComment`, `Notification`.

**Contracts/jobs:** review comment API; `review_notify`, `send_notification`.

**Failure contract:** Comments cannot attach to another workspace/version; duplicate
notifications collapse to one logical notification.

**Evidence:** role tests, cross-version test, timestamped-comment journey and notification
idempotency.

**Depends on:** V0-C2.  
**Gate:** V0-G6.

### V0-R2: Auditable Approval Bound To Final Media

**Outcome:** An authorized actor approves, rejects or requests changes for one exact final
video; only the current approved version becomes schedulable.

**Includes:** decision reason, actor, media fingerprint, optimistic version, supersession
and downstream approval token/reference.

**Primary records:** `ReviewDecision`, `ReviewItem`, `FinalVideo`, `AuditEvent`.

**Contracts/jobs:** `POST /review-items/{id}/decisions`.

**Failure contract:** Stale review tabs, superseded renders, wrong roles and replayed
decisions cannot approve different media.

**Evidence:** stale/superseded approval tests, permission tests, exact hash/decision trace
and approval journey.

**Depends on:** V0-R1.  
**Gate:** Completes V0-G6.

## 10. Calendar, Publishing And Verification Slices

### V0-U1: Approved Calendar And Manual Export Fallback

**Outcome:** The user schedules an approved exact video with platform/account/caption
identity or exports it manually and later supplies the live post URL for verification.

**Includes:** calendar create/edit, timezone handling, account authorization, schedule
conflict handling, media identity, manual package and manual URL state.

**Primary records:** `CalendarPost`, export `Artifact`.

**Contracts/jobs:** `POST /calendar-posts`.

**Failure contract:** Unapproved/superseded media, past/invalid schedules, wrong account
and stale caption/media versions cannot become publishable.

**Evidence:** timezone boundary tests, superseded-media test, manual export package and
calendar browser journey.

**Depends on:** V0-R2.  
**Gate:** V0-G7.

### V0-U2: Idempotent Meta Publication

**Outcome:** An authorized Owner, Admin or Client Manager publishes the approved calendar post to the intended
Meta account and receives one external post identity or a recoverable uncertain state.

**Includes:** Meta adapter/simulator, credential metadata, account confirmation,
idempotency, callback/polling, external ID/public URL and provider reconciliation.

**Primary records:** `PublishOperation`, `CalendarPost`, `InboxEvent`.

**Contracts/jobs:** `POST /calendar-posts/{id}/publish`, publishing callback;
`publish_post`, `reconcile_publishing`.

**Failure contract:** Retry, timeout, callback replay and worker crash never create two
posts or switch accounts/media.

**Evidence:** duplicate-publish test, wrong-account test, timeout reconciliation and Meta
simulator journey.

**Depends on:** V0-U1.  
**Gate:** V0-G7.

### V0-U3: Idempotent YouTube Shorts Publication

**Outcome:** An authorized Owner, Admin or Client Manager publishes the same approved contract to YouTube
Shorts with quota-aware behavior and one external post identity.

**Includes:** YouTube adapter/simulator, quota state, account confirmation, upload
processing state and the same internal publication contract as Meta.

**Primary records:** `PublishOperation`, `CalendarPost`, `InboxEvent`.

**Contracts/jobs:** existing publish API and `publish_post`.

**Failure contract:** Quota exhaustion, delayed processing, duplicate retry and account
mismatch are visible and do not corrupt the Meta/manual paths.

**Evidence:** shared adapter contract tests, quota-exhausted UI, duplicate test and
YouTube simulator journey.

**Depends on:** V0-U1; may run after or alongside V0-U2 once the internal contract is
stable.  
**Gate:** V0-G7.

### V0-U4: Audience-Facing Verification And One Completion Notification

**Outcome:** The system independently verifies target account, media identity, caption,
visibility and publish timing; only then does the post become `published_verified` and
send one success notification.

**Includes:** configurable bounded retries, delayed propagation, evidence artifact,
identity mismatch, visibility restriction, manual URL verification and processing/failure
notifications.

**Primary records:** `PostVerification`, `Notification`, `CalendarPost`,
`PerformanceSnapshot` initial observation.

**Contracts/jobs:** `POST /calendar-posts/{id}/verify`; `verify_post`,
`send_notification`.

**Failure contract:** Provider acknowledgement alone never becomes success. Wrong media,
wrong account, restricted visibility and missing manual URL remain explicit non-success
states.

**Evidence:** delayed-processing test, identity-mismatch test, manual URL journey,
notification dedupe and audience evidence reference.

**Depends on:** V0-U1 and one of V0-U2/V0-U3 or manual publication.  
**Gate:** Completes V0-G7.

## 11. Production Acceptance Slices

### V0-A1: Complete Creative Lineage And Performance Snapshot

**Outcome:** An authorized user can inspect/export the ancestry from approved brand and
blueprint through script, avatar, provider, render, review, publication, cost and initial
performance observation.

**Includes:** lineage traversal, immutable observation window, bounded export, cost
attribution, source/provider timestamps and artifact manifest.

**Primary records:** `CreativeLineage`, `PerformanceSnapshot`, `Artifact`, ledger and
audit references.

**Contracts/jobs:** `performance_collect`; bounded lineage/export read contract.

**Failure contract:** Missing ancestry, hash mismatch, stale metrics and cross-workspace
references make the export incomplete/blocked rather than silently trusted.

**Evidence:** full ancestry assertion, immutable snapshot test, bounded export and
hash-verified manifest.

**Depends on:** V0-U4.  
**Gate:** V0-G8.

### V0-A2: Security, Recovery And Load-Shaped Hardening

**Outcome:** Operators demonstrate that V0 survives Redis loss, worker crashes, callback
replay, provider uncertainty, queue backlog and database restore without tenant exposure,
duplicate paid work, lost lineage or false publication success.

**Includes:** security zero-tolerance suite, two-hour queue-backlog simulation, restore,
provider/credit/publish reconciliation, B2 benchmark, connection-pool and queue metrics,
incident/runbook rehearsal.

**Primary records:** evidence artifacts and audit/job/ledger records produced by drills.

**Contracts/jobs:** every external boundary and reconciliation endpoint.

**Failure contract:** Any cross-tenant access, duplicate capture/submission, wrong
publication, unsigned mutation, secret leak or use-after-revocation blocks release.

**Evidence:** signed test report, restore report, India-to-B2 benchmark, alert screenshots,
reconciliation totals and rollback rehearsal.

This slice also proves:

- workspace export is bounded, authorized and hash-manifested;
- consent revocation blocks future avatar use immediately;
- deletion revokes access before binary lifecycle purge;
- financial, audit and published-lineage records follow their retention basis;
- provider credentials can be rotated without exposing secret values.

**Depends on:** All preceding functional slices used by the reference journey.  
**Gate:** V0-G8.

### V0-A3: Standalone Real-Estate Reference Journey

**Outcome:** One India-first real-estate workspace completes brand intake through verified
publication without manual intervention inside the pipeline, while V1 and V2 are absent.

**Includes:** real/staging-approved providers, exact screenshots, stable IDs/hashes,
ledger reconciliation, manual-intervention time capture, first-video timing, revisions, cost and
pilot scorecard evidence.

**Primary records:** All V0 production records.

**Contracts/jobs:** Complete `/api/v0` and job graph.

**Failure contract:** No manual database edits, hidden provider retries, unrecorded file
movement, V1/V2 calls or evidence gaps are permitted.

**Evidence:**

- brand approval screenshot and ID;
- blueprint choice and immutable artifact hashes;
- complete script tournament and selected-script ID;
- estimate, reservation, provider operation and settled ledger;
- AE plan, final-video hash and review decision;
- calendar post, external ID, public URL and audience verification;
- complete lineage manifest;
- recovery/security reports;
- founder-reviewed pilot scorecard.

**Depends on:** V0-A1, V0-A2.  
**Gate:** Completes V0-G8 and Product V0.

## 12. Detailed Slice Execution Matrix

This matrix is the task-planning layer for agentic engineering. The slice cards above
define the product outcome. This matrix defines how implementation work starts, what must
be built through the stack and what evidence closes the slice. Agents may split a row
into smaller behaviours, but must not drop the row's first failing behaviour or closure
evidence.

### Foundation Execution Detail

| Slice | First failing behaviour | Implementation focus | Closure evidence |
|---|---|---|---|
| `V0-F0` | `pnpm dev` or the documented local command does not start all required V0 services, and `/ready` cannot report dependency state through the generated client. | Create the workspace scaffold, typed env validation, health/readiness routes, local services, fake provider/worker, build metadata and CI entrypoints without product tables. | Clean-machine startup transcript, generated-client smoke test, dependency-failure readiness test, command list and shutdown/cleanup proof. |
| `V0-F1` | User A can alter a workspace ID and see or mutate User B's workspace state. | Implement Supabase Auth validation, user/workspace/membership records, role resolution, RLS policies, audit events and workspace switch UI. | Two-workspace RLS suite, direct-object-reference denial, role matrix tests, sign-in/create/switch browser evidence. |
| `V0-F2` | Reusing an idempotency key with different input is accepted or malformed input creates state. | Generate OpenAPI and TypeScript client, implement RFC 9457 errors, cursor envelopes, idempotency records and contract-diff CI. | Red/green idempotency tests, duplicate-same-input proof, duplicate-different-input rejection, generated artifact reproducibility. |
| `V0-F3` | A cross-tenant or expired signed URL can access an artifact, or a hash mismatch is accepted. | Implement private artifact records, signed upload/download, quarantine/clean/private storage adapters, media validation and lifecycle cleanup. | Upload-to-clean/rejected browser flows, cross-tenant signed URL tests, object-substitution test, local/B2 adapter fixtures. |
| `V0-F4` | Duplicate delivery or worker crash creates two completions, loses work or accepts substituted output. | Add canonical PostgreSQL jobs, attempts, dependencies, events, outbox, BullMQ wake-ups, worker claim/heartbeat/complete/fail APIs and dead-letter visibility. | Redis-loss recovery, duplicate-delivery test, worker-crash replay test, job status UI and dead-letter evidence. |
| `V0-F5` | An Owner/Admin cannot trace or safely recover failed work, or recovery bypasses authorization/immutability. | Add OpenTelemetry propagation, structured metrics/logs, credential metadata, protected recovery controls, capability flags, restore drill and simulator modes. | End-to-end trace evidence, queue-age alert, capability-disable test, restore report preserving RLS/artifacts and secret/signed-URL log scan. |

### Brand And Blueprint Execution Detail

| Slice | First failing behaviour | Implementation focus | Closure evidence |
|---|---|---|---|
| `V0-B1` | Brand intake accepts a private/link-local URL, unsafe redirect, unsupported file or missing rights acknowledgement. | Build URL normalization, crawl scope preview, robots/policy recording, upload association, rights declaration and intake status states. | SSRF suite, malformed-file suite, crawl-scope audit, browser journey for URL plus approved files. |
| `V0-B2` | Malformed, empty, refused or prompt-injected extraction output can become a candidate without source evidence. | Parse crawl/assets, isolate prompt input, extract brand fields with confidence and provenance, support partial/low-confidence states. | Deterministic site/document fixtures, prompt-injection test, partial-result UI, candidate-source trace. |
| `V0-B3` | Two concurrent approvals create two active profiles, or a superseded profile can be used downstream. | Implement candidate editing, version diff, approval/rejection, brand rules, one-active-version constraint and downstream approved-version contract. | Concurrent approval test, downstream rejection test, version diff browser evidence and approval audit. |
| `V0-P1` | The system silently selects a blueprint path or accepts archived/cross-workspace/incompatible blueprint input. | Build explicit existing/discovery/default choice, bounded library list, compatibility metadata, empty states and selected brand-profile binding. | Existing and discovery contract convergence test, stale selection rejection, empty-state browser journey. |
| `V0-P2` | Provider outage, empty results, malformed payloads or changed metrics fabricate or mutate candidate evidence. | Add Xpoz adapter behind simulator, candidate ranking, manual fallback, immutable metric snapshots, source/right warnings and outage states. | Adapter fixtures, deterministic ranking test, provider-outage UI and immutable snapshot proof. |
| `V0-P3` | Unauthorized media acquisition, hash mismatch or low-confidence OCR proceeds as if blueprint input is ready. | Implement rights-aware acquisition, quarantine, retained analysis copy, thumbnail OCR, hook hypothesis, source hash and blocked acquisition states. | Authorized and blocked fixture journeys, thumbnail schema validation, source-hash trace. |
| `V0-P4` | Partial scene/transcript/keyframe/vision/OCR failure is reported as a complete blueprint. | Implement separate stage jobs, dependency graph, timestamps, transcript, keyframes, vision, OCR, replacement guidance and resource-class isolation. | Stage fixtures, malformed/empty model output tests, partial-state UI, worker resource-isolation proof. |
| `V0-P5` | A ready blueprint can be edited in place or extracted/default paths produce incompatible script input contracts. | Validate merge, derive formula slots, generate provider-neutral director prompt, support approved default formula and create immutable library entries. | Extracted/default convergence test, immutability test, complete lineage and ready-blueprint browser demo. |

### Script, Avatar, Billing And Generation Execution Detail

| Slice | First failing behaviour | Implementation focus | Closure evidence |
|---|---|---|---|
| `V0-S1` | The tournament advances with fewer than 10 valid scripts, prohibited claims, schema-invalid output or missing evaluations. | Generate 10-20 variants through deterministic simulator/adapter, preserve prompt/model versions, evaluate hook/timing/CTA/claims/captions/tone and expose progress. | Variant-count boundary tests, prohibited-claim test, malformed/refusal tests and tournament browser journey. |
| `V0-S2` | A stale, unevaluated, rejected, superseded or cross-workspace variant can be selected for generation. | Build comparison UI, explicit immutable selected-script record, optimistic-version guard, approver identity and idempotent selection. | Stale/double-select tests, immutable identity proof and selection audit. |
| `V0-G1` | Expired, revoked, missing-evidence or wrong-workspace avatar can enter a generation estimate. | Build avatar catalog, consent evidence, likeness/voice scope, expiry/revocation checks, brand/workspace eligibility and unavailable reasons. | Revocation/expiry tests, cross-workspace test and avatar-selection browser journey. |
| `V0-G2` | Forged/replayed payment callback or amount/currency mismatch creates duplicate credit or edits ledger history. | Implement wallet, purchase, signed callback inbox, refunds/disputes, Admin adjustments and append-only ledger view for Razorpay/Stripe simulators. | Signed callback fixtures, replay rejection, purchase/refund/dispute reconciliation and Admin adjustment permission test. |
| `V0-G3` | Stale estimate, insufficient balance, changed input, double-click or concurrent confirmation creates over-reservation or duplicate generation. | Implement price versions, estimate expiry, balance checks, maximum authorization, confirmation UI and transactional credit reservation. | Concurrent reservation test, stale-price test, insufficient-credit UI and one-reservation ledger proof. |
| `V0-G4` | Timeout after possible HeyGen acceptance is retried blindly or creates a second provider operation. | Persist provider operation before network I/O, handle request hashes, external IDs, callbacks, polling, concurrency limits, cancellation and `unknown`. | Crash-window test, timeout-to-unknown test, callback replay test, concurrency test and provider-operation audit. |
| `V0-G5` | Crash between media retention and settlement causes orphaned capture, duplicate release or untrusted provider media. | Copy provider media to private storage, validate/hash it, create generated assets, reconcile provider cost and settle reservation exactly once. | Success capture proof, failure release proof, crash-window reconciliation, media hash and provider-total comparison. |

### Composition, Review And Publishing Execution Detail

| Slice | First failing behaviour | Implementation focus | Closure evidence |
|---|---|---|---|
| `V0-C1` | The AE plan accepts invented assets, fonts, plugins, invalid timing, unsafe zones or unsupported capabilities. | Normalize user direction, bind selected assets, validate timeline schema, captions, effects, fonts, plugins, templates and capability version. | Schema fixtures, invented-asset test, overlap/safe-zone tests and plan review browser journey. |
| `V0-C2` | Render overwrites a prior final video, ignores input hashes or accepts incompatible worker output. | Implement licensed AE readiness, one-job concurrency, render attempts, golden render comparison, output validation, fingerprints and revision lineage. | Golden-video comparison, capability-drift test, worker-crash recovery, immutable prior revision and final-media hash. |
| `V0-R1` | Reviewer comments attach to the wrong workspace/version or duplicate notifications are sent. | Build exact-version review item, video/thumbnail/caption/script preview, timestamped comments, role access and notification dedupe. | Role tests, cross-version comment test, timestamped-comment browser journey and notification idempotency. |
| `V0-R2` | Stale tabs, wrong roles, superseded renders or replayed decisions approve different media. | Bind approval/rejection/change request to actor, exact final-video fingerprint, optimistic version, supersession and downstream approval reference. | Stale/superseded approval tests, permission tests, exact hash/decision trace and approval journey. |
| `V0-U1` | Unapproved/superseded media, wrong account, stale caption or invalid timezone becomes publishable. | Build calendar create/edit, platform/account/caption/media identity, timezone handling, schedule conflict checks and manual export package. | Timezone boundary tests, superseded-media test, manual export package and calendar browser journey. |
| `V0-U2` | Meta retry, timeout, callback replay or worker crash creates two posts or switches account/media. | Implement Meta adapter/simulator, credential metadata, account confirmation, idempotent publish operation, callbacks/polling and reconciliation. | Duplicate-publish test, wrong-account test, timeout reconciliation and Meta simulator journey. |
| `V0-U3` | YouTube quota exhaustion, delayed processing, duplicate retry or account mismatch corrupts shared publication state. | Implement YouTube adapter/simulator using the same internal publish contract, quota state, processing state and account confirmation. | Shared adapter contract tests, quota-exhausted UI, duplicate test and YouTube simulator journey. |
| `V0-U4` | Provider acknowledgement alone marks success, or wrong media/account/visibility sends completion notification. | Implement audience verifier, bounded retries, delayed propagation, manual URL verification, evidence artifact, status transition to `published_verified` and one notification. | Delayed-processing test, identity-mismatch test, manual URL journey, notification dedupe and audience evidence reference. |

### Acceptance Execution Detail

| Slice | First failing behaviour | Implementation focus | Closure evidence |
|---|---|---|---|
| `V0-A1` | Lineage export silently omits ancestry, accepts hash mismatch or leaks cross-workspace references. | Implement bounded lineage traversal/export from brand through performance snapshot, cost attribution, timestamps and artifact manifest. | Full ancestry assertion, immutable snapshot test, bounded export and hash-verified manifest. |
| `V0-A2` | Recovery/load/security drills expose tenant data, duplicate paid work, lose lineage or falsely report publication success. | Run zero-tolerance security suite, queue backlog simulation, Redis loss, worker crash, callback replay, provider uncertainty, restore, B2 benchmark and reconciliation drills. | Signed test report, restore report, India-to-B2 benchmark, alert screenshots, reconciliation totals and rollback rehearsal. |
| `V0-A3` | The reference real-estate journey needs manual database edits, hidden retries, V1/V2 calls or has evidence gaps. | Execute the full production-shaped journey with V1/V2 absent, approved providers/simulators as allowed, screenshots, IDs, hashes, cost and pilot scorecard. | Brand approval, blueprint choice, selected script, estimate/reservation/provider/ledger, AE plan, final hash, review, calendar, external ID, public URL, verification, lineage manifest and founder-reviewed scorecard. |

## 13. Slice Dependency Graph

```text
F0 -> F1 -> F2 -> F3 -> F4 -> F5
                          |
                          +-> B1 -> B2 -> B3
                                          |
                                          +-> P1 -> P2 -> P3 -> P4 -> P5
                                          |                         |
                                          |                         +-> S1 -> S2
                                          |                                  |
                                          +-> G1 -----------------------------+
F5 -> G2 -----------------------------------------------------------> G3
                                                                      |
                                                                      v
                                                               G4 -> G5
                                                                      |
                                                                      v
                                                               C1 -> C2
                                                                      |
                                                                      v
                                                               R1 -> R2
                                                                      |
                                                                      v
                                                               U1 -> U2/U3
                                                                      |
                                                                      v
                                                                     U4
                                                                      |
                                                                      v
                                                                     A1
                                                                      |
                                               all critical paths -> A2 -> A3
```

## 14. Parallel Execution Lanes

No parallel feature work begins before V0-F5.

| Lane | Slices | Merge dependency |
|---|---|---|
| Foundation | F0 -> F1 -> F2 -> F3 -> F4 -> F5 | Must complete first |
| Brand/creative | B1 -> B2 -> B3 -> P1 -> P2 -> P3 -> P4 -> P5 -> S1 -> S2 | Foundation |
| Billing/provider | G2; then G3 -> G4 -> G5 after S2 and G1 | Foundation plus selected script/avatar |
| Avatar | G1 | Foundation and approved brand |
| Composition | AE readiness during F5; C1 -> C2 after G5 | Generated asset |
| Review/publishing | Simulator scaffolds after F5; R1 -> R2 -> U1 -> U2/U3 -> U4 after C2 | Final video |
| Acceptance | A1 -> A2 -> A3 | All required paths |

Parallel lanes may create adapters, fixtures and tests early, but cannot fabricate the
immutable predecessor identity they consume.

## 15. V0 Gate Coverage

| V0 gate | Closing slices |
|---|---|
| V0-G0 Foundation | F0-F5 |
| V0-G1 Brand | B1-B3 |
| V0-G2 Blueprint | P1-P5 |
| V0-G3 Scripts | S1-S2 |
| V0-G4 Generation | G1-G5 |
| V0-G5 Composition | C1-C2 |
| V0-G6 Review | R1-R2 |
| V0-G7 Publishing | U1-U4 |
| V0-G8 Production | A1-A3 |

## 16. Requirement Traceability

| V0 requirement area | Owning slices |
|---|---|
| Runnable environments and local simulators | F0, F5 |
| Identity, workspaces, roles, RLS and audit | F1 |
| OpenAPI, generated client, errors and idempotency | F2 |
| Private B2 artifacts, quarantine and signed access | F3 |
| PostgreSQL jobs, BullMQ wake-ups and private workers | F4 |
| Telemetry, credentials, Admin recovery and restore | F5, A2 |
| URL/file brand intake and crawl safety | B1 |
| Evidence-backed brand extraction | B2 |
| Human-approved versioned brand truth | B3 |
| Existing/new blueprint choice | P1 |
| Xpoz discovery and immutable metrics | P2 |
| Rights-aware acquisition and thumbnail deciphering | P3 |
| Scene, transcript, keyframe, vision and OCR processing | P4 |
| Blueprint merge, formula, prompt and default fallback | P5 |
| 10-20 scripts and evaluations | S1 |
| Immutable exact script selection | S2 |
| Avatar catalog, consent, expiry and revocation | G1, A2 |
| Razorpay/Stripe purchase, refund, dispute and adjustment | G2 |
| Estimate, price version and credit reservation | G3 |
| HeyGen submission, callbacks, limits and unknown state | G4 |
| Retained provider media and capture/release | G5 |
| User direction and validated AE plan | C1 |
| Licensed AE render, thumbnail, captions and revisions | C2 |
| Review comments and notifications | R1 |
| Exact-version approval/rejection/change request | R2 |
| Calendar, timezone and manual export fallback | U1 |
| Meta publication | U2 |
| YouTube Shorts publication | U3 |
| Audience verification and completion notification | U4 |
| Creative/cost/publication/performance lineage | A1 |
| Security, load, deletion, retention and recovery | A2 |
| Standalone real-estate acceptance and pilot evidence | A3 |

## 17. Data Model Traceability

| Model group | Owning slices |
|---|---|
| `User`, `Workspace`, `Membership` | F1 |
| `ServiceCredential` | F5 |
| `BrandProfile`, `BrandCrawlRun`, `BrandCandidate`, `BrandAsset`, `BrandApproval`, `BrandRule` | B1-B3 |
| `ViralCandidate`, `MetricSnapshot`, `MediaAcquisition`, `ThumbnailBlueprint` | P2-P3 |
| `VideoBlueprint`, `BlueprintScene`, `FormulaDerivation`, `DirectorPrompt`, `BlueprintLibraryEntry` | P1, P4-P5 |
| `ScriptTournament`, `ScriptVariant`, `ScriptEvaluation`, `SelectedScript` | S1-S2 |
| `AvatarProfile`, `AvatarConsent` | G1 |
| `GenerationEstimate`, `GenerationJob`, `ProviderOperation`, `GeneratedSegment`, `GeneratedAsset` | G3-G5 |
| `CompositionInstruction`, `AePlan`, `RenderAttempt`, `FinalVideo` | C1-C2 |
| `CreditWallet`, `CreditPurchase`, `CreditReservation`, `CreditLedgerEntry`, `ProviderPriceVersion` | G2-G5 |
| `ReviewItem`, `ReviewComment`, `ReviewDecision` | R1-R2 |
| `CalendarPost`, `PublishOperation`, `PostVerification`, `Notification` | U1-U4 |
| `PerformanceSnapshot`, `CreativeLineage` | G5, U4, A1 |
| `Artifact`, `AuditEvent`, `IdempotencyRecord`, `OutboxEvent`, `InboxEvent` | F1-F5 and owning domain slices |
| `Job`, `JobAttempt`, `JobDependency`, `JobEvent` | F4 and every asynchronous slice |

## 18. API And Job Traceability

| Contract family | Owning slices |
|---|---|
| Workspace and membership context | F1 |
| Brand crawl, uploads and approvals | B1-B3 |
| Blueprint library and viral discovery | P1-P5 |
| Script tournament and selection | S1-S2 |
| Avatar list | G1 |
| Credit purchases and ledger | G2 |
| Generation estimate, create, status and cancel | G3-G5 |
| Composition plan and render | C1-C2 |
| Review comments and decisions | R1-R2 |
| Calendar create, publish and verify | U1-U4 |
| Job status and events | F4 |
| HeyGen, payment and publishing callbacks | G2, G4, U2-U3 |
| Internal worker claim, heartbeat, complete and fail | F4 |
| Provider, credit and publishing reconciliation | G4-G5, U2-U4 |
| Every named V0 job type | F3-F5, B1-B2, P2-P5, S1, G4-G5, C1-C2, R1, U2-U4, A1 |

## 19. Explicit V0 Exclusions

The slices must not implement:

- template clustering across blueprints;
- Google Flow, KlingAI, Higgsfield, Magnific or other automated generation providers;
- TikTok Direct Post;
- automated A/B testing;
- V2 briefs, scoring, HCP/A-Q evidence, recommendations or model learning;
- scientific or guaranteed virality claims;
- any table, API, job or runtime dependency whose only consumer is V1 or V2.

## 20. Release Invariant Traceability

| Release-blocking invariant | Proving slices |
|---|---|
| No unapproved brand enters production | B3, P1, S1, G3 |
| No cross-workspace access succeeds | F1, F3, every domain slice, A2 |
| No paid provider submission/capture occurs twice | F2, G2-G5, A2 |
| No uncertain provider operation is blindly resubmitted | G4, A2 |
| No unconsented avatar, voice, media or brand asset is used | B1-B3, G1, A2 |
| No approval applies to different/superseded media | C2, R1-R2, U1 |
| No publication succeeds before audience verification | U2-U4 |
| No workflow requires a later product version | F0, A3 |
| No secret enters browser code, logs, prompts or artifacts | F0, F5, A2 |

## 21. Role Traceability

| Role | Slice outcomes exercised |
|---|---|
| Owner/Admin | Workspace, credentials, recovery, reconciliation, export/deletion and all approval paths |
| Client Manager | B1-B3, P1-P5, S1-S2, G1-G3, R1-R2 and U1-U4 production, wallet and publishing paths |
| Reviewer | R1 comments and read-only review evidence |

Role access never bypasses brand approval, consent, credit, exact-version review or
publication verification.

## 22. Implementation Start Rule

Begin with V0-F0 only. A task-level implementation plan may split one slice into small
TDD tasks, but it must preserve the slice outcome and evidence contract. The next slice
starts only after the current slice's required evidence is retained and reviewed.
