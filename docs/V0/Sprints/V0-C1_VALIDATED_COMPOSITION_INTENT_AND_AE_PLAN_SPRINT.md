# V0-C1 Sprint: Validated Composition Intent And AE Plan

## Sprint Objective

Convert user composition direction into a versioned AE timeline plan that validates
against available assets and worker capabilities or explains every unsupported item.

## Source Contracts

- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../V0_JOBS.md`
- `../V0_SCREEN_AND_STATE_INVENTORY.md`
- `../../Project/DESIGN.md`

## Sprint Backlog

- Capture natural-language or structured composition direction.
- Bind selected generated media, approved brand assets, captions and allowed templates.
- Normalize intent into a versioned timeline JSON schema.
- Validate duration, overlaps, safe zones, captions, effects, fonts and plugins.
- Validate AE worker capability version.
- Store `CompositionInstruction`, `AePlan` and plan artifact.
- Show `validation_failed` with specific unsupported items.

## TDD And Verification Plan

First failing test: the AE plan accepts invented assets, fonts, plugins, invalid timing,
unsafe zones or unsupported capabilities.

Required tests:

- Timeline schema fixtures.
- Invented asset/font/plugin rejection.
- Overlap and safe-zone tests.
- Capability mismatch test.
- Plan review browser journey.

## Security And Guardrails

- AI output cannot invent assets or capabilities.
- Plans reference retained artifact IDs, not signed URLs.
- Validation failure is explicit and not treated as partial success.

## Completion Evidence

- Valid and invalid plan artifacts.
- Plan validation test output.
- Browser screenshots for plan review and validation errors.
- Capability version evidence.
