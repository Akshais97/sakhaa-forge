# V0-U2 Sprint: Idempotent Meta Publication

## Sprint Objective

Publish an approved calendar post to the intended Meta account exactly once, or enter a
recoverable uncertain state without switching media or account.

## Source Contracts

- `../V0_API.md`
- `../V0_JOBS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_SECURITY.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_API_CALLS.md`

## Sprint Backlog

- Add Meta adapter and deterministic simulator.
- Store credential metadata without secret values.
- Confirm target Meta account before submission.
- Create idempotent `PublishOperation`.
- Handle callbacks, polling and provider reconciliation.
- Store external post ID and public URL only after provider identity is known.
- Add timeout, duplicate, wrong-account and worker-crash states.

## TDD And Verification Plan

First failing test: retry, timeout, callback replay or worker crash creates two posts or
switches account/media.

Required tests:

- Duplicate publish test.
- Wrong-account rejection.
- Timeout reconciliation.
- Callback replay handling.
- Meta simulator browser journey.

## Security And Guardrails

- Provider acknowledgement is not audience verification.
- Provider payloads stay adapter-private.
- Idempotency prevents duplicate externally visible posts.

## Completion Evidence

- Publish operation audit.
- External ID/public URL when available.
- Timeout reconciliation proof.
- Duplicate-publish test output.
