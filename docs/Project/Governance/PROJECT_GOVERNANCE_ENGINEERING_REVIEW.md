# Product V0 Engineering Review

**Date:** 2026-06-15  
**Mode:** Full review  
**Framework:** `garrytan/gstack` `plan-eng-review`, current `main` reference  
**Verdict:** Clear to begin Gate 0. Production readiness requires executable proof.

## Engineering Scorecard

| Dimension | Score | Judgment |
|---|---:|---|
| Architecture and ownership | 9.4 | Modular monolith and worker boundaries are explicit |
| Data integrity and tenancy | 9.4 | Prisma ownership, RLS and immutable lineage are strong |
| Provider and billing reliability | 9.4 | Durable operations and append-only ledger close duplicate risk |
| API contracts | 8.9 | OpenAPI/client ownership is now explicit; implementation is pending |
| Jobs and failure recovery | 9.1 | PostgreSQL canonical state and BullMQ wake-ups are appropriate |
| Security | 9.3 | High-risk boundaries have mandatory controls and tests |
| Testing | 9.1 | Critical paths are specified; no executable suite exists yet |
| Deployment and recovery | 9.0 | AE runtime and rollback contract are explicit |
| Performance and cost | 8.7 | Measurement plan is sound; numeric budgets require evidence |
| **Overall** | **9.1** | **Proceed with Gate 0** |

## Architecture Review

```text
Browser -> Next.js -> NestJS/Fastify -> Supabase PostgreSQL
                         |       |
                         |       +-> B2 private object storage
                         +-> outbox -> BullMQ wake-up -> NestJS processor
                                                     |-> Python CPU/GPU worker
                                                     |-> licensed AE worker
                                                     |-> provider adapters
```

- NestJS is the sole domain API and PostgreSQL writer.
- Prisma is the sole schema and migration owner, including reviewed migration SQL.
- PostgreSQL owns job, provider, billing and publication truth; Redis is delivery only.
- Python and AE workers use an authenticated internal API and job-scoped object access.
- HeyGen is the only automated V0 generation provider. Other providers are V1.
- V0 has no runtime or schema dependency on V1 or V2.

## Findings Resolved In This Review

1. Removed non-HeyGen provider routes and `template_clusters` from the V0 executable
   contract.
2. Replaced the incorrect “V1 submits to HeyGen” flow with the actual V0 flow.
3. Added executable OpenAPI ownership and generated TypeScript client requirements.
4. Added a dedicated licensed AE worker topology, capability version and golden render.
5. Added provider-limit, malformed-AI, queue-backlog and contract-diff tests.
6. Added measurable pilot economics as a launch gate without inventing target values.

## Error And Rescue Registry

| Codepath | Failure | Rescue | User-visible result |
|---|---|---|---|
| Brand crawl | SSRF, redirect, oversized/malicious media | Block and retain reason | Crawl blocked with actionable error |
| AI extraction/script | Empty, malformed, refusal, invalid schema | Bounded retry or blocked state | Stage failed/blocked; no fabricated output |
| HeyGen submit | Timeout after possible acceptance | Mark `unknown`, reconcile | Processing delayed; no duplicate submission |
| HeyGen rate limit | `429` plus `Retry-After` | Delayed retry within limit | Queued with updated timing |
| Worker execution | Lease expiry or crash | Lease recovery and idempotent completion | Retrying or operator-visible failure |
| AE render | Capability drift | Reject before work; route compatible worker | Rendering unavailable with exact missing capability |
| Payment callback | Replay or invalid signature | Reject or inbox dedupe | One financial transition |
| Publish | Timeout or duplicate request | Idempotency and provider reconciliation | No duplicate post |
| Verification | Delayed propagation or identity mismatch | Bounded retry or manual URL state | Never falsely reports success |

## Failure Modes

No reviewed path is allowed to have all three properties: no rescue, no test and silent
user impact. The highest-risk implementation proofs are provider crash windows, ledger
capture/release races, tenant isolation, AE environment drift and wrong-account
publication.

## Test Coverage Plan

```text
AUTH/TENANCY
  -> approved brand
  -> blueprint/default formula
  -> script tournament and immutable selection
  -> estimate/reservation/provider operation
  -> retained media/AE golden render
  -> exact-version approval
  -> idempotent publish
  -> audience verification
  -> one notification and reconciled ledger

For every boundary: happy + nil/empty + malformed + unauthorized + duplicate +
timeout + crash window + stale version + recovery.
```

Unit tests cover domain transitions and validators. Integration tests cover Prisma/RLS,
outbox, callbacks, ledger and object ownership. Contract tests cover adapters and
OpenAPI. E2E tests cover the reference journey. Chaos tests cover Redis loss, worker
crash, callback replay, unknown provider state and restore.

## Performance Review

The architecture is appropriate for initial scale. The first limits will likely be
external generation concurrency, AE rendering, media transfer and AI/video processing,
not NestJS CRUD. Gate 0 must establish workload-shaped measurements for queue age,
connection pools, B2 transfer, provider latency, AE render time, cost per verified post
and operator time. No numeric SLO is claimed without evidence.

## Deployment And Rollback

```text
additive migration -> compatible API -> processors/workers -> callback checks
-> golden/smoke tests -> internal workspace canary -> controlled pilot

failure -> stop new paid submissions -> drain safe work -> preserve unknown operations
-> reconcile -> roll back compatible code/capability version
```

## Parallelization

After Gate 0 contracts land, implementation can use three lanes:

| Lane | Work | Depends on |
|---|---|---|
| A | Identity, tenancy, schema, RLS, billing primitives | Gate 0 contracts |
| B | B2, media validation, worker protocol, job runtime | Gate 0 contracts |
| C | OpenAPI, frontend client, provider simulators, telemetry | Gate 0 contracts |

Merge Gate 0 before parallel feature lanes. Brand, blueprint and script work can then
advance while HeyGen/AE adapters are implemented against simulators. Review/publishing
depends on immutable final-video identity and therefore remains later.

## What Already Exists

Documentation contracts and guardrails exist. No application code, migrations, generated
OpenAPI client, automated tests, deployed workers or production evidence were found in
the reviewed workspace.

## Not In Scope

- V1 providers, template clustering, A/B testing and scale automation.
- V2 inference, datasets, calibration and recommendations.
- Numeric performance claims before representative benchmarks.
- Production launch based solely on documentation review.

## Engineering Go/No-Go

**GO:** Start Gate 0 contracts, repository scaffold, schema, OpenAPI, simulators,
telemetry, queues, storage and AE readiness.  
**NO-GO:** Do not begin broad parallel feature implementation until Gate 0 isolation,
contract, restore and local-start evidence passes.

NO UNRESOLVED DECISIONS
