# V0-S2 Sprint: Immutable Selected Script

## Sprint Objective

Let a strategist compare evaluated variants and select one exact immutable script version
for generation.

## Source Contracts

- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../V0_PERMISSIONS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_SCREEN_AND_STATE_INVENTORY.md`

## Sprint Backlog

- Build comparison UI for evaluated variants.
- Add explicit script selection action and confirmation state.
- Create immutable `SelectedScript` identity.
- Record actor, workspace, tournament, variant, version and timestamp.
- Add optimistic-version guard for stale comparison tabs.
- Make selection idempotent for duplicate submissions.
- Reject stale, unevaluated, rejected, superseded or cross-workspace variants.

## TDD And Verification Plan

First failing test: a stale, unevaluated, rejected, superseded or cross-workspace variant
can be selected for generation.

Required tests:

- Stale selection rejection.
- Double-select idempotency.
- Cross-workspace selection denial.
- Immutable selected-script identity proof.

## Security And Guardrails

- Selection does not imply generation approval or credit reservation.
- Selected script remains immutable; changes require a new selection.
- Selection audit must be retained for lineage.

## Completion Evidence

- Selected script ID and audit record.
- Stale/double-select test output.
- Browser screenshot of comparison and selected state.
- Downstream contract reference for generation estimate.
