# Implemented changes - V0-P3 rights-aware media acquisition and thumbnail blueprint

## Scope

Implemented V0-P3 route `POST /viral-candidates/{candidate_id}/extract-blueprint` for
rights-aware acquisition and thumbnail blueprint evidence.

## Changes

- Added generated-client method `extractViralCandidateBlueprint`.
- Added server route with workspace permission `select_blueprint_and_run_scripts`.
- Added deterministic media acquisition simulator modes:
  - `fixture_authorized`
  - `hash_mismatch`
  - `low_confidence_ocr`
  - `unsupported_retrieval`
- Added `MediaAcquisition` and `ThumbnailBlueprint` Prisma models plus migration `0013`.
- Added RLS, status/source-hash checks and tenant-leading indexes for P3 tables.
- Added web-shell evidence states for authorised acquisition, rights block and low-confidence OCR.
- Updated V0 API/data/schema docs and local evidence notes.

## TDD

Red observed:

`TypeError: client.extractViralCandidateBlueprint is not a function`

Green target:

`node --test tests\integration\media-acquisition-p3.test.mjs`

## Verification

Full closure requires fresh `.\pnpm.cmd verify`, DB migration, and `node scripts\check-p3-tables.mjs`.
