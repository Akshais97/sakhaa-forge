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
