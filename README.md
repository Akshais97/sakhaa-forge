# Sakhaa Forge

Sakhaa Forge is the first application implemented in this workspace. Product V0 is a
standalone India-first production system that turns approved brand truth into a reviewed,
published and audience-verified short-form video with complete cost and creative lineage.

## Current Status

The repository contains authoritative V0 documentation and the initial `V0-F0` walking
skeleton scaffold. The current scaffold provides workspace boundaries, health/readiness
contracts, a generated-client smoke path and local verification scripts. Later slices
must not start until the full F0 evidence package is retained.

## V0 Journey

```text
Brand intake and approval
-> blueprint selection or discovery
-> multimodal structural blueprint
-> script tournament and exact selection
-> consent-safe avatar and cost authorisation
-> HeyGen generation and reconciliation
-> After Effects composition
-> exact-version review approval
-> schedule and publication
-> audience verification
-> cost and lineage evidence
```

## Read First

1. [`docs/V0/V0.md`](docs/V0/V0.md)
2. [`docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`](docs/V0/V0_VERTICAL_OUTCOME_SLICES.md)
3. [`docs/V0/V0_INFORMATION_ARCHITECTURE.md`](docs/V0/V0_INFORMATION_ARCHITECTURE.md)
4. [`docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`](docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md)
5. [`docs/Project/DESIGN.md`](docs/Project/DESIGN.md)
6. [`docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`](docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md)
7. [`AGENTS.md`](AGENTS.md)

## Technology

- Next.js and TypeScript
- NestJS with Fastify
- Supabase PostgreSQL and Auth
- Prisma migrations and ORM
- BullMQ with Redis wake-ups
- Private Python 3.12 media/AI workers
- Dedicated licensed After Effects workers
- Backblaze B2 private object storage

## Toolchain

- Node.js `24.15.0`
- pnpm 11, with the exact version committed in root `packageManager` by V0-F0
- Python `3.12.13`

Use the repo-root `pnpm.cmd` launcher or Corepack directly to run the pinned pnpm line:

```text
pnpm verify
```

Fallback:

```text
corepack pnpm verify
```

On Windows PowerShell, if `pnpm` is still unresolved, run:

```text
node scripts/install-pnpm-shim.mjs
```

## Scope

Implementation is V0 only. Do not introduce template clustering, additional automated
generation providers, TikTok Direct Post, automated A/B testing, V2 scoring or any V1/V2
runtime dependency.

## Security

Never commit real credentials, customer media or personal data. Browser code receives no
database, Redis, provider or storage credentials. Paid and publishing operations are
durable, idempotent and reconciled before retry.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md). Changes follow the owning V0 slice, TDD,
generated-contract and documentation-update requirements.
