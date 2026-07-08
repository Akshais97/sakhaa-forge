# Product V0 Screen and State Inventory

**Status:** Canonical screen contract  
**Scope:** Product V0 only  
**Design authority:** `../Project/DESIGN.md`  
**Language authority:** `../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## 1. Universal Screen Contract

Every screen specifies:

- permitted roles and active workspace;
- durable route and canonical object identity;
- entry prerequisites and successful exit;
- server data and capability dependencies;
- primary, secondary and destructive actions;
- loading, empty, queued, running, retrying, unknown, blocked, failed, partial and
  successful states where applicable;
- malformed, unauthorised and stale-version behaviour;
- mobile adaptation, keyboard order, focus destination and live announcements.

Unauthorised and cross-workspace object access use the same existence-hiding not-found
surface.

## 2. Foundation Screens

| Screen | Route | Roles | Entry / exit | Data and actions | Required states |
|---|---|---|---|---|---|
| Sign in | `/sign-in` | Signed-out | Entry without session; exit to last/selected workspace | Supabase Auth; sign in, resend/retry | loading, provider failure, expired callback, success redirect |
| Auth callback | `/auth/callback` | Provider callback | Entry with auth response; exit by replace navigation | Auth exchange only | processing, malformed, expired, denied |
| No workspace | `/access-denied` | Authenticated | No membership; exit after invite/workspace creation | Membership lookup; create/request access | empty, loading, forbidden |
| Service status | `/service-status` | Public-safe | Direct entry | Sanitised liveness/readiness | healthy, degraded, unavailable; no secrets |
| Workspace home | `/w/{slug}` | All members | Valid membership; exit through next action | Workspace, role, capability, recent jobs | loading, no brand, next-action, degraded capability |
| Workspace switcher | Shell | Multi-workspace users | Trigger from shell; exit to destination workspace home | Membership list; select workspace | loading, empty impossible, stale membership, keyboard selection |
| Activity | `/w/{slug}/activity` | All members | Workspace shell | Jobs/events; filter/open job | empty, queued, running, retrying, unknown, failed, done |
| Job detail | `/w/{slug}/activity?job={id}` or owning detail | Authorised members | Durable job ID | Job events, attempts, linked artifact | reconnecting, stale lease, retry scheduled, dead letter |
| Notifications | `/w/{slug}/notifications` | All members | Workspace shell | Notification list; mark read/open object | empty, loading, malformed deep link |
| Operations jobs | `/w/{slug}/operations/jobs` | Owner/Admin | Operational role | Jobs, attempts, traces; retry/cancel | queue loss, dead letter, unauthorised, recovery success |
| Integrations | `/w/{slug}/settings/integrations` | Owner/Admin | Settings | Credential metadata; add/rotate/revoke reference | unconfigured, validating, active, expired, rotation failed |
| Members | `/w/{slug}/settings/members` | Owner/Admin | Settings | Memberships; invite/change/remove | empty, pending, stale role, last-owner destructive block |
| Workspace data | `/w/{slug}/settings/data` | Owner/Admin | Settings | Export/delete state | calculating, ready, expired export, deletion confirmation |

## 3. Brand Screens

| Screen | Route | Roles | Entry / exit | Primary actions | State requirements |
|---|---|---|---|---|---|
| Brand list | `/brands` | Owner/Admin/Client Manager | Workspace | Create/open brand | empty with Create brand; loading; archived filter |
| Brand intake | `/brands/new` | Owner/Admin/Client Manager | Workspace capability | Submit permitted URL/files and optional brand type | URL invalid, unsupported brand type, rights missing, upload scanning, partial uploads, success run |
| Crawl run | `/brands/{id}/runs/{runId}` | Owner/Admin/Client Manager | Intake run | Observe, cancel before external side effect, retry safe stage | queued, crawling universal, crawling vertical, selected/detected conflict, partial, blocked, failed, candidates ready |
| Brand review | `/brands/{id}/profiles/{profileId}/review` | Owner/Admin/Client Manager | Candidates ready | Edit universal/vertical candidate, approve/reject | low confidence, source conflict, selected/detected conflict, missing required field, stale version |
| Brand detail | `/brands/{id}` | Relevant production roles | Brand exists | Open active profile/assets/rules | no approved profile, approved, superseded |
| Brand assets | `/brands/{id}/assets` | Brand roles | Brand exists | Upload/approve/revoke | quarantine, validating, clean, rejected, revoked |
| Brand rules | `/brands/{id}/rules` | Owner/Admin/Client Manager | Brand exists | Add required/prohibited rule | empty, duplicate, conflicting rule |

The active standalone branding app route is `/app/branding`, with refresh-safe detail state
at `/app/branding?crawlRunId=<uuid>`. `/brand-extract` is the direct brand-extraction
frontend entry for the same screen contract; it must resolve the same tenant-scoped crawl-run
truth and must not create a separate workflow. It is available to authenticated Owner, Admin
and Client Manager actors and resolves the same tenant-scoped crawl-run truth as the workspace
brand routes. Required states are blank, onboarding missing, ready to scan, upload pending,
queued, running, partial, failed, candidates ready, approval required and approved. Primary
actions are Scan URL, Upload brand assets, Review candidates, Request missing assets and
Approve this profile. The screen never shows Firecrawl credentials, raw provider payloads,
object keys, signed URLs, prompt material or extracted values as approved truth before the
approval endpoint creates an immutable brand profile version.
The intake state may include a brand type selector. The crawl detail and review states must
show universal candidate groups first, then the selected or detected vertical group, plus
any selected/detected conflict and retained-asset rights state.

## 4. Blueprint Screens

| Screen | Route | Roles | Entry / exit | Primary actions | State requirements |
|---|---|---|---|---|---|
| Blueprint library | `/blueprints` | Owner/Admin/Client Manager | Approved brand selected | Select/open/start discovery | empty, loading, incompatible, archived |
| Path selection | `/blueprints/new` | Creation roles | Approved brand | Choose existing or new discovery | no library, stale selected brand, explicit choice |
| Candidate search | `/discover` | Creation roles | New discovery chosen | Search/filter/select | empty before search, searching, no results, provider delayed/failed |
| Candidate detail | `/discover/{candidateId}` | Creation roles | Candidate exists | Inspect metrics/rights; extract | stale metrics, missing rights, provider payload partial |
| Blueprint stages | `/blueprints/{id}/stages` | Creation roles | Extraction created | Observe/retry permitted stage | per-stage queued/running/retrying/failed/blocked/partial |
| Blueprint detail | `/blueprints/{id}` | Production roles | Ready or historical blueprint | Use for scripts; inspect formula/prompt | pending, ready, blocked, failed, archived |

## 5. Script Screens

| Screen | Route | Roles | Entry / exit | Primary actions | State requirements |
|---|---|---|---|---|---|
| Tournament list | `/scripts` | Creation roles | Workspace | Create/open tournament | empty, loading, status filters |
| New tournament | `/scripts/new` | Owner/Admin/Client Manager | Approved brand + ready formula | Set objective/constraints; generate | malformed constraints, stale brand/blueprint, blocked claim |
| Tournament detail | `/scripts/{id}` | Creation roles | Tournament exists | Observe variants/evaluations | generating, partial-valid, evaluating, failed |
| Script comparison | `/scripts/{id}/compare` | Owner/Admin/Client Manager | Ready for selection | Compare/select exact variant | no valid variants, stale selection, already selected |

The web shell implements the script tournament and script comparison workflow at
`apps/web/src/script-tournament-workflow.mjs`. A Client Manager runs a ready blueprint
tournament through the generated `V0Client.createScriptTournament`, the workflow renders
10-20 variants with evaluations and eligibility, and a confirmed selection calls
`V0Client.selectScriptVariant`. The workflow exposes empty, loading, error, stale,
disabled (ineligible variant), already-selected and success states as `data-state`
attributes; selection is never optimistic and is confirmed before the irreversible call.

## 6. Avatar, Credits and Generation Screens

| Screen | Route | Roles | Entry / exit | Primary/destructive actions | State requirements |
|---|---|---|---|---|---|
| Avatar catalogue | `/avatars` | Owner/Admin/Client Manager | Approved brand | Select/manage allowed avatar; revoke consent (V0-A2) | empty, consent missing, expiring, expired, revoked, service pending, forbidden, cross-workspace hidden |
| Credits | `/credits` | Owner/Admin/Client Manager | Workspace wallet | View ledger/purchase | loading, zero balance, pending purchase, reconciliation mismatch |
| Purchase credits | `/credits/purchase` | Owner/Admin/Client Manager | Wallet | Start payment | amount invalid, provider pending, callback delayed, failed, succeeded |
| New generation | `/generate/new` | Owner/Admin/Client Manager | Selected script + eligible avatar | Estimate, confirm reservation | estimating, stale estimate, insufficient credit, price changed |
| Generation detail | `/generations/{id}` | Owner/Admin/Client Manager | Generation created | Observe/cancel where safe | queued, submitting, accepted, unknown-checking, generating, generated, failed, cancel requested |

The web shell implements the avatar catalogue workflow at
`apps/web/src/avatar-workflow.mjs`. A Client Manager loads the catalogue for an
approved brand profile through the generated `V0Client.listAvatars`, the workflow
renders eligible, expired, revoked, consent-missing and service-pending avatars as
`data-state` attributes, and ineligible avatars render a disabled Select control and
never advance. There is no V0 public avatar mutation endpoint, so selection is a
local client-side decision for the next generation step and is never an optimistic
paid or publishing action. Consent evidence is never rendered.

V0-A2 consent revocation (`POST /avatars/{avatarProfileId}/consent-revocation`) is a
confirmation-dialog action on an eligible avatar in the catalogue: the actor must
enter a reason and confirm before the monotonic, audited revocation is submitted. A
revoked avatar immediately renders `data-state="revoked"` with the disabled Select
control and the "Revoked" label, and is blocked at the next generation estimate with
`AVATAR_CONSENT_REVOKED` shown as a recovery state, never as an optimistic action. A
cross-workspace or missing avatar is hidden behind `WORKSPACE_ACCESS_DENIED` (404) with
no owned-workspace leak.

V0-A2 credential rotation (`POST /workspaces/{workspace_id}/service-credentials/{credentialId}/rotate`)
is a confirmation-dialog action on the Integrations screen: the actor supplies a new
`secret-manager://` reference and a reason and confirms before the prior credential is
marked `revoked` and the fresh `active` credential is shown. The prior `secretRef` is
never rendered, and a rotation input carrying a plaintext secret field is rejected with
`VALIDATION_FAILED`. The Integrations screen renders the `rotation failed` recovery
state when rotation is rejected, never as an optimistic action.

