# Architecture Principles

1. **Evidence before claims.** Product language must reflect whether evidence is measured, inferred, proxied, or unavailable.
2. **Contracts before implementations.** Version schemas, events, files, formulas, and model inputs.
3. **Immutable lineage.** Never overwrite a creative revision, score run, dataset, or model version.
4. **Tenant context everywhere.** Every domain row, job, object, log, and cache key carries workspace scope.
5. **Async by default for expensive work.** No GPU, video, training, or provider operation in a web request.
6. **Determinism at the core.** LLM output is downstream of deterministic data and cannot mutate it.
7. **One write owner per domain.** Cross-domain updates use services and events.
8. **Boring infrastructure first.** PostgreSQL, object storage, request-driven tasks, and explicit workers precede Kubernetes.
9. **Reproducibility over convenience.** Pin code, data, formulas, checkpoints, seeds, and environments.
10. **Fail closed on stale science.** Accept only HCP-MMP1 artifacts with exactly A-Q.
11. **Design for AI-assisted coding.** Small modules, generated clients, fixtures, ADRs, and executable acceptance tests reduce ambiguity.
12. **Earn complexity.** New services, stores, queues, and models require measured need and an ADR.


# More wide scoped Engineering Principles

## 1. Practical SOLID

- Each module owns one business capability.
- Services should stay focused and avoid becoming God services.
- High-level business rules must not depend directly on low-level storage, queue, or worker details.
- Use interfaces only where implementation swapping is realistic.
- Keep dependencies explicit through NestJS dependency injection.

## 2. Practical OOP

- Use encapsulation inside services and modules.
- Keep controllers thin.
- Keep business logic inside services.
- Avoid unnecessary inheritance.
- Prefer composition and clear interfaces over base-class hierarchies.

## 3. Modular Monolith First

- Build the backend as a NestJS modular monolith.
- Keep modules independently understandable.
- Do not create microservices until scale or team structure forces it.
- Python workers may remain separate because AI/video processing has different runtime needs.

## 4. Separation of Concerns

- React handles UI state and form input.
- NestJS controllers handle HTTP boundaries.
- Services handle business rules.
- Prisma/Postgres handles persistence.
- Workers handle long-running AI/video jobs.
- Backblaze B2 handles media and artifact storage through private buckets and short-lived
  presigned access.

## 5. Validation and Type Safety Pipeline

- Validate frontend inputs with Zod.
- Re-validate backend payloads before business logic.
- Validate worker job payloads before processing.
- Enforce tenant ownership and credit rules in backend services.
- Use database constraints for final data integrity.
- Never trust frontend validation alone.

## 6. Keep It Simple

- Do not build abstractions before they are needed.
- Do not introduce microservices, event buses, or complex repositories prematurely.
- Optimize for correctness, debuggability, and fast iteration first.
