# Repository Structure

```text
apps/
  web/                 # Next.js UI
  api/                 # NestJS + Fastify control plane
workers/
  queue/               # NestJS BullMQ processor, deployed separately
  python/              # private AI/video/GPU HTTP workers
packages/
  contracts/           # JSON Schema/OpenAPI/event types
  db/                  # Prisma schema/migrations, repositories, reviewed SQL, RLS
  ui/                  # shared design primitives
  config/              # typed configuration
ml/
  pipelines/
  training/
  evaluation/
  registry/
tests/
  contract/
  integration/
  e2e/
  fixtures/
  scientific/
infra/
  docker/
  deploy/
docs/
```

Each module owns code, tests, fixtures, and a short README. Generated files live in
clearly named folders and are never manually edited. Large models, videos, caches, and
datasets stay outside Git.

Module task manifests identify owner, contracts, tests, and allowed write scope so
AI-assisted changes remain bounded.
