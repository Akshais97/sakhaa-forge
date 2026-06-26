 # Senior Sprint Review

  ## Verdict

  NEEDS FIXES BEFORE MERGE

  G1 fails its own failure contract: revoked/expired/missing-consent avatars can still enter POST /generation-estimates.

  ## Intended Outcome

  V0-G1 should let Owner/Admin/Client Manager load a workspace-scoped avatar catalogue for an approved brand profile, see eligibility for
  generic, brand-ambassador and real-person avatars, and prevent expired, revoked, missing-evidence, service-pending or cross-workspace avatars
  from entering generation.

  Source contract:
  docs/V0/Sprints/V0-G1_CONSENT_SAFE_AVATAR_SELECTION_SPRINT.md

  - First failing test: ineligible or wrong-workspace avatar can enter generation estimate.
  - Backlog: block ineligible avatars from generation estimates and jobs.
  - Completion evidence: avatar eligibility matrix, revocation/expiry output, selection audit record, browser evidence.

  ## Implementation Map

  - apps/api/src/server.mjs: adds GET /avatars; existing POST /generation-estimates remains.
  - apps/api/src/workspace-store.mjs: materializes deterministic avatar catalogue, derives eligibility, creates generation estimates.
  - apps/web/src/avatar-workflow.mjs: browser-side avatar catalogue state/rendering and local selection.
  - apps/web/src/server.mjs: renders avatar catalogue form and serves workflow module.
  - packages/db/prisma/migrations/0019_v0_g1_consent_safe_avatar_selection/migration.sql: adds avatar_profiles and avatar_consents.
  - packages/db/prisma/schema.prisma: adds AvatarProfile and AvatarConsent.
  - packages/contracts/src/openapi.v0.json and generated files: adds listAvatars.
  - tests/integration/avatar-g1.test.mjs: catalogue, evidence hiding, pagination, cross-workspace denial.
  - tests/unit/avatar-workflow.test.mjs: UI state mapping and disabled buttons.
  - tests/integration/prisma-runtime.test.mjs: Prisma catalogue materialization proof.

  ## User Flow

  1. User enters workspace id, approved brand profile id and JWT in the web shell.
  2. Browser calls generated V0Client.listAvatars.
  3. API checks manage_avatars_consent, workspace membership, brand profile ownership and approval.
  4. API materializes deterministic avatar catalogue and returns eligible/ineligible avatars.
  5. UI renders ready, expired, revoked, consent-missing and service-pending cards.
  6. UI disables ineligible avatar buttons.
  7. Eligible avatar selection is local-only in browser state. It is not persisted and no audit event is written.
  8. Backend generation estimate still accepts any avatarProfileId passed in the body, including revoked avatars.

  Broken part: server-side downstream guard is missing. UI blocks clicks, but API accepts bad avatar ids directly.

  ## Critical Issues

  - Issue

  Ineligible avatars can enter generation estimates.

  - Evidence

  apps/api/src/workspace-store.mjs:595-625 creates an in-memory generation estimate after only checking active approved brand profile. It copies
  input.avatarProfileId into the estimate without loading avatar profile, checking workspace/brand binding, or deriving consent eligibility.

  apps/api/src/workspace-store.mjs:2726-2757 does the same in Prisma runtime. It validates brand profile, then writes avatarProfileId:
  input.avatarProfileId.

  Direct smoke command result:

  {"badReason":"consent_revoked","status":202,"code":null,"avatarProfileId":"91ddc01d-0157-0c36-f737-99634e40fc2d"}

  That command selected a consent_revoked avatar from GET /avatars, then successfully created a generation estimate with it.

  - User impact

  A revoked or expired real-person likeness can be used in the next paid generation step. This violates consent, rights and privacy invariants.

  - Root cause

  G1 implemented catalogue eligibility and UI disabled states, but did not enforce avatar eligibility at the backend boundary that consumes
  avatar selection.

  - Required fix

  Add server-side avatar eligibility validation in createGenerationEstimate for both memory and Prisma stores:

  - avatar exists in same workspace;
  - avatar belongs to requested active approved brand profile;
  - service fulfillment is not pending;
  - required consent exists;
  - consent is not expired;
  - consent is not revoked;
  - generic avatar rule is explicit;
  - failures return stable problem code, likely AVATAR_CONSENT_INVALID or existing catalogued code if present.

  - Verification

  Add integration tests that call createGenerationEstimate with each ineligible avatar reason and expect rejection. Add Prisma runtime proof for
  at least revoked and expired avatars.

  - Issue

  Avatar “selection” is not auditable or durable.

  - Evidence

  apps/web/src/avatar-workflow.mjs stores selected avatar only in current.selectedAvatarId and renders a success banner. Comment says no
  mutation endpoint exists. docs/V0/Sprints/V0-G1_CONSENT_SAFE_AVATAR_SELECTION_SPRINT.md requires “Selection audit record.” AvatarProfile,
  AvatarConsent, Artifact, AuditEvent are primary records, but G1 code writes no G1 selection audit event.

  - User impact

  A user can believe an avatar is selected, but refresh/navigation loses that state. Later generation can receive any manually supplied
  avatarProfileId; no retained evidence proves which eligible avatar the user selected before estimate.

  - Root cause

  Sprint scoped selection as local UI state while sprint contract requires retained selection/audit evidence.

  - Required fix

  Either add a durable avatar selection endpoint/audit event, or bind selection into the first downstream generation-estimate mutation and write
  an audit event there. Update docs only if product owner explicitly narrows G1 to catalogue-only.

  - Verification

  Test that selecting an eligible avatar creates an audit record or that creating an estimate with eligible avatar writes avatar-selection audit
  lineage. Test no audit is written for ineligible attempts.

  ## Non-Blocking Issues

  - avatar_consents.revoked_by_user_id has no FK to users(id) in migration 0019. If retained as a user id, add FK or document why simulator
    revocation actor is intentionally non-enforced.

  - GET /avatars requires manage_avatars_consent. That is defensible for this slice, but future generation users may need read-only avatar
    selection without consent-management permission.

  - Browser evidence is mostly HTML/module/unit tests, not true browser click automation against live API. Existing tests prove state functions
    and module serving, not a real user completing catalogue load and selection in a browser.

  ## Second-Order Risks

  - Consent risk: backend trusts client/UI for avatar eligibility. Any API caller can bypass disabled buttons.
  - Lineage risk: no durable selected-avatar decision means later generation evidence can be incomplete or user-disputed.
  - API drift risk: docs/V0/V0_API.md says ineligible avatars cannot enter estimates/jobs, but code does not enforce it.
  - Test risk: green verify misses the sprint’s first failing behaviour.
  - Maintenance risk: deterministic catalogue materializes on GET /avatars; later real avatar creation/revocation may need migration away from
    read-side seeding.

  ## Test Review

  Covered:

  - Avatar catalogue returns eligible, expired, revoked, missing evidence and service-pending states.
  - Consent evidence is not in public avatar response.
  - Catalogue materialization is idempotent.
  - Cursor pagination avoids repeats.
  - Cross-workspace brand profile lookup returns WORKSPACE_ACCESS_DENIED.
  - Unauthenticated GET /avatars returns 401.
  - UI state functions render disabled buttons for ineligible avatars.
  - Prisma runtime materializes avatar profiles and consents.

  Missing:

  - Ineligible avatar rejected by POST /generation-estimates.
  - Cross-workspace avatar rejected by POST /generation-estimates.
  - Missing/nonexistent avatar rejected by POST /generation-estimates.
  - Eligible avatar accepted by generation estimate with retained audit/lineage.
  - Selection audit record.
  - True browser interaction test for loading catalogue and selecting avatar.
  - Job-level guard not applicable yet because generation jobs are not implemented, but estimate guard is applicable now.

  ## Commands Run

  - git status --short -> clean.
  - git status -sb -> v0_side_branch...origin/v0_side_branch [ahead 4].
  - git log --oneline --decorate -8 -> latest commit a9e58a7 feat(v0-g1): consent-safe avatar selection.
  - git diff --stat HEAD~1..HEAD -> G1 commit changes 24 files, 1530 insertions.
  - git diff --name-only HEAD~1..HEAD -> reviewed G1 docs, API, store, web workflow, schema, migration, tests.
  - node --test tests\integration\avatar-g1.test.mjs tests\unit\avatar-workflow.test.mjs tests\unit\permissions.test.mjs -> 13 pass.
  - Direct in-memory API smoke using node --input-type=module -e ... -> consent_revoked avatar accepted into generation estimate with 202.
  - node scripts\lint.mjs -> pass.
  - node scripts\typecheck.mjs -> pass.
  - node packages\db\scripts\db-validate.mjs -> pass.
  - .\pnpm.cmd verify -> pass; broad suite 125 pass, 3 skipped runtime proofs; dedicated Prisma runtime proof 3 pass.
  - Final git status --short -> clean.

  ## Fix Plan for Coding Agent

  1. Add failing tests in tests/integration/avatar-g1.test.mjs: revoked, expired, missing-evidence and service-pending avatar ids must be
     rejected by createGenerationEstimate.

  2. Add Prisma runtime test for revoked/expired avatar rejection in tests/integration/prisma-runtime.test.mjs.
  3. Add validateAvatarEligibilityForGeneration helper shared by memory and Prisma store paths.
  4. In createGenerationEstimate, load avatar by workspaceId, brandProfileId, and avatarProfileId; derive eligibility using the same server
     logic as GET /avatars.

  5. Return stable RFC 9457 problem for ineligible avatar, without leaking cross-workspace existence.
  6. Add audit/lineage for eligible avatar selection, either through a new selection endpoint or inside createGenerationEstimate.
  7. Update docs/V0/V0_ERROR_CATALOG.md, docs/V0/V0_API.md, and generated OpenAPI if a new error code or endpoint is added.
  8. Run focused tests, Prisma runtime proof, db-validate, and .\pnpm.cmd verify.
