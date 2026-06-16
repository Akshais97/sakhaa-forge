# V0-F2 Sprint: Executable Contracts, Errors And Idempotency

## Sprint Objective

Make `/api/v0` executable through generated contracts only, with stable RFC 9457 errors
and durable idempotency for costly or externally visible mutations.

## Source Contracts

- `../V0_API.md`
- `../V0_ERROR_CATALOG.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_DATA_MODELS.md`
- `../V0_PRISMA_SCHEMA.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_API_CALLS.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_TDD.md`

## Sprint Backlog

- Generate OpenAPI from NestJS DTOs and validation schemas.
- Generate the TypeScript browser client from OpenAPI.
- Add RFC 9457 problem details with stable error codes.
- Add `IdempotencyRecord` with request hash conflict detection.
- Add deterministic cursor envelope and bounded collection pattern.
- Add contract-diff CI and generated-file reproducibility checks.
- Add request, actor, workspace, operation and trace correlation.

## TDD And Verification Plan

First failing test: reusing an idempotency key with different input is accepted, or
validation errors create domain state.

Required tests:

- OpenAPI generation reproducibility.
- Duplicate same-input returns original durable response.
- Duplicate different-input returns conflict without side effects.
- Malformed input returns cataloged problem details.
- Browser field-level error demonstration through generated client.

## Security And Guardrails

- Provider payloads never become public contracts.
- Generated files are not manually edited.
- Error text must not expose secrets, stack traces or protected existence.

## Completion Evidence

- Generated OpenAPI and client diff.
- Red/green idempotency test output.
- Error catalog references for each problem response.
- Contract-diff CI output or documented local equivalent.
