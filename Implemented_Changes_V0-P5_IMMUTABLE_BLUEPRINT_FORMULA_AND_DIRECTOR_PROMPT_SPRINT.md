# Implemented Changes: V0-P5 Immutable Blueprint, Formula And Director Prompt Sprint

## Slice

V0-P5: Immutable Blueprint, Formula And Director Prompt.

## Behaviour

- Added `POST /api/v0/blueprint-requests/{blueprint_request_id}/ready-blueprint`.
- Validates extracted P4 blueprint readiness before formula derivation.
- Supports the approved default formula path.
- Produces the common `v0.script-input.1` contract for extracted and default paths.
- Retains immutable ready blueprint, formula derivation and provider-neutral director prompt identities.
- Records `blueprint_merge`, `formula_derive` and `director_prompt_generate` job evidence.
- Rejects incomplete stages, invalid formula slots and duplicate ready creation.

## Contract and data changes

- Added `FormulaDerivation` and `DirectorPrompt` Prisma models.
- Added migration `0015_v0_p5_ready_blueprint_formula_prompt`.
- Updated OpenAPI source and generated client.
- Updated V0 API, data model, Prisma schema, jobs and implementation-plan docs.

## Verification

- Red: `node --test tests\integration\blueprint-ready-p5.test.mjs` failed on missing `createReadyBlueprint`.
- Red: same test later failed on missing P5 job evidence.
- Green: `node --test tests\integration\blueprint-ready-p5.test.mjs`.
- Final: `node scripts\verify.mjs`.

## Notes

All provider/media boundaries remain deterministic simulators. No V1/V2 runtime dependency was added.