## 7. Composition and Review Screens

| Screen | Route | Roles | Entry / exit | Primary/destructive actions | State requirements |
|---|---|---|---|---|---|
| Composition | `/compositions/{id}` | Owner/Admin/Client Manager | Retained generated asset | Enter direction; validate; render | planning, malformed plan, unsupported capability, validated, rendering, rendered, render-failed, crash-recovery |
| Final video | `/videos/{id}` | Production/review roles | Render exists | Inspect/download/create revision | rendering, rendered, failed, superseded, signed URL refresh, revision lineage |

V0-C1 implements the validation surface of the Composition screen. The browser workflow
(`apps/web/src/composition-plan-workflow.mjs`) is never optimistic: it shows loading, calls
`POST /composition-plans`, and renders the committed plan or a calm error. Banner states map
the API outcome: `validated`, `validation_failed`, and the access/AE error banners
`blocked-hidden` (`WORKSPACE_ACCESS_DENIED`), `forbidden` (`PERMISSION_DENIED`),
`malformed-plan` (`AE_PLAN_SCHEMA_INVALID`), `missing-asset` (`AE_ASSET_MISSING`),
`unsupported-capability` (`AE_CAPABILITY_UNAVAILABLE`) and `invalid-timeline`
(`AE_TIMELINE_INVALID`). The plan artifact sha256, asset ids, signed URLs and secrets never
appear in the rendered markup.

