# Agent Instructions

## 1. Purpose

This repository is building Product V0: Sakhaa Forge, the standalone Virality Creator
Engine.
Agents must help deliver V0 as accepted software before any V1 or V2 work begins.

V0 is complete only when it can run with Product V1 and Product V2 absent and can take an
India-first real-estate customer from approved brand intake through verified publication
with retained evidence, lineage, cost records and recovery proof.

Agents must work from first principles, perform deep requirements analysis, and avoid
guesswork. Do not invent product behaviour, architecture, claims, statuses, permissions or
contracts. When evidence is missing, stop the affected decision, name the missing source
and use the documented decision priority below.

## 2. Active Development Scope

The active implementation scope is Product V0 only.

- Begin with `V0-F0` from `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`.
- Work on one vertical slice and one behaviour at a time.
- Do not start a dependent slice until predecessor evidence is retained.
- Use deterministic simulators by default for paid, publishing, provider and worker
  boundaries.
- Preserve the slice evidence contract for every completed behaviour.

## 3. Documentation Source Rules

Documentation is part of the contract.

- Follow current canonical documents over older notes, drafts, memories or comments.
- Use `docs/V0/` for V0 product, slice, architecture, API, status, permission, data,
  testing and deployment contracts.
- Use `docs/Project/` for project-wide architecture, guardrails, design, governance,
  security and operations rules.
- Use `docs/V0/V0_DOCUMENTATION_INDEX.md` and
  `docs/Project/Architecture/PROJECT_ARCHITECTURE_INDEX.md` as the map when a task may
  touch more than one contract area.
- Use `docs/Project/DESIGN.md` as the authoritative application and landing-page design
  system. `docs/Project/Design/` contains supporting brand, language and reference
  material.
- Treat `docs/Project/Design/references for only design and not TEXT/` as visual design
  references only. Do not copy, paraphrase or adopt text, claims, IA labels, product
  promises or interaction contracts from those reference files.
- Treat `docs/V0/Source_Notes/` and historical project notes as non-authoritative unless a
  canonical document explicitly promotes them.
- Update owning documentation in the same change when code changes a contract, status,
  route, screen, permission, data model, job, error, provider behaviour or acceptance
  evidence.
- Do not claim a command, feature or slice works before fresh verification proves it.

## 4. Required Current Documents

Before implementation, read the documents that own the current task. At minimum, every
implementation agent must read:

1. `docs/V0/V0.md`
2. `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
3. the owning V0 contract documents for the slice or behaviour being changed
4. `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
5. `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
6. `docs/Project/DESIGN.md`
7. `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
8. `docs/Project/Governance/karpathy_SKILL.md`

### Supporting Reference Documents

Use these as needed for the task:

