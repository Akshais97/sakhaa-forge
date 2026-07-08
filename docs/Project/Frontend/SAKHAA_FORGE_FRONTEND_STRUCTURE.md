# Sakhaa Forge frontend structure

Status: current frontend replacement map for `apps/web`.

## Purpose

The frontend now separates the public Sakhaa Forge landing experience from the authenticated V0
application. The public landing is repurposed from `sakhaa-forge/src` and its parent Vite project:
brand switching, a hero product theatre, workflow stage navigation, a bottom progress rail and an
access modal were rebuilt as Next/React code inside `apps/web`. The authenticated application stays
a backend-shaped command surface and does not become a landing-page demo.

The implementation does not copy unsupported V1/V2 claims from the source landing. It keeps the
source design energy but limits product language to V0: approved brand truth, observed structure,
script selection, paid generation, exact-version review, publication and audience verification.

## Files

| File | Role |
|---|---|
| `apps/web/app/page.tsx` | Thin server entry for the public landing. It imports the retained Sakhaa Forge landing component. |
| `apps/web/app/sakhaa-forge-landing.tsx` | Client-side landing port derived from `sakhaa-forge/src/App.tsx`, `src/data.ts`, `src/components/Header.tsx`, `src/components/HeroScene.tsx`, `src/components/NarrativePanel.tsx`, `src/components/DynamicMockup.tsx`, `src/components/ProgressBar.tsx` and `src/components/AccessModal.tsx`, rewritten without Vite, Tailwind, `motion/react` or `lucide-react` dependencies. |
| `apps/web/app/w/[workspaceSlug]/[[...segments]]/page.tsx` | Authenticated workspace command centre. It renders the active backend step, server truth, retained evidence and next dependency. |
| `apps/web/app/workspace-screen-model.ts` | Frontend route and production-step model derived from the V0 backend slice order. |
| `apps/web/app/globals.css` | Separate `source-forge-*` landing styles plus command-centre and public/auth screen styles. |
| `apps/web/app/public-screen.tsx` | Shared public-safe surface for sign-in, callback, access denied and service status. |
| `apps/web/src/*-workflow.mjs` | Existing deterministic state/render helpers retained for future screen wiring and tests. |

## Route shape

| Route | Current purpose |
|---|---|
| `/` | Public Sakhaa Forge landing page retained from `sakhaa-forge/src` and adapted to V0. |
| `/sign-in` | Public-safe sign-in placeholder surface. |
| `/auth/callback` | Public-safe auth callback placeholder surface. |
| `/access-denied` | Existence-hiding access-denied surface. |
| `/service-status` | Public-safe status surface. |
| `/w/{workspaceSlug}` | Workspace foundation step. |
| `/w/{workspaceSlug}/brands` | B1-B2A-B3 brand truth step, including Firecrawl universal/vertical candidate review. |
| `/w/{workspaceSlug}/blueprints` | P1-P5 blueprint and candidate step. |
| `/w/{workspaceSlug}/scripts` | S1-S2 script tournament step. |
| `/w/{workspaceSlug}/generate/new` | G1-G5 paid generation step. |
| `/w/{workspaceSlug}/reviews` | R1-R2 review and approval step. |
| `/w/{workspaceSlug}/calendar` | U1-U4 schedule, publish and verify step. |
| `/w/{workspaceSlug}/lineage/final-video` | Lineage, performance and hardening step. |

## Landing and app boundary

| Surface | Source | Purpose | Current data mode |
|---|---|---|---|
| Landing | `sakhaa-forge/src` port | Public product story, brand switcher and workflow walkthrough. | Local deterministic presentation data only; no secrets and no provider calls. |
| Workspace app | `apps/web/app/w/[workspaceSlug]/[[...segments]]/page.tsx` | Authenticated V0 command centre aligned to backend slices. | Backend-shaped model pending generated-client wiring per screen. |

The landing can use higher-contrast Sakhaa Forge motion and stage energy. The app must keep the
Studio Instrument rules from `docs/Project/DESIGN.md`: server truth before action, no optimistic
paid or publishing states, visible lineage, evidence and recovery.

## Backend alignment

The workspace page intentionally shows four backend-derived blocks for every step:

- `serverTruth`: the backend facts that must load before the user acts.
- `requiredEvidence`: the records or artifacts that must be retained.
- `primaryAction`: the next user action allowed by the current state.
- `next`: the dependent slice or workflow that follows.

This keeps the UI honest while final API wiring is completed. Paid generation, scheduling,
publishing and verification must not become optimistic UI actions.

## Retained code

The old public and workspace surfaces were replaced. The workflow helper modules in
`apps/web/src` were retained because they encode status mapping and no-leak rendering rules used
by tests. They should be reused when the real API client is connected to individual pages.

## Next wiring rule

Every new screen that calls the API should use generated contracts from `packages/contracts`,
carry the workspace slug/id explicitly, render backend problem codes through the existing workflow
helpers, and avoid exposing signed URLs, object keys, provider payloads, request hashes, consent
evidence or secrets in markup.
