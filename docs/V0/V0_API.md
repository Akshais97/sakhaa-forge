# Product V0 API

Base path: `/api/v0`. NestJS validates Supabase JWTs and resolves workspace membership.
Long operations return `202 Accepted` with a canonical job.

## Contract Ownership

- A versioned OpenAPI document under the backend API package is the executable contract.
- NestJS DTOs and validation schemas generate the OpenAPI document.
- The Next.js client is generated from that document; browser code must not duplicate
  request or response types manually.
- Every route defines request, success response, RFC 9457 error responses, authorization
  roles, idempotency behavior and pagination where applicable.
- Contract-diff CI blocks undocumented breaking changes to `/api/v0`.

## Browser API

```text
POST   /workspaces                 Idempotency-Key required
POST   /brands/crawl-runs
POST   /brands/assets/uploads      Idempotency-Key required
POST   /brands/assets/uploads/{artifact_id}/complete
POST   /artifacts/{artifact_id}/downloads
POST   /jobs/simulated-media-processing  Idempotency-Key required; local deterministic F4 round trip
POST   /jobs/dead-letter          Owner/Admin-visible failed job recovery list
POST   /brands/{brand_id}/approvals
GET    /blueprints
POST   /viral-candidates/search
POST   /viral-candidates/{candidate_id}/extract-blueprint
POST   /script-tournaments
POST   /script-tournaments/{id}/select
GET    /avatars
POST   /generation-estimates
POST   /generation-jobs
GET    /generation-jobs/{id}
POST   /generation-jobs/{id}/cancel
POST   /composition-plans
POST   /composition-plans/{id}/render
POST   /review-items/{id}/comments
POST   /review-items/{id}/decisions
POST   /calendar-posts
POST   /calendar-posts/{id}/publish
POST   /calendar-posts/{id}/verify
POST   /credit-purchases
GET    /credit-wallets/{id}/ledger
GET    /jobs/{id}
GET    /jobs/{id}/events
```

## Provider Callbacks

```text
POST /callbacks/heygen
POST /callbacks/razorpay
POST /callbacks/stripe
POST /callbacks/publishing/{provider}
```

Handlers preserve raw bytes where signature verification requires them, acknowledge
quickly, persist an inbox record and process asynchronously. Duplicate callbacks produce
one transition.

## Internal Worker API

```text
POST /internal/jobs/{job_id}/claim
POST /internal/jobs/{job_id}/heartbeat
POST /internal/jobs/{job_id}/complete
POST /internal/jobs/{job_id}/fail
POST /internal/jobs/leases/expire
POST /internal/outbox/relay
POST /internal/reconciliation/provider-operations
POST /internal/reconciliation/credits
POST /internal/reconciliation/publishing
```

Workers authenticate with dedicated service identity. Completion supplies expected
object keys, hashes, schemas, byte sizes and lineage. A queue message alone never
authorizes work.

## Standards

- `Idempotency-Key` is required for paid, publishing and costly mutations.
- `Idempotency-Key` is also required for externally visible tenant mutations introduced by
  V0-F2, including `POST /workspaces`, so duplicate submissions replay the original durable
  response and changed input returns `IDEMPOTENCY_INPUT_CONFLICT`.
- RFC 9457 problem details use stable error codes.
- Cursor pagination is mandatory for collections.
- Signed URLs never reveal bucket credentials.
- V0-F3 upload and download contracts are short-lived, workspace-scoped and never logged
  or exposed in cross-workspace error responses.
- Provider payloads are translated into internal contracts.
- Authorization is rechecked when a job is claimed, not only when it is created.
- V0-F4's deterministic simulated media-processing job creates a canonical job and outbox
  row, returns `202 Accepted`, and completes only through authenticated internal worker
  endpoints with validated output hash, object key, byte size and schema version.
- V0-F4 outbox relay treats Redis as wake-up delivery only. Redis loss returns
  `DEPENDENCY_UNAVAILABLE` while PostgreSQL job and outbox rows remain canonical and
  relayable later.
- V0-F4 lease expiry requeues canonical work, rejects stale worker completion and records
  job events. Exhausted or non-retryable worker failure remains visible in the dead-letter
  list with a stable error code.
- Request body size, upload size, string length, enum and provider-specific limits are
  explicit in validation schemas.
- V0 APIs do not require a V1 or V2 endpoint.