- `docs/V0/V0_DOCUMENTATION_INDEX.md`
- `docs/V0/V0_PRODUCT_SPECIFICATION.md`
- `docs/V0/V0_ARCHITECTURE.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_TESTING.md`
- `docs/V0/V0_DEPLOYMENT.md`
- `docs/V0/V0_SETUP_RUNBOOK.md`
- `docs/V0/V0_RISKS_AND_GATES.md`
- `docs/V0/V0_IMPLEMENTATION_PLAN.md`
- `docs/V0/V0_HEYGEN_INTEGRATION.md`
- `docs/V0/V0_HEYGEN_COST_MODEL.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/V0/V0_TEST_PERSONAS_AND_SEED_FIXTURES.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_ANALYTICS_EVENT_TAXONOMY.md`
- `docs/V0/V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`
- `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_DESIGN_INDEX.md`
- `docs/Project/Design/PROJECT_BRAND_GUIDELINES.md`
- `docs/Project/Design/PROJECT_GUARDRAILS.md`
- `docs/Project/Design/references for only design and not TEXT/`
- `docs/Project/Governance/karpathy_SKILL.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `docs/Project/Architecture/`
- `docs/Project/Guardrails/`
- `docs/Project/Design/`
- `docs/Project/Governance/`
- `docs/Project/Security/`
- `docs/Project/Operations/`

## 5. Architecture Target

Implement the V0 architecture described in `docs/V0/V0_ARCHITECTURE.md`.

- Web: Next.js and TypeScript.
- Domain API: NestJS with Fastify; the sole domain API and PostgreSQL writer.
- Auth/database: Supabase Auth and Supabase PostgreSQL.
- ORM/migrations: Prisma is the sole schema and migration owner.
- Jobs: BullMQ carries opaque wake-up IDs; PostgreSQL owns canonical job, credit,
  provider and publication state.
- Workers: private Python/media workers receive no PostgreSQL or Redis credentials.
- Storage: private Backblaze B2 areas for quarantine, clean media and private artifacts.
- Providers: adapters for generation, payment, publishing, crawling and AI services.
- Region: India-first control plane and evidence for B2 latency/cost where required.
- Boundaries: V0 must run as a standalone product with V1 and V2 absent. V1/V2 documents
  may explain deferred direction, but they must not introduce V0 runtime dependencies,
  feature flags, tables, routes, jobs or claims.
- Repository shape: follow `docs/Project/Architecture/PROJECT_ARCHITECTURE_REPOSITORY_STRUCTURE.md`.
  Expected areas are `apps/web`, `apps/api`, `workers/queue`, `workers/python`,
  `packages/contracts`, `packages/db`, `packages/ui`, `packages/config`, `tests`, `infra`
  and `docs`.
- Architecture principles: follow
  `docs/Project/Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md`: evidence before claims,
  contracts before implementations, immutable lineage, tenant context everywhere, async
  by default for expensive work, deterministic core, one write owner per domain, boring
  infrastructure first, reproducibility over convenience and earned complexity.
- Infrastructure decisions: follow the project infrastructure and low-cost infrastructure
  documents before adding hosted services, queues, stores, deployment targets or paid
  provider dependencies.
- Configuration: follow the project operations configuration catalogue when adding or
  changing environment variables, secrets, deployment settings or runtime toggles.

## 5A. Product And Documentation Boundaries

V0 agents must keep the following document ownership boundaries clear:

- Product contracts live in `docs/V0/`; project-wide architecture, guardrails, design,
  governance, security and operations live in `docs/Project/`.
- V0 implementation sequence starts with `V0-F0` and follows
  `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md` plus the owning sprint in `docs/V0/Sprints/`.
- Screen, copy and state work must reconcile `docs/V0/V0_INFORMATION_ARCHITECTURE.md`,
  `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`, `docs/V0/V0_STATUS_ENUMS.md`,
  `docs/Project/DESIGN.md` and
  `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`.
- API, contract and generated-client work must reconcile `docs/V0/V0_API.md`,
  `docs/V0/V0_ERROR_CATALOG.md`, `docs/V0/V0_PERMISSIONS.md`,
  `docs/V0/V0_SECURITY.md`, `docs/V0/V0_DATA_MODELS.md` and
  `docs/V0/V0_PRISMA_SCHEMA.md`.
- Job, worker and provider work must reconcile `docs/V0/V0_JOBS.md`,
  `docs/V0/V0_HEYGEN_INTEGRATION.md`, `docs/V0/V0_HEYGEN_COST_MODEL.md`,
  `docs/V0/V0_RISKS_AND_GATES.md` and the relevant adapter/provider contract.
- Deployment, configuration, restore and operations work must reconcile
  `docs/V0/V0_DEPLOYMENT.md`, `docs/V0/V0_SETUP_RUNBOOK.md`,
  `docs/Project/Operations/` and the project guardrails.

## 6. Non-Negotiable Engineering Rules

- Use test-driven development and observe red before green.
- Implement public behaviour through generated contracts, not private shortcuts.
- Enforce server-side authentication, authorization, tenancy and RLS for every tenant
  resource.
- Keep raw parameterised SQL inside the documented allowlist only.
- Keep providers behind adapters; domain modules do not import provider SDKs.
- Persist external side-effect operations before network I/O.
- Treat timeout after possible provider acceptance as `unknown`; reconcile before retry.
- Never blindly retry uncertain paid, publishing, provider or notification operations.
- Never expose secrets, signed URLs, raw provider payloads, internal credentials or
  protected cross-tenant existence.
- Never use unapproved brand truth, expired consent or revoked consent.
- Never claim publication success before audience-facing verification.
- Never weaken tests, assertions, permissions or evidence to make progress.

## 7. Backend Agent Rules

- Controllers validate transport input and delegate to application/domain services.
- Use generated/shared schemas for request and response contracts.
- Use RFC 9457 problem details and stable error codes from the V0 error catalog.
- Use idempotency keys for costly or externally visible mutations.
- Make external callbacks authenticated, deduplicated and reconciled.
- Keep transactions short and database-only.
- Use one shared Prisma client per process.
- Use `select`, bounded queries, cursor pagination and tenant-leading predicates.
- Do not create generic repositories that hide query shape.
- Do not put provider payloads, secrets, signed URLs or sensitive identifiers in logs,
  browser responses, prompts or retained artifacts.

## 8. Frontend Agent Rules

- Use generated OpenAPI clients; do not duplicate transport types by hand.
- Browser code must not contain database, Redis, provider or secret credentials.
- Keep UI status labels, icons and presentation mapped to backend truth.
- Follow `docs/Project/DESIGN.md` for tokens, status, layout, media, money,
  lineage, accessibility and component governance.
- Follow `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md` for product
  language.
- Provide empty, loading, progress, failure, retry and recovery states for async
  workflows.
- Do not use optimistic UI for paid generation, credit capture, publishing, scheduling or
  other irreversible operations.
- Signed URLs must be short-lived, self-healing in media components and never rendered as
  copy, tooltips, analytics, errors or data attributes.
- Meet keyboard, focus, screen-reader, contrast and reduced-motion requirements.

## 9. Workflow Agent Rules

- Follow `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`.
- For each behaviour:
  1. read the owning slice, contract, error entry and screen state;
  2. write one failing public-behaviour test;
  3. run the narrow test and record the expected failure;
  4. implement the minimum passing behaviour;
  5. run the narrow test;
  6. run nearby unit, contract and integration tests;
  7. regenerate affected contracts and inspect unexplained diffs;
  8. run the required verification command before completion.
- Keep branches and commits scoped to one slice or coherent behaviour.
- Do not manually edit generated files.
- Do not revert unrelated user changes.
- Avoid unrelated refactors.

## 10. Status and Enum Rules

- `docs/V0/V0_STATUS_ENUMS.md` is authoritative for V0 statuses.
- UI labels follow `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`.
- Generated status mappings must fail when a backend enum lacks presentation.
- Do not invent, merge, rename or silently collapse backend states in the UI.
- Preserve `unknown` as a real state for uncertain provider and publication outcomes.
- Never use `Done` for publication before audience verification or paid work before
  settlement.

## 11. Permissions Rules

- `docs/V0/V0_PERMISSIONS.md` owns V0 roles and permission behaviour.
- Enforce permissions server-side for every tenant route and sensitive action.
- RLS is mandatory defence in depth; runtime roles do not own tables or bypass RLS.
- Cross-workspace reads, writes, signed URLs, queue events, cache keys and callbacks must
  fail without exposing whether the target exists.
- Review, approval, scheduling, publishing, billing, credential, consent and recovery
  actions require explicit authorised actors.

## 12. Do Not Implement

Do not implement:

- V1 template clustering or provider expansion;
- Google Flow, KlingAI, Higgsfield or Magnific automated routes;
- TikTok Direct Post;
- automated A/B testing;
- Sakhaa/V2 scoring, HCP/A-Q, calibration, datasets or learning;
- TRIBEv2 inference or V2 scientific/predictive claims;
- guaranteed virality, reach, conversion, attention, emotion or causal performance
  claims;
- tables, APIs, jobs, feature flags or runtime dependencies whose only consumer is V1 or
  V2.

## 13. File and Folder Rules

- Follow the repository structure contract in the Project architecture documents.
- Expected V0 areas include `apps/web`, `apps/api`, `workers/queue`,
  `workers/python`, `packages/contracts`, `packages/db`, `packages/config`, `tests` and
  `infra` when implemented by V0-F0.
- Keep generated OpenAPI clients in `packages/contracts/generated`.
- Keep Prisma ownership in `packages/db`.
- Keep design-token generated outputs in the documented UI package location.
- Do not place secrets, signed URLs, provider payloads or environment-specific values in
  committed files or generated output.
- Keep fixture and evidence files deterministic, scoped and documented.

## 14. API Rules

- Version public, internal-worker, event and artifact contracts.
- Use generated OpenAPI documents and generated TypeScript clients.
- Authenticate and authorize every tenant route.
- Use RFC 9457 problem details with stable error codes.
- Use cursor pagination and bounded result sets for growing collections.
- Require idempotency keys for costly or externally visible mutations.
- Provider payloads are adapter-private and never become public contracts.
- Contract-changing work requires documentation, generated artifacts and contract tests.

## 15. Changelog Rules

- Update changelog or release notes when a change affects user-visible behaviour,
  contracts, migrations, operations, security, billing, provider behaviour or slice
  acceptance evidence.
- Changelog entries must name the owning V0 slice or gate.
- Do not describe unverified work as shipped, complete or accepted.
- Keep generated artifacts, docs and changelog consistent in the same change.

## 16. Database Rules

- Supabase PostgreSQL is canonical.
- Prisma is the sole schema and migration owner.
- Every tenant-owned table and query carries `workspace_id`.
- Migrations are additive unless the owning plan proves compatibility and recovery.
- Migration work must cover forward migration, compatibility, RLS and restore behaviour.
- Use integer minor units or provider-native credit micros for money; never floats.
- Financial, audit, job, lineage and publication records are append-only or immutable
  where the contract says so.
- Manual production DDL and second migration tools are forbidden.

## 17. Validation Rules

- Validate transport input at API boundaries with shared/generated schemas.
- Validate environment variables with typed, redacted configuration.
- Validate artifacts by type, size, hash, ownership, retention class and producer.
- Validate worker outputs against versioned schemas before accepting them.
- Validate provider callbacks with signatures, idempotency and replay protection.
- Validate AE plans for assets, duration, timing, captions, safe zones, fonts, plugins and
  capability version.
- Treat malformed, empty, refused, low-confidence or schema-invalid AI output as blocked
  or failed according to the contract; never silently promote it.

## 18. Output Rules for AI Agents

- State the slice, contract and behaviour being changed.
- State assumptions and evidence; do not present guesses as facts.
- Summarise reasoning as decisions, sources and tradeoffs. Do not expose private
  chain-of-thought; provide concise, auditable rationale instead.
- Report fresh verification commands and outcomes.
- If verification cannot run, say why and leave the slice incomplete.
- Mention contract, migration, security, tenant, billing, provider and UI impacts when
  relevant.
- Use the project content guide: calm, precise, sentence case, no hype, no unsupported
  claims.

## 19. Decision Priority

When instructions conflict, use this order:

1. security, privacy, tenant isolation, consent, rights and financial correctness;
2. Product V0 canonical contracts in `docs/V0/`;
3. project guardrails in `docs/Project/Guardrails/`;
4. project architecture, design, governance, security and operations documents;
5. generated contracts, schema and tests;
6. local code patterns;
7. user implementation preferences for the current task.

If the conflict still cannot be resolved, stop the affected work, document the conflict
and ask for a decision from the project owner.

## 20. Final Principle

Build V0 as a calm, honest system of record for an expensive creative workflow. Every
agent action must protect truth: approved brand truth, consent truth, tenant truth,
provider truth, money truth, publication truth and evidence truth. If the system does not
know, it must say `unknown`; if the documents do not say, the agent must not guess.
