# V0-G4 Sprint: Exactly-Once HeyGen Submission

## Sprint Objective

Submit confirmed generation work to HeyGen exactly once, persist provider operation
state before network I/O and reconcile uncertain provider outcomes without blind retry.

## Source Contracts

- `../V0_HEYGEN_INTEGRATION.md`
- `../V0_API.md`
- `../V0_JOBS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_ERROR_CATALOG.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_JOBS_AND_WORKERS.md`

## Sprint Backlog

- Create durable `ProviderOperation` before external request.
- Store request hash, provider route, workspace, generation job and idempotency key.
- Implement HeyGen simulator for success, timeout, duplicate, malformed and callback
  replay modes.
- Handle external ID, `Retry-After`, callback signatures, polling and reconciliation.
- Add concurrency limits and cancellation foundation.
- Model queued, submitting, accepted, generating, unknown, failed and cancelled states.
- Prevent second paid operation after uncertain timeout.

## TDD And Verification Plan

First failing test: timeout after possible acceptance is retried blindly or creates a
second provider operation.

Required tests:

- Crash window between operation persistence and network response.
- Timeout to `unknown` state.
- Callback replay and malformed callback tests.
- Concurrency limit test.
- Cancellation during uncertainty reconciliation.

## Security And Guardrails

- Provider payloads stay private to adapters.
- Unknown state is not success or failure.
- No duplicate paid/provider submission under retry, callback replay or worker crash.

## Completion Evidence

- Provider operation audit.
- Timeout/unknown test output.
- Callback signature and replay evidence.
- Generation status browser screenshot.
