# V0 Functional Workflow UI Plan

## Summary

Replace the current static workflow map in `apps/web/src/components/ForgeWorkspaceApp.tsx`
with a real V0 production interface for the 21-step brand-to-publication journey. The UI
will use the generated `V0Client` from `packages/contracts/generated/v0-client.mjs`,
route-specific forms/actions, canonical statuses, evidence panels, guarded irreversible
confirmations, and durable object outputs.

This plan is Product V0 only. It does not add backend behaviour, new provider claims,
V1/V2 navigation, fake forms, generic dashboard cards, or marketing feature lists. Where
a backend read endpoint is missing, the UI will show the last durable response after
mutation, linked jobs, or an explicit "not available yet" empty/recovery state rather
than inventing data.

Authoritative sources read: `docs/V0/V0.md`, `V0_VERTICAL_OUTCOME_SLICES.md`,
`V0_INFORMATION_ARCHITECTURE.md`, `V0_SCREEN_AND_STATE_INVENTORY.md`, `V0_API.md`,
`V0_STATUS_ENUMS.md`, `V0_PERMISSIONS.md`, `V0_ERROR_CATALOG.md`,
`V0_BRAND_PROFILE_CONTRACT.md`, `V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`,
`docs/Project/DESIGN.md`, `PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`, project guardrails,
and current `apps/web` / `apps/api` code.

## Key Changes

- Replace the hard-coded bullet/card workflow with a workspace shell plus functional route
  screens for the 21 V0 steps.
- Add a small frontend state/data layer that wraps `V0Client`, idempotency-key creation,
  safe error mapping, local journey context, and canonical status presentation.
- Add route-specific forms, result panels, progress/job panels, evidence displays,
  review/approval surfaces, money panels, media/version panels, publication verification
  panels, and lineage views.
- Remove dependence on static demo data from `apps/web/src/data.ts` for authenticated
  product workflow screens.
- Update tests so UI correctness is based on real controls, API method wiring, states,
  evidence and secret-hiding rules, not the mere presence of step labels.

## Functional UX Map And I/O Visualization

