# V0-F3 Sprint: Private Artifact Upload, Quarantine And Authorized Retrieval

## Sprint Objective

Allow a workspace user to upload a test media file, watch quarantine validation and
retrieve only authorized retained artifacts.

## Source Contracts

- `../V0_SECURITY.md`
- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../V0_JOBS.md`
- `../../Project/Architecture/PROJECT_ARCHITECTURE_INFRASTRUCTURE_DECISION.md`
- `../../Project/Security/PROJECT_SECURITY_PRIVACY_AND_RIGHTS_METHODOLOGY.md`

## Sprint Backlog

- Add private quarantine, clean-media and private-artifact storage areas.
- Add signed upload and download contracts scoped by workspace, key, method and expiry.
- Validate content type, extension, size, hash and media container.
- Add isolated fake scanner and media validator.
- Persist `Artifact` owner, producer, schema, hash and retention class.
- Add lifecycle cleanup for unreferenced objects.
- Add B2-compatible adapter and local object-store simulator.

## TDD And Verification Plan

First failing test: cross-tenant keys, expired signed URLs or hash mismatches can access
or replace artifacts.

Required tests:

- Upload-to-clean and upload-to-rejected journeys.
- Cross-tenant signed URL denial.
- Hash mismatch and object substitution rejection.
- Local object store and B2 adapter contract fixtures.

## Security And Guardrails

- Signed URLs are short lived and never logged, copied, exposed in analytics or retained
  in evidence screenshots.
- Quarantined files cannot be used by downstream production records.
- Artifact retrieval checks workspace and role at API and storage contract boundaries.

## Completion Evidence

- Browser upload flow screenshots.
- Artifact records with hash, retention class and owner.
- Signed URL denial tests.
- Cleanup and retention behaviour proof.
