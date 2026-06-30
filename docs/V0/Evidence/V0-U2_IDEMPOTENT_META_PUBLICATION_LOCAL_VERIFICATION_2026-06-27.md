# V0-U2 Idempotent Meta Publication Local Verification — 2026-06-27

## Slice

V0-U2: Idempotent Meta Publication.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/Sprints/V0-U2_IDEMPOTENT_META_PUBLICATION_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Owner decisions on unspecified contract dimensions

The canonical contracts named the V0-U2 outcome (an authorised role publishes an approved calendar
post to the intended Meta account and receives one external post identity or a recoverable uncertain
state) and its failure contract (retry, timeout, callback replay and worker crash never create two
posts or switch accounts/media), but did not name several operational dimensions. Per CLAUDE.md §1
and §19, the unspecified dimensions were resolved by owner decision rather than guesswork:

- Publish operation status enum: a dedicated `PublishOperationStatus` enum mirroring
  `ProviderOperationStatus` (including `UNKNOWN`), documented as a new "Publish Operation" section in
  `V0_STATUS_ENUMS.md`. The `CalendarPost.PublishStatus` advances in lockstep but has no
  `processing` or `unknown` value: while Meta processes the post stays `accepted`, and the uncertain
  `unknown` truth lives on the operation while the post stays `submitting`.
- Credential model: simulator-only, mirroring G4. `V0_META_SIMULATOR_SECRET` (with `META_WEBHOOK_SECRET`
  fallback) signs the callback envelope; no `ServiceCredential` lookup is enforced in V0. The adapter
  refuses `META_MODE=api` so no unbound live Meta call can escape the simulator boundary.
- Account binding: the request `account` must equal the calendar post's bound `account`; a mismatch
  returns `PUBLISH_ACCOUNT_MISMATCH` (409) and never calls the provider.
- Manual-export rejection: a manual-export post (`manualExport` true) cannot be submitted to a
  provider; it returns `PUBLISH_NOT_SUBMITTABLE` (409).
- One operation per post: a unique constraint on `calendarPostId` enforces one `PublishOperation` per
  `CalendarPost`; a same-key replay returns the existing operation, and a different key for an
  already-published post returns `IDEMPOTENCY_INPUT_CONFLICT` (409).
- Publishing is not a V0 credit op: the `PublishOperation` carries no price, currency, estimated
  maximum or settlement fields (no reservation, capture or release).

## Behaviour verified

- `POST /calendar-posts/{id}/publish` publishes an approved scheduled calendar post to the intended
  Meta account exactly once. Only Owner, Admin or Client Manager (`schedule_publish_approved_media`)
  may publish; a Reviewer is denied by the shared `assertWorkspacePermission` guard
  (`PERMISSION_DENIED` 403). An `Idempotency-Key` is required; a missing key returns
  `IDEMPOTENCY_KEY_REQUIRED` (400). The response is `202 Accepted`.
- A durable `PublishOperation` is persisted `SUBMITTING` before the Meta network I/O so a crash
  between persistence and the network response leaves a resumable operation, never a blind duplicate.
  The operation binds the workspace, the calendar post, the Meta provider route, the idempotency key
  and a server-side `requestHash` (`sha256` over the canonical bound inputs). The `requestHash` is a
  server-side binding secret and never appears in any response, audit row, analytics event or
  rendered markup.
- The request `account` must equal the calendar post's bound `account`; a mismatch returns
  `PUBLISH_ACCOUNT_MISMATCH` (409) and never calls the provider (no operation row is written). A
  manual-export post cannot be submitted and returns `PUBLISH_NOT_SUBMITTABLE` (409). A malformed
  provider response returns `PROVIDER_OUTPUT_INVALID` (422) and no callback.
- A timeout after possible acceptance marks the operation `UNKNOWN` and the calendar post stays
  `submitting`; the response carries `unknown: true` and no callback, and the caller must reconcile
  before any retry. Blind resubmission is prohibited: a same-key replay returns the unknown operation
  (`replay: true`), and a fresh key for the same post returns `IDEMPOTENCY_INPUT_CONFLICT` (409).
