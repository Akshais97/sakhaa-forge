# V0-B1 Safe Brand Intake Local Verification

Date: 2026-06-24  
Slice: V0-B1 safe brand intake  
Behaviour: durable brand crawl run creation with SSRF blocking and retained rights

## Scope

This evidence covers the first V0-B1 behaviour only. It does not close B2/B3 brand
extraction or approval work.

## Sources

- `docs/V0/Sprints/V0-B1_SAFE_BRAND_INTAKE_SPRINT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`
- `docs/V0/V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`

## Verification

- Red: `node --test tests\contract\openapi-generation.test.mjs`
  - Failed because `/brands/crawl-runs` and `createBrandCrawlRun` were absent.
- Red: `node --test tests\unit\db-schema.test.mjs`
  - Failed because B1 `BrandCrawlRun`, `BrandAsset` and migration `0008` were absent.
- Red: `node --test tests\integration\brand-intake-b1.test.mjs`
  - Failed because `client.createBrandCrawlRun` was absent.
- Green: `node --test tests\contract\openapi-generation.test.mjs`
- Green: `node --test tests\unit\db-schema.test.mjs tests\unit\verify-script.test.mjs`
- Green: `node --test tests\integration\brand-intake-b1.test.mjs`

## Evidence retained

- Private/link-local metadata URL `http://169.254.169.254/latest/meta-data` returns
  `CRAWL_SSRF_BLOCKED` before creating a run.
- Missing `rightsAcknowledged` returns `SOURCE_RIGHTS_REQUIRED`.
- Public URL `https://Aster.example.com//projects/?utm_source=ad` normalizes to
  `https://aster.example.com/projects/`.
- Clean uploaded artifact is linked as `BrandAsset` with retained rights basis and
  permitted use.
- Successful intake creates `BrandCrawlRun`, `BrandAsset`, queued `brand_crawl` `Job`
  and pending wake-up `OutboxEvent`.
