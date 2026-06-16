# Sakhaa Forge to Product V2 Boundary

## Decision

Product V0 is the first standalone Sakhaa Forge release. Product V1 is its additive
maturity release. Product V2, Sakhaa, integrates with the stable production contract
exposed by the V1-era engine only after V0 acceptance.

Research on TRIBEv2, HCP-MMP1, A-Q scoring, fixtures, and contracts may continue before
that gate. It does not count as V2 product implementation.

The filename is retained for existing links. It does not mean V1 is a bridge service.

## Ownership

| Capability | System of record |
|---|---|
| Brand crawl, approved production brand kit, avatars | V0, inherited by V1 |
| Blueprint discovery and extraction | V0, enhanced by V1 |
| Script tournament and generation routing | V0, enhanced by V1 |
| HeyGen and other generation-provider calls | V0/V1 production engine |
| After Effects planning and rendering | V0/V1 production engine |
| Production review and permission to publish | V0/V1 production engine |
| Calendar, publishing, audience verification, notifications | V0/V1 production engine |
| Creator-credit reservation, capture, release, and payment collection | V0/V1 production engine |
| Immutable scoring input and analysis record | V2 |
| TRIBEv2/HCP/A-Q evidence and research-prior indices | V2 |
| Revision comparison and evidence-linked recommendations | V2 |
| Recommendation acceptance and analytical decision audit | V2 |
| Normalized outcome observations and attribution quality | V2 |
| Calibration, evaluation, datasets, and model governance | V2 |

V2 never calls HeyGen, publishing platforms, or production payment providers directly. V2
produces a versioned generation brief. V1 validates and executes that brief through its
own generation, review, billing, and publishing controls.

## Handoff Flow

```text
V1 brand + blueprint + generation
  -> V1 rendered revision and immutable lineage
  -> V2 scoring-input import
  -> V2 evidence, comparison, and recommendation
  -> human accepts/edits recommendation in V2
  -> V2 generation brief
  -> V1 validates brief, estimates/reserves creator credits, and generates
  -> V1 creates child revision, reviews, publishes, and verifies
  -> V1 emits publication and performance records
  -> V2 normalizes outcomes and evaluates learning hypotheses
```

## Required Contract Fields

Every V1-to-V2 envelope includes:

- `schema_version`, `event_id`, `event_type`, and `occurred_at`;
- `workspace_id` plus a verified V1/V2 workspace mapping;
- production-engine aggregate IDs and immutable revision ID;
- media SHA-256, duration, dimensions, codec, and stable object reference;
- parent revision, blueprint, script, generation route, and provider-operation lineage;
- production review and publication status where applicable;
- trace ID, producer version, idempotency key, and payload hash;
- rights, consent, retention, and purpose metadata.

Every V2-to-V1 generation brief includes:

- V2 recommendation and brief IDs;
- source production revision ID and media hash;
- accepted changes, script, visual direction, brand-kit version, and constraints;
- evidence tier, uncertainty, limitations, and human approver;
- requested output format, maximum cost authorization, and idempotency key.

## State and Failure Rules

- Duplicate events are ignored by `event_id` and idempotency key.
- An unknown workspace mapping is quarantined; it is never guessed.
- A media-hash mismatch blocks scoring or generation.
- Empty, malformed, unsupported-version, unauthorized, or expired payloads fail loudly.
- V2 recommendations never authorize spending or publishing.
- V1 may reject a V2 brief that violates brand, rights, provider, cost, or media rules.
- Provider uncertainty remains in the V1 production engine and is reconciled there.
- V2 outcome imports with ambiguous attribution remain ineligible for training.
- Cross-product retries reuse the original idempotency key and trace ID.
- V1 publishes bridge rate limits and retry guidance; V2 queues with bounded backoff and
  never creates an unbounded retry or submission storm.

## Security Boundary

- Service-to-service calls use dedicated workload identity with audience restriction.
- Both products independently enforce workspace authorization.
- Short-lived signed media access is preferred over public URLs or copied credentials.
- Provider secrets, payment secrets, raw webhook bodies, and creator-credit balances
  never cross into V2.
- V1 and V2 audit the same trace ID so an operator can reconstruct the full loop.

## Compatibility and Rollout

V1 publishes the current and immediately previous compatible contract version. V2 starts
in shadow import mode, then read-only scoring, then recommendation export. Generation
brief submission is enabled only after contract, authorization, replay, timeout, and
rollback tests pass.

Rollback disables V2 brief submission first. V1 continues operating independently with
its existing generation and publishing workflow.
