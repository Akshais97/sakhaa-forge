# V0-P1 Sprint: Explicit Blueprint Path Selection

## Sprint Objective

Require a strategist to choose existing blueprint, new viral discovery or approved
default path explicitly, with the same downstream blueprint-request contract.

## Source Contracts

- `../V0_VERTICAL_OUTCOME_SLICES.md`
- `../V0_INFORMATION_ARCHITECTURE.md`
- `../V0_SCREEN_AND_STATE_INVENTORY.md`
- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../../Project/DESIGN.md`

## Sprint Backlog

- Build blueprint library list with bounded pagination.
- Show compatibility metadata against the approved brand profile.
- Build empty library state.
- Add explicit path choice and selected brand-profile version binding.
- Reject archived, incompatible or cross-workspace blueprint selections.
- Produce one downstream blueprint-request identity independent of path.

## TDD And Verification Plan

First failing test: the system silently changes paths or accepts incompatible,
archived or cross-workspace blueprint input.

Required tests:

- Existing, discovery and default path contract convergence.
- Empty-state browser journey.
- Stale-selection rejection.
- Cross-workspace library denial.

## Security And Guardrails

- The path decision is auditable and cannot be implied by UI defaults.
- Existing blueprint use requires workspace authorization and compatibility.
- Default formula use must still bind approved brand profile version.

## Completion Evidence

- Path selection audit record.
- Contract convergence test output.
- Empty and stale-selection UI screenshots.
- Downstream request identity example.
