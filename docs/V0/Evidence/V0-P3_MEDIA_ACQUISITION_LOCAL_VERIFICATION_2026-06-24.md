# V0-P3 media acquisition local verification - 2026-06-24

## Slice

V0-P3: Rights-aware media acquisition and thumbnail blueprint.

## Red evidence

`node --test tests\integration\media-acquisition-p3.test.mjs`

Expected failure observed before implementation:

`TypeError: client.extractViralCandidateBlueprint is not a function`

## Behaviour evidence

- Authorised acquisition creates `MediaAcquisition`, private clean `Artifact`, `ThumbnailBlueprint`, `media_acquire` job and audit evidence.
- Reference-only rights block retained analysis copies with `MEDIA_ACQUISITION_BLOCKED`.
- Source-hash mismatch returns `ARTIFACT_HASH_MISMATCH`.
- Low-confidence OCR returns `BLUEPRINT_STAGE_INCOMPLETE` and keeps thumbnail blueprint status `blocked`.

## Verification commands

Fresh verification is recorded in sprint closure output:

- `node --test tests\integration\media-acquisition-p3.test.mjs`
- `node --test tests\contract\openapi-generation.test.mjs`
- `node --test tests\unit\db-schema.test.mjs`
- `node --test tests\e2e\web-workspace.test.mjs`
- `.\pnpm.cmd db:generate`
- `.\pnpm.cmd verify`
- `node scripts\check-p3-tables.mjs`
