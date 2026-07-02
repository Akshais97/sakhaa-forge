Proposed Plan





&#x20; # Sakhaa Forge V0 Frontend Revamp Plan



&#x20; ## Summary



&#x20; Build a new Next.js frontend that keeps the current Sakhaa Forge landing-page theme as the visual foundation, then builds the authenticated

&#x20; V0 app around the same system: dark graphite canvas, spotlight panels, motion-led stage transitions, compact controls, progress rails,

&#x20; evidence cards, and calm system-of-record language.



&#x20; Use a hybrid gated workflow by default: the app shows the full workflow map and progress rail, but only the current valid step opens for

&#x20; action. Previous steps open read-only. Future steps show locked blockers from backend truth. This matches the user request for “step by

&#x20; step, one after the other” while still giving operators context.



&#x20; No docs/Project/Design/Design\_Implemented dependency. V0 contracts, permissions, statuses, generated clients, and evidence rules remain the

&#x20; source of truth.



&#x20; ## App Flow And Sitemap



&#x20; Public routes:



&#x20; - / - Sakhaa Forge landing page, retained visually from the current theme.

&#x20; - /sign-in - Supabase sign-in.

&#x20; - /auth/callback - auth callback.

&#x20; - /access-denied - tenant or role failure state.



&#x20; Workspace shell:



&#x20; - /w/\[workspaceSlug] - V0 workflow command center.

&#x20; - /w/\[workspaceSlug]/create - redirects to the current allowed step.

&#x20; - /w/\[workspaceSlug]/evidence - retained artifacts, costs, lineage and recovery proof.

&#x20; - /w/\[workspaceSlug]/wallet - credit wallet, estimates, reservations and ledger.

&#x20; - /w/\[workspaceSlug]/jobs - async jobs, traces, recovery actions.

&#x20; - /w/\[workspaceSlug]/settings/members - workspace members and roles.

&#x20; - /w/\[workspaceSlug]/settings/credentials - Owner/Admin provider credentials.



&#x20; Step-by-step production flow:



&#x20; 1. /brand/intake - submit URL/assets.

&#x20; 2. /brand/candidates - review extracted candidates and evidence.

&#x20; 3. /brand/approval - approve brand truth.

&#x20; 4. /blueprint/path - choose existing blueprint or new viral extraction.

&#x20; 5. /blueprint/library - select existing approved blueprint.

&#x20; 6. /blueprint/discovery - search/select viral candidate.

&#x20; 7. /blueprint/acquisition - crawl/download candidate source.

&#x20; 8. /blueprint/scene - scene, thumbnail, OCR and structure extraction.

&#x20; 9. /blueprint/ready - approve ready blueprint.

&#x20; 10. /scripts/tournament - generate/evaluate scripts.

&#x20; 11. /scripts/selection - select final script.

&#x20; 12. /avatars - choose eligible consented avatar.

&#x20; 13. /generation/estimate - review cost and reserve credits.

&#x20; 14. /generation/jobs/\[id] - HeyGen generation, reconcile, cancel or settle.

&#x20; 15. /composition/plan - AE composition plan and validation.

&#x20; 16. /composition/render - render final asset.

&#x20; 17. /review/\[id] - comments and approval decision.

&#x20; 18. /calendar - schedule approved item.

&#x20; 19. /publish/\[id] - publish or manual export flow.

&#x20; 20. /verify/\[id] - audience-facing verification.

&#x20; 21. /lineage/\[finalVideoId] - final evidence, cost, hashes and provenance.



&#x20; ## Workflow Map



&#x20; The workflow gate is computed from backend status and retained artifacts, not browser state.



&#x20; - Brand gate: brand intake exists -> candidates ready -> approved brand profile.

&#x20; - Blueprint gate: approved brand -> selected blueprint path -> ready blueprint.

&#x20; - Script gate: ready blueprint -> tournament complete -> selected script.

&#x20; - Generation gate: selected script + eligible avatar -> estimate -> credit reservation -> generation job.

&#x20; - Composition gate: generated media -> valid AE plan -> rendered final video.

&#x20; - Review gate: rendered final video -> review item -> approved or changes requested.

&#x20; - Publishing gate: approved review -> scheduled calendar post -> provider acceptance.

&#x20; - Verification gate: provider acceptance is not success; success only at published\_verified.

&#x20; - Evidence gate: final lineage, cost records, artifacts, job traces and recovery proof retained.



&#x20; Locked pages must show:



&#x20; - the required missing prerequisite,

&#x20; - the current open step,

&#x20; - the responsible role,

&#x20; - the backend status causing the lock,

&#x20; - a direct action to return to the current step.



&#x20; ## User Journey Map



&#x20; Client Manager journey:



&#x20; 1. Creates or selects workspace.

&#x20; 2. Submits brand source material.

&#x20; 3. Approves brand profile only after evidence is visible.