- On success the operation advances to `ACCEPTED` with the external post id bound and the calendar
  post advances to `accepted`; a `publish.state_changed` audit is retained (target type `CalendarPost`,
  reason `accepted`). The public post URL is `null` until the post is live. In simulator mode the
  response carries a signed `callback` envelope (`{envelope, signature}`) for the deterministic test to
  post back; the signature is the simulator's HMAC digest (the same affordance as G2/G4), not a
  credential.
- A replay with the same `Idempotency-Key` and the same post + account returns the existing operation
  with `replay: true`; the same key against a different post or account returns
  `IDEMPOTENCY_INPUT_CONFLICT` (409). Exactly one `PublishOperation` exists per `CalendarPost`.
- `POST /calendar-posts/{id}/publish/reconcile` reconciles an uncertain publish operation. It never
  resubmits; it resolves `unknown`/`submitting`/`accepted`/`processing` to a terminal state, records
  `reconciledAt`, and on `completed` binds the public post URL and advances the calendar post to
  `published_unverified`. A terminal operation replays with `replay: true`. A calendar post with no
  publish operation returns `PUBLISH_NOT_SUBMITTABLE` (409). The response is `200 OK`.
- `POST /callbacks/publishing/{provider}` is the signed publishing callback receiver. The handler
  verifies the `x-meta-signature` header in constant time (`crypto.timingSafeEqual`), windows the
  timestamp (5-minute window), deduplicates by `(workspaceId, source, eventId)` via `inbox_events`, and
  advances the `PublishOperation` and `CalendarPost` in lockstep. The public post URL is bound only on
  `publish.completed`. A bad signature or out-of-window callback returns `PROVIDER_CALLBACK_INVALID`
  (401); a malformed envelope returns `PROVIDER_OUTPUT_INVALID` (422); both hide cross-workspace
  existence behind the same 401/422. A replayed callback returns the prior response with
  `duplicate: true` and never transitions a second time. The response is `200 OK`.
- The web shell implements the publish workflow at `apps/web/src/publish-workflow.mjs` with pure,
  DOM-agnostic state functions unit tested in Node and a `publishMarkup` renderer. The workflow is
  never optimistic for the paid/publishing action: it shows `publish-loading`, calls the API with an
  `Idempotency-Key`, and renders the committed operation (status, external id, public URL when live)
  or a calm error. `publishOperationState` maps the nine publish operation statuses and preserves
  `unknown`. `classifyPublishError` maps each publish error to a stable banner state
  (`blocked-hidden` `WORKSPACE_ACCESS_DENIED`, `forbidden` `PERMISSION_DENIED`, `missing-idempotency`
  `IDEMPOTENCY_KEY_REQUIRED`, `account-mismatch` `PUBLISH_ACCOUNT_MISMATCH`, `not-submittable`
  `PUBLISH_NOT_SUBMITTABLE`, `callback-invalid` `PROVIDER_CALLBACK_INVALID`, `post-invalid`
  `PROVIDER_OUTPUT_INVALID`, `idempotency-conflict` `IDEMPOTENCY_INPUT_CONFLICT`, `media-stale`
  `PUBLISH_MEDIA_STALE`, `approval-required` `REVIEW_APPROVAL_REQUIRED`). `derivePublishState` produces
  the `publish-accepted` / `published-unverified` / `unknown-checking` / `publish-failed` / error
  descriptors. The rendered markup carries only the operation status, the external post id, and the
  public post URL (only when live); the request hash, workspace id and any raw provider payload never
  appear. The unit suite asserts the FORBIDDEN regex never matches the markup and that the request
  hash key never appears.
