# V0-F5 Capability Disable Local Verification

Date: 2026-06-24  
Slice: V0-F5 traceable operations, restore and feature capability control  
Behaviour: Owner/Admin workspace capability disable for `media_processing`

## Scope

This evidence covers one V0-F5 behaviour only. It does not close the full V0-F5 sprint.

## Sources

- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/Sprints/V0-F5_TRACEABLE_OPERATIONS_RESTORE_AND_FEATURE_CAPABILITY_CONTROL_SPRINT.md`
- `docs/Project/Operations/PROJECT_OPERATIONS_OBSERVABILITY.md`
- `docs/Project/Operations/PROJECT_OPERATIONS_DISASTER_RECOVERY.md`
- `docs/Project/Security/PROJECT_SECURITY_REVIEW_METHODOLOGY.md`

## Verification

- Red: `node --test tests\contract\openapi-generation.test.mjs`
  - Failed because `/workspaces/{workspace_id}/capabilities` and `setWorkspaceCapability`
    were absent.
- Red: `node --test tests\unit\db-schema.test.mjs`
  - Failed because `0006_v0_f5_workspace_capabilities` did not exist.
- Red: `node --test tests\integration\capabilities.test.mjs`
  - Failed because `client.setWorkspaceCapability` was absent.
- Green:
  - `node --test tests\contract\openapi-generation.test.mjs`
  - `node --test tests\unit\db-schema.test.mjs tests\unit\permissions.test.mjs`
  - `node --test tests\integration\capabilities.test.mjs`

## Evidence retained

- `WorkspaceCapability` is additive, workspace-scoped and RLS-protected.
- Owner/Admin can update `media_processing` capability.
- Cross-workspace capability mutation returns `WORKSPACE_ACCESS_DENIED`.
- Disabled `media_processing` returns `CAPABILITY_DISABLED` with 404 hidden semantics and
  does not create a new simulated media-processing job.
