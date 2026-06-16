# Architectural Decision Records

## ADR-001: HCP-MMP1 Only

**Decision:** Map fsaverage5 outputs exclusively to HCP-MMP1.
**Reason:** The product contract and 17-cluster research are HCP-based.
**Consequence:** Legacy mappings remain historical evidence only.

## ADR-002: A-Q Is Canonical

**Decision:** Require exactly 17 unique cluster IDs A-Q.
**Reason:** P adds valence direction and Q adds narrative temporal coherence.
**Consequence:** Any payload whose cluster ID set is not exactly A-Q fails validation.

## ADR-003: Modular Monolith plus GPU Worker

**Decision:** Keep business APIs together; isolate ML inference.
**Reason:** Low initial traffic, high inference resource requirements.
**Consequence:** Clear internal interfaces are mandatory to enable future extraction.

## ADR-004: PostgreSQL plus Object Storage

**Decision:** Store metadata and lineage in PostgreSQL; binaries in object storage.
**Reason:** Relational integrity and cheap, durable media storage.
**Consequence:** Every object has a database asset record and content hash.

## ADR-005: Asynchronous Heavy Work

**Decision:** Inference, generation, import, report, and training operations are jobs.
**Reason:** They exceed request lifetimes and require retries.
**Consequence:** APIs return job IDs and the UI renders progress states.

## ADR-006: Deterministic Scores Are Immutable

**Decision:** LLMs may explain or propose edits but never calculate or alter scores.
**Reason:** Auditability and hallucination containment.
**Consequence:** Score payloads are signed/versioned inputs to the LLM adapter.

## ADR-007: Phase 1 Includes Calibration

**Decision:** Ingest outcomes and train/evaluate baseline calibrators in shadow mode.
**Reason:** Predictive validity is the core business risk.
**Consequence:** Outcome linkage is MVP infrastructure; promotion is a powered gate.

## ADR-008: Commercial Runtime Cannot Assume TRIBEv2 Rights

**Decision:** Paid SaaS requires a separate license or a clean proprietary replacement.
**Reason:** The current source is CC BY-NC 4.0.
**Consequence:** Licensing is a release blocker for external commercialization.

## ADR-009: No Kubernetes in Phase 1

**Decision:** Use managed services and container workers.
**Reason:** Operational simplicity matters more than theoretical scale.
**Consequence:** Add orchestration only after queue, utilization, or availability data requires it.

## ADR-010: SQLAlchemy/Alembic Is the Sole Schema Owner (Superseded)

**Original decision:** FastAPI, SQLAlchemy 2 and Alembic owned persistence.
**Superseded by:** ADR-017.

## ADR-011: Research-Prior Index Terminology

**Decision:** Deterministic outputs are called research-prior indices.
**Reason:** Prospective evidence does not yet support predictive-score claims.
**Consequence:** Stronger language requires an approved claims-register update.

## ADR-012: Celery/Redis with PostgreSQL Canonical State (Superseded)

**Original decision:** Celery used Redis as broker while PostgreSQL remained canonical.
**Superseded because:** Continuous consumers conflict with request-billed, scale-to-zero
Cloud Run services and introduce broker visibility-timeout failure modes.

## ADR-015: Request-Driven CPU Tasks and Leased GPU Jobs (Superseded)

**Original decision:** Cloud Tasks invoked request-driven CPU handlers.
**Superseded by:** ADR-018.

## ADR-013: Three Independent Release Gates

**Decision:** Separate workflow pilot, model readiness, and commercial release.
**Reason:** Usability, statistical validity, and legal/economic readiness differ.
**Consequence:** Ten campaigns cannot promote a model or authorize SaaS launch.

## ADR-014: No RL Initially

**Decision:** Exclude reinforcement learning and online bandits from Phase 1 and initial
Phase 2.
**Reason:** Traffic, causal identification, reward stability, and safety are insufficient.
**Consequence:** Reconsider only through a later ADR with a safe reward, adequate sample,
controlled experiment, and constrained action space.

## ADR-016: Product V0 Owns Production Generation

