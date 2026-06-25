# Implemented changes: V0-B1 safe brand intake

Date: 2026-06-24

## Behaviour

Added the first V0-B1 public behaviour: a client manager can submit a public brand
website URL, acknowledge source rights, attach clean uploaded brand artifacts with rights
basis and receive a durable queued brand crawl run.

## Changes

- Added `POST /brands/crawl-runs` to the V0 OpenAPI contract and generated client.
- Added `BrandCrawlRun` and `BrandAsset` Prisma models and migration
  `0008_v0_b1_safe_brand_intake` with workspace RLS policies.
- Added API/store creation for URL normalization, SSRF target blocking, rights
  acknowledgement enforcement, clean artifact association, `brand_crawl` job creation
  and outbox wake-up persistence.
- Updated V0 API, data model and Prisma docs for the B1 intake contract.

## Verification

- Red: `node --test tests\contract\openapi-generation.test.mjs`
- Red: `node --test tests\unit\db-schema.test.mjs`
- Red: `node --test tests\integration\brand-intake-b1.test.mjs`
- Green: `node --test tests\contract\openapi-generation.test.mjs`
- Green: `node --test tests\unit\db-schema.test.mjs tests\unit\verify-script.test.mjs`
- Green: `node --test tests\integration\brand-intake-b1.test.mjs`

Full `pnpm verify` remains required after migration application.
