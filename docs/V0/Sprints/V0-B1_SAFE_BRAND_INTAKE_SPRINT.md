# V0-B1 Sprint: Safe Brand Intake

## Sprint Objective

Let a client manager submit a website URL and approved files, preview crawl/upload scope
and receive a durable intake run without unsafe network access or unacknowledged rights.

## Source Contracts

- `../V0_BRAND_PROFILE_CONTRACT.md`
- `../V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`
- `../V0_SECURITY.md`
- `../V0_API.md`
- `../../Project/Security/PROJECT_SECURITY_PRIVACY_AND_RIGHTS_METHODOLOGY.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Normalize URLs and display crawl scope before execution.
- Accept an optional V0 brand type selection for later Firecrawl vertical routing without
  treating it as approved brand truth.
- Record robots, policy and permitted crawl decisions.
- Block SSRF, private IP ranges, unsafe redirects and oversized downloads.
- Associate uploaded assets with rights declarations.
- Reuse F3 artifact validation for brand assets.
- Create durable `BrandCrawlRun`, `BrandAsset`, `Artifact` and `Job` records with crawl
  scope, rights acknowledgement and selected brand type when supplied.
- Build intake status UI with blocked, queued, running, failed and ready states.

## TDD And Verification Plan

First failing test: private/link-local/metadata URLs, unsafe redirects, unsupported files
or missing rights acknowledgement become accepted intake runs.

Required tests:

- SSRF and unsafe redirect suite.
- Malformed/unsupported file suite.
- Missing rights acknowledgement rejection.
- Browser intake journey for URL plus files.

## Security And Guardrails

- Raw customer URLs and uploaded files are workspace-scoped and never leaked across
  tenants.
- Crawling only uses permitted scope.
- Brand candidates remain unapproved until B3.

## Completion Evidence

- Crawl-scope audit record.
- SSRF and malformed-file test output.
- Browser screenshots for preview, submit and blocked states.
- Artifact IDs and hashes for accepted uploads.