| Step | Functional behaviour and user problem | Inputs and backend | Processing, output, and screen | States, rules, hidden data, downstream, acceptance |
|---:|---|---|---|---|
| 1. Brand intake | Starts brand truth from a company URL, not a questionnaire. Solves "how do I safely begin brand extraction?" | User: company URL, rights acknowledgement, optional approved files only if supported. System: workspace, role, idempotency key. API: `POST /brands/crawl-runs`, upload APIs. | Screen: URL field as primary object, crawl-scope/rights panel, optional upload queue, primary CTA `Start brand intake`. Success shows crawl run id, brand id, job id, submitted URL, safety status. | Loading: submitting and upload scanning. Empty: one URL input. Success: run created. Error: invalid/private URL, rights missing, unsupported files. Permission: Owner/Admin/Client Manager. Hide raw redirects, signed URLs, storage keys. Downstream: candidates. Acceptance: URL-only path can create durable intake run. |
| 2. Brand candidates | Shows extraction results as candidates, never truth. Solves "what did the system infer and why?" | System: crawl run id. API: `GET /brands/crawl-runs/{id}/candidates`; job/event links where available. | Screen: extraction progress spine plus candidate review table grouped by identity, visual identity, voice, offers, CTA, audiences, prohibited claims. Each value shows source, evidence excerpt hash, confidence, conflict/low-confidence. CTA `Review profile`. | Loading: fetching candidates/job status. Empty: crawl has no candidates yet. Success: candidates ready. Failure: refused/empty/schema-invalid extraction. Validate no evidence-free candidate is approvable. Hide raw provider output. Downstream: approval. Acceptance: every candidate row has source + confidence + decision state. |
| 3. Brand approval | Turns selected candidates into immutable approved brand truth. Solves "what exactly becomes production source of truth?" | User: resolves required fields, approves/rejects/refines supported fields, rights attestation. System: latest profile version, brand id, crawl run id. API: `POST /brands/{brand_id}/approvals`. | Screen: candidate-vs-approved diff editor, required field checklist, claims/rules panel, approval confirmation naming version and permanence. Success shows profile id/version, approval actor, active status. | Loading: approving. Empty: no candidates. Success: approved. Error: stale version, missing required field, source conflict. Permission: Owner/Admin/Client Manager. Hide legal restricted values unless returned. Downstream: blueprint path. Acceptance: approval cannot proceed without required fields and rights attestation. |
| 4. Blueprint path | Requires explicit existing/new/default path. Solves "which structure source feeds scripts?" | User: chooses existing blueprint, new discovery, or default formula. System: approved brand profile/version. APIs: `GET /blueprints`, `POST /blueprint-requests`. | Screen: segmented path selector with library list, compatibility metadata, default formula option, objective field. Primary CTA changes by path. Success shows blueprint request id and selected path. | Loading: library fetch. Empty: no library, offer discovery/default. Error: stale brand, incompatible/archived blueprint. Permission: select blueprint/run scripts. Hide cross-workspace blueprint existence. Downstream: library selection, discovery, or ready blueprint. Acceptance: no silent path choice. |
| 5. Blueprint library | Selects compatible reusable blueprint. Solves "reuse proven internal structure without new acquisition." | User: selects compatible entry. System: brand profile id/version, cursor/limit. APIs: `GET /blueprints`, `POST /blueprint-requests/{id}/ready-blueprint`. | Screen: bounded blueprint list with status, compatibility, formula preview, evidence link. CTA `Use selected blueprint`. Success shows ready blueprint/formula/director prompt identities. | Loading list. Empty: choose discovery/default. Success: ready. Error: archived/incompatible/stale. Hide raw prompt internals if not returned. Downstream: scripts. Acceptance: selected blueprint creates same script-input contract as discovery/default. |
| 6. Viral discovery | Searches and ranks candidates with metric snapshots and rights warnings. Solves "which external structure should we analyse?" | User: niche/objective, optional manual fallback data when provider unavailable. System: blueprint request id, simulator mode. API: `POST /viral-candidates/search`. | Screen: search form, ranked result table with source URL, metrics, observation time, rights warning, confidence/status. CTA `Select candidate`. | Loading: searching. Empty: before search/no results. Success: ranked candidates. Error: provider unavailable/outage; manual fallback form only with provenance. Hide raw provider payloads. Downstream: media acquisition. Acceptance: no fabricated candidate on timeout/empty results. |
| 7. Media acquisition | Retains or blocks source media under rights policy. Solves "can this candidate legally and technically feed blueprinting?" | User: rights decision, retrieval policy, expected source hash. System: candidate id. API: `POST /viral-candidates/{candidate_id}/extract-blueprint`. | Screen: candidate evidence header, rights decision form, source hash confirmation, thumbnail OCR preview if returned. CTA `Acquire media`. | Loading: acquiring/quarantine. Empty: no selected candidate. Success: media acquisition + thumbnail blueprint. Error: rights blocked, unsupported retrieval, hash mismatch, low-confidence OCR. Hide protected source copies and object keys. Downstream: scene blueprint. Acceptance: blocked acquisitions cannot advance. |
| 8. Scene structure | Runs scene/transcript/keyframe/vision/OCR stages independently. Solves "what structural blueprint exists and which stages failed?" | User: starts/observes stage processing. System: media acquisition, thumbnail blueprint, source hash. API: `POST /viral-candidates/{candidate_id}/scene-blueprint`; job endpoints. | Screen: stage spine with scene detect, transcript, keyframes, vision, OCR; each stage has evidence/status/detail. Output shows scene-level blueprint when complete. | Loading: queued/running per stage. Empty: not started. Success: blueprint scenes. Error: incomplete stage, malformed AI output, worker timeout/OOM. Hide raw model JSON. Downstream: ready blueprint. Acceptance: partial/failed stage never renders as complete. |
| 9. Ready blueprint | Freezes immutable blueprint, formula and director prompt. Solves "what exact structure feeds script generation?" | User: confirms merge/default/existing readiness. System: blueprint request, stage evidence or default formula. API: `POST /blueprint-requests/{id}/ready-blueprint`. | Screen: formula slots, replacement instructions, director prompt summary, lineage/evidence. CTA `Make blueprint ready`. | Loading: deriving. Empty: missing required stages/path. Success: ready blueprint ids. Error: incomplete stages, invalid formula, stale ready creation. Hide internal prompt payloads beyond contract. Downstream: scripts. Acceptance: ready record is immutable and script-input compatible. |
| 10. Script tournament | Generates 10-20 evaluated variants. Solves "which scripts comply with brand and formula?" | User: variant count, objective/constraints supported by API. System: ready blueprint request, brand/formula/prompt. API: `POST /script-tournaments`. | Screen: tournament configuration form, generation progress, variants grid with hook, timing, CTA, claim safety, captions, evaluation. CTA `Generate scripts`. | Loading: generating/evaluating. Empty: no tournament. Success: ready for selection. Error: insufficient variants, policy violation, AI refusal/schema invalid. Hide raw prompts/analytics payloads. Downstream: selection. Acceptance: fewer than 10 valid variants cannot advance. |
| 11. Script selection | Selects one immutable evaluated script. Solves "which exact script enters paid generation?" | User: chooses eligible variant and confirms. System: tournament id/version, variant id, idempotency key. API: `POST /script-tournaments/{id}/select`. | Screen: side-by-side comparison with disabled ineligible variants, evaluation details, confirmation dialog. Success shows selected script id and audit. | Loading: selecting. Empty: no valid variants. Success: selected. Error: stale tab, already selected, invalid variant. No optimistic selection. Hide raw analytics. Downstream: avatar. Acceptance: exactly one selected script retained. |
| 12. Avatar | Chooses eligible consent-safe avatar. Solves "which likeness/voice may be used?" | User: selects eligible avatar; optionally revokes consent where authorised. System: brand profile id, selected script. APIs: `GET /avatars`, `POST /avatars/{id}/consent-revocation`. | Screen: avatar catalogue with kind, scope, expiry/revocation/service state, disabled reasons; CTA `Choose avatar`. Revocation uses typed reason confirmation. | Loading catalogue. Empty: no eligible avatar. Success: selected locally for generation estimate. Error: consent required/expired/revoked, forbidden. Hide consent evidence refs. Downstream: estimate. Acceptance: ineligible avatars are disabled and server still guards estimate. |
| 13. Cost estimate | Shows estimate and maximum authorisation before reserving credits. Solves "what will this cost before paid work begins?" | User: selected script, avatar, generation settings if supported, confirmation. System: approved brand, wallet/price version. APIs: `POST /generation-estimates`, `POST /generation-estimates/{id}/confirm`. | Screen: cost panel with estimate, max authorisation, price version, expiry, wallet balance, reservation lifecycle. CTA `Reserve credits and generate`. | Loading: estimating/reserving. Empty: missing script/avatar. Success: credits reserved + generation queued. Error: stale/expired estimate, insufficient credit, changed input. Permission: confirm paid generation. Hide provider cost internals not returned. Downstream: generation. Acceptance: no paid action before explicit confirmation. |
| 14. Generation job | Submits and reconciles HeyGen operation exactly once. Solves "is paid generation accepted, unknown, generated or failed?" | User: submit, reconcile/cancel only where allowed. System: job id, provider operation, idempotency keys. APIs: generation job submit/reconcile/cancel/settle/get. | Screen: provider operation timeline, status chip, reservation state, callback/reconciliation panel. CTA depends on status: `Submit`, `Reconcile`, `Settle`, `Cancel generation`. | Loading: submitting/reconciling. Empty: no job. Success: generated/settled. Error: unknown, provider invalid, not submittable, cost exceeds authorisation. Preserve `Unknown — checking`; no blind retry. Hide request hash/raw provider payloads. Downstream: composition. Acceptance: timeout shows unknown and reconcile-only path. |
| 15. Composition plan | Converts user direction into validated AE plan. Solves "how should retained generated media become final branded media?" | User: direction, timeline tracks if supported. System: generated asset id. API: `POST /composition-plans`. | Screen: direction editor, asset-binding summary, validation results, timeline preview. CTA `Create composition plan`. | Loading: planning/validating. Empty: no generated asset. Success: validated plan. Error: schema invalid, missing asset, unsupported capability, invalid timeline. Hide signed URLs, plan artifact object keys. Downstream: render. Acceptance: unsupported assets/capabilities are visible and blocking. |
| 16. Composition render | Creates immutable final video revision. Solves "what exact MP4 is available for review?" | User: render validated plan. System: composition plan id, idempotency key. API: `POST /composition-plans/{id}/render`. | Screen: render attempt card, 9:16 media placeholder/player, final video hash/version, thumbnail/captions and revision lineage. CTA `Render final video`. | Loading: rendering. Empty: no validated plan. Success: rendered current final video. Error: render failed, capability drift, crash recovery, unknown. Hide render logs/object keys/signed URLs. Downstream: review. Acceptance: revisions do not overwrite prior final videos. |
| 17. Review | Comments and approves/rejects exact final-video version. Solves "who approved which exact media?" | User: comment, approve/reject/request changes with reason. System: review item, final video hash/version. APIs: review item create/list/get/comments/decisions. | Screen: 9:16 player, thumbnail/caption/script preview, comments, exact version identity, decision dialog. CTA `Approve this version`. | Loading: media/comments/decision. Empty: no assigned review. Success: decision recorded. Error: stale/superseded version, duplicate decision, comment failure. Reviewer can comment only; approval restricted. Hide signed URLs. Downstream: calendar. Acceptance: approval token only after approve and bound to exact version. |
| 18. Calendar | Schedules approved media or manual export. Solves "where and when should approved media publish?" | User: platform, account, caption, schedule time/timezone or manual export. System: approved final video, approval token, idempotency key. APIs: `POST /calendar-posts`, `PATCH /calendar-posts/{id}`. | Screen: schedule form, media identity panel, caption editor, timezone display, manual export option. CTA `Schedule post` or `Create export package`. | Loading: saving. Empty: no approved video. Success: scheduled/approved export. Error: past time, unauthorised account, stale approval/media, conflict, locked post. Hide account credential metadata. Downstream: publish/verify. Acceptance: unapproved/superseded media cannot schedule. |
| 19. Publish | Submits scheduled post idempotently or reconciles unknown. Solves "did the platform accept this exact post?" | User: publish to bound account, reconcile unknown, manual export path if unsupported. System: calendar post id/account, idempotency key. APIs: `POST /calendar-posts/{id}/publish`, `/publish/reconcile`. | Screen: account/platform/media confirmation, publish operation timeline, external id/public URL only when live. CTA `Publish to {platform}` or `Reconcile`. | Loading: submitting/reconciling. Empty: no scheduled post. Success: accepted/completed, verification pending. Error: account mismatch, quota exhausted, unsupported platform, duplicate blocked, unknown. Hide request hash/raw provider payload. Downstream: verify. Acceptance: provider acknowledgement is never final success. |
| 20. Verify | Independently verifies live post. Solves "is the audience-facing post correct and visible?" | User: `Check live post`; manual live URL when required. System: calendar post, provider/verifier. API: `POST /calendar-posts/{id}/verify`. | Screen: verification checklist for account, media hash, caption, visibility, publish time; evidence artifact and notification state. CTA `Check live post`. | Loading: checking. Empty: no accepted/manual URL. Success: published and verified. Error: processing wait, identity mismatch, visibility restricted, manual URL required. Hide observed raw account/media/caption details not returned. Downstream: lineage/performance. Acceptance: only verified state closes publication and sends one notification. |
| 21. Lineage | Exports complete ancestry and cost evidence. Solves "can we prove what happened end to end?" | User: inspect/export manifest. System: final video id, workspace. APIs: `GET /lineage/{finalVideoId}`, `GET/POST performance`. | Screen: lineage trail from brand profile to verified post, manifest hash, missing/mismatch panel, cost attribution, provider timestamps, performance snapshots. CTA `Collect observed metrics` where allowed. | Loading: fetching. Empty: no verified post. Success: complete lineage. Error: incomplete, blocked hash mismatch, unknown, forbidden. Hide object keys, signed URLs, raw provider payloads, cross-workspace refs. Acceptance: manifest includes retained IDs/hashes/cost/publication evidence without predictive claims. |