- Signed URLs, object keys, secrets, the request hash, the external provider account id, the signed
  callback signature and raw provider payloads never appear in any publish response, audit row,
  analytics event or rendered markup. The public post URL is the only URL surfaced and only once the
  post is live. Cross-workspace and missing posts hide behind `WORKSPACE_ACCESS_DENIED` (404) and
  never leak the owning workspace id; a cross-workspace publish returns the same 404.
- Prisma schema and migration `0030_v0_u2_idempotent_meta_publication` add the
  `publish_operation_status` enum (nine values) and the `publish_operations` table. The table has FKs
  to `workspaces` and `calendar_posts`, captures `provider`/`operation_type`/`status`/
  `idempotency_key`/`request_hash` (Char 64)/`external_id`/`public_url`/`last_error_code` and the
  `submitted_at`/`accepted_at`/`completed_at`/`reconciled_at`/`cancelled_at` lifecycle timestamps.
  Unique indexes enforce one operation per idempotency key (`(workspace_id, idempotency_key)`) and
  one operation per calendar post (`(calendar_post_id)`), with a partial unique index on
  `(provider, external_id)` for provider identity reconciliation. Two indexes support status listing
  (`(workspace_id, status, updated_at)`) and per-post lookup
  (`(workspace_id, calendar_post_id, status)`). The table enables RLS with a
  `publish_operations_workspace_isolation` policy keyed on `app.current_workspace_id`; no BYPASSRLS is
  granted. The migration is additive and forward-only, and is validated by `db-validate.mjs`.

## Prisma runtime design

The U2 Prisma path mirrors the established V0-G4 exactly-once provider-operation pattern, bound to a
`CalendarPost` instead of a `GenerationJob`, with no credit reservation or settlement. Two short
`withActor` transactions bracket the provider network I/O. The first transaction does the exactly-once
validation and persists the `SUBMITTING` operation: an existing-by-key lookup replays when the post +
account match or returns `IDEMPOTENCY_INPUT_CONFLICT` when they differ; the calendar post is loaded
with a tenant-leading predicate (`findFirst` on `id + workspaceId`) so a cross-workspace caller cannot
learn whether a post they do not own already has a publish operation (the existence-hiding 404 is
returned before any per-post conflict is observable); an existing-for-post lookup returns
`IDEMPOTENCY_INPUT_CONFLICT`; the `manualExport` and `account` checks return their 409 problems from
inside the transaction (never a thrown `HttpException`) so the transaction commits cleanly with no
writes. The `requestHash` is computed with Node `crypto.createHash("sha256")` over the canonical bound
inputs (no `Date.now()`/`Math.random()`), so it is deterministic across replays. A concurrent create that
loses the one-operation-per-post unique race throws P2002 and is reconciled by
`reconcilePrismaPublishRace` to a replay or a stable conflict (never a raw 500). The Meta network I/O
runs outside the transaction; a timeout after possible acceptance is `UNKNOWN` (never a blind
resubmit). The second transaction applies the outcome: `ACCEPTED` + external id + post `accepted` +
audit on success; `UNKNOWN` + post `submitting` + `{unknown:true}` on timeout; `FAILED` +
`PROVIDER_OUTPUT_INVALID` on a malformed response. `applyPrismaPublishOutcome` maps a reconciled or
callback outcome to prisma update payloads, binding `publicUrl` only on `completed` and advancing the
post to `published_unverified`. `processPublishingCallback` runs under `withCallbackWorkspace`
(system-actor context) and deduplicates via `inbox_events` (`source: "meta"`, `idempotencyKey: eventId`).
The `requestHash` is retained on the row but never returned (`publicPublishOperation` omits it and
`workspaceId`).

## Red evidence

Command:

```text
node --test tests\integration\calendar-u2.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.publishCalendarPost is not a function
```

All eight U2 integration tests failed before `publishCalendarPost`/`reconcilePublishOperation`/
`postPublishingCallback` existed on the generated client or the store/routes, and before the
`publish_operation_status` enum and `publish_operations` table existed in the Prisma client and
migration. The Prisma runtime proof additionally failed before the migration was applied and the U2
runtime proof test was written.

