# Product V0 Vertical Outcome Slice Design

**Date:** 2026-06-15  
**Scope:** Product V0 only  
**Status:** Approved design

## Purpose

This design converts Product V0 into independently demonstrable vertical outcomes. A
slice is not a frontend task, backend task or database task. It is the smallest coherent
user or administrator outcome that crosses every required layer and proves its own failure
behavior.

V1 and V2 are not implementation dependencies, parallel workstreams or acceptance
participants. They are excluded from this design.

## Chosen Approach

Use vertical outcome slices with a thin walking skeleton first.

Each slice may include:

- Next.js user or administrator interaction;
- generated OpenAPI client and NestJS/Fastify route;
- domain service and explicit repository query;
- Prisma model or additive migration;
- PostgreSQL RLS, constraints and indexes;
- BullMQ wake-up and canonical PostgreSQL job state;
- private Python, media or AE worker interaction;
- B2 artifact ownership and hashes;
- provider adapter or deterministic simulator;
- audit, tracing, metrics and Admin recovery;
- unit, contract, integration and end-to-end evidence.

A slice includes only the layers required for its outcome. It must not create speculative
abstractions for later slices.

## Why This Approach

Layer-first implementation would postpone integration between identity, storage, jobs,
providers, billing and user-visible state until late in the project. V0's highest risks
are exactly at those boundaries: cross-tenant access, duplicate paid work, uncertain
provider state, artifact substitution, wrong-version approval and wrong-account
publication.

Vertical slices force those boundaries to work from the beginning.

## Slice Rules

1. A slice has one named user or administrator outcome.
2. A slice has one primary aggregate or state transition.
3. A slice ends in demonstrable behavior, not internal code completion.
4. A slice includes nil, empty, malformed, unauthorized, duplicate, stale, timeout and
   recovery behavior where applicable.
5. A slice writes immutable evidence for sensitive transitions.
6. A slice uses deterministic simulators before paid or externally reviewed providers.
7. A slice is hidden behind workspace capability configuration until its evidence passes.
8. A slice cannot weaken a release-blocking invariant to become demonstrable.
9. A slice cannot depend on V1, V2, TRIBEv2, HCP, A-Q or deferred provider routes.
10. A slice follows the project definition of done and TDD guardrails.

## Slice Completion Contract

A slice is complete only when:

- the user or administrator outcome works through the real public contract;
- the intended test failed before implementation and now passes;
- authorization and workspace isolation are verified;
- state transitions and idempotency are enforced;
- errors are visible and actionable;
- trace, audit and relevant metrics exist;
- generated contracts, schema, migrations and documentation agree;
- rollback or forward recovery is demonstrated;
- evidence is linked to the relevant V0 build gate.

## Foundation Shape

```text
F0 Walking skeleton
  -> F1 Tenant-safe identity
  -> F2 Executable API contracts
  -> F3 Private artifact lifecycle
  -> F4 Durable jobs and worker protocol
  -> F5 Observability and Admin recovery

F1, F2 and F3 may overlap after F0.
F4 depends on F1-F3.
F5 is completed against the working F4 path.
```

The first foundation demo is:

```text
authenticated user
-> selects workspace
-> submits a simulated artifact-processing request
-> receives a durable job
-> watches progress
-> downloads the workspace-authorized result
-> sees a traceable audit history
-> retries safely after a simulated worker crash
```

This proves the architecture used by every later V0 workflow without pretending that a
business feature is complete.

## Dependency Strategy

After the foundation passes, slices may advance in lanes:

```text
Lane A: brand and blueprint domain outcomes
Lane B: billing, avatar and HeyGen provider outcomes
Lane C: AE capability and media composition outcomes
Lane D: review and publishing adapters using simulators
```

Merges occur at explicit integration points:

- approved brand profile;
- immutable ready blueprint;
- immutable selected script;
- retained generated asset with settled credits;
- immutable final video;
- exact-version approval;
- verified publication.

These are the only handoff identities later slices may consume.

## Rejected Approaches

### Gate-Sized Work

V0-G0 through V0-G8 remain release gates, but they are too large to be implementation
units. They remain evidence checkpoints above the slices.

### Technical-Layer Work

Building all schema, then all backend, then all workers, then all frontend would create
long periods without a testable product outcome and defer the riskiest integration.

### Provider-First Prototype

Calling HeyGen before tenancy, ledger, durable operations and reconciliation exist would
make duplicate charges and orphaned media part of the architecture. The simulator path
must pass first.

## Design Success

The design succeeds when every requirement in `V0.md` maps to at least one slice, every
slice maps to a V0 gate, and the final slice proves the complete reference journey with
V1 and V2 absent.
