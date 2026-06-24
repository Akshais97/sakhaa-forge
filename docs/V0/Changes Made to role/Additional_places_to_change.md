# Role Consolidation and Operator Removal Plan

## Goal Description

Simplify the Sakhaa Forge V0 workspace roles by merging overlapping roles into a consolidated client-facing role, removing the technical Operator role (reassigning emergency recovery tasks to Admins/Owners), and ensuring a streamlined workflow for the target user base.

The roles will change as follows:
* **`OWNER`**: Unchanged.
* **`ADMIN`**: Unchanged. Receives additional system telemetry/recovery capabilities previously held by Operator.
* **`CLIENT_MANAGER`**: A new consolidated role combining `BRAND_MANAGER`, `STRATEGIST`, and `FINANCE`.
* **`REVIEWER`**: Unchanged (client review/comments only).
* **`OPERATOR`**: Removed.
* **`STRATEGIST`**: Removed.
* **`BRAND_MANAGER`**: Removed.
* **`FINANCE`**: Removed.

---

## User Review Required

> [!NOTE]
> Because the codebase is currently at the boundary of `V0-F0` and `V0-F1` and does not yet contain coded references to the old roles in NestJS controllers, database schema, or frontend components, this role consolidation carries **zero codebase refactoring risk**. It only requires updating document specifications and aligning files before they are written.

---

## Open Questions

None. The user has explicitly directed the removal of the Operator role and consolidation of Client roles into a single operational entity.

---

## Proposed Changes

### Documentation Component

#### [MODIFY] [V0_PERMISSIONS.md](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/docs/V0/V0_PERMISSIONS.md)
* Consolidate capability matrix columns to: **Owner**, **Admin**, **Client Manager**, and **Reviewer**.
* Assign capabilities:
  * `CLIENT_MANAGER` receives all permissions of the former Brand Manager, Strategist, and Finance roles (approving brand guidelines, running script tournaments, confirming paid generations, managing wallets, approving/rejecting final videos, scheduling/publishing).
  * `ADMIN` receives retry/reconcile provider job capabilities previously owned by Operator.

#### [MODIFY] [V0_PRISMA_SCHEMA.md](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/docs/V0/V0_PRISMA_SCHEMA.md)
* Update `enum MembershipRole` declaration to match the new simplified list:
  ```prisma
  enum MembershipRole { OWNER ADMIN CLIENT_MANAGER REVIEWER }
  ```

#### [MODIFY] [V0_TEST_PERSONAS_AND_SEED_FIXTURES.md](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/docs/V0/V0_TEST_PERSONAS_AND_SEED_FIXTURES.md)
* Redefine the test personas in Section 2:
  * Remove `Bhavna Brand Manager` (replaced by consolidated Client Manager).
  * Remove `Sameer Strategist`.
  * Remove `Farah Finance`.
  * Remove `Om Operator`.
  * Add `Bhavna Client Manager` (Role: `CLIENT_MANAGER`).

#### [MODIFY] [V0_VERTICAL_OUTCOME_SLICES.md](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/docs/V0/V0_VERTICAL_OUTCOME_SLICES.md)
* Update Section 21 (**Role Traceability**) to reference `Owner/Admin`, `Client Manager`, and `Reviewer` only.
* Re-map mentions of "operator" or "brand manager" tasks in the functional slice definitions (specifically in V0-F5, V0-U2/U3, and V0-A2/A3) to reference `Client Manager` or `Admin/Owner`.

---

### Backend & Database Components (V0-F1 Implementation Scope)

#### [NEW] [schema.prisma](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/packages/db/prisma/schema.prisma)
* Implement the enum `MembershipRole` using the consolidated roles as part of the database setup.

#### [NEW] [Membership guards / decorators]
* When building NestJS controllers and auth decorators in `apps/api`, restrict endpoints based on the consolidated list (`MembershipRole.CLIENT_MANAGER`, etc.).

---

## Verification Plan

### Automated Tests
* Run `pnpm test` to verify that no existing walking skeleton tests break.
* In the upcoming RLS and direct object reference tests for `V0-F1`, include tests verifying that:
  * A user with `CLIENT_MANAGER` role can successfully complete approvals, tournaments, and financial reservations.
  * A user with `REVIEWER` role is blocked from billing, scheduling, and approvals.
  * Attempting to use a deleted role (like `STRATEGIST` or `OPERATOR`) is rejected.
