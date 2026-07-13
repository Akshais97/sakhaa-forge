# V0-G1 Consent-Safe Avatar Selection Local Verification — 2026-06-26

## Slice

V0-G1: Consent-Safe Avatar Selection.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/Sprints/V0-G1_CONSENT_SAFE_AVATAR_SELECTION_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_TEST_PERSONAS_AND_SEED_FIXTURES.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Behaviour verified

- `GET /api/v0/avatars` returns the consent-safe avatar catalogue for one
  workspace and one active approved brand profile. Results are bounded by `limit`
  (1-50, default 20) with a cursor and an `emptyState` action. The endpoint
  requires the `manage_avatars_consent` capability (Owner, Admin, Client Manager);
  Reviewer is denied by the unit permission contract.
- The deterministic consent simulator idempotently materializes one brand-bound
  catalogue per approved brand profile on first read. The catalogue contains an
  eligible generic avatar, an eligible brand ambassador, and real-person avatars
  that are expired, revoked, missing consent evidence and pending service
  fulfillment. Generic avatars are labelled honestly by kind with no performance
  claims.
- Each avatar carries a derived `eligibility` object (`eligible`, `reason`,
  `consentExpiresAt`, `consentRevokedAt`). `reason` is one of `eligible`,
  `consent_required`, `consent_expired`, `consent_revoked`, `service_pending`,
  checked in that blocking order. Eligibility is derived from the linked
  `AvatarConsent` (evidence, expiry, revocation) and `serviceFulfillmentState`; it
  is never stored as a separate enum, mirroring the blueprint `emptyState`
  precedent.
- Consent evidence is sensitive: `AvatarConsent.evidenceRef` is a secret-manager
  style reference that never appears in public responses or analytics. The
  integration test asserts the serialized response contains no `evidenceRef` /
  `evidence_ref` token.
- A missing or cross-workspace brand profile is hidden behind
  `WORKSPACE_ACCESS_DENIED` (404), never a 409 that leaks existence. In Prisma,
  RLS plus the `workspaceId` predicate hide the foreign profile; in the in-memory
  store the `profile.workspaceId !== input.workspaceId` guard hides it. The error
  body never includes the other workspace's avatar display names or brand profile
  id. An unauthenticated request is rejected with 401 before any catalogue work.
- The catalogue materializes idempotently: repeated `GET /avatars` calls return
  the same avatar identities. Cursor pagination does not repeat the last-seen
  avatar and does not drop any avatar across pages.
- The web shell implements the avatar catalogue workflow at
  `apps/web/src/avatar-workflow.mjs` with pure, DOM-agnostic state functions unit
  tested in Node and a browser glue that wires the generated `V0Client.listAvatars`.
  Eligible, expired, revoked, consent-missing and service-pending avatars render
  as `data-state` attributes; ineligible avatars render a disabled Select control
  and never advance. There is no V0 public avatar mutation endpoint, so selection
  is a local client-side decision for the next generation step and is never an
  optimistic paid or publishing action.
- Prisma schema and migration `0019_v0_g1_consent_safe_avatar_selection` create
  `avatar_profiles` and `avatar_consents` with workspace back-references, the
  one-to-one consent relation, `kind` / `likeness_scope` / `voice_scope` /
  `service_fulfillment_state` CHECK constraints, a non-empty `evidence_ref` CHECK
  constraint and workspace-isolation RLS policies on both tables.

## Red evidence

Command:

```text
node --test tests\integration\avatar-g1.test.mjs
```

Observed failures before implementation:

```text
TypeError: client.listAvatars is not a function
```

All three G1 integration tests failed before `listAvatars` existed on the
generated client or the store/route.

## Green evidence

Command:

```text
node --test tests\integration\avatar-g1.test.mjs
```

Outcome:

```text
tests 3
pass 3
fail 0
```

Required sprint tests and outcomes:

- Consent expiry and revocation — pass. The expired avatar returns
  `eligibility.reason: consent_expired` with `eligible: false`; the revoked
  avatar returns `consent_revoked` with `eligible: false` and a non-null
  `consentRevokedAt`.
