# Implemented changes: V0-B2 evidence-backed brand candidate extraction

Date: 2026-06-24

## Behaviour

Added first V0-B2 behaviour: `brand_crawl` worker completion accepts deterministic
Firecrawl-like scrape output and stores evidence-backed brand candidates only. Extracted
values remain `decision: candidate`; B3 approval still gates brand truth.

## Changes

- Added `BrandCandidate` Prisma model and migration
  `0009_v0_b2_brand_candidate_extraction` with workspace RLS.
- Added deterministic extraction script for summary, USPs, CTAs, audiences, colors,
  fonts, logo candidates and prohibited-claim candidates.
- Added prompt-injection isolation for scraped text before candidate creation.
- Added `GET /brands/crawl-runs/{crawl_run_id}/candidates` to generated API/client.
- Added worker completion branch for `brand_crawl`, retaining extraction events and
  rejecting refused, empty, malformed or evidence-free output.
- Added B2 candidate review UI surface with provenance, partial and low-confidence states.
- Used Firecrawl branding references for scrape payload shape: colors, typography,
  logo candidates, button/CTA context, personality and target audience.

## Verification

- Red: `node --test tests\unit\brand-extraction-script.test.mjs`
- Red: `node --test tests\unit\db-schema.test.mjs`
- Red: `node --test tests\contract\openapi-generation.test.mjs`
- Red: `node --test tests\integration\brand-extraction-b2.test.mjs`
- Red: `node --test tests\e2e\web-workspace.test.mjs`
- Green: same focused commands after implementation.
- Screenshot: `docs/V0/Evidence/V0-B2_CANDIDATE_REVIEW_UI_2026-06-24.png`

Full `pnpm verify` passed after migration application.
