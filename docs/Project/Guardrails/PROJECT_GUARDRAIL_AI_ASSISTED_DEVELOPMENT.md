# AI-Assisted Development

## Repository Design

Keep modules small, typed, and contract-led. Generate the frontend client from OpenAPI.
Store ADRs, examples, fixtures, state machines, and error codes beside the owning module.
Prefer explicit names over framework magic.

## Agent Task Contract

Every task states goal, allowed files, invariant, acceptance test, verification commands,
prohibited changes, owning document, and evidence artifact. Parallel tasks have disjoint
write sets.

## Required Agent Behavior

1. Read the owning docs and tests.
2. Inspect current code; do not assume status from prose.
3. Add a failing test.
4. Make the smallest coherent change.
5. Run focused and adjacent verification.
6. Report files changed, evidence, and residual risks.

## Review Risks

Pay special attention to tenant filters, async duplication, status transitions, generated
migrations, provider signature verification, score mutation, data leakage, licensing, and
silent compatibility fallbacks.

Agents must not introduce a second migration owner, bypass Prisma through ad hoc SQL,
grant database or Redis credentials to Python workers, accept any cluster set other than
A-Q, call indices predictions, promote shadow models, or close empirical/legal gates
without linked evidence.