&#x20; 4. Chooses blueprint path.

&#x20; 5. Selects script, avatar and generation estimate.

&#x20; 6. Confirms paid generation with no optimistic success state.

&#x20; 7. Reviews rendered media.

&#x20; 8. Schedules, publishes and verifies.

&#x20; 9. Ends only when publication is audience-visible and evidence is retained.



&#x20; Reviewer journey:



&#x20; - Opens assigned review item.

&#x20; - Views exact video/version, caption, script and evidence summary.

&#x20; - Adds comments or requests changes.

&#x20; - Cannot approve brand, confirm credits, publish, verify, view wallet or run recovery.



&#x20; Owner/Admin journey:



&#x20; - Configures workspace, credentials and members.

&#x20; - Monitors jobs, provider state, costs and recovery.

&#x20; - Can inspect lineage, wallet ledger and operational evidence.

&#x20; - Can recover failed/unknown jobs without bypassing V0 truth rules.



&#x20; ## Frontend Architecture



&#x20; Use Next.js App Router with:



&#x20; - public landing/auth area,

&#x20; - authenticated workspace shell,

&#x20; - feature modules for brand, blueprint, scripts, generation, composition, review, calendar, publishing, verification and evidence,

&#x20; - generated OpenAPI client only for backend calls,

&#x20; - server-side auth, tenancy and role checks before rendering protected routes.



&#x20; Core frontend types:



&#x20; - WorkflowStepKey

&#x20; - WorkflowGateSnapshot

&#x20; - StepAccess: current, complete, read\_only, locked, blocked, failed, unknown

&#x20; - StepBlocker

&#x20; - RoleCapability

&#x20; - StatusPresentation



&#x20; Core UI primitives:



&#x20; - ForgeShell

&#x20; - ForgeHeader

&#x20; - StageRail

&#x20; - WorkflowMap

&#x20; - TheatrePanel

&#x20; - EvidenceCard

&#x20; - StatusChip

&#x20; - ActionDock

&#x20; - LockedStep

&#x20; - AsyncJobCard

&#x20; - CostPanel

&#x20; - MediaFrame

&#x20; - LineageTrail



&#x20; The landing page remains visually intact. The app reuses the same theme language but becomes denser, more operational and evidence-first.



&#x20; ## Data Flow



&#x20; - Server auth resolves workspace and role.

&#x20; - Page loaders fetch backend truth through generated clients.

&#x20; - A frontend workflow adapter builds the gate snapshot from V0 statuses and artifacts.

&#x20; - Mutations use idempotency keys for costly or externally visible operations.

&#x20; - Async jobs update through polling or event traces.

&#x20; - Step access is recomputed after every mutation.

&#x20; - No optimistic UI for credits, generation, review approval, scheduling, publishing or verification.

&#x20; - Signed URLs stay hidden inside media components and are never rendered as text, analytics, tooltips or errors.



&#x20; ## Implementation Phases



&#x20; 1. Theme and shell:

&#x20;    Preserve the current landing theme, extract reusable shell primitives, create workspace layout, navigation, progress rail and locked-step

&#x20;    states.



&#x20; 2. Workflow gate engine:

&#x20;    Implement status-to-step mapping, role capabilities, read-only previous steps and locked future steps.



&#x20; 3. Brand and blueprint flow:

&#x20;    Build intake, candidate review, approval, blueprint path, library, discovery, acquisition, scene extraction and ready blueprint pages.



&#x20; 4. Scripts and generation flow:

&#x20;    Build tournament, script selection, avatar choice, cost estimate, credit reservation and generation job pages.





&#x20; 6. Calendar, publishing and verification flow:

&#x20; 7. Evidence and operations:

&#x20; - Unit tests for workflow gate computation, status presentation, role access and locked-step blockers.

&#x20; - Contract tests proving frontend calls generated clients and handles RFC 9457 problem details.

&#x20; - Integration tests for Client Manager happy path through deterministic simulators.

&#x20; - Permission tests for Reviewer, Client Manager, Admin and Owner route/action access.

&#x20; - E2E tests for full V0 flow: brand approval to published\_verified.

&#x20; - Failure tests for unknown provider state, failed jobs, insufficient credits, revoked avatar consent and cross-workspace access.

&#x20; - Visual regression checks for landing, shell, step pages, mobile layout, reduced motion and focus states.

&#x20; - Copy/status tests to prevent unsupported claims, V1/V2 language, and “success” before verified publication.



&#x20; ## Assumptions



&#x20; - “Same theme” means the current apps/web Sakhaa Forge landing visual system.

&#x20; - The old sitemap is ignored.

&#x20; - docs/Project/Design/Design\_Implemented is excluded.

&#x20; - V0 only: no V1/V2 routes, claims, feature flags or runtime dependencies.

&#x20; - Backend contracts remain the source of truth; missing backend capability appears as blocked or unavailable, never as fake success.