- Cross-workspace avatar denial — pass. A member of workspace A asking for the
  avatars bound to workspace B's brand profile receives
  `WORKSPACE_ACCESS_DENIED` (404); the other workspace's display names and brand
  profile id do not leak.
- Missing evidence blocked state — pass. The missing-evidence avatar returns
  `consent_required` with `eligible: false` and no consent timing exposed.
- Avatar-selection browser journey — pass. The `avatar-workflow` unit suite
  covers empty, loading, ready, selected, expired, revoked, consent-missing,
  service-pending, forbidden, blocked-hidden and blocked-brand states; the
  rendered markup disables Select for ineligible avatars and never renders
  consent evidence.

Unit test command and outcome:

```text
node --test tests\unit\avatar-workflow.test.mjs tests\unit\permissions.test.mjs
tests 11
pass 11
fail 0
```

## Full verification

Command:

```text
node scripts\verify.mjs
```

Outcome:

```text
tests 128
pass 125
fail 0
skipped 3

prisma runtime persists workspace and idempotency records in Supabase
prisma runtime persists S1 script tournament and S2 selected script and is concurrency-safe
prisma runtime materializes V0-G1 avatar catalogue with derived consent eligibility
tests 3
pass 3
fail 0

V0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5/S1/S2/G1 local verification passed.
```

The three skipped tests in the broad test glob are the runtime-proof tests
intentionally skipped there and run by the dedicated verification step
immediately after, including the new G1 avatar catalogue runtime proof against
Supabase.

## Migration evidence

`node scripts\verify.mjs` applied the new migration:

```text
Applying packages/db/prisma/migrations/0019_v0_g1_consent_safe_avatar_selection/migration.sql
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
ALTER TABLE
CREATE POLICY
CREATE TABLE
CREATE INDEX
ALTER TABLE
CREATE POLICY
```

The migration creates `avatar_profiles` (primary key, workspace and brand-profile
back-references, kind/scope/service-fulfillment CHECK constraints, a
`(workspace_id, brand_profile_id, display_name)` unique index and a
workspace-isolation RLS policy) and `avatar_consents` (primary key, unique
`avatar_profile_id`, non-empty `evidence_ref` CHECK constraint, scope CHECK
constraints and a workspace-isolation RLS policy). No BYPASSRLS is granted.

The runtime-proof test confirms persistence under RLS:

```text
SELECT count(*)::text || ':' || count(c.id)::text
FROM avatar_profiles p LEFT JOIN avatar_consents c ON c.avatar_profile_id = p.id
WHERE p.workspace_id = '<ws>' AND p.brand_profile_id = '<bp>'
-- result: 6:5
```

Six avatars materialize; five carry a consent record (the missing-evidence
avatar has none).

## Downstream contract reference

`docs/V0/V0_DATA_MODELS.md` and `docs/V0/V0_API.md` record that expired, revoked,
missing-evidence or service-pending avatars cannot enter a generation estimate or
job. The `AvatarProfile.id` (already referenced as `avatarProfileId` on
`GenerationEstimate` and `GenerationJob`) is the downstream contract reference that
V0-G3 generation estimate and later generation work will bind to. No V0-G3 job,
table or runtime dependency was introduced in V0-G1; the avatar mutation contract
gap (no public avatar creation or revocation endpoint) is intentionally left for
the owner to decide, so V0-G1 does not invent a public mutation contract.

## Browser state evidence

The web shell renders the avatar catalogue contract at
`data-testid="avatar-catalog-contract"` with `ready`, `expired`, `revoked`,
`consent-missing`, `service-pending`, `forbidden`, `blocked-hidden`,
`blocked-brand`, `loading` and `empty` states. The `avatar-workflow` unit suite
asserts the rendered copy and the disabled Select control for ineligible
avatars. This is the deterministic V0 browser-state evidence for the sprint; no
live browser screenshot is captured in local verification.

## Scope note

This is local deterministic simulator evidence for V0-G1. It does not claim
production provider readiness or full V0 acceptance. Generation (V0-G3 onward),
credit reservation, wallet and publishing are not yet implemented; avatar
selection stops at the derived eligibility surface and never silently advances
to generation. No public avatar creation or revocation endpoint was introduced.

