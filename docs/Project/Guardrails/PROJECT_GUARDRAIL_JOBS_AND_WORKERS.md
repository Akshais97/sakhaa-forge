# Project Jobs and Worker Guardrails

- BullMQ transports opaque job IDs; PostgreSQL owns canonical state and dependencies.
- Delivery is at least once, so every handler and completion path is idempotent.
- Claim work atomically with an expiring lease and heartbeat.
- Queue payloads contain no media, secrets or mutable business truth.
- Python workers receive short-lived object access and no PostgreSQL or Redis credentials.
- NestJS validates job type, lease, expected input hash, output key, size, schema and
  artifact hash before committing completion.
- Retries use bounded exponential backoff with jitter.
- Validation and policy failures are non-retryable.
- Exhausted work enters an operator-visible dead-letter state.
- Cancellation blocks new leases and reconciles already-submitted provider operations.
- Redis loss cannot erase, complete or financially alter canonical work.