## Screen-By-Screen Implementation Plan

- `ForgeWorkspaceApp` becomes the authenticated shell only: workspace switcher/top bar,
  left production navigation, status spine, role/capability-aware destinations, and a
  screen outlet.
- Add screen components grouped by workflow domain:
  - Brand: `BrandIntakeScreen`, `BrandCandidatesScreen`, `BrandApprovalScreen`.
  - Blueprint: `BlueprintPathScreen`, `BlueprintLibraryScreen`, `ViralDiscoveryScreen`,
    `MediaAcquisitionScreen`, `SceneBlueprintScreen`, `ReadyBlueprintScreen`.
  - Scripts: `ScriptTournamentScreen`, `ScriptSelectionScreen`.
  - Generation: `AvatarCatalogueScreen`, `GenerationEstimateScreen`, `GenerationJobScreen`.
  - Composition/review: `CompositionPlanScreen`, `CompositionRenderScreen`, `ReviewScreen`.
  - Publishing/evidence: `CalendarScreen`, `PublishScreen`, `VerifyScreen`,
    `LineageScreen`.
- Keep one route resolver for the existing catch-all route, but map canonical IA routes
  and legacy short aliases to functional screens.
- Add a journey context persisted per workspace in local storage for durable IDs returned
  by mutations: crawl run, brand id/profile id, blueprint request, candidate id,
  tournament id, selected script, avatar id, estimate id, generation job, composition
  plan, final video, review item, calendar post. This is only a UI convenience; server
  state remains authoritative.
