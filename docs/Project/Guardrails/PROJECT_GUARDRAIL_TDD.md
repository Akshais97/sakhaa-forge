# Proper Test-Driven Development

## Non-Negotiables

- Red must be observed before green.
- One behavior per test.
- Test public behavior, not incidental implementation.
- Every bug fix starts with a reproducer.
- External providers are behind deterministic adapters.
- ML changes require data and evaluation tests, not only code tests.
- Migrations include forward, compatibility, and restore verification.

## Test Naming

Use `given_condition_when_action_then_result` or a concise equivalent. Failure messages
must identify the violated business invariant.

## AI-Assisted TDD

An AI agent must read the owning contract and existing tests before editing. It must not
weaken assertions, delete failing fixtures, increase tolerances, or regenerate snapshots
without explaining the behavioral change. Completion claims require fresh command output.

## Done

A change is TDD-complete only when the intended test failed first, passes after the
implementation, nearby regressions pass, and the documentation remains consistent.
