# V0-P5 Sprint: Immutable Blueprint, Formula And Director Prompt

## Sprint Objective

Produce one immutable ready blueprint, derived formula and provider-neutral director
prompt. Default formula and extracted blueprint paths must converge to the same script
input contract.

## Source Contracts

- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_VERTICAL_SLICE_DESIGN.md`
- `../V0_ERROR_CATALOG.md`

## Sprint Backlog

- Validate blueprint merge inputs and required stages.
- Derive formula slots and replacement instructions.
- Generate provider-neutral director prompt with prompt version.
- Implement approved default formula path.
- Create immutable `VideoBlueprint`, `FormulaDerivation`, `DirectorPrompt` and
  `BlueprintLibraryEntry` records.
- Add compatibility metadata and lineage.
- Reject edits to ready records.

## TDD And Verification Plan

First failing test: a ready blueprint can be edited in place, or extracted/default paths
produce incompatible script input contracts.

Required tests:

- Extracted/default convergence contract test.
- Missing required stage rejection.
- Invalid formula slot rejection.
- Immutability and lineage tests.

## Security And Guardrails

- No missing stage is invented.
- Director prompt must be provider-neutral and cannot expose raw provider payloads.
- Ready records are immutable; revisions create new identities.

## Completion Evidence

- Ready blueprint browser demo.
- Formula and director prompt IDs.
- Complete lineage from candidate/default source.
- Immutability and convergence test output.
