# Product V0 Information Architecture

**Status:** Canonical V0 navigation and route contract  
**Scope:** Standalone Product V0 only  
**Design authority:** `../Project/DESIGN.md`

## 1. Purpose

This document defines how users find, understand and move through Product V0. It prevents
routes, navigation, breadcrumbs, workspace context and unfinished capabilities from being
invented independently during implementation.

## 2. Architecture Principles

1. The active workspace is visible at all times.
2. Navigation follows the production journey, not the backend module tree.
3. Every durable object has a stable, refresh-safe detail URL.
4. Server state survives refresh, back/forward navigation and a second browser tab.
5. A user sees only destinations allowed by membership and capability configuration.
6. Unavailable future work is absent, not shown as a deceptive disabled product.
7. Paid, publishing and destructive actions never depend on browser history state.
8. V0 does not expose V1 or V2 navigation, routes or teaser modules.

## 3. Route Conventions

- Product routes use lowercase plural nouns and immutable IDs.
- The workspace slug is present in every authenticated product URL.
- Human-readable slugs may decorate URLs but IDs remain authoritative.
- Filters, sort, page cursors and selected tabs use query parameters.
- Modals that must survive refresh use routes; incidental confirmations do not.
- The canonical pattern is `/w/{workspaceSlug}/{resource}/{resourceId}`.
- A stale slug redirects to the current slug without changing the resource ID.
- A resource outside the active workspace returns the existence-hiding not-found view.

## 4. Route Map

### Public and Authentication

| Route | Purpose | Access |
|---|---|---|
| `/` | Product entry or redirect to last workspace | Public |
| `/sign-in` | Supabase sign-in | Signed-out |
| `/auth/callback` | Auth callback processing | Provider callback |
| `/access-denied` | Authenticated but no permitted workspace | Authenticated |
| `/service-status` | Sanitised dependency status | Public-safe |
| `/app/signup` | Email, username and password sign-up entry | Signed-out |
| `/app/onboarding` | Optional brand context collection before extraction | Authenticated |
| `/app/profile` | User profile and brand context defaults | Authenticated |
| `/app/branding` | Active standalone branding entry; detail state uses `?crawlRunId=<uuid>` | Authenticated |
| `/brand-extract` | Direct brand-extraction frontend entry for the active branding surface; resolves the same V0 brand intake and candidate review workflow as `/app/branding` | Authenticated |
| `/branding` | Redirects to `/app/branding` | Public-safe redirect |

### Workspace Shell

| Route | Purpose |
|---|---|
| `/w/{workspaceSlug}` | Workspace home and next-action summary |
| `/w/{workspaceSlug}/activity` | User-visible jobs and production activity |
| `/w/{workspaceSlug}/notifications` | Actionable notifications |

### Brand

| Route | Purpose |
|---|---|
| `/w/{workspaceSlug}/brands` | Brand list |
| `/w/{workspaceSlug}/brands/new` | URL/upload intake |
| `/w/{workspaceSlug}/brands/{brandId}` | Brand overview and active profile |
| `/w/{workspaceSlug}/brands/{brandId}/runs/{crawlRunId}` | Crawl progress, selected/detected brand type and evidence |
| `/w/{workspaceSlug}/brands/{brandId}/profiles/{profileId}` | Exact profile version |
| `/w/{workspaceSlug}/brands/{brandId}/profiles/{profileId}/review` | Candidate review and approval |
| `/w/{workspaceSlug}/brands/{brandId}/assets` | Approved and quarantined assets |
| `/w/{workspaceSlug}/brands/{brandId}/rules` | Claims, required phrases and prohibitions |

### Blueprint

| Route | Purpose |
|---|---|
| `/w/{workspaceSlug}/blueprints` | Approved reusable blueprint library |
| `/w/{workspaceSlug}/blueprints/new` | Existing/new discovery choice |
| `/w/{workspaceSlug}/discover` | Viral candidate search |
| `/w/{workspaceSlug}/discover/{candidateId}` | Candidate metrics, rights and selection |
| `/w/{workspaceSlug}/blueprints/{blueprintId}` | Immutable blueprint, formula and prompt |
| `/w/{workspaceSlug}/blueprints/{blueprintId}/stages` | Stage evidence and partial failures |

### Scripts