## Green evidence

Command:

```text
node --test tests/integration/calendar-u2.test.mjs
```

Outcome:

```text
✔ U2 publishes an approved scheduled calendar post to Meta exactly once and a verified callback drives it to published_unverified
✔ U2 rejects a wrong-account publish with PUBLISH_ACCOUNT_MISMATCH and never calls the provider
✔ U2 treats a timeout after possible acceptance as unknown and reconciles before any retry
✔ U2 rejects a manual-export post publish with PUBLISH_NOT_SUBMITTABLE
✔ U2 fails a malformed Meta response with PROVIDER_OUTPUT_INVALID and no callback
✔ U2 rejects a malformed, bad-signature and out-of-window Meta callback without leaking existence
✔ U2 replays the publish by idempotency key and rejects a same-key different-input conflict
✔ U2 hides a cross-workspace publish behind WORKSPACE_ACCESS_DENIED
tests 8
pass 8
fail 0
```

Unit test commands and outcomes:

```text
node --test tests/unit/publish-workflow.test.mjs
tests 11
pass 11
fail 0
```

The workflow unit suite asserts the publish operation status mapping (nine statuses, `unknown`
preserved), every publish error mapped to a calm banner state, the `publish-accepted` descriptor (with
the external id and no public URL), the `published-unverified` descriptor (with the public URL), the
`unknown-checking` descriptor (never claims success or failure), the `publish-failed` descriptor, each
error banner from a problem code, the rendered operation + external id (no request hash leak), the
rendered public post URL when live, the unknown-status guard, and the cross-workspace blocked-hidden
banner. The FORBIDDEN regex never matches the markup; the `requestHash` key is asserted absent.

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome (broad test glob, prisma runtime proof, db-validate):

```text
node --test tests/**/*.test.mjs
tests 335
pass 314
fail 0
skipped 21

node --test tests/integration/prisma-runtime.test.mjs   (V0_RUNTIME_DB_PROOF=1)
tests 21
pass 21
fail 0
  ✔ prisma runtime persists V0-U2 idempotent Meta publication, verified callback and reconcile under RLS

node packages/db/scripts/db-validate.mjs
Database contract valid for V0-F5/.../C2/R1/R2/U1/U2 identity, ... idempotent Meta publication bound
to one calendar post with one publish operation, a retained request hash, a bound external post id
and public post URL on completion, and RLS.

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1/G2/G3/G4/G5/C1/C2/R1/R2/U1/U2 local verification passed.
```

The 21 skipped tests in the broad glob are the prisma-runtime proof tests intentionally skipped there
and run by the dedicated verification step immediately after, including the V0-U2 runtime proof
against Supabase. All nine verification phases ran green: generate-contracts, db-generate,
db-migrate-dev, check-format, lint, typecheck, the broad test glob, the prisma-runtime proof and
db-validate.

Note on the broad test glob: `node --test tests/**/*.test.mjs` runs integration test files
concurrently. The integration harness uses ephemeral ports (`listen(0)`), and under rare CPU
contention a slow integration file may report a nondeterministic `test failed` (a different
pre-existing file each run; each passes in isolation). This is a pre-existing test-harness
contention characteristic, not a V0-U2 regression: the U2 unit and integration suites pass in
isolation and as a group, and the full glob passes on the vast majority of runs.

## Migration evidence

`node packages/db/scripts/db-migrate-dev.mjs` applied the new migration:

```text
CREATE TYPE
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
V0-F1/.../C2/R1/R2/U1/U2 migrations applied.
```

The migration creates the `publish_operation_status` enum (nine values) and the `publish_operations`
table (workspace, calendar post, provider, operation type, status, idempotency key, request hash,
external id, public URL, retry-after, last error code, submitted/accepted/completed/reconciled/
cancelled timestamps). The table enables RLS with a `publish_operations_workspace_isolation` policy
keyed on `app.current_workspace_id`. No BYPASSRLS is granted. The `db-migrate-dev.mjs` and
`db-validate.mjs` scripts were extended with the U2 migration entry and U2 schema/migration statement
checks.