V0-C2 implements the render surface of the Composition screen and the Final video screen.
The browser workflow (`apps/web/src/composition-render-workflow.mjs`) is never optimistic:
it shows loading, calls `POST /composition-plans/{id}/render` with an idempotency key, and
renders the committed `RenderAttempt`/`FinalVideo` or a calm error. Banner states map the
API outcome: `rendered` (attempt `succeeded`, final video `current`), `render-failed`
(`AE_RENDER_FAILED`), `unsupported-capability` (`AE_CAPABILITY_UNAVAILABLE`),
`crash-recovery` (`DEPENDENCY_UNAVAILABLE` while the attempt is `running`) and
`blocked-hidden` (`WORKSPACE_ACCESS_DENIED`). A revision supersedes the prior final video
without overwriting it; the revision lineage is rendered as an immutable list. The render
attempt output hash, golden render hash, render-logs payload, signed URLs and secrets never
appear in the rendered markup; only the public final-video sha256, version and status do.
`unknown` is preserved for an uncertain worker outcome and never collapsed to success or
failure.
| Review queue | `/reviews` | Review participants | Workspace | Open assigned review | empty, loading, role-filtered |
| Review item | `/reviews/{id}` | Comment roles; decision roles restricted | Exact final video | Comment, request changes, approve/reject | media processing, comment failure, stale/superseded, approved/rejected, decision-loading, decision-recorded, decision-already-recorded, decision-invalid, idempotency-conflict |