## Review Fixes (2026-06-26)

A senior sprint review (`docs/Project/Sprint Reviews/G1_review.md`) found that
G1 implemented catalogue eligibility and UI disabled states but did not enforce
avatar eligibility at the backend boundary that consumes avatar selection, and
that avatar selection was not auditable or durable. Both critical issues are
fixed in this change.

### Backend consent guard at the estimate boundary

`createGenerationEstimate` (in-memory and Prisma) now enforces consent-safe
avatar eligibility when an `avatarProfileId` is supplied. After the active
approved brand-profile check, the API materializes the brand-bound catalogue,
loads the avatar by `workspaceId` and `brandProfileId`, and derives eligibility
with the same server logic as `GET /avatars`. The UI disabled state is never
trusted.

- A missing, nonexistent or cross-workspace avatar is hidden behind
  `WORKSPACE_ACCESS_DENIED` (404), never a 409 that leaks existence.
- A revoked avatar returns `AVATAR_CONSENT_REVOKED` (409).
- An expired avatar returns `AVATAR_CONSENT_EXPIRED` (409).
- A missing-evidence avatar returns `AVATAR_CONSENT_REQUIRED` (409).
- A service-pending custom avatar returns `AVATAR_CONSENT_REQUIRED` (409). The
  V0 error catalog defines no dedicated service-pending code; an unfulfilled
  custom-avatar service means valid likeness/voice consent is not yet in place.
  This mapping is documented in `docs/V0/V0_API.md`.
- A generic avatar is accepted by the same derive logic; it carries a
  non-expiring library licence consent record and is bound to the workspace and
  brand profile.
- When no `avatarProfileId` is supplied, the estimate is created without an
  avatar and no guard or audit applies, preserving the pre-G1 estimate contract.

Error codes are the existing `AVATAR_CONSENT_*` entries in
`docs/V0/V0_ERROR_CATALOG.md`; no new error code or endpoint was introduced.

### Durable selection audit

An eligible avatar that enters a generation estimate writes a durable
`avatar.selected` audit row (target type `AvatarProfile`, target id the avatar
id) retained as selection lineage. A rejected avatar writes no estimate and no
audit. Consent evidence never reaches the audit record. This binds avatar
selection into the first downstream generation-estimate mutation, satisfying the
sprint's "Selection audit record" completion evidence without inventing a public
avatar mutation endpoint.

### Fix verification

Red evidence before the fix: a `consent_revoked` avatar was accepted into a
generation estimate with `202`; a cross-workspace avatar was accepted with `202`;
no audit record was returned.

Green evidence after the fix:

```text
node --test tests\integration\avatar-g1.test.mjs tests\integration\brand-memory-b3.test.mjs
tests 8
pass 8
fail 0
```

The `brand-memory-b3` "active estimate" case now uses a real eligible avatar
from the catalogue, because a fake `avatarProfileId` is correctly rejected under
the strengthened contract; its draft and stale assertions are unchanged because
they fail at the brand-profile check before any avatar guard runs.

Prisma runtime proof against Supabase:

```text
V0_RUNTIME_DB_PROOF=1 node --test tests\integration\prisma-runtime.test.mjs
✔ prisma runtime enforces V0-G1 avatar consent at the generation estimate boundary and retains selection audit
tests 4
pass 4
fail 0
```

The runtime proof confirms a revoked avatar is rejected with
`AVATAR_CONSENT_REVOKED` (409), an eligible avatar is accepted (202) with an
`avatar.selected` audit, `audit_events` holds one selection row for the eligible
avatar and zero rows for the rejected avatar.

### Non-blocking items left for the owner

- `avatar_consents.revoked_by_user_id` remains a plain nullable UUID column
  with no FK to `users(id)`, mirroring the pre-0018 selected-script approver
  pattern. The deterministic simulator sets it to null; a real revocation actor
  FK can be added when a public revocation contract is introduced.
- A true browser click-automation test against the live API is not added; the
  web-shell state functions and module serving remain unit-tested. The sprint's
  first failing behaviour (backend guard) is covered by the integration and
  runtime proofs above.
