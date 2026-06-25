# Implemented changes: V0-P2 Viral Candidate Discovery And Immutable Metrics

Date: 2026-06-24

## Scope

Implemented V0-P2 search and evidence path for `new_discovery` blueprint requests.

## Changes

- Added deterministic Xpoz simulator adapter in `apps/api/src/viral-discovery.mjs`.
- Added `POST /viral-candidates/search` and generated client method
  `searchViralCandidates`.
- Added `ViralCandidate` and `MetricSnapshot` Prisma models, migration 0012, RLS
  policies and runtime table probe.
- Added in-memory and Prisma store persistence for ranked candidates, immutable metric
  snapshots, job/outbox evidence and audit.
- Added provider-outage and manual-fallback UI states.
- Updated API, data model and Prisma docs.

## Verification

Red:

```text
node --test tests\integration\viral-candidate-p2.test.mjs
```

Expected failure:

```text
TypeError: client.searchViralCandidates is not a function
```

Focused green:

```text
node --test tests\integration\viral-candidate-p2.test.mjs
node --test tests\unit\viral-discovery.test.mjs
node --test tests\contract\openapi-generation.test.mjs
node --test tests\unit\db-schema.test.mjs
node --test tests\e2e\web-workspace.test.mjs
```

All focused checks passed.
