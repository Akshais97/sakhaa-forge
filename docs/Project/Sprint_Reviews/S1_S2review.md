• # Senior Sprint Review

  ## Verdict

  NEEDS FIXES BEFORE MERGE

  S1/S2 backend happy paths pass, but the sprint does not deliver a real frontend user journey and the S2
  selection path has contract/concurrency holes.

  ## Intended Outcome

  S1 should let a client manager create an auditable 10-20 script tournament from a ready blueprint, retain
  every variant/evaluation/provenance item, and block invalid advancement.

  S2 should let a client manager compare evaluated variants and select one exact immutable script version with
  actor, tournament, variant, version, stale-tab guard, idempotency, and cross-workspace protection.

  ## Implementation Map

  - apps/api/src/script-generation.mjs: deterministic script simulator and evaluation helpers.
  - apps/api/src/server.mjs: S1/S2 HTTP routes, auth, permission and idempotency wrapper.
  - apps/api/src/workspace-store.mjs: in-memory and Prisma-backed S1/S2 domain writes.
  - packages/contracts/src/openapi.v0.json: S1/S2 OpenAPI contract.
  - packages/contracts/generated/v0-client.mjs: generated client methods.
  - packages/db/prisma/migrations/0016_v0_s1_script_tournament/migration.sql: S1 tables/RLS.
  - packages/db/prisma/migrations/0017_v0_s2_selected_script/migration.sql: S2 selected-script table/RLS.
  - apps/web/src/server.mjs: static web shell sections for S1/S2.
  - tests/integration/script-tournament-s1.test.mjs: S1 API tests.
  - tests/integration/script-selection-s2.test.mjs: S2 API tests.
  - tests/e2e/web-workspace.test.mjs: static HTML assertions.
  - tests/integration/prisma-runtime.test.mjs: Prisma runtime smoke proof, but not S1/S2.

  ## User Flow

  1. User can theoretically create a ready blueprint through API setup.
  2. User can call POST /script-tournaments through generated client and receive variants/evaluations.
  3. User can call POST /script-tournaments/{id}/select and select a generated/evaluated variant.
  4. Real browser journey is not implemented. apps/web/src/server.mjs:336-379 only renders static contract
     cards. There is no tournament creation form, no API call, no variant list, no comparison UI, no select
     action, no loading/error/disabled/retry states.

  5. The route path tournament ID is accepted but ignored. apps/api/src/server.mjs:428-457 receives
     tournamentId, but passes only request.body to store.selectScriptVariant.

  6. Sequential API tests pass. Concurrent selection and S1/S2 Prisma runtime are not proven.

  ## Critical Issues

  - Issue: S2 does not deliver the required frontend comparison and selection UI.
  - Evidence: apps/web/src/server.mjs:336-379 renders static text cards only. tests/e2e/web-workspace.test.mjs
    only fetches HTML and matches text such as data-testid="script-selection-contract".

  - User impact: A real client manager cannot compare variants or select a script in the product UI.
  - Root cause: The web layer is a contract display page, not an implemented workflow.
  - Required fix: Build the actual S1/S2 screen: load ready tournament data, show variants/evaluations,
    support empty/loading/error/stale/disabled/success states, confirm selection, and call generated
    V0Client.selectScriptVariant.

  - Verification: Add e2e/browser tests that create a tournament, render 10-20 variants, select one, handle
    stale and ineligible variants, and assert selected state.

  - Issue: POST /script-tournaments/{id}/select ignores the path ID.
  - Evidence: apps/api/src/server.mjs:428 accepts tournamentId, but apps/api/src/server.mjs:457 calls
    store.selectScriptVariant(auth.actor, request.body ?? {}). Store lookup uses input.tournamentId at apps/
    api/src/workspace-store.mjs:3178-3179.

  - User impact: A malformed or buggy client can post to tournament A’s URL while selecting tournament B from
    the body. That breaks API contract truth and audit expectations.

  - Root cause: Path parameter is not reconciled with request body.
  - Required fix: Reject mismatch between path tournamentId and body tournamentId, or remove body tournamentId
    and derive it from the path.

  - Verification: Add an integration test calling /script-tournaments/A/select with body tournamentId: B and
    expect VALIDATION_FAILED or hidden 404.

  - Issue: Concurrent S2 selections can escape the intended SCRIPT_ALREADY_SELECTED behavior.
  - Evidence: Prisma path checks tournament.status === "selected" before insert at apps/api/src/workspace-
    store.mjs:3184-3185, then inserts selectedScript at apps/api/src/workspace-store.mjs:3229. DB unique
    constraint is on tournament_id at packages/db/prisma/migrations/0017_v0_s2_selected_script/
    migration.sql:7. No duplicate-key handling is visible.

  - User impact: Double-clicks or two reviewers selecting at once can produce a 500 instead of stable
    SCRIPT_ALREADY_SELECTED.

  - Root cause: Read-check-write without catching unique constraint conflict or doing an atomic guarded
    update.

  - Required fix: Handle Prisma unique violation on selected_scripts.tournament_id as SCRIPT_ALREADY_SELECTED,
    or atomically claim tournament with WHERE status = 'ready_for_selection'.

  - Verification: Add a concurrent selection test against Prisma runtime or a store-level test that races two
    different idempotency keys.

  ## Non-Blocking Issues

  - selected_scripts.approver_user_id is UUID NOT NULL but has no FK to users(id) in
    0017_v0_s2_selected_script/migration.sql:9. This weakens actor lineage integrity. Add the FK unless there
    is a documented reason not to.

  - tests/integration/prisma-runtime.test.mjs proves workspace/idempotency/artifact/job persistence, but not
    S1/S2 persistence. Green verify does not prove S1/S2 under Prisma.

  ## Second-Order Risks

  - UX risk: future agents may treat static contract cards as completed screens.
  - API risk: path/body mismatch will create confusing audit trails and hard-to-debug client bugs.
  - Concurrency risk: selected-script immutability depends on DB uniqueness but error handling is not
    normalized.

  - DB risk: actor lineage is weaker without FK enforcement on approver_user_id.
  - Test risk: in-memory integration coverage can drift from Prisma production behavior.

  ## Test Review

  Covered:

  - S1 happy path, 10-20 boundary, insufficient valid variants, AI refusal, malformed simulator output, draft/
    foreign guard, idempotency.

  - S2 happy path, stale tab, refused/foreign variant, sequential idempotency, second sequential selection,
    cross-workspace denial, missing idempotency key.

  - Static web HTML text for S1/S2.
  - Full verify passes.

  Missing:

  - Real frontend interaction tests.
  - Path/body tournament mismatch test.
  - Concurrent S2 selection race test.
  - S1/S2 Prisma runtime persistence test.
  - FK/integrity proof for selected-script approver lineage.

  ## Commands Run

  - git status --short -> clean.
  - git diff --stat -> no working-tree diff.
  - node --test tests/integration/script-tournament-s1.test.mjs tests/integration/script-selection-s2.test.mjs
    -> 13 passed.

  2. Add browser/e2e tests for tournament display, comparison, selection, loading, empty, error, stale,
     disabled and success states.

  3. Fix selectScriptVariant route handling so path tournamentId is authoritative or must match the body.
  4. Add API test for mismatched path/body tournament IDs.
  5. Make S2 selection concurrency-safe: atomic status transition or catch unique-constraint conflict and
     return SCRIPT_ALREADY_SELECTED.

  6. Add concurrent double-selection test, preferably against Prisma runtime.
  7. Add S1/S2 Prisma runtime proof covering tournament creation and selected-script insertion.
  8. Add FK from selected_scripts.approver_user_id to users(id) or document why it must remain unenforced.
