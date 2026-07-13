# Senior Engineer Sprint Review

## Verdict

NEEDS FIXES BEFORE MERGE

U2's Meta publish behaviour passes narrow tests, but the repository verification gate is red.

## Intended Outcome

V0-U2 should publish an approved calendar post to the intended Meta account exactly once, or enter a recoverable uncertain state without switching media or account. It should use a deterministic Meta adapter/simulator, store one durable `PublishOperation` before network I/O, reject wrong account/manual export, handle timeout/callback/reconcile safely, dedupe callbacks, and expose public URL only after provider identity is known.

## Implementation Map

- `docs/V0/Sprints/V0-U2_IDEMPOTENT_META_PUBLICATION_SPRINT.md`: sprint objective and required tests.
- `docs/V0/Evidence/V0-U2_IDEMPOTENT_META_PUBLICATION_LOCAL_VERIFICATION_2026-06-27.md`: submitted evidence.
- `docs/V0/V0_API.md`, `V0_DATA_MODELS.md`, `V0_PRISMA_SCHEMA.md`, `V0_STATUS_ENUMS.md`, `V0_JOBS.md`, `V0_ERROR_CATALOG.md`, `V0_SECURITY.md`, `V0_PERMISSIONS.md`: publish contract, model, state and callback rules.
- `docs/Project/Guardrails/PROJECT_GUARDRAIL_API_CALLS.md`, `PROJECT_GUARDRAILS.md`, `PROJECT_DEVELOPMENT_WORKFLOW.md`: rules for provider boundaries, idempotency and verification.
- `apps/api/src/meta-provider.mjs`: deterministic Meta simulator and reconcile logic.
- `apps/api/src/server.mjs`: publish, reconcile and callback routes.
- `apps/api/src/workspace-store.mjs`: `PublishOperation` creation, idempotency, timeout, callback and reconciliation.
- `apps/web/src/publish-workflow.mjs`: publish UI states and markup.
- `packages/db/prisma/schema.prisma` and migration `0030_v0_u2_idempotent_meta_publication`: `PublishOperation` model, unique constraints and RLS.
- `tests/integration/calendar-u2.test.mjs`: U2 integration tests.
- `tests/unit/publish-workflow.test.mjs`: U2/U3 publish workflow tests.

## User Flow

1. User schedules exact approved media through U1 for `platform: "meta"`.
2. User publishes the post with an idempotency key and matching account.
3. Store checks workspace access, rejects manual export, rejects wrong account, then persists a `SUBMITTING` `PublishOperation` before provider I/O.
4. Meta simulator returns accepted, timeout or malformed.
5. Accepted creates external id and moves post to `accepted`; callback later completes to `published_unverified` and stores public URL.
6. Timeout becomes `unknown`; user must reconcile instead of resubmitting.
7. Callback route verifies signature, windows timestamp and dedupes by inbox event.

The U2 journey is implemented and passes narrow tests. Merge readiness still fails because the repo verification script is broken.

## Critical Issues

- Issue

Full verification fails.

- Evidence

`node scripts\verify.mjs` runs generation, Prisma generation, migrations, format, lint, typecheck and broad tests. The broad test suite fails at `tests/unit/verify-script.test.mjs` because the test still expects the final verification banner to end at `.../R1/R2/U1 local verification passed`, while `scripts/verify.mjs` prints `.../R1/R2/U1/U2/U3 local verification passed`.

- User impact

The project definition of done requires fresh verification output. A red verification gate means the sprint cannot be considered merge-ready even if its narrow tests pass.

- Root cause

The verification script was updated for U2/U3 scope, but its unit test was not updated.

- Required fix

Update `tests/unit/verify-script.test.mjs` to expect the current verification scope, or better, make the expected scope single-sourced so future sprint additions do not stale this test.

- Verification

Rerun `node scripts\verify.mjs` to completion and retain the green output.

## Non-Blocking Issues

- The simulator returns a signed callback envelope to the API caller. Evidence says this mirrors other deterministic provider simulators. Keep this strictly simulator-only; non-simulator mode must not leak callback affordances.
- U2 verifies callback signatures, but after U3 there are multiple callback sources. U2 by itself is coherent, but the shared callback route needs provider-operation binding once U3 is present.

## Second-Order Risks

- U2 is the first external publication side-effect boundary. If verification is red, future sprint evidence can claim publication readiness while the repo gate disagrees.
- The `PublishOperation` one-operation-per-calendar-post model prevents duplicate Meta posts, but it also means a failed provider attempt consumes the post's only operation unless product later defines cancellation/retry semantics.
- Provider acceptance is correctly distinct from audience verification. UI copy must continue to avoid calling accepted posts "published and verified".

## Test Review

Covered:

- Meta publish exactly once.
- Wrong-account rejection.
- Timeout as `unknown` and reconciliation before retry.
- Manual-export rejection.
- Malformed Meta response.
- Bad, malformed and stale callback rejection.
- Idempotent replay and same-key different-input conflict.
- Cross-workspace hiding.
- Publish UI accepted, unknown, failed and completed states.

Missing:

- Green full verification.
- Explicit test that simulator callback envelope is absent when live API mode is enabled/refused.
- Cross-provider callback mismatch test belongs to U3 after YouTube exists.

## Commands Run

- `Get-Content docs\V0\Sprints\V0-U2_IDEMPOTENT_META_PUBLICATION_SPRINT.md` -> sprint contract read.
- `Get-Content docs\V0\Evidence\V0-U2_IDEMPOTENT_META_PUBLICATION_LOCAL_VERIFICATION_2026-06-27.md` -> evidence read.
- `rg -n "submitPublishOperation|processPublishingCallback|PublishOperation|meta-simulator|PUBLISH_ACCOUNT_MISMATCH" apps\api\src packages\db docs\V0 tests` -> Meta publish flow traced.
- `node --test tests\integration\calendar-u2.test.mjs` -> pass, 8 tests.
- `node --test tests\unit\publish-workflow.test.mjs` -> pass, 18 tests.
- `node scripts\verify.mjs` -> fail, 1 failing test in `tests/unit/verify-script.test.mjs`.

## Fix Plan for Coding Agent

1. Update `tests/unit/verify-script.test.mjs` for the current U1/U2/U3 verification scope.
2. Consider extracting the verification scope string to one source to prevent recurring stale tests.
3. Add a simulator/live-mode assertion if the project wants hard proof that callback envelopes are simulator-only.
4. Rerun `node --test tests\integration\calendar-u2.test.mjs`.
5. Rerun `node scripts\verify.mjs`.
