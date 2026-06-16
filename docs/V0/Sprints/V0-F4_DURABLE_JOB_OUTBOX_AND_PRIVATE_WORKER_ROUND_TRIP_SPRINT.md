# V0-F4 Sprint: Durable Job, Outbox And Private Worker Round Trip

## Sprint Objective

Prove asynchronous V0 work as a durable PostgreSQL-owned job with BullMQ wake-ups,
private worker APIs, progress visibility and crash-safe artifact completion.

## Source Contracts

- `../V0_JOBS.md`
- `../V0_API.md`
- `../V0_DATA_MODELS.md`
- `../V0_PRISMA_SCHEMA.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_JOBS_AND_WORKERS.md`
- `../../Project/Operations/PROJECT_OPERATIONS_OBSERVABILITY.md`

## Sprint Backlog

- Add `Job`, `JobAttempt`, `JobDependency`, `JobEvent` and `OutboxEvent`.
- Commit domain mutation and outbox atomically.
- Relay opaque job IDs to BullMQ.
- Add atomic claim, lease, heartbeat, expiry and retry logic.
- Add internal worker claim, heartbeat, complete and fail endpoints.
- Validate worker input and output hashes, object keys, sizes and schemas.
- Add CPU, GPU and AE resource-class queues.
- Add dead-letter state and cancellation foundation.

## TDD And Verification Plan

First failing test: duplicate delivery or worker crash creates two completions, loses
canonical work or accepts substituted output.

Required tests:

- Happy-path job browser journey.
- Redis loss recovery.
- Duplicate wake-up delivery.
- Worker crash after artifact upload and completion replay.
- Dead-letter visibility.

## Security And Guardrails

- Python/media workers receive no PostgreSQL or Redis credentials.
- Authorization is rechecked when work is claimed and completed.
- Worker output is accepted only through authenticated APIs.

## Completion Evidence

- Job status and event records.
- Worker crash and duplicate delivery test output.
- Artifact hash and schema validation evidence.
- Dead-letter UI or protected endpoint evidence.