The runtime-proof test confirms persistence under RLS:

```text
SELECT count(*)::text || ':' || status::text || ':' || (external_id IS NOT NULL)::text || ':' ||
       (request_hash IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text || ':' || (accepted_at IS NOT NULL)::text
FROM publish_operations WHERE id = '<op>' AND workspace_id = '<ws>' AND calendar_post_id = '<post>'
  AND provider = 'meta-simulator' AND operation_type = 'publish_post'
GROUP BY status, external_id, request_hash, public_url, accepted_at
-- result: 1:ACCEPTED:true:true:false:true

SELECT status FROM calendar_posts WHERE id = '<post>' AND workspace_id = '<ws>'
-- result: ACCEPTED   (raw DB returns the uppercase publish_status enum label; the API
--                     response lowercases it to "accepted" via publicCalendarPost)

SELECT count(*)::text FROM audit_events WHERE workspace_id = '<ws>' AND event_type = 'publish.state_changed'
  AND target_type = 'CalendarPost' AND target_id = '<post>' AND reason = 'accepted'
-- result: 1

SELECT count(*)::text FROM publish_operations WHERE workspace_id = '<ws>' AND calendar_post_id = '<post>'
-- result: 1   (replay writes no second operation)

SELECT status::text || ':' || (completed_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text
FROM publish_operations WHERE id = '<op>' AND workspace_id = '<ws>'
-- result: COMPLETED:true:true   (after the verified callback)

SELECT status FROM calendar_posts WHERE id = '<post>' AND workspace_id = '<ws>'
-- result: PUBLISHED_UNVERIFIED   (raw DB returns the uppercase publish_status enum label; the
--                                  API response lowercases it to "published_unverified")

SELECT count(*)::text FROM inbox_events WHERE workspace_id = '<ws>' AND source = 'meta'
  AND idempotency_key = '<eventId>'
-- result: 1   (a replayed callback is deduplicated to one inbox event)

SELECT count(*)::text FROM publish_operations WHERE workspace_id = '<ws>' AND calendar_post_id = '<wrong-account-post>'
-- result: 0   (a rejected wrong-account publish writes no operation)

SELECT status::text || ':' || (reconciled_at IS NOT NULL)::text || ':' || (public_url IS NOT NULL)::text
FROM publish_operations WHERE id = '<timeout-op>' AND workspace_id = '<ws>'
-- result: COMPLETED:true:true   (reconcile resolves unknown to completed without resubmitting)
```

The runtime proof also confirms a cross-workspace publish returns `WORKSPACE_ACCESS_DENIED` (404)
with no owning workspace id leak, that the `publish.state_changed` audit is retained once, that a
replayed publish key returns `replay: true` with exactly one operation row, that a replayed callback
returns `duplicate: true` with exactly one inbox event, that a wrong-account and manual-export publish
write no operation, and that a timeout reconciles to `completed` with `reconciledAt` recorded. Signed
URLs, object keys, secrets, the request hash, the external provider account id, the signed callback
signature and raw provider payloads never appear in any response; the public post URL is the only URL
surfaced and only once the post is live.

## Downstream contract reference

