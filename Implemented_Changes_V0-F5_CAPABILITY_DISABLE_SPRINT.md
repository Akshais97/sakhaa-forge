# Implemented changes: V0-F5 operations foundation

Date: 2026-06-24

## Behaviour

Added V0-F5 operational foundation behaviours: Owner/Admin trace, metrics, recovery,
credential metadata, capability control, simulator modes, restore drill and redaction
scan.

## Changes

- Added `WorkspaceCapability` Prisma model and migration
  `0006_v0_f5_workspace_capabilities`.
- Added `ServiceCredential` Prisma model and migration
  `0007_v0_f5_service_credentials`.
- Added `POST /workspaces/{workspace_id}/capabilities` to the generated V0 API contract
  and generated client.
- Added Owner/Admin protected F5 operations endpoints for job traces, operational metrics,
  dead-letter recovery, service credential metadata, simulator modes, restore drills and
  redaction scans.
- Added server-side Owner/Admin permission enforcement for capability updates.
- Gated simulated media-processing job creation when `media_processing` is disabled.
- Propagated request and trace IDs through simulated job, outbox, worker and retained
  artifact evidence.
- Updated V0 API, data model, Prisma, security, setup and permission docs.

## Verification

- `node --test tests\contract\openapi-generation.test.mjs`
- `node --test tests\unit\db-schema.test.mjs tests\unit\permissions.test.mjs`
- `node --test tests\integration\capabilities.test.mjs`
- `node --test tests\integration\operations-f5.test.mjs`

Full `pnpm verify` remains required after migration generation/application.