| Route | Purpose |
|---|---|
| `/w/{workspaceSlug}/scripts` | Tournament history |
| `/w/{workspaceSlug}/scripts/new` | Tournament configuration |
| `/w/{workspaceSlug}/scripts/{tournamentId}` | Variants, evaluations and progress |
| `/w/{workspaceSlug}/scripts/{tournamentId}/compare` | Side-by-side comparison and selection |

### Avatars, Generation and Credits

| Route | Purpose |
|---|---|
| `/w/{workspaceSlug}/avatars` | Eligible avatar catalogue and consent state |
| `/w/{workspaceSlug}/credits` | Wallet, purchases and ledger |
| `/w/{workspaceSlug}/credits/purchase` | Razorpay/Stripe purchase flow |
| `/w/{workspaceSlug}/generate/new` | Selected-script, avatar and estimate confirmation |
| `/w/{workspaceSlug}/generations/{generationId}` | Generation state and reconciliation |

### Composition and Review

| Route | Purpose |
|---|---|
| `/w/{workspaceSlug}/compositions/{compositionId}` | Direction and AE plan |
| `/w/{workspaceSlug}/videos/{finalVideoId}` | Exact final-video revision |
| `/w/{workspaceSlug}/reviews` | Assigned and recent reviews |
| `/w/{workspaceSlug}/reviews/{reviewItemId}` | Media review, comments and decision |

### Calendar, Publishing and Lineage

| Route | Purpose |
|---|---|
| `/w/{workspaceSlug}/calendar` | Calendar and schedule list |
| `/w/{workspaceSlug}/calendar/new` | Schedule approved media |
| `/w/{workspaceSlug}/posts/{calendarPostId}` | Schedule, publish and verification state |
| `/w/{workspaceSlug}/lineage/{finalVideoId}` | Full ancestry, cost and evidence |

### Settings and Operations

| Route | Purpose | Roles |
|---|---|---|
| `/w/{workspaceSlug}/settings` | Workspace settings | Owner, Admin |
| `/w/{workspaceSlug}/settings/members` | Membership and roles | Owner, Admin |
| `/w/{workspaceSlug}/settings/integrations` | Provider credential metadata | Owner, Admin |
| `/w/{workspaceSlug}/settings/data` | Export and deletion | Owner, Admin |
| `/w/{workspaceSlug}/operations/jobs` | Job/dead-letter operations | Owner, Admin |
| `/w/{workspaceSlug}/operations/reconciliation` | Provider/credit/publishing reconciliation | Owner, Admin |
| `/w/{workspaceSlug}/operations/audit` | Security and production audit | Owner, Admin |

## 5. Authenticated Application Shell

### Desktop

- Persistent left navigation, 248px expanded and 72px collapsed.
- Top bar contains workspace switcher, page title, activity indicator, notifications and
  account menu.
- Workspace colour seed appears in the switcher and a 2px top rail.
- Main content has one page title, optional contextual actions and a maximum readable
  width. Media/review surfaces may use the full available canvas.
- A right inspector is allowed only for evidence, lineage, comments or exact-version
  metadata; it must not become a second primary navigation.

### Mobile

- Bottom navigation contains Home, Create, Activity and More.
- Workspace switching is in a full-height sheet opened from the top bar.
- Deep production screens use a single-column sequence with sticky current-step actions.
- Tables become labelled record lists; critical columns cannot disappear without an
  equivalent field.
- Video review defaults to media first, then collapsible script/comments/evidence.

## 6. Primary Navigation

The production navigation is:

1. Home
2. Brands
3. Blueprints
4. Scripts
5. Generate
6. Review
7. Calendar
8. Activity

Credits is a persistent wallet affordance for Owner, Admin and Client Manager roles.
Avatars appears under Generate until its catalogue justifies primary navigation.
Operations and Settings are in a separated lower navigation group.

## 7. Role-Specific Navigation

| Role | Primary additions/omissions |
|---|---|
| Owner | All destinations, including settings, audit, export, credits and recovery |
| Admin | All destinations needed for administration, credentials, reconciliation and recovery |
| Client Manager | Brand, blueprint, script, avatar, credits, generation, review and calendar |
| Reviewer | Review and notifications; read-only context needed to review |

Navigation visibility is convenience, not authorization. NestJS rechecks every action.

## 8. Complete Brand-To-Publication Journey

