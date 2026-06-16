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
POST   /workspaces
POST   /brands/crawl-runs
POST   /brands/assets/uploads
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
POST /internal/reconciliation/provider-operations
POST /internal/reconciliation/credits
POST /internal/reconciliation/publishing
```

Workers authenticate with dedicated service identity. Completion supplies expected
object keys, hashes, schemas, byte sizes and lineage. A queue message alone never
authorizes work.

## Standards

- `Idempotency-Key` is required for paid, publishing and costly mutations.
- RFC 9457 problem details use stable error codes.
- Cursor pagination is mandatory for collections.
- Signed URLs never reveal bucket credentials.
- Provider payloads are translated into internal contracts.
- Authorization is rechecked when a job is claimed, not only when it is created.
- Request body size, upload size, string length, enum and provider-specific limits are
  explicit in validation schemas.
- V0 APIs do not require a V1 or V2 endpoint.
