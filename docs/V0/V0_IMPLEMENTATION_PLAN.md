# Product V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> or superpowers:executing-plans task by task.

**Goal:** Deliver the standalone Sakhaa Forge production acceptance journey.

**Architecture:** Next.js plus NestJS/Fastify owns the control plane and Prisma-managed
Supabase PostgreSQL. BullMQ drives separate queue processors and private media workers.
Backblaze B2 stores quarantined, clean and derived media.

**Execution units:** Implement the vertical outcomes in
`V0_VERTICAL_OUTCOME_SLICES.md`. The gates below are release checkpoints, not permission
to build every checklist item as one large technical-layer batch.

## Gate 0: Foundation

- [ ] Create the monorepo and deployment entrypoints.
- [ ] Configure Supabase Auth, restricted runtime role, migration role and RLS.
- [ ] Implement the schema in `V0_PRISMA_SCHEMA.md`.
- [ ] Generate and validate the versioned `/api/v0` OpenAPI contract and TypeScript client.
- [ ] Configure Redis persistence/`noeviction` and B2 private buckets.
- [ ] Provision the pinned licensed AE render capability and pass a golden readiness render.
- [ ] Add OpenTelemetry, structured errors, audit and local provider simulators.
- [ ] Prove cross-workspace isolation, restore and one-command local startup.

## Gate 1: Brand Intelligence

- [ ] Implement safe crawl scope, URL policy and uploads.
- [ ] Extract brand candidates and retain source evidence.
- [ ] Implement approval, versioning, rules and active brand memory.
- [ ] Block production work without an approved exact brand-profile version.

## Gate 2: Discovery and Blueprint

- [ ] Implement the required existing-blueprint/new-discovery choice.
- [ ] Integrate Xpoz candidate search and immutable metric snapshots.
- [ ] Implement safe acquisition, thumbnail analysis, scene detection, transcription,
      keyframes, vision/OCR, merge, formula and director-prompt artifacts.
- [ ] Implement the approved default formula when no extracted blueprint is used.
- [ ] Preserve low-confidence and blocked states.

## Gate 3: Script Tournament

- [ ] Generate 10-20 formula- and brand-constrained variants.
- [ ] Evaluate hooks, cadence, CTA, claims and sound-off captions.
- [ ] Preserve all variants/evaluations and require explicit selected-script identity.

## Gate 4: Credits and HeyGen Generation

- [ ] Implement wallets, price versions, purchases and append-only ledger.
- [ ] Implement estimate, confirmation and atomic reservation.
- [ ] Implement HeyGen primary route with durable provider operations.
- [ ] Enforce configured HeyGen input, concurrency, rate-limit and price-version controls.
- [ ] Reconcile callback duplicates and uncertain submissions.
- [ ] Capture or release credits exactly once.

## Gate 5: AE Composition

- [ ] Implement versioned user instructions and normalized AE plans.
- [ ] Validate assets, timing, effects, fonts, captions and duration.
- [ ] Render retained final media with hashes and lineage.
- [ ] Support revisions without silently replacing approved upstream artifacts.

## Gate 6: Review

- [ ] Implement internal/client review, comments and version-specific decisions.
- [ ] Prevent scheduling of unapproved or superseded media.
- [ ] Preserve reviewer, reason and exact input version.

## Gate 7: Calendar, Publishing and Verification

- [ ] Implement Meta first, YouTube second and manual export fallback.
- [ ] Submit idempotently and retain external post identity.
- [ ] Verify account, post, media, caption, visibility and timing as an audience member.
- [ ] Send one processing/success/failure notification per policy.

## Gate 8: Production Acceptance

- [ ] Run one real-estate client through the complete journey without manual pipeline
      intervention.
- [ ] Reconcile provider charges with the V0 ledger.
- [ ] Demonstrate V0 with V1 and V2 absent.
- [ ] Complete security, recovery, performance and operator runbooks.

V1 starts only after this gate passes. V2 is not part of this implementation plan.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope and strategy | 1 | CLEAR | Scope held; pilot economics remain a launch evidence gate |
| Codex Review | outside voice | Independent second opinion | 0 | SKIPPED | Current reviewer is Codex and the workspace is not a Git repository |
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | CLEAR TO START GATE 0 | Version, provider, AE and API ambiguities corrected |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | NOT RUN | Run before committing the full user interface |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | NOT RUN | Not required to begin Gate 0 |

**VERDICT:** CEO + ENG CLEARED TO START V0 GATE 0; production launch requires all V0 gates and pilot evidence.

NO UNRESOLVED DECISIONS