```text
Workspace home
-> Create brand
-> Crawl/upload intake with optional brand type
-> Review universal and vertical candidates
-> Approve exact brand profile
-> Choose existing blueprint or discover
-> Select candidate and inspect rights
-> Watch extraction stages
-> Open ready blueprint/formula/prompt
-> Create script tournament
-> Compare and select exact script
-> Select eligible avatar
-> Review estimate and reserve credits
-> Watch HeyGen generation/reconciliation
-> Review retained generated media
-> Provide composition direction
-> Validate AE plan and render
-> Review exact final-video version
-> Approve
-> Schedule or export
-> Publish to approved account
-> Verify audience-facing post
-> Inspect lineage, ledger and initial performance snapshot
```

Every step links forward only when its blocking predecessor exists. A user may navigate
back to evidence at any time, but editing immutable records creates a new version or
revision.

`/app/branding?crawlRunId=<uuid>` is the current primary branding surface for the V0
branding app plan. `/brand-extract` is the direct brand-extraction entry for that same
surface and must not introduce a second workflow or alternate contract. Both routes must
resolve the same canonical crawl-run state as
`/w/{workspaceSlug}/brands/{brandId}/runs/{crawlRunId}` when workspace routing is present.
The query parameter is refresh-safe state only; signed URLs, provider IDs that grant
access, raw Firecrawl payloads and worker lease tokens are never placed in the URL.
Branding routes show universal candidate groups before vertical candidate groups, preserve
selected/detected brand-type conflicts as review state and never present crawled assets as
approved production assets before V0-B3 approval. The brand review sequence contains an
Acquired brand assets card between candidate review and final profile approval. Its
horizontally scrollable cupboard lists retained clean files with provenance and rights,
while source-only or rejected candidates remain in a separate evidence section. Add and
Remove from profile actions change only the pending profile selection; retained evidence is
not deleted. Opaque `artifact:{id}` references are identifiers, not browser URLs, and must
be exchanged through the authorised artifact-download contract before media rendering.

## 9. Object Detail URLs and Breadcrumbs

Breadcrumbs describe ownership, not every click:

```text
Brands / Aster Heights / Profile v3
Blueprints / BP-024 / Stages
Scripts / Tournament ST-018 / Compare
Generations / GEN-104
Reviews / RV-077
Calendar / POST-031
```

- Workspace is represented by the shell switcher and omitted from breadcrumbs.
- IDs use the short display ID; the full immutable ID is available in evidence details.
- The final breadcrumb is plain text.
- Breadcrumb links preserve safe list filters only when they came from the current
  workspace and do not contain sensitive data.

## 10. Browser Back, Forward and Refresh

- The URL is the source of truth for the current object, tab, filter and cursor.
- Unsaved local form changes trigger a navigation warning.
- Refresh refetches canonical PostgreSQL state; it never resubmits a mutation.
- Mutation success uses replace/redirect to the durable detail route.
- Back from a detail page returns to the prior filtered list when the query is valid.
- Signed media URLs are reminted after refresh and never placed in route/query state.
- Job progress reconnects by canonical job ID.
- A stale version route remains readable if authorised and clearly says `Superseded`.
- Deleted/revoked resources use the existence-hiding not-found surface.

## 11. Unfinished Capability Visibility

Capability state has four values:

| State | User treatment |
|---|---|
| `enabled` | Destination and actions are visible |
| `internal_preview` | Visible only to explicitly entitled workspaces with a Preview label |
| `disabled` | Hidden from product navigation; direct route returns not found |
| `blocked_external` | Existing object remains visible with the provider/approval blocker and fallback |

V1/V2 capabilities are not registered in V0. Marketing-style “coming soon” cards are
prohibited in the production shell.

## 12. Cross-Cutting Behaviour

- Page titles follow `{Object or page} · {Workspace} · Sakhaa Forge`.
- Every async detail page contains status, last update, current action and recovery path.
- Every paid page displays estimate/authorisation/settled amount separately.
- Every approval and publication page repeats the exact media/version identity.
- Empty states offer one permitted next action, never generic encouragement.
- Search and collection filters are workspace-scoped and bounded.
- Notifications deep-link to a durable route, not a modal or signed URL.

## 13. Accessibility

- A skip link precedes navigation.
- Route changes move focus to the page heading unless focus is intentionally retained.
- Breadcrumbs use `nav[aria-label="Breadcrumb"]`.
- Current navigation uses `aria-current`.
- Mobile sheets trap focus and restore it to the trigger.
- Status, workspace identity and capability state are never colour-only.
- Browser title and live-region announcements reflect meaningful async transitions.
