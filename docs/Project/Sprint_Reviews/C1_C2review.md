• # Senior Engineer Sprint Review

  ## Verdict

  NEEDS FIXES BEFORE MERGE

  C2 can replay a render idempotency key against the wrong composition, and it does not create the CreativeLineage record required by the C2 contract.

  ## Intended Outcome

  C1 was supposed to turn composition direction into a validated AE timeline plan, reject invented assets/capabilities/timing, retain validation evidence,
  and expose plan review states.

  C2 was supposed to render a validated AE plan into retained final video, thumbnail and captions with input hashes, worker capability version, immutable
  revisions, render attempt evidence, and lineage.

  ## Implementation Map

  Files reviewed and their role:

  - docs\Project\Sprint Reviews\reviewer_skill.md: review process and output contract.
  - docs\V0\Sprints\V0-C1_VALIDATED_COMPOSITION_INTENT_AND_AE_PLAN_SPRINT.md: C1 sprint contract.
  - docs\V0\Sprints\V0-C2_REPRODUCIBLE_FINAL_BRANDED_RENDER_SPRINT.md: C2 sprint contract.
  - docs\V0\Evidence\V0-C1_VALIDATED_COMPOSITION_INTENT_AND_AE_PLAN_LOCAL_VERIFICATION_2026-06-26.md: submitted C1 evidence.
  - docs\V0\Evidence\V0-C2_REPRODUCIBLE_FINAL_BRANDED_RENDER_LOCAL_VERIFICATION_2026-06-26.md: submitted C2 evidence.
  - apps\api\src\server.mjs: adds POST /composition-plans and POST /composition-plans/:id/render.
  - apps\api\src\workspace-store.mjs: in-memory and Prisma implementation for C1/C2.
  - apps\api\src\ae-capability-registry.mjs: deterministic AE plan capability registry and validator.
  - apps\api\src\ae-render-provider.mjs: deterministic render adapter and output validator.
  - packages\db\prisma\schema.prisma: C1/C2 models and enums.
  - packages\db\prisma\migrations\0024_v0_c1_validated_composition_intent_and_ae_plan\migration.sql: C1 tables/RLS.
  - packages\db\prisma\migrations\0025_v0_c2_reproducible_final_branded_render\migration.sql: C2 tables/RLS.
  - tests\integration\composition-c1.test.mjs: C1 integration coverage.
  - tests\integration\composition-c2.test.mjs: C2 integration coverage.
  - tests\unit\ae-plan-validator.test.mjs: C1 validator coverage.
  - tests\unit\ae-render-validator.test.mjs: C2 render validator coverage.

  ## User Flow

  1. User has a retained generated asset from prior G5 work.
  2. User submits composition direction and a structured AE timeline through POST /composition-plans.
  3. API validates the plan against supported assets, timing, safe zones, fonts, plugins, templates, effects and AE capability version.
  4. If valid, API stores CompositionInstruction, AePlan, a clean plan artifact and audit evidence.
  5. If invalid, API stores failed composition/plan state and returns unsupported items.
  6. User requests render through POST /composition-plans/{id}/render with an Idempotency-Key.
  7. API persists a RenderAttempt, calls the deterministic AE simulator, validates output, writes final artifacts and a FinalVideo.
  8. New renders create a new current final video and supersede the prior current row.

  Broken/risky behavior: a reused idempotency key in the same workspace can replay a different composition’s render. Also, the C2 user journey does not
  retain the required C2 CreativeLineage record, so downstream review/publication cannot prove lineage through final render.

  ## Critical Issues

  - Issue

  C2 idempotency is scoped only to workspaceId + idempotencyKey, not to the render operation input or composition.

  - Evidence

  In apps\api\src\workspace-store.mjs, the in-memory implementation looks up an existing render attempt using only candidate.workspaceId === workspaceId &&
  candidate.idempotencyKey === input.idempotencyKey around line 1815. The Prisma implementation does the same with where: { workspaceId, idempotencyKey:
  input.idempotencyKey } around line 6389.

  On replay, the succeeded path fetches the final video for the existing attempt but uses the currently requested instruction for the response. That can mix
  a final video from composition A with the response composition from composition B.

  The Prisma schema also declares @@unique([workspaceId, idempotencyKey]) for RenderAttempt, so the database bakes in the same overly broad scope.

  - User impact

  A user or client retrying with a reused key can get the wrong final video for a different composition. This is a lineage, review, billing-adjacent and
  evidence correctness failure.

  - Root cause

  C2 implemented idempotency as key-only replay rather than operation/input-bound replay with conflict detection.

  - Required fix

  Bind render idempotency to the exact operation input: workspace, composition instruction id, AE plan id, plan canonical hash, input asset hashes and
  capability version. Same key + same input replays/resumes. Same key + different input returns IDEMPOTENCY_INPUT_CONFLICT or the project’s documented
  equivalent. Update the DB uniqueness/indexing and API/store logic consistently.

  - Verification

  Add an integration test: render composition A with key render-x, then attempt to render composition B in the same workspace with key render-x; assert
  conflict and no final video for B. Repeat for failed/running attempts.

  - Issue

  C2 does not create or update the required CreativeLineage record.

  - Evidence

  docs\V0\V0_VERTICAL_OUTCOME_SLICES.md lists C2 primary records as RenderAttempt, FinalVideo, Artifact, CreativeLineage around the C2 section. The C2
  sprint backlog also requires creating RenderAttempt, FinalVideo, Artifact and CreativeLineage.

  Search evidence shows C2 code writes RenderAttempt and FinalVideo, but CreativeLineage writes are only in the earlier G5 settlement path, not in the
  render path. apps\api\src\workspace-store.mjs has C2 final video creation around lines 1995 and 6591, but no adjacent creativeLineage write. The C2
  integration test never asserts lineage.

  - User impact

  The final branded render lacks a first-class lineage record tying final media back through the composition plan, generated asset, script/avatar/provider
  path and retained artifacts. Downstream review, approval and publication evidence can become incomplete.

  - Root cause

  The implementation treated G5 creative lineage as sufficient and did not extend or create render-level lineage for C2.

  - Required fix

  Add render-level lineage retention according to the owning data model. Either extend CreativeLineage to bind compositionInstructionId, aePlanId,
  renderAttemptId and finalVideoId, or create the documented equivalent if the canonical docs specify another shape. Update docs/schema/contracts/tests
  together.

  - Verification

  Add integration and Prisma runtime tests proving a successful render writes lineage and that a revision preserves prior lineage immutably.

  ## Non-Blocking Issues

  - Issue

  Submitted evidence contradicts implementation on C2 caption artifact content type.

  - Evidence

  docs\V0\Evidence\V0-C2...md says final captions are application/json. apps\api\src\ae-render-provider.mjs returns captions with contentType: "text/vtt",
  and tests\integration\composition-c2.test.mjs asserts text/vtt.

  - User impact

  Not a runtime blocker if text/vtt is the intended contract, but evidence is inaccurate.

  - Required fix

  Correct the evidence/docs or code so captions have one canonical content type.

  - Issue

  Full verification was not completed during review.

  - Evidence

  node scripts\verify.mjs failed inside the Windows sandbox with CreateProcessAsUserW failed: 5. Retried with escalation; it timed out after 184 seconds.

  - User impact

  Merge readiness cannot rely on the claimed full verifier result.

  - Required fix

  Run node scripts\verify.mjs to completion before merge and retain fresh output.

  ## Second-Order Risks

  Idempotency bugs here can corrupt later review and publication flows because R1/R2/U1+ will trust FinalVideo and render lineage as exact media truth.

  The render path is synchronous inside the API store. The docs mention ae_render as a job boundary, but the implementation mainly uses RenderAttempt as the
  durable side-effect record. That may be acceptable for the deterministic simulator, but it needs an explicit contract decision before a real worker is
  introduced.

  The evidence files overclaim in places. They say some hashes/ids never reach responses while public mappers return artifact sha256, generationAssetId,
  plan artifact id, final video sha256, and render attempt outputHash. Some of that may be intentional, but the evidence must not say otherwise.

  ## Test Review

  Covered:

  - C1 valid plan retention.
  - C1 invented asset, unsupported capability, invalid timing, unsafe zone, capability mismatch and malformed schema.
  - C1 cross-workspace and missing workspace hiding.
  - C2 successful render.
  - C2 capability drift, bad output, crash recovery, immutable revision, idempotency-key required, cross-workspace hiding and missing workspace hiding.
  - Unit coverage for AE plan and render validation.

  Missing:

  - C2 same idempotency key with different composition/input must conflict.
  - C2 lineage retention.
  - C2 Prisma/runtime proof for idempotency input conflict.
  - C2 exact response consistency on replay: attempt, final video and composition must all belong to the same composition instruction.
  - Evidence/doc consistency test for caption artifact content type is absent.

  ## Commands Run

  git status --short
  Result: working tree contains C1/C2 source, docs, schema, generated contract and test changes.

  rg --files docs\V0\Evidence
  Result: C1 and C2 evidence files are present.

  node --test tests\integration\composition-c1.test.mjs
  Result: pass, 8 tests.

  node --test tests\integration\composition-c2.test.mjs
  Result: pass, 9 tests.

  node --test tests\unit\ae-plan-validator.test.mjs
  Result: pass, 8 tests.

  node --test tests\unit\ae-render-validator.test.mjs
  Result: pass, 14 tests.

  git diff --stat
  Result: 21 tracked files changed, 2647 insertions, 14 deletions; new untracked C1/C2 files also present.

  node scripts\verify.mjs
  Result: sandbox launch failure: CreateProcessAsUserW failed: 5.

  node scripts\verify.mjs with escalation
  Result: timed out after 184 seconds.

  ## Fix Plan for Coding Agent

  1. Fix C2 render idempotency scoping.
  2. Add tests for same-key different-composition/input conflict in both in-memory and Prisma/runtime paths.
  3. Add C2 CreativeLineage retention or the documented equivalent, with schema/docs/contracts updated in the same change.
  4. Add tests proving render lineage exists and revisions preserve prior lineage.
  5. Reconcile caption content type across code, tests, docs and evidence.
  6. Rerun narrow C1/C2 tests.
  7. Rerun node scripts\verify.mjs to completion and update retained evidence with the actual fresh result.