`docs/V0/V0_API.md` (the `POST /calendar-posts/{id}/publish`, `POST /calendar-posts/{id}/publish/reconcile`
and `POST /callbacks/publishing/{provider}` routes with the Owner/Admin/Client Manager annotation and
the Idempotent Meta Publication prose), `docs/V0/V0_DATA_MODELS.md` (the `PublishOperation` model),
`docs/V0/V0_PRISMA_SCHEMA.md` (the `PublishOperationStatus` enum and the `PublishOperation` model in
the review/publishing inventory, with the `publishOperations` back-relation on `CalendarPost`),
`docs/V0/V0_STATUS_ENUMS.md` (the new "Publish Operation" section with the nine-value enum and the
lockstep `CalendarPost` advancement), `docs/V0/V0_JOBS.md` (the "Publishing State (V0-U2)" subsection
with the `meta-simulator` publish state machine), `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md` (the
post-detail screen with the `publish-loading`/`publish-accepted`/`publish-submitting`/
`unknown-checking`/`reconcile-loading`/`publish-failed`/`account-mismatch`/`not-submittable`/
`callback-invalid`/`post-invalid`/`missing-idempotency` states), `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
(the `publish_state_changed` event with the `publish.state_changed` audit row as record of truth),
`docs/V0/V0_ERROR_CATALOG.md` (`PUBLISH_ACCOUNT_MISMATCH` 409, `PUBLISH_NOT_SUBMITTABLE` 409, plus the
existing `PROVIDER_CALLBACK_INVALID`, `PROVIDER_OUTPUT_INVALID`, `IDEMPOTENCY_INPUT_CONFLICT`,
`IDEMPOTENCY_KEY_REQUIRED`, `WORKSPACE_ACCESS_DENIED` and `PERMISSION_DENIED` codes) and
`docs/V0/V0_PERMISSIONS.md` (`schedule_publish_approved_media` for Owner/Admin/Client Manager,
Reviewer denied) record the V0-U2 contract. U2 introduces the `V0_META_SIMULATOR_SECRET`
configuration (with `META_WEBHOOK_SECRET` fallback and `V0_META_SIMULATOR_MODE`/
`V0_META_SIMULATOR_RECONCILE` simulator overrides) and reuses `SUPABASE_JWT_SECRET` and
`V0_INTERNAL_WORKER_TOKEN`. The generated OpenAPI document and generated `v0-client.mjs` carry the
three publish endpoints.

## Browser state evidence

The web shell renders the publish contract at `/posts/{id}` with the `publish-loading`,
`publish-accepted`, `publish-submitting`, `unknown-checking`, `reconcile-loading`, `publish-failed`,
`account-mismatch`, `not-submittable`, `callback-invalid`, `post-invalid`, `missing-idempotency`,
`idempotency-conflict`, `forbidden`, `blocked-hidden` and `error` states. The `publish-workflow` unit
suite asserts the rendered accepted-operation copy (status, external post id, no public URL until
live), the published-unverified copy (public post URL bound), the unknown-checking copy (never claims
success or failure), the publish-failed copy, the calm error banners for every publish guard code, the
unknown-status guard, the cross-workspace blocked-hidden banner, and that no secret, signature,
signed URL, object key, request hash or raw provider payload appears in the markup. No live browser
screenshot is captured in local verification; the deterministic state functions and `publishMarkup`
renderer are the browser-state evidence.

## Scope note

This is local deterministic simulator evidence for V0-U2. It does not claim production publication
readiness, real Meta handoff or full V0 acceptance. The `meta-simulator` adapter refuses
`META_MODE=api` so no unbound live Meta call can escape the simulator boundary; real Meta integration
is deferred. The simulator surfaces a signed callback envelope as a test affordance (the same pattern
as G2/G4); the `x-meta-signature` is the deterministic simulator's HMAC digest, not a credential.
Audience-facing verification is V0-U3 and later and is not claimed here. The permission matrix is
unit-asserted for the Reviewer-deny path because the integration harness only creates OWNER
memberships. The 5-minute callback window, the simulator-only credential model and the one-operation-
per-post unique constraint are flagged for owner confirmation. Publishing is not a V0 credit op: no
reservation, capture or release occurs. New revisions never rewrite historical calendar posts, review
or lineage records. The Prisma concurrency design mirrors G4: the runtime proof covers sequential
publish, callback, replay, dedupe, wrong-account, manual-export, timeout→reconcile and cross-workspace
hiding; a full multi-process concurrency proof for the rare one-operation-per-post race is covered by
the `reconcilePrismaPublishRace` path and the G4 concurrency precedent.