## 8. Calendar, Publishing and Lineage Screens

| Screen | Route | Roles | Entry / exit | Primary/destructive actions | State requirements |
|---|---|---|---|---|---|
| Calendar | `/calendar` | Publishing roles; Reviewer read if assigned | Workspace | Open/create schedule | empty, timezone display, conflict, loading |
| New schedule | `/calendar/new` | Owner/Admin/Client Manager | Exact approved video | Select platform/account/time; export; edit pre-submit post | invalid/past time, unauthorised account, stale approval, blocked-hidden, missing-idempotency, approval-required, media-stale, schedule-invalid, idempotency-conflict, post-invalid, post-scheduled, manual-export-ready, edit-loading, edit-saved, version-stale, post-locked, unknown |
| Post detail | `/posts/{id}` | Publishing roles | Calendar post | Edit pre-submit post; publish, verify, provide manual URL, cancel before submit | scheduled, submitting, accepted, unverified, retrying, mismatch, verified, failed, publish-loading, publish-accepted, publish-submitting, publish-processing, unknown-checking, reconcile-loading, publish-failed, account-mismatch, not-submittable, quota-exhausted, platform-unsupported, callback-invalid, post-invalid, idempotency-conflict, missing-idempotency, version-stale, post-locked, verify-loading, processing-wait, identity-mismatch, visibility-restricted, manual-url-required, verify-invalid, verify-failed, forbidden, blocked-hidden, duplicate-collapsed, evidence-shown, notification-shown, unknown |
| Performance | `/posts/{id}/performance` | Authorised production roles; NOT Reviewer | Verified calendar post | Collect observed metrics (Idempotency-Key) | empty, loading, awaiting-collection, observed, stale, not-observable, collect-loading, collect-ready, collect-replay, processing-wait, missing-idempotency, idempotency-conflict, performance-invalid, forbidden, blocked-hidden, unknown |
| Lineage | `/lineage/{finalVideoId}` | Authorised production roles; NOT Reviewer | Final video | Inspect/export manifest | loading, lineage-ready, incomplete, blocked (hash mismatch), lineage-invalid, forbidden, blocked-hidden, unknown |

## 9. Confirmation Dialogues

| Action | Required content |
|---|---|
| Approve brand | Brand/profile version, changed fields, permanence of historical lineage |
| Reserve and generate | Script ID, avatar, estimated cost, maximum authorisation |
| Cancel generation | Current provider state and whether reconciliation must continue |
| Approve video | Final-video version and fingerprint |
| Publish | Platform, exact account, exact video, caption and schedule |
| Retry/reconcile | Existing operation identity; explicit statement that no duplicate is created |
| Revoke consent | Person/voice scope and immediate future-use impact |
| Delete workspace | Export option, retention exceptions and typed workspace name |

## 10. Responsive Rules

- `<768px`: single-column, bottom navigation, sheets instead of side inspectors.
- `768-1199px`: compact rail navigation and two-column detail where media remains legible.
- `>=1200px`: full navigation; optional evidence/comment inspector.
- No critical action depends on hover.
- 9:16 media remains fully visible or uses an explicit full-screen mode.
- Comparison tables become stacked cards while preserving labels and selection context.

## 11. Accessibility Rules

- Each screen has one `h1` and a meaningful document title.
- Initial focus follows route intent; errors receive a summary focus target.
- Async transitions announce only meaningful state changes.
- Progress has a textual status and does not invent a percentage.
- Dialogues name the affected object and return focus to the invoking control.
- Media includes captions/transcript access and keyboard controls.
- Errors identify fields in text and programmatic descriptions.
- Target size, focus, contrast and reduced motion follow `DESIGN.md`.

## 12. Extension Rule

Before implementing a slice, its routes and screens must be present in this inventory.
Changing a route, role, destructive action or state requires updating this document,
`V0_INFORMATION_ARCHITECTURE.md`, the generated OpenAPI contract and affected tests in
the same change.
