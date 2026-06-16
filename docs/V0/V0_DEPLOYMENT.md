# Product V0 Deployment

## Environments

Use isolated local, staging and production Supabase projects, Redis instances, B2
buckets, provider credentials, publishing accounts and payment webhook endpoints.

## Topology

- Next.js web service.
- NestJS/Fastify API service.
- Separate always-on NestJS BullMQ processor.
- Private Python/media workers by CPU/GPU resource class.
- Dedicated licensed After Effects render workers on an Adobe-supported operating
  system; they are not deployed in the generic Linux/Python worker image.
- Supabase PostgreSQL/Auth in Mumbai or nearest suitable Indian region.
- Managed Redis with persistence and `noeviction`.
- Backblaze B2 private buckets; benchmark cross-region transfer.

## After Effects Runtime Contract

- Pin the After Effects version, operating-system image, templates, scripts, plugins and
  fonts as one tested render capability version.
- Keep the worker private and give it only short-lived job-scoped B2 access plus the
  internal worker API credential.
- Run a readiness render before accepting jobs and expose supported effects, fonts,
  codecs and templates through a capability registry.
- Default concurrency is one render per licensed worker until measured evidence supports
  more.
- A missing license, plugin, font, template or codec is a non-retryable capability error;
  infrastructure loss is retryable on another compatible worker.
- Releases that change render capabilities require golden-video comparison and rollback
  to the prior capability version.

## Release Sequence

1. Apply additive Prisma migrations with the migration-owner connection.
2. Deploy code compatible with old and new schemas.
3. Deploy and drain queue processors gracefully.
4. Verify provider callback endpoints and signatures in staging.
5. Run credit, generation, AE golden-render, review, publish and verification smoke tests.
6. Canary one internal workspace.
7. Monitor queue age, duplicate prevention, provider unknown state and ledger balance.
8. Backfill and verify before contract/removal migrations.

## Recovery

- PostgreSQL point-in-time recovery and quarterly restore exercises.
- B2 versioning/protected copies for final production media and financial evidence.
- Rebuild workers from signed images.
- Reconcile outbox, provider operations, credit reservations and publish operations after
  restore.
- V0 recovery never requires V1 or V2.

## Rollback

Disable new paid submissions first, drain active work, preserve unknown operations for
reconciliation and roll back application code only while schema compatibility holds.
Never delete uncertain provider or ledger state to simplify rollback.
