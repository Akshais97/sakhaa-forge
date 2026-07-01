# Route sitemap

## Evidence sources

- Canonical route contract: `docs/V0/V0_INFORMATION_ARCHITECTURE.md`.
- Screen states: `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`.
- API evidence: `packages/contracts/generated/openapi.v0.json`.
- Implemented web shell: `apps/web/src/server.mjs` and workflow modules in `apps/web/src/*.mjs`.

## Implemented web surface

| Route/surface | Status | Evidence | Notes |
|---|---|---|---|
| `/` | Implemented shell | `apps/web/src/server.mjs` serves one HTML page | Current shell is not a Next.js App Router tree. |
| `/script-tournament-workflow.mjs` | Implemented module | `apps/web/src/server.mjs`, `apps/web/src/script-tournament-workflow.mjs` | Client workflow calls generated V0 client. |
| `/avatar-workflow.mjs` | Implemented module | `apps/web/src/avatar-workflow.mjs` | Avatar catalogue and local selection states. |
| `/wallet-ledger-workflow.mjs` | Implemented module | `apps/web/src/wallet-ledger-workflow.mjs` | Ledger read workflow. |
| `/generation-confirmation-workflow.mjs` | Implemented module | `apps/web/src/generation-confirmation-workflow.mjs` | Estimate confirmation and reservation. |
| `/generation-submission-workflow.mjs` | Implemented module | `apps/web/src/generation-submission-workflow.mjs` | Provider submit/reconcile/cancel. |
| `/generation-settlement-workflow.mjs` | Implemented module | `apps/web/src/generation-settlement-workflow.mjs` | Media retention and ledger settlement. |

## Required canonical product routes

All routes below are required by canonical IA but are not implemented as individual Next.js pages in the current codebase.

| Area | Required routes |
|---|---|
| Public/auth | `/`, `/sign-in`, `/auth/callback`, `/access-denied`, `/service-status` |
| Workspace | `/w/{workspaceSlug}`, `/w/{workspaceSlug}/activity`, `/w/{workspaceSlug}/notifications` |
| Brand | `/w/{workspaceSlug}/brands`, `/w/{workspaceSlug}/brands/new`, `/w/{workspaceSlug}/brands/{brandId}`, `/w/{workspaceSlug}/brands/{brandId}/runs/{crawlRunId}`, `/w/{workspaceSlug}/brands/{brandId}/profiles/{profileId}`, `/w/{workspaceSlug}/brands/{brandId}/profiles/{profileId}/review`, `/w/{workspaceSlug}/brands/{brandId}/assets`, `/w/{workspaceSlug}/brands/{brandId}/rules` |
| Blueprint | `/w/{workspaceSlug}/blueprints`, `/w/{workspaceSlug}/blueprints/new`, `/w/{workspaceSlug}/discover`, `/w/{workspaceSlug}/discover/{candidateId}`, `/w/{workspaceSlug}/blueprints/{blueprintId}`, `/w/{workspaceSlug}/blueprints/{blueprintId}/stages` |
| Scripts | `/w/{workspaceSlug}/scripts`, `/w/{workspaceSlug}/scripts/new`, `/w/{workspaceSlug}/scripts/{tournamentId}`, `/w/{workspaceSlug}/scripts/{tournamentId}/compare` |
| Generate | `/w/{workspaceSlug}/avatars`, `/w/{workspaceSlug}/credits`, `/w/{workspaceSlug}/credits/purchase`, `/w/{workspaceSlug}/generate/new`, `/w/{workspaceSlug}/generations/{generationId}` |
| Composition/review | `/w/{workspaceSlug}/compositions/{compositionId}`, `/w/{workspaceSlug}/videos/{finalVideoId}`, `/w/{workspaceSlug}/reviews`, `/w/{workspaceSlug}/reviews/{reviewItemId}` |
| Publishing/lineage | `/w/{workspaceSlug}/calendar`, `/w/{workspaceSlug}/calendar/new`, `/w/{workspaceSlug}/posts/{calendarPostId}`, `/w/{workspaceSlug}/posts/{calendarPostId}/performance`, `/w/{workspaceSlug}/lineage/{finalVideoId}` |
| Settings/operations | `/w/{workspaceSlug}/settings`, `/w/{workspaceSlug}/settings/members`, `/w/{workspaceSlug}/settings/integrations`, `/w/{workspaceSlug}/settings/data`, `/w/{workspaceSlug}/operations/jobs`, `/w/{workspaceSlug}/operations/reconciliation`, `/w/{workspaceSlug}/operations/audit` |

## Conflict found

Canonical IA requires per-workspace durable routes. Current web code serves a single HTML shell at `/` with embedded sections and workflow scripts. This is not a product-flow conflict, but it is an implementation gap.

