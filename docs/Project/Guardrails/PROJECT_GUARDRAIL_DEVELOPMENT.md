# Proper Development Guardrails

## Product and Science

- Use HCP-MMP1 only and exactly 17 A-Q clusters.
- Never call predicted cortical proxies measured customer brain activity.
- Never claim guaranteed engagement, virality, recall, conversion, emotion, or intent.
- Preserve factor status: measured override, whole-video proxy, timing proxy, interaction proxy, context-gated, unavailable.
- Human approval is mandatory.
- Call deterministic outputs research-prior indices until the claims register changes.
- Underpowered or observational results cannot be called validation or causation.

## Data and Security

- Enforce workspace scope in API, repository, storage, queue, cache, and logs.
- Store secrets only in a secret manager; redact tokens and signed URLs.
- Use signed uploads, malware scanning, content-type validation, and retention policies.
- Verify webhook signatures on raw bytes and de-duplicate events.
- Do not train on customer data outside documented consent and purpose.

## Engineering

- Heavy work is asynchronous and idempotent.
- No direct provider SDK imports in domain modules.
- No unversioned schema, formula, prompt, dataset, or model changes.
- No competing migration owners.
- Prisma is the sole schema and migration owner.
- NestJS is the sole domain API and PostgreSQL writer.
- Python workers must not receive PostgreSQL or Redis credentials.
- Raw SQL is confined to named parameterized modules; no `$queryRawUnsafe` or
  string-built SQL.
- BullMQ is delivery infrastructure, never canonical job or billing state.
- No Kubernetes, feature store, vector database, or new service without measured need and an ADR.
- Never bypass failing tests by weakening assertions.

## Commercial

- Paid SaaS cannot ship on assumed TRIBEv2 rights.
- Every model and dataset requires a license manifest.
- V0 generation estimates and limits are contract data; V0 checks them before provider submission.
- Phase 2 cannot start before `../../V2/V2_PHASE2_ENTRY_GATES.md` passes.
- RL and online bandits require a later ADR and causal-safety review.

## AI-Assisted Coding

- Agents read contracts and tests before editing.
- Each task has a bounded write scope.
- Generated code must be reviewed against security and tenant invariants.
- Agents may not invent metrics, source claims, or implementation status.
- Completion requires fresh verification evidence.
