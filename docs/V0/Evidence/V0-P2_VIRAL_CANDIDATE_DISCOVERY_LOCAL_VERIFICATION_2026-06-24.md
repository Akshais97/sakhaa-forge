# V0-P2 local verification evidence

Date: 2026-06-24

Slice: V0-P2 Viral Candidate Discovery And Immutable Metrics.

## Red test

Command:

```text
node --test tests\integration\viral-candidate-p2.test.mjs
```

Expected failure before implementation:

```text
TypeError: client.searchViralCandidates is not a function
```

## Focused green checks

```text
node --test tests\integration\viral-candidate-p2.test.mjs
node --test tests\unit\viral-discovery.test.mjs
node --test tests\contract\openapi-generation.test.mjs
node --test tests\unit\db-schema.test.mjs
node --test tests\e2e\web-workspace.test.mjs
```

Observed focused result: all listed tests passed.

## Evidence retained

- Xpoz simulator adapter fixture ranks candidates deterministically.
- `POST /viral-candidates/search` returns bounded ranked candidates for same-workspace
  `new_discovery` blueprint requests.
- Provider timeout/outage/empty/malformed states return `DISCOVERY_PROVIDER_UNAVAILABLE`
  with no fabricated candidates.
- Manual fallback keeps actor, source URL, metrics and rights-basis provenance.
- Metric snapshots retain observed time, source hash and immutable flag.
- UI includes candidate search, rights warning, immutable snapshot and provider-outage
  states.
