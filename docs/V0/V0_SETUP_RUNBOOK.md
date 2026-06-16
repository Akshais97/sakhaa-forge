# Product V0 Setup and Operations Runbook

## Local

1. Install Node.js 22.22.1, the exact pnpm 11 version committed by V0-F0, Python 3.12.13,
   Docker Desktop and
   the worker-image-pinned `ffmpeg`.
2. Create environment files from redacted examples.
3. On Windows PowerShell, run `node scripts/install-pnpm-shim.mjs` once if bare `pnpm`
   commands are unresolved.
4. Start PostgreSQL and Redis, then initialize the filesystem-backed local storage
   simulator.
5. Run Prisma migrations and seed two isolated workspaces.
6. Start web, API, queue processor and fake provider/media workers.
7. Run contract, RLS, ledger and end-to-end simulator suites.

## Staging

1. Provision separate Supabase, Redis and B2 resources.
2. Create migration-owner, API-runtime and queue-runtime database roles.
3. Configure B2 bucket-scoped keys and CORS for presigned PUT.
4. Register HeyGen, payment and publishing callback URLs.
5. Configure secret manager entries and workload identities.
6. Run callback signature, unknown-provider, duplicate-charge and audience-verification
   drills.

## Production

1. Confirm provider prices, limits and account balances.
2. Confirm backup/PITR and B2 protection.
3. Deploy additive migrations, API and queue worker.
4. Run one internal canary workspace.
5. Enable paid submissions only after canary reconciliation.
6. Monitor oldest queue age, unknown operations, active reservations, ledger mismatch,
   publish verification failures and provider spend.

## Incident Priorities

- P0: tenant exposure, duplicate capture, wrong publication, secret leak.
- P1: provider uncertainty backlog, ledger mismatch, callback outage, lost final media.
- P2: queue delay, noncritical provider degradation, failed optional analysis.

V0 incident response and recovery never waits for Product V1 or Product V2.
