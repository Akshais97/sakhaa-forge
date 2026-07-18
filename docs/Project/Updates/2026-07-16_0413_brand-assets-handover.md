# Brand assets handover

**Recorded:** 2026-07-16 04:13 IST  
**Scope:** Approved Brand Profile Constructor RCA and reusable frontend component preview  
**V0 slices:** V0-F3, V0-B2, V0-B2A, V0-B3

## Completed

- Confirmed the Superpowers plugin was already installed and enabled under the Codex plugin cache. Used its systematic debugging, brainstorming, and design workflow.
- Read the owning V0 API, brand profile, permissions, errors, data, screen, design, guardrail, workflow, and governance contracts before diagnosis.
- Traced and reproduced the asset, approval, and candidate-status paths.
- Wrote the detailed RCA at `docs/V0/RCA_findings/BRAND_ASSET_APPROVAL_AND_CANDIDATE_STATUS_RCA_2026-07-16.md`.
- Recorded the approved reusable-component design at `docs/superpowers/specs/2026-07-16-brand-assets-component-preview-design.md` and committed it as `794d271`.
- Added a component-only review route at `/brand-extract/components`.
- Added reusable components under `apps/web/app/brand-extract/_components/brand-assets/`:
  - Liquid Ether-style WebGL background with static/reduced-motion fallback
  - controlled swipeable brand-intake step deck
  - magnetic Next-step cue
  - secure artifact thumbnail states
  - horizontally scrollable Acquired Brand Assets cupboard with add/remove controls
- Added `three` and `@types/three` to the web package and lockfile.
- Added `tests/unit/brand-assets-component-preview.test.mjs` after first recording the expected red failures.

## RCA conclusion

The reported console errors have separate causes:

1. `artifact:<id>` is an opaque private-artifact identifier but is passed directly to `<img src>` and `<a href>`, causing `ERR_UNKNOWN_URL_SCHEME`. It must first be exchanged for an authorized short-lived download URL.
2. Some Firecrawl branding fields bypass consistent URL normalization, allowing malformed source locators into the review UI. The acquisition worker can correctly reject these before B2 retention.
3. Final approval uses raw `fetch` without the bearer token, directly causing 401. Its payload and response handling also differ from the canonical generated B3 contract.
4. Candidate status succeeds for a fresh authorized session/crawl/candidate tuple. The historical protected 404 indicates a stale or mismatched tenant tuple, compounded by regenerated demo sessions, optimistic UI, and an undocumented mutation outside the generated client.

Missing thumbnails do not cause the approval 401 or candidate-status 404. The `artifact:` browser error is not evidence that a clean B2 object is missing because that failed request never reaches B2.

## Fresh verification

- `node --test tests/unit/brand-assets-component-preview.test.mjs` — 4 passed.
- `pnpm --filter @sakhaa-forge/web lint` — passed.
- `pnpm --filter @sakhaa-forge/web build` — passed; `/brand-extract/components` was statically generated.
- Live request to `http://localhost:3005/brand-extract/components` — HTTP 200 with title `Component review · Sakhaa Forge`.
- `git diff --check` — passed.

The preview was opened locally for user review. It is isolated from the live constructor and performs no API or brand-data mutations.

## Current worktree and ownership caution

User-owned changes that existed before this work remain in:

- `apps/api/src/workspace-store.mjs`
- `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`
- `docs/V0/RCA_findings/FIRECRAWL_BRAND_CRAWL_ISSUE_FIX.md`

Do not overwrite or revert them. The new RCA, component preview, component test, dependency changes, and lockfile changes are not yet committed. Generated build changes to `next-env.d.ts` and `tsconfig.tsbuildinfo` were removed after verification.

## Next step

Run the remaining repository-wide verification gates, inspect generated-contract and
worktree diffs, and review the uncommitted documentation changes. Do not mark any V0 slice
accepted unless all owning acceptance evidence passes.

## Liquid Ether revision and implementation plan

- Replaced the custom cloud/noise shader with the source-faithful ReactBits Liquid Ether fluid solver.
- Added the approved palette and settings: `#5227FF`, `#FF9FFC`, `#B497CF`, force `20`, cursor `100`, viscosity `30`, both iteration counts `32`, resolution `0.5`, auto speed `0.5`, intensity `2.2`, takeover `0.25`, resume delay `3000`, and ramp `0.6`.
- Preserved reduced-motion, WebGL-failure, off-screen, and document-visibility fallbacks.
- Updated the approved component design record to distinguish the real fluid solver from the rejected cloud shader.
- Wrote the detailed Superpowers plan at `docs/superpowers/plans/2026-07-16-approved-brand-assets-production-integration.md`.
- The plan also records a second approval contract drift: `apps/web/src/workflow/v0-actions.ts` uses the obsolete approval payload, and the live constructor claims an `approvalHash` that the canonical B3 response does not return.
- Fresh verification: component test 4/4 passed, strict web type-check passed, production build passed, `/brand-extract/components` returned HTTP 200, and `git diff --check` passed.

## Production integration update

- Generated the missing candidate-decision client method.
- Normalised retained branding locators and prevented malformed source values from being
  promoted as clean retained assets.
- Added authorised short-lived artifact downloads with retry and unavailable states; no
  browser media element receives an `artifact:` URL.
- Changed candidate decisions and final brand approval to server-confirmed generated
  client operations with tenant-hidden and stale-version recovery.
- Added the Acquired brand assets cupboard to the live constructor. Removing an item
  changes only the pending profile selection; retained evidence remains intact.
- Prevented a newly persisted brand identity from resetting an in-flight crawl to step 1.
- Integrated the source-faithful ReactBits Liquid Ether solver and native magnetic Next
  cue. The background starts with a static hydration-safe layer and remains static for
  reduced motion or WebGL failure.

Fresh focused verification:

- Brand component/frontend unit tests: 18 passed.
- Playwright and Selenium browser automation: 2 passed.
- Strict web TypeScript check: passed.
- Optimised Next.js production build: passed; 15 routes generated.
- Focused artifact, brand-intake and B3 integration tests: 10 passed.
- Contract tests: 2 passed.
- Full unit suite: 270 passed.
- Full E2E suite: 18 passed.
- `git diff --check`: passed.
- Generated OpenAPI and client diff inspection: no unexplained diff.

The repository `pnpm verify` gate remains incomplete. Contract generation, Prisma client
generation, migrations, format, lint, type checks and the general test command completed,
but the dedicated Prisma runtime proof failed. With temporary localhost services stopped,
the narrow proof still returned `500` instead of `200` for the outbox relay recovery
assertion in `tests/integration/prisma-runtime.test.mjs:168`; the full run also reported
transaction failures including Prisma `P2028` and `RUNTIME_DB_WRITE_FAILED`. This is not
presented as a brand-assets acceptance failure, but V0 slice acceptance must remain open
until the owning database/runtime issue is resolved and `pnpm verify` exits zero.

The latest integration and documentation edits remain uncommitted at the project owner's
request.