**Decision:** Product V0 is implemented first and remains the system of record for brand
production assets, generation providers, creator credits, production review, publishing,
and audience verification. Product V2 owns scoring, recommendations, analytical review,
normalized outcomes, and model learning. V2 submits versioned briefs to V1 through
`PROJECT_ARCHITECTURE_V1_V2_BOUNDARY.md`; it does not call generation or publishing providers directly.

**Reason:** A single production owner prevents duplicate provider integrations, billing,
review authority, and publication state while preserving Sakhaa's focused decision wedge.

**Consequence:** V2 can be disabled or rolled back without stopping V1 production.
Moving any ownership across this boundary requires a later ADR and contract migration.

## ADR-017: NestJS and Prisma Own the Domain Database

**Decision:** NestJS with the Fastify adapter is the sole domain API and PostgreSQL
writer. Prisma exclusively owns schema and migrations. A restricted `pg` adapter is
allowed only for named, reviewed and parameterized query modules. Python workers have no
database credentials.

**Reason:** One schema owner prevents migration drift while TypeScript keeps ordinary
SaaS APIs and contracts in one control plane. PostgreSQL-specific features remain
available without turning raw SQL into an alternate persistence layer.

**Consequence:** `$queryRawUnsafe`, string-built SQL, independent Python migrations and
direct Python domain writes are prohibited. Runtime roles are restricted; migrations use
a separate owner role.

## ADR-018: BullMQ Delivers Work; PostgreSQL Owns Work

**Decision:** BullMQ and managed Redis provide delivery, retry and scheduling. Supabase
PostgreSQL remains canonical for jobs, attempts, dependencies, leases, idempotency,
billing and provider operations. A separately deployed NestJS processor consumes the
queue and invokes private Python workers.

**Reason:** AI/video work needs an always-on consumer, but Redis must not become an
unrecoverable business-state store.

**Consequence:** Queue payloads contain opaque IDs only. Redis uses persistence and
`noeviction`. PostgreSQL reconciliation can recover missed or duplicate deliveries.

## ADR-019: Supabase Is Database and Identity Infrastructure

**Decision:** Use Supabase PostgreSQL and Auth, with optional Realtime only for job
progress. NestJS remains the sole domain API.

**Reason:** Supabase reduces database and identity operations without creating two
competing business APIs.

**Consequence:** Browser clients do not directly mutate domain tables. NestJS validates
JWTs and authorizes requests. Runtime roles do not own tables or bypass RLS, and tenant
context is transaction-local.

## ADR-020: Backblaze B2 Owns Media and Artifact Storage

**Decision:** Use private `media-quarantine`, `media-clean` and `artifacts-private`
buckets in Backblaze B2. NestJS issues short-lived presigned PUT/GET URLs and owns object
metadata in PostgreSQL.

**Reason:** B2 provides an S3-compatible, low-entry-cost storage option suitable for the
pilot.

**Consequence:** Browser uploads use presigned PUT rather than presigned POST. IAM-like
object policy and tagging assumptions are prohibited. Cross-region India-to-B2 latency
and transfer cost are benchmark gates.

## ADR-021: India-First Regional Topology

**Decision:** Place Supabase, NestJS, Redis and the BullMQ processor in Mumbai or the
nearest suitable Indian region. Select Python/GPU and B2 regions by measured end-to-end
performance and cost.

**Reason:** Initial users and operations are India-first.

**Consequence:** B2 cannot be described as co-located in India. Region changes require
data residency, latency, transfer-cost and disaster-recovery review.

## ADR-022: Product V1 Matures Product V0

**Decision:** Product V0 is standalone Sakhaa Forge. Product V1 is an
additive release of the same application that adds deferred production capabilities,
quality, reliability, scale and stable Product V2 integration contracts. It is not a
separate bridge service.

**Reason:** V0 must reach production without depending on Sakhaa, while deferred
capabilities need a named evolution path that preserves customers, media, credits and
lineage.

**Consequence:** V0 has its own data model, Prisma contract, API, jobs, security, tests,
deployment and implementation plan. V2 retains a separate schema and release lifecycle.
V1 migrations follow expand/backfill/verify/contract and cannot reinterpret V0 financial
or approval history.