- When a screen lacks a current predecessor ID, show a functional empty state with one
  valid upstream CTA, not placeholder cards.
- Every mutation uses the generated client, an idempotency key when required by contract,
  disabled in-flight controls, and server-confirmed success before advancing.

## Required Components

- `WorkspaceShell`, `ProductionNav`, `WorkflowSpine`, `PageHeader`, `Breadcrumbs`.
- `StatusChip`, `ProblemBanner`, `FieldError`, `EmptyState`, `SkeletonBlock`,
  `AsyncJobPanel`.
- `EvidencePopover`, `EvidenceTable`, `ConfidenceMeter`, `SourceList`, `LineageTrail`.
- `IdempotentActionButton`, `ConfirmDialog`, `VersionIdentityPanel`.
- `BrandUrlForm`, `RightsAcknowledgement`, `CandidateFieldEditor`, `ApprovalChecklist`.
- `PathSelector`, `BlueprintLibraryList`, `StageProgressSpine`.
- `ScriptVariantCard`, `ScriptComparisonTable`, `EvaluationPanel`.
- `AvatarCard`, `ConsentStateBadge`, `CostAuthorisationPanel`, `LedgerTimeline`.
- `MediaFrame9x16`, `CompositionTimeline`, `ReviewComments`, `DecisionPanel`.
- `CalendarPostForm`, `PublishOperationPanel`, `VerificationChecklist`,
  `PerformanceSnapshotList`.

