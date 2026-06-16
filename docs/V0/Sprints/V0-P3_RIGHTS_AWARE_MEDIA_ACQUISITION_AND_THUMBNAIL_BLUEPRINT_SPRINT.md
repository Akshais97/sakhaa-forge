# V0-P3 Sprint: Rights-Aware Media Acquisition And Thumbnail Blueprint

## Sprint Objective

Acquire candidate media only when permitted, retain an analysis copy when authorized and
produce a thumbnail blueprint or explicit blocked acquisition reason.

## Source Contracts

- `../V0_SECURITY.md`
- `../V0_DATA_MODELS.md`
- `../V0_JOBS.md`
- `../V0_ERROR_CATALOG.md`
- `../../Project/Security/PROJECT_SECURITY_PRIVACY_AND_RIGHTS_METHODOLOGY.md`

## Sprint Backlog

- Implement acquisition priority and approved retrieval policy.
- Record rights, source and acquisition decision.
- Move acquired media through quarantine and validation.
- Add thumbnail OCR, composition analysis, hook hypothesis and source hash.
- Translate thumbnail findings into director-friendly replacement guidance.
- Block unsupported, unavailable or low-confidence acquisition states.

## TDD And Verification Plan

First failing test: unauthorized acquisition, hash mismatch or low-confidence OCR proceeds
as ready blueprint input.

Required tests:

- Authorized and blocked acquisition fixtures.
- Hash mismatch rejection.
- Thumbnail artifact schema validation.
- Low-confidence OCR blocked/partial state.

## Security And Guardrails

- Source rights determine whether media may be retained or only referenced.
- Provider/source URLs are transient and not retained as production source.
- Acquired media stays private and workspace-scoped.

## Completion Evidence

- Rights decision record.
- Retained analysis artifact hash.
- Thumbnail blueprint artifact.
- Browser evidence for authorized and blocked paths.
