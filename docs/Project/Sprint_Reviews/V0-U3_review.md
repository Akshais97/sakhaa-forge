# Senior Engineer Sprint Review

## Verdict

NEEDS FIXES BEFORE MERGE

U3 adds YouTube publication, but the shared publishing callback route can apply a YouTube callback to a Meta operation because it does not bind callback provider to the stored operation provider.

## Intended Outcome

V0-U3 should publish the same approved internal publication contract to YouTube Shorts with quota-aware behaviour and one external post identity. It should derive provider from calendar post platform, handle YouTube quota exhaustion, delayed processing, duplicate retry, account mismatch, callback/polling, and keep Meta/manual paths isolated.

## Implementation Map

- `docs/V0/Sprints/V0-U3_IDEMPOTENT_YOUTUBE_SHORTS_PUBLICATION_SPRINT.md`: sprint objective and backlog.
- `docs/V0/Evidence/V0-U3_IDEMPOTENT_YOUTUBE_SHORTS_PUBLICATION_LOCAL_VERIFICATION_2026-06-29.md`: submitted evidence.
- `docs/V0/V0_API.md`, `V0_DATA_MODELS.md`, `V0_PRISMA_SCHEMA.md`, `V0_STATUS_ENUMS.md`, `V0_JOBS.md`, `V0_ERROR_CATALOG.md`, `V0_SECURITY.md`, `V0_SCREEN_AND_STATE_INVENTORY.md`: platform publication contract.
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`: YouTube simulator configuration.
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`, `PROJECT_GUARDRAIL_API_CALLS.md`, `PROJECT_DEVELOPMENT_WORKFLOW.md`, `Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md`: provider boundary and verification rules.
- `apps/api/src/youtube-provider.mjs`: deterministic YouTube simulator, quota and reconcile behaviour.
- `apps/api/src/meta-provider.mjs`: Meta simulator used to compare isolation.
- `apps/api/src/workspace-store.mjs`: provider registry, publish, reconcile and callback paths.
- `apps/api/src/server.mjs`: shared `/callbacks/publishing/{provider}` route.
- `apps/web/src/publish-workflow.mjs`: provider-aware publish UI states.
- `packages/db/prisma/schema.prisma`: U3 reuses U2 `PublishOperation`.
- `tests/integration/calendar-u3.test.mjs`: U3 integration tests.
- `tests/unit/publish-workflow.test.mjs`: publish UI state tests.

## User Flow

1. User schedules exact approved media with `platform: "youtube-shorts"`.
2. User publishes with matching account and idempotency key.
3. Store resolves `youtube-shorts` to `youtube-simulator`.
4. Quota exhaustion refuses before provider I/O and writes no operation.
5. Accepted upload writes one `PublishOperation`, external id and accepted status.
6. Processing keeps operation `processing` and post `accepted` until callback or reconcile completes.
7. Completed callback binds public YouTube Shorts URL and moves post to `published_unverified`.
8. Meta path should remain isolated from all YouTube failures and callbacks.

The happy path, quota path, processing path and Meta happy-path isolation pass narrow tests. The callback provider isolation is incomplete.

## Critical Issues

- Issue

The callback handler does not verify that the callback provider matches the stored publish operation provider.

- Evidence

`apps/api/src/workspace-store.mjs` resolves the callback adapter from the `{provider}` path and verifies the adapter-specific signature. It then loads the operation with `where: { id: envelope.operationId, workspaceId: envelope.workspaceId }`. The query does not constrain `provider`, and there is no later check that `operation.provider === adapter.provider` or that `CalendarPost.platform` resolves to that adapter.

The same function then applies `applyPrismaPublishOutcome` using the URL provider's adapter. A valid YouTube-signed callback envelope can reference a Meta operation id in the same workspace and mutate the Meta operation/post, if the caller can construct the envelope.

- User impact

Provider isolation can fail at the publication evidence boundary. A callback from one provider can complete or alter another provider's operation, corrupting external identity, public URL and audit trail.

- Root cause

Callback authentication proves the envelope came from a configured provider simulator, but the handler does not bind that provider to the stored operation and calendar post.

- Required fix

After loading operation and post, verify all of these before processing:

- `operation.provider === adapter.provider`
- `operation.operationType === adapter.operationType`
- `resolvePublishAdapter(post.platform)?.provider === adapter.provider`
- the envelope `externalId` is compatible with the operation/provider if an external id already exists

