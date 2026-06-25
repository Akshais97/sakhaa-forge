# Implemented changes: V0-P1 Explicit Blueprint Path Selection Sprint

Date: 2026-06-24

## Outcome

Client manager can explicitly choose an existing blueprint, new viral discovery or the
approved default formula. All three paths create the same downstream `BlueprintRequest`
identity bound to the active approved brand-profile version.

## Code and contracts

- Added `GET /blueprints` for bounded workspace-scoped blueprint library listing.
- Added `POST /blueprints/library-entries` for approved reusable blueprint entries.
- Added `POST /blueprint-requests` for explicit path selection.
- Added generated client methods:
  - `listBlueprints`
  - `seedBlueprintLibraryEntry`
  - `createBlueprintRequest`
- Added in-memory and Prisma store implementations with:
  - active approved brand-profile enforcement;
  - exact brand-profile version binding;
  - existing/discovery/default contract convergence;
  - archived/incompatible blueprint rejection;
  - cross-workspace hidden 404 behaviour.

## Data and migration

- Added Prisma models:
  - `BlueprintLibraryEntry`
  - `BlueprintRequest`
- Added migration:
  - `packages/db/prisma/migrations/0011_v0_p1_blueprint_path_selection/migration.sql`
- Added RLS policies and tenant-leading indexes for both P1 tables.
- Added runtime table proof script:
  - `scripts/check-p1-tables.mjs`

## UI

- Added P1 blueprint path selection section to the web shell.
- Captured browser evidence:
  - `docs/V0/Evidence/V0-P1_BLUEPRINT_PATH_SELECTION_UI_2026-06-24.png`
  - `docs/V0/Evidence/V0-P1_BLUEPRINT_PATH_SELECTION_UI_SNAPSHOT_2026-06-24.html`

## Tests

- Added `tests/integration/blueprint-path-p1.test.mjs`.
- Updated OpenAPI/client contract tests.
- Updated DB schema/migration tests.
- Updated web e2e screenshot-state test.

## Verification

Observed red:

```text
TypeError: client.listBlueprints is not a function
TypeError: client.seedBlueprintLibraryEntry is not a function
```

Green checks retained in:

```text
docs/V0/Evidence/V0-P1_BLUEPRINT_PATH_SELECTION_LOCAL_VERIFICATION_2026-06-24.md
```

Runtime DB proof:

```text
P1 tables exist; P2021 clear: blueprint_library_entries, blueprint_requests
```
