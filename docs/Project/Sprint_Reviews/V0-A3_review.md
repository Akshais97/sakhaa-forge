# Senior Engineer Sprint Review

## Verdict

NEEDS FIXES BEFORE MERGE

A3 passes the deterministic generated-client reference journey, but the sprint evidence does not satisfy the still-canonical screenshot and founder-reviewed pilot scorecard requirements.

## Intended Outcome

V0-A3 should prove the standalone India-first real-estate reference journey with V1 and V2 absent. It should run from approved brand intake through script, avatar, estimate, provider reservation, composition, render, review, calendar, publication, audience verification, lineage, ledger, recovery/security evidence and pilot scorecard, retaining stable IDs, hashes, screenshots and trace evidence.

## Implementation Map

- `docs/V0/Sprints/V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_SPRINT.md`: sprint objective, backlog and completion evidence.
- `docs/V0/Evidence/V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_LOCAL_VERIFICATION_2026-06-30.md`: submitted evidence.
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`: A3 acceptance row and evidence requirements.
- `docs/V0/V0.md`: V0 completion rule and technical completion note.
- `tests/helpers/reference-journey-fixtures.mjs`: generated-client reference journey harness.
- `tests/integration/reference-journey-a3.test.mjs`: A3 journey, lineage, ledger, A2 report and V1/V2 absence tests.
- `apps/api/src/server.mjs`, `apps/api/src/workspace-store.mjs`: API and domain path exercised by the generated client.
- `packages/contracts/generated`: generated V0 client path used by the test harness.

## User Flow

1. The generated V0 client creates the workspace and approved brand profile.
2. It derives the real-estate blueprint/script path.
3. It creates avatar, estimate, reservation, composition and render evidence.
4. It opens review, approves, schedules and publishes the final video.
5. It verifies the audience-facing post.
6. It exports lineage and ledger evidence.
7. It checks A2 recovery/security report surfaces.
8. It scans for V1/V2 runtime dependency absence.

The deterministic technical journey works. The sprint evidence package is still incomplete against the written A3 contract.

## Critical Issues

- Issue

Founder-reviewed pilot scorecard evidence is missing or contractually inconsistent.

- Evidence

`docs/V0/Sprints/V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_SPRINT.md` requires a founder-reviewed pilot scorecard. `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md` also lists founder-reviewed scorecard evidence for A3. `docs/V0/Evidence/V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_LOCAL_VERIFICATION_2026-06-30.md` says the test assembles a deterministic technical scorecard and that the founder-approved measured pilot scorecard remains a human business acceptance step, not an automatable test assertion. `docs/V0/V0.md` now distinguishes technical completion proof from founder-approved measured pilot scorecard, but the A3 sprint and vertical-slice acceptance text still require the founder-reviewed scorecard.

- User impact

The project can mark A3 complete while the business acceptance gate remains unproven. That weakens the V0 completion claim and creates disagreement between sprint evidence and canonical acceptance requirements.

- Root cause

The evidence narrowed A3 completion to deterministic technical proof without updating all owning A3 acceptance documents or attaching the required founder-reviewed scorecard artifact.

- Required fix

Choose one owner-approved path:

- attach the founder-reviewed pilot scorecard evidence required by the sprint and vertical-slice documents; or
- update the A3 sprint and vertical-slice contracts to explicitly split technical completion proof from later founder business acceptance, with no ambiguity about which gate A3 is allowed to close.

- Verification

Review the updated A3 sprint, vertical-slice and evidence files together. The same artifact type must be required and supplied across all three.

- Issue

Screenshot evidence is still required by the sprint and vertical-slice contracts, but no screenshot artifact was verified in the submitted A3 evidence.

- Evidence

`docs/V0/Sprints/V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_SPRINT.md` requires screenshots, including brand approval screenshot and ID. `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md` requires exact screenshots for A3. The submitted evidence focuses on deterministic command output, IDs, hashes and technical scorecard, but does not identify retained screenshot artifacts for the user journey screens.

- User impact

The end-to-end user journey has less visual/product evidence than the sprint requires. This matters for A3 because it is the standalone reference journey, not only an API contract test.

- Root cause

The A3 harness validates the generated-client journey and records technical evidence, but the sprint evidence package did not include the visual screenshot evidence still required by the contract.

- Required fix

Either retain the required screenshots and reference their IDs/hashes in the A3 evidence, or update the A3 contract to state that generated-client deterministic proof replaces screenshot evidence for this local verification scope.

- Verification

Add or reference the screenshot artifacts in the evidence file and rerun the A3 review against the updated evidence package.

## Non-Blocking Issues

- The V1/V2 absence check is valuable and passed in the narrow A3 test.
- The generated-client harness is the right boundary for standalone journey proof because it avoids private API shortcuts.
- The technical scorecard correctly avoids virality, reach, conversion or causal-performance claims.

## Second-Order Risks

- If A3 closes without reconciling founder scorecard language, later launch readiness can be disputed even when technical tests stay green.
- If screenshots are silently removed from acceptance evidence, future UI regressions can escape the reference journey proof.
- A3 depends on A2 hardening evidence. Since A2 has deferred drills, A3 should not overclaim recovery/load/security readiness.

## Test Review

Covered:

- Full deterministic reference journey through generated V0 client.
- Lineage manifest validation.
- Ledger reconciliation.
- A2 recovery/security report surfacing.
- V1/V2 absence scan over OpenAPI, Prisma schema and API imports.

Missing:

- Founder-reviewed pilot scorecard artifact, unless the contract is changed.
- Required screenshot artifacts or an owner-approved replacement.
- Explicit reconciliation that A2 deferred drills do not block A3 acceptance.

## Commands Run

- `node --test tests\integration\reference-journey-a3.test.mjs` -> pass, 5 tests.
- `rg -n "Founder-reviewed|scorecard|screenshots|screenshot|business-acceptance|technical completion" docs\V0\Sprints\V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_SPRINT.md docs\V0\V0_VERTICAL_OUTCOME_SLICES.md docs\V0\Evidence\V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_LOCAL_VERIFICATION_2026-06-30.md docs\V0\V0.md` -> confirmed scorecard and screenshot contract/evidence conflict.

## Fix Plan for Coding Agent

1. Decide whether A3 closes technical completion only or full business acceptance.
2. If A3 closes full acceptance, attach founder-reviewed pilot scorecard evidence.
3. If A3 closes technical completion only, update the sprint and vertical-slice contracts to remove or defer founder-reviewed scorecard from A3 closure.
4. Attach required screenshots with retained IDs/hashes, or formally replace screenshot evidence with an owner-approved deterministic local proof.
5. Reconcile A3 wording with A2 deferred drills so A3 does not overclaim security/recovery readiness.
6. Rerun `node --test tests\integration\reference-journey-a3.test.mjs`.
7. Update the A3 evidence file with the final accepted evidence package.
