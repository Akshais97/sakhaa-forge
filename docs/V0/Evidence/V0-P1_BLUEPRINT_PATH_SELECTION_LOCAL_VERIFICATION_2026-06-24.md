# V0-P1 local verification evidence: Explicit blueprint path selection

Date: 2026-06-24  
Slice: `V0-P1 Explicit Blueprint Path Selection`

## Sources read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-P1_EXPLICIT_BLUEPRINT_PATH_SELECTION_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Red test

Command:

```powershell
node --test tests\integration\blueprint-path-p1.test.mjs
```

Expected failure before implementation:

```text
TypeError: client.listBlueprints is not a function
TypeError: client.seedBlueprintLibraryEntry is not a function
```

## Green checks

Command:

```powershell
node --test tests\integration\blueprint-path-p1.test.mjs
```

Result:

```text
pass 2, fail 0
```

Command:

```powershell
node --test tests\contract\openapi-generation.test.mjs
node --test tests\unit\db-schema.test.mjs
node --test tests\e2e\web-workspace.test.mjs
```

Result:

```text
contract pass 2, fail 0
db schema pass 11, fail 0
web e2e pass 4, fail 0
```

Command:

```powershell
node --test tests/**/*.test.mjs
```

Result:

```text
tests 69, pass 68, fail 0, skipped 1
```

Command:

```powershell
.\pnpm.cmd verify
```

Result:

```text
tests 69, pass 68, fail 0, skipped 1
prisma runtime proof pass 1, fail 0
Database contract valid for V0-F5/B1/B2/B3/P1 identity, idempotency, artifacts, jobs, outbox, capability controls, service credentials, brand intake, brand candidates, brand memory, blueprint path selection and RLS.
V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1 local verification passed.
```

Command:

```powershell
.\pnpm.cmd db:migrate:dev
node scripts\check-p1-tables.mjs
```

Result:

```text
Applying packages/db/prisma/migrations/0011_v0_p1_blueprint_path_selection/migration.sql
V0-F1/F2/F3/F4/F5/B1/B2/B3/P1 migrations applied.
P1 tables exist; P2021 clear: blueprint_library_entries, blueprint_requests
```

Final post-verify table proof:

```text
P1 tables exist; P2021 clear: blueprint_library_entries, blueprint_requests
```

## Browser evidence

- `docs/V0/Evidence/V0-P1_BLUEPRINT_PATH_SELECTION_UI_2026-06-24.png`
- `docs/V0/Evidence/V0-P1_BLUEPRINT_PATH_SELECTION_UI_SNAPSHOT_2026-06-24.html`

## Closure notes

- `GET /blueprints` returns a bounded workspace-scoped library with compatibility metadata.
- `POST /blueprint-requests` creates one downstream request identity for `existing_blueprint`, `new_discovery` and `default_formula`.
- Existing selections reject stale brand-profile versions, archived entries, incompatible entries and cross-workspace entries.
- `blueprint_library_entries` and `blueprint_requests` are Prisma-owned, additive and RLS-protected.
