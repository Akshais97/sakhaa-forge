# V0-F1 Sprint: Tenant-Safe Sign-In And Workspace Selection

## Sprint Objective

Allow a user to sign in, create or select a workspace, see their role and fail safely
when attempting cross-workspace access.

## Source Contracts

- `../V0_PERMISSIONS.md`
- `../V0_SECURITY.md`
- `../V0_DATA_MODELS.md`
- `../V0_PRISMA_SCHEMA.md`
- `../V0_STATUS_ENUMS.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_BACKEND.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_DATABASE.md`
- `../../Project/DESIGN.md`

## Sprint Backlog

- Validate Supabase Auth JWTs in the NestJS API.
- Add `User`, `Workspace`, `Membership` and `AuditEvent` records.
- Resolve active workspace and role for each tenant request.
- Add RLS policies and restricted runtime/migration roles.
- Build workspace creation, selection and switcher UI.
- Add unauthorized and existence-hiding not-found states.
- Audit workspace creation and membership-sensitive actions.

## TDD And Verification Plan

First failing test: User A can alter a workspace ID and read or mutate User B's state.

Required tests:

- Two-workspace RLS integration suite.
- Direct object reference attack test.
- Role matrix tests from `V0_PERMISSIONS.md`.
- Browser journey for sign-in, workspace creation and workspace switching.

## Security And Guardrails

- Cross-workspace access must not reveal whether the target exists.
- Runtime database role must not own tables or bypass RLS.
- Browser code must not receive database credentials.

## Completion Evidence

- RLS and authorization test output.
- Browser screenshots for sign-in, create workspace and switch workspace.
- Audit event examples with actor, workspace and timestamp.
- Evidence that stale or missing membership invalidates access.
