# V0-B2A Sprint: Firecrawl Brand Crawl Backend Revamp

## Sprint Objective

Integrate the fixed Firecrawl universal brand crawl and the selected/detected vertical
brand crawl into the V0 backend so a brand crawl run can produce retained, evidence-backed
universal and vertical brand candidates without exposing provider secrets or approving
brand truth.

## Slice, Contract And Behaviour

**Slice:** V0-B1/V0-B2 backend extension before V0-B3 approval.  
**Gate:** V0-G1 Brand.  
**Behaviour:** Owner/Admin/Client Manager starts a safe brand crawl with an optional
brand type, the backend runs universal extraction first, then one vertical pass, stores
retained asset/evidence artifacts and returns grouped candidates for later approval.

## Source Contracts

- `../V0.md`
- `../V0_PRODUCT_SPECIFICATION.md`
- `../V0_VERTICAL_OUTCOME_SLICES.md`
- `../V0_FIRECRAWL_BRAND_ASSET_ACQUISITION_PLAN.md`
- `../V0_API.md`
- `../V0_DATA_MODELS.md`
- `../V0_PRISMA_SCHEMA.md`
- `../V0_JOBS.md`
- `../V0_STATUS_ENUMS.md`
- `../V0_ERROR_CATALOG.md`
- `../V0_SECURITY.md`
- `../V0_TESTING.md`
- `../V0_BRAND_PROFILE_CONTRACT.md`
- `../V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`
- `../Features/Firecrawl/brand-crawl-universal.md`
- `../Features/Firecrawl/brand-crawl-verticals.md`
- `../../Project/Guardrails/PROJECT_GUARDRAILS.md`
- `../../Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `../../Project/DESIGN.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `../../Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `../../Project/Governance/karpathy_SKILL.md`

## Sprint Backlog

- Add optional `brandType` to the brand crawl request contract using the allowed V0 brand
  type keys from `V0_FIRECRAWL_BRAND_ASSET_ACQUISITION_PLAN.md`.
- Persist selected brand type, detected brand type, extraction schema version, universal
  artifact reference, vertical artifact reference, media inventory reference and provider
  credit telemetry on `BrandCrawlRun` or in its documented `crawlScope`/artifact fields.
- Add `brand.extraction.output.v3` schema fixtures for universal plus vertical output.
- Implement a Firecrawl adapter boundary for universal scrape calls from
  `brand-crawl-universal.md` without modifying that guide.
- Implement vertical routing from selected type or universal `schema_org_type` /
  `vertical_signals`, then run only the matching section from `brand-crawl-verticals.md`.
- Retain selected/detected type conflicts as candidate evidence instead of silently
  overriding either value.
- Download eligible image, screenshot and document assets through quarantine, validation
  and clean artifact promotion when rights permit retention.
- Expand candidate extraction for visual identity, messaging, social proof, voice,
  product/service, claim, publishing/social and vertical conflict groups.
- Map Firecrawl timeout, refused, empty, schema-invalid, partial and malformed responses to
  stable V0 errors and job events.
- Regenerate OpenAPI/client artifacts and inspect the contract diff.

## First Failing Behaviour

A `brand_crawl` completion containing Firecrawl universal and real-estate vertical output
is accepted as a generic v2 scrape, loses the selected/detected brand type, does not retain
vertical evidence artifacts and either drops real-estate claim evidence or exposes raw
provider payload details.

## TDD And Verification Plan

Required first tests:

- `POST /brands/crawl-runs` accepts supported `brandType` values and rejects unsupported
  values with `VALIDATION_FAILED`.
- Private, link-local, metadata and unsafe redirect targets still fail before any
  Firecrawl adapter call.
- A deterministic Firecrawl fixture runs universal first, then the selected `real_estate`
  vertical, and produces `brand.extraction.output.v3`.
- A selected/detected mismatch creates a `vertical_conflict` candidate and does not block
  the universal candidate set.
- Empty, refused, schema-invalid or evidence-free Firecrawl output returns
  `PROVIDER_OUTPUT_INVALID` and creates no approved brand truth.
- Cross-workspace reads of crawl runs, asset packs and candidates hide behind
  `WORKSPACE_ACCESS_DENIED`.
- Firecrawl API keys, raw payloads, object keys, signed URLs, prompts and provider crawl IDs
  are absent from public responses, job events, analytics fixtures and retained public
  artifacts.

Nearby tests:

- RLS integration for `BrandCrawlRun`, `BrandCandidate`, `BrandAsset` and `Artifact`.
- Artifact quarantine, hash mismatch, unsupported type and rights-not-permitted cases for
  crawled image/PDF/screenshot assets.
- Idempotency replay for crawl-run creation with the same request identity.
- Job retry mapping for timeout/rate-limit and non-retryable malformed provider output.
- OpenAPI/client generation reproducibility.

## Backend Design Decisions

- **Universal guide is fixed:** implementation reads and follows
  `brand-crawl-universal.md`; sprint work may not rewrite that document.
- **Universal first:** even when the user selects a brand type, universal extraction runs
  before the vertical pass so all brand profiles share the same base evidence contract.
- **One vertical pass:** the backend runs only one vertical section per crawl run. Running
  multiple verticals would multiply cost, complicate evidence and blur approval.
- **Selection is not truth:** user-selected type controls crawl depth; detected type remains
  evidence. A mismatch is a candidate conflict for human review.
- **Provider cost is operational telemetry:** Firecrawl credits are retained for evidence
  and operations, but they do not become creator-credit billing until a separate pricing
  contract authorises it.
- **Assets are candidates:** crawled images, screenshots and PDFs can be retained for later
  use only through rights, quarantine and approval. Provider URLs are never production
  asset sources.

## Security And Guardrails

- Firecrawl API key is server-side only and must never enter browser code, logs, analytics,
  prompts, public API responses or retained public artifacts.
- Crawler SSRF, redirect, robots/policy, size and downloadable-document controls remain in
  force before provider calls.
- Provider payloads stay adapter-private and are normalised before persistence.
- Every tenant-owned row carries `workspace_id`; runtime roles do not bypass RLS.
- Extracted values are candidates only. Production APIs accept only approved
  `BrandProfile` versions from V0-B3.
- Prompt injection from crawled pages is treated as hostile content and cannot influence
  system instructions or approval.

## Backend-To-Frontend Implications

Frontend work is not in this sprint, but the backend must return enough stable data for a
later UI to show:

- brand type selector options and the selected type;
- detected type and detection evidence;
- universal candidate groups;
- vertical candidate groups;
- selected/detected conflict state;
- skipped pages, fallback pages and partial extraction warnings;
- retained asset candidates with rights state and source evidence;
- missing required approval fields.

Do not introduce optimistic UI behaviour for crawl start, asset retention or brand
approval. The UI must read canonical backend/job status.

## Completion Evidence

- Red/green output for the first failing public-behaviour tests.
- Contract fixtures for `brand.extraction.output.v3`.
- OpenAPI/client generation output with inspected diffs.
- RLS and cross-workspace test output.
- Secret/redaction scan proving Firecrawl key, raw provider payloads and signed URLs are
  absent from public surfaces.
- Artifact hashes for retained universal output, vertical output, media inventory and any
  promoted clean assets.
- Job event trace showing universal pass before vertical pass.
- Gap review against `V0_FIRECRAWL_BRAND_ASSET_ACQUISITION_PLAN.md`.

## Known Gaps To Close During Implementation

- Decide the exact schema placement for selected/detected brand type after inspecting the
  executable Prisma schema: dedicated columns or versioned fields inside `crawlScope`.
- Define the final JSON Schema for `brand.extraction.output.v3`.
- Confirm whether production Firecrawl mode uses queue-processor network calls or a
  private worker, while preserving the rule that browser code never calls Firecrawl.
- Extend approval UI contracts in a later frontend sprint so new candidate groups can be
  reviewed without inventing labels or statuses.