On mismatch, return `PROVIDER_CALLBACK_INVALID`, write no inbox event, and leave operation/post unchanged.

- Verification

Add integration tests:

- Publish a Meta post, then send a correctly signed YouTube callback referencing the Meta operation id; expect `PROVIDER_CALLBACK_INVALID`, Meta operation unchanged, no YouTube inbox event.
- Publish a YouTube post, then send a correctly signed Meta callback referencing the YouTube operation id; expect the same rejection.

- Issue

Full verification fails.

- Evidence

`node scripts\verify.mjs` fails in `tests/unit/verify-script.test.mjs`. The test expects the verification banner to stop at U1, while `scripts/verify.mjs` prints U1/U2/U3.

- User impact

The project verification gate is red, so U3 is not merge-ready even though `calendar-u3.test.mjs` passes.

- Root cause

Verification scope changed without updating the verify-script unit test.

- Required fix

Update the unit test or centralise the scope string.

- Verification

Rerun `node scripts\verify.mjs`.

## Non-Blocking Issues

- YouTube quota is simulator-forced by `V0_YOUTUBE_SIMULATOR_QUOTA=exhausted`; there is no persisted per-client daily quota counter. That matches deterministic simulator scope if accepted, but it is not production quota accounting.
- U3 adds no migration. That is reasonable because `provider` and `platform` are varchars, but the no-migration decision depends on strict provider/platform validation in code.
- `publish-workflow.mjs` comments still open with "V0-U2 idempotent Meta publication workflow" even though the file now owns U2/U3 provider-aware UI. This is minor but confusing for future reviewers.

## Second-Order Risks

- Cross-provider callback mutation can poison U4 audience verification because U4 will trust `PublishOperation.publicUrl`, `externalId` and post status.
- A shared publication table with one operation per calendar post is simple, but platform additions increase the importance of provider/platform invariants at every read and callback boundary.
- Quota refusal writes no operation. That is good for avoiding duplicates, but users need a retained UI/audit trace somewhere if support needs to explain why upload did not start.

## Test Review

Covered:

- YouTube publish exactly once.
- Quota-exhausted refusal writes no operation.
- Processing state and reconcile to completed.
- Wrong-account rejection.
- Timeout as unknown and reconcile.
- Idempotent replay and same-key conflict.
- Unsupported platform rejection.
- Meta happy path still works.
- Cross-workspace hiding.
- Malformed/bad/out-of-window YouTube callback rejection.
- Provider-aware UI labels and states.

Missing:

- Cross-provider callback rejection.
- Full verification pass.
- Persisted quota/accounting proof beyond simulator-forced refusal.
- Explicit invariant tests that operation provider, post platform and callback source match.

## Commands Run

- `Get-Content docs\V0\Sprints\V0-U3_IDEMPOTENT_YOUTUBE_SHORTS_PUBLICATION_SPRINT.md` -> sprint contract read.
- `Get-Content docs\V0\Evidence\V0-U3_IDEMPOTENT_YOUTUBE_SHORTS_PUBLICATION_LOCAL_VERIFICATION_2026-06-29.md` -> evidence read.
- `rg -n "resolvePublishCallbackAdapter|processPublishingCallback|PUBLISH_PLATFORMS|youtube-simulator|checkYouTubeQuota" apps\api\src packages\db docs\V0 tests` -> YouTube/shared publish flow traced.
- `node --test tests\integration\calendar-u3.test.mjs` -> pass, 10 tests.
- `node --test tests\unit\publish-workflow.test.mjs` -> pass, 18 tests.
- `node scripts\verify.mjs` -> fail, 1 failing test in `tests/unit/verify-script.test.mjs`.

## Fix Plan for Coding Agent

1. Bind callback provider/source to `PublishOperation.provider`, `operationType` and `CalendarPost.platform`.
2. Reject provider/operation mismatches with `PROVIDER_CALLBACK_INVALID` and no state transition.
3. Add Meta-operation-with-YouTube-callback and YouTube-operation-with-Meta-callback tests.
4. Update stale verification-script test.
5. Rerun `node --test tests\integration\calendar-u3.test.mjs`.
6. Rerun `node scripts\verify.mjs`.
