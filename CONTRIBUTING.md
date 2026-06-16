# Contributing

## Scope

Build Product V0 one vertical outcome slice at a time. Start with `V0-F0`. Do not add
V1/V2 capabilities or speculative abstractions.

## Before Changing Anything

1. Read `AGENTS.md`.
2. Read the owning slice in `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`.
3. Read its data, API, screen/state, error and configuration contracts.
4. Check `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`.
5. Confirm the change has one user/operator outcome.

## Branches

Use:

```text
feat/v0-f0-walking-skeleton
fix/v0-g4-provider-timeout
docs/v0-brand-contract
```

Do not mix unrelated slices.

## TDD

- Write the failing behavioural test first.
- Run it and observe the expected failure.
- Implement the minimum passing behaviour.
- Run the narrow test and nearby regressions.
- Run fresh verification before claiming completion.
- Do not weaken assertions or regenerate snapshots without explaining the behaviour.

## Contracts

- NestJS is the sole domain API and PostgreSQL writer.
- Prisma is the sole migration owner.
- The frontend uses generated OpenAPI clients.
- Provider SDKs stay behind adapters.
- PostgreSQL owns job and financial truth.
- Python/AE workers complete through authenticated internal APIs.
- Every tenant row and query carries workspace ownership and RLS protection.

## Pull Requests

Include:

- V0 slice and gate;
- outcome and acceptance evidence;
- tests run with results;
- API/schema/migration/generated changes;
- tenant/security impact;
- rollback or forward recovery;
- screenshots for UI changes;
- performance/cost effect;
- documentation changes.

## Commit Messages

Use conventional commits with scope:

```text
feat(v0-f1): enforce workspace membership
fix(v0-g4): reconcile uncertain provider submission
test(v0-f3): reject cross-tenant signed URL
docs(v0): define error catalog
```

## Dependencies

New dependencies require an explicit purpose, compatible licence, maintenance/security
review and removal plan. Commit lockfiles. Do not introduce another ORM, migration owner,
queue or database without an ADR and measured need.

## Documentation

Routes, screens, errors, events, environment variables, models, migrations, provider
limits and user language must update their owning document in the same change.