## API/Data Integrations

Use `V0Client` only for API calls. Browser code must not duplicate transport types manually.

- Brand: `createBrandCrawlRun`, `listBrandCandidates`, `approveBrandProfile`,
  upload/download calls where enabled.
- Blueprint: `listBlueprints`, `createBlueprintRequest`, `seedBlueprintLibraryEntry` only
  for authorised fixture/admin flows if already used, `searchViralCandidates`,
  `extractViralCandidateBlueprint`, `createSceneBlueprint`, `createReadyBlueprint`.
- Scripts: `createScriptTournament`, `selectScriptVariant`.
- Avatar/generation: `listAvatars`, `revokeAvatarConsent`, `createGenerationEstimate`,
  `confirmGenerationEstimate`, `getGenerationJob`, `submitGenerationJob`,
  `reconcileGenerationJob`, `cancelGenerationJob`, `settleGenerationJob`.
- Composition/review: `createCompositionPlan`, `renderCompositionPlan`,
  `createReviewItem`, `listReviewItems`, `getReviewItem`, `addReviewComment`,
  `listReviewComments`, `recordReviewDecision`.
- Publishing/evidence: `createCalendarPost`, `updateCalendarPost`, `publishCalendarPost`,
  `reconcilePublishOperation`, `verifyCalendarPost`, `getLineage`, `collectPerformance`,
  `getPerformance`.
- Operations support surfaces: `getJob`, `listJobEvents`, `getJobTrace`, `recoverJob`,
  wallet ledger, alerts, credential metadata/rotation where routed.

## Tests And Acceptance Criteria

- Add unit tests for route-to-screen mapping: every canonical IA route renders a
  functional screen with a primary form/action or a predecessor empty state.
- Add unit tests for API wiring using a fake `V0Client`: each screen calls the correct
  generated method with required `workspaceId`, predecessor IDs, and idempotency key where
  required.
- Add UI-state tests for each domain: loading, empty, success, RFC 9457 error, stale
  version, permission denied, existence-hidden 404, and `unknown`.
- Add regression tests that fail if workflow screens render bullet-list feature
  descriptions as their main body.
- Add secret-hiding tests: no signed URL, object key, request hash, raw provider payload,
  consent evidence ref, credential secret, or cross-workspace identifier is rendered.
- Add accessibility-focused structural tests: one `h1`, labelled inputs, error summaries,
  non-colour-only status labels, disabled irreversible actions during submission.
- Run verification in this order during implementation: narrow unit tests,
  `pnpm --filter @sakhaa-forge/web lint`, relevant web tests, generated client smoke/e2e
  test, then `pnpm verify` if available.

Per-step acceptance is the table above: each step must expose real input, call or read the
owning API, render server output/evidence, handle loading/empty/success/error, enforce
role/capability display rules, hide protected data, and enable only the documented
downstream action.

## Assumptions And Defaults

- This UI pass changes frontend behaviour only unless tests reveal a missing API contract
  that blocks a documented screen.
- The brand intake first screen takes company URL as the primary required input; optional
  file upload remains secondary and only uses the existing upload contract.
- Local journey persistence may cache IDs and last responses for refresh convenience, but
  it must never be treated as approval, payment, publication or tenant truth.
- If no read endpoint exists for a newly created object, the UI renders the mutation
  response and linked job/evidence IDs, then offers the next valid action. It does not
  fabricate richer detail.
- Status labels use `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`;
  `unknown` is preserved as `Unknown — checking`.
- Existing dirty workspace changes are treated as user work; implementation must not
  revert unrelated deletions or edits.
