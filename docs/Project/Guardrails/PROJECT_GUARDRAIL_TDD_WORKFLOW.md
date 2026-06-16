# TDD Workflow

1. Write one observable acceptance statement.
2. Add the smallest failing test at the correct layer.
3. Run it and confirm failure is for the intended reason.
4. Implement the minimum behavior.
5. Run the focused test until it passes.
6. Refactor without changing behavior.
7. Run adjacent and full relevant suites.
8. Update contracts, fixtures, and docs in the same change.

## Example Sequence

For the A-Q migration:

1. Add tests that missing, extra, duplicate, or unknown cluster IDs return
   `invalid_cluster_contract`.
2. Confirm current validation incorrectly accepts it.
3. Implement exact set equality against `A..Q`.
4. Add a valid A-Q fixture and missing/duplicate cluster tests.
5. Run scoring contract tests and update migration documentation.

## Rule

Do not write implementation first and backfill tests that merely mirror it. Tests should
describe user-visible behavior, contract invariants, or failure recovery.
