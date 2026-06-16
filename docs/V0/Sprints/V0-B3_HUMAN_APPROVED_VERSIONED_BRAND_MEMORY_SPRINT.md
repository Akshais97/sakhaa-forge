# V0-B3 Sprint: Human-Approved Versioned Brand Memory

## Sprint Objective

Let an authorized brand manager edit candidates and approve one exact brand profile
version that downstream production APIs require.

## Source Contracts

- `../V0_BRAND_PROFILE_CONTRACT.md`
- `../V0_PERMISSIONS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_DATA_MODELS.md`
- `../V0_PRISMA_SCHEMA.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Build candidate edit and review UI with version diff.
- Add `BrandProfile`, `BrandApproval`, `BrandRule` and approved asset references.
- Enforce one active approved profile version per brand/workspace.
- Record required and prohibited brand rules.
- Bind approval to actor, timestamp and exact candidate values.
- Reject downstream use of draft, rejected, revoked or superseded profiles.
- Add audit events for approval, rejection, revocation and supersession.

## TDD And Verification Plan

First failing test: concurrent approvals create two active profiles or a superseded
profile can be used downstream.

Required tests:

- Concurrent approval race test.
- Downstream unapproved/superseded rejection test.
- Permission tests for approval roles.
- Version-diff browser journey.

## Security And Guardrails

- Human approval is mandatory before production use.
- Historical lineage keeps superseded brand versions immutable.
- Brand truth must not be inferred from source notes or unapproved candidates.

## Completion Evidence

- Approval audit record.
- Active-version constraint proof.
- Downstream rejection test output.
- Browser screenshots for edit, diff and approval.
