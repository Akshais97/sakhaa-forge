# V0-F5 Sprint: Traceable Operations, Restore And Feature Capability Control

## Sprint Objective

Give Owners and Admins traceability, safe recovery controls, feature capability switches,
credential metadata and restore proof before product-domain slices begin.

## Source Contracts

- `../V0_SECURITY.md`
- `../V0_DEPLOYMENT.md`
- `../V0_SETUP_RUNBOOK.md`
- `../../Project/Operations/PROJECT_OPERATIONS_OBSERVABILITY.md`
- `../../Project/Operations/PROJECT_OPERATIONS_DISASTER_RECOVERY.md`
- `../../Project/Security/PROJECT_SECURITY_REVIEW_METHODOLOGY.md`

## Sprint Backlog

- Add OpenTelemetry request, job, queue, worker and artifact trace propagation.
- Add structured logs and metrics for request rate, queue age, retries, leases, dead
  letters and artifact validation.
- Add `ServiceCredential` metadata with secret-manager references and rotation status.
- Add protected Owner/Admin reads and recovery actions.
- Add workspace capability configuration for unfinished slices.
- Add local simulator modes: success, timeout, duplicate, malformed and bad signature.
- Add backup/PITR and artifact-reference restore procedure.
- Add secret and signed-URL redaction tests.

## TDD And Verification Plan

First failing test: an Owner/Admin cannot trace a failed request or recovery can bypass
authorization, duplicate side effects or mutate immutable state.

Required tests:

- Trace propagation across API, outbox, queue, worker and artifact.
- Capability-disable behaviour.
- Queue-age and failed-job alert behaviour.
- Restore drill preserving RLS and artifact references.
- Secret/signed-URL log scan.

## Security And Guardrails

- Secret values are never stored in PostgreSQL.
- Recovery actions cannot bypass tenant, role, idempotency or immutability checks.
- Simulator controls are limited to local/staging.

## Completion Evidence

- End-to-end trace screenshot or record.
- Queue and failure alert evidence.
- Capability-disabled test output.
- PostgreSQL restore report.
- Log redaction scan output.
