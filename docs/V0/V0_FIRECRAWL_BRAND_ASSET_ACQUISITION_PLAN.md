# V0 Firecrawl Brand Asset Acquisition Plan

**Status:** Implementation planning note for V0-B1 and V0-B2  
**Scope:** Product V0 only  
**Primary flow:** Company URL -> safe crawl -> Firecrawl-backed extraction -> evidence-backed candidates -> human approval  
**Do not treat this document as approval to use extracted assets in production.** The canonical approval contract remains `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`.

## 1. Source Documents And Code Read

- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`
- `docs/V0/V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`
- `apps/api/src/workspace-store.mjs`
- `apps/api/src/brand-extraction.mjs`
- `packages/db/prisma/schema.prisma`
- Firecrawl v2 scrape, crawl, crawl-status and batch-scrape documentation, checked July 2, 2026.

## 2. First-Principles Workflow

The first brand workflow is not a long brand questionnaire. The initial customer-facing input is the company URL.

The API also requires `rightsAcknowledged: true` before creating the crawl run. That should be presented as a crawl permission and source-use attestation after URL entry and scope preview, not as a brand-data field. The user is not manually filling brand identity, tone, colours, projects or claims at this step.

The system action is:

1. Normalize and validate the public website URL.
2. Block private, local, metadata and unsafe targets.
3. Record crawl scope, robots/policy result and rights acknowledgement.
4. Create `BrandCrawlRun`, associated clean `BrandAsset` rows when approved files exist, a `brand_crawl` `Job`, and outbox wake-up evidence.
5. Let the worker/provider boundary call Firecrawl.
6. Translate Firecrawl output into `brand.extraction.output.v1`.
7. Complete the job through the authenticated worker API.
8. Persist `BrandCandidate` rows with field type, value, confidence, extraction state, source evidence and source fingerprint.

## 3. Firecrawl Capabilities Relevant To V0

Firecrawl v2 supports:

- `POST /v2/crawl` for multi-page crawling from a base URL.
- Crawl scoping through `includePaths`, `excludePaths`, `maxDiscoveryDepth`, `limit`, `crawlEntireDomain`, `allowExternalLinks`, `allowSubdomains`, `sitemap`, `ignoreQueryParameters`, `delay` and `maxConcurrency`.
- `GET /v2/crawl/{id}` for status, totals, completed page count, credits used, timestamps, pagination and page data.
- Scrape formats including `markdown`, `summary`, `html`, `rawHtml`, `links`, `images`, `screenshot`, `json`, `branding`, `product`, `audio`, `video`, `question` and `highlights`.
- Page options including `onlyMainContent`, `onlyCleanContent`, `includeTags`, `excludeTags`, `waitFor`, `mobile`, `timeout`, `parsers: ["pdf"]`, `location`, `removeBase64Images`, `blockAds`, `proxy`, `storeInCache`, `lockdown`, `redactPII` and `zeroDataRetention`.
- Branding extraction for logo, colour palette, typography, spacing, component styles and visual personality.

Firecrawl provider details must stay behind the adapter. Browser UI should show crawl status, page count, evidence, confidence, warnings and next action, not raw Firecrawl request bodies, API keys, provider payloads or cache internals.

## 4. Recommended Firecrawl Request Shape For V0-B1/B2

Use `POST /v2/crawl` for the crawl run, not one unbounded scrape.

```json
{
  "url": "<normalized company URL>",
  "includePaths": ["^/$", "^/about", "^/projects", "^/properties", "^/contact", "^/brochure", "^/rera", "^/legal"],
  "excludePaths": ["^/blog/.*", "^/careers/.*", "^/privacy.*", "^/terms.*"],
  "maxDiscoveryDepth": 1,
  "sitemap": "include",
  "ignoreQueryParameters": true,
  "limit": 5,
  "crawlEntireDomain": true,
  "allowExternalLinks": false,
  "allowSubdomains": false,
  "ignoreRobotsTxt": false,
  "delay": 1,
  "maxConcurrency": 1,
  "scrapeOptions": {
    "formats": ["markdown", "links", "images", "screenshot", "branding"],
    "onlyMainContent": true,
    "onlyCleanContent": false,
    "waitFor": 1000,
    "mobile": false,
    "timeout": 60000,
    "parsers": ["pdf"],
    "location": { "country": "IN", "languages": ["en-IN"] },
    "removeBase64Images": true,
    "blockAds": true,
    "proxy": "auto",
    "storeInCache": false,
    "redactPII": true
  },
  "zeroDataRetention": false
}
```

Implementation notes:

- `limit` must be derived from `BrandCrawlRun.crawlScope.maxPages` and capped by current code at `50`, with V0 UI defaulting to `5`.
- `includePaths` must be generated from `crawlScope.permittedPathPrefixes`. Do not let Firecrawl natural-language `prompt` decide crawl scope for production.
- `allowExternalLinks` should remain `false` for B1. External social/publishing links can be retained as outbound references, not crawled as brand truth.
- `allowSubdomains` should remain `false` until the intake contract explicitly records permitted subdomains.
- `ignoreRobotsTxt` must remain `false`.
- `storeInCache: false` and `redactPII: true` fit V0's privacy posture better than Firecrawl defaults. If `zeroDataRetention` is available for the account, prefer it for customer crawls, but do not rely on it as the only privacy control.
- Use Firecrawl status fields for progress display and internal job events, but map terminal failures to V0 errors such as `CRAWL_TIMEOUT`, `CRAWL_POLICY_BLOCKED`, `DEPENDENCY_UNAVAILABLE` or `PROVIDER_OUTPUT_INVALID` according to cause.

## 5. Brand Assets And Evidence To Acquire

### 5.1 Crawl And Page Evidence

Acquire these as source evidence:

| Asset/evidence | Firecrawl source | V0 use | User-visible? | Retention note |
|---|---|---|---|---|
| Canonical page URL | `metadata.sourceURL` / `metadata.url` | Evidence locator and source fingerprint | Yes | Store hash/locator in `sourceEvidence` |
| Page title | `metadata.title` | Evidence context | Yes | Safe to show |
| Page description | `metadata.description` | Summary, positioning and SEO clue | Yes | Candidate evidence only |
| Language | `metadata.language` | Voice/language candidate | Yes | Candidate evidence only |
| HTTP status | `metadata.statusCode` | Crawl diagnostics | Yes, summarized | Do not expose provider internals |
| Markdown body | `markdown` | Text extraction source | Excerpts only | Retain private artifact or hashed excerpt |
| Links | `links` | Discover brochures, contact pages, RERA/legal pages, CTAs | Yes, selected links | Do not crawl external links by default |
| Screenshot | `screenshot` | Visual evidence for logo/colour/layout candidates | Preview only if retained as safe artifact | Treat as private evidence |
| Page errors | `metadata.error` | Failure state and retry/recovery | Sanitized | Map to stable V0 error |
| Credits used and timing | crawl status | Operations/cost telemetry | Summary only | Provider cost is operational, not brand truth |

### 5.2 Visual Identity Assets

Acquire these as candidates, never approved truth:

| Candidate | Firecrawl source | V0 `fieldType` | Approval requirement |
|---|---|---|---|
| Primary logo URL or embedded logo | `branding.logo`, `branding.images.logo`, `images` | `logo` | Reviewer approves logo or explicit no-logo decision |
| Favicon/icon mark | `branding.images.favicon`, page metadata/images | `logo` or future `icon` | Reviewer approves role and usage |
| Primary/secondary/accent colours | `branding.colors` | `color` | Reviewer approves role and prohibited contexts |
| Background/text/link colours | `branding.colors` | `color` | Reviewer approves if usable in generated creative |
| Font families | `branding.typography.fontFamilies` | `font` | Reviewer approves source/licence/fallback |
| Font sizes/weights | `branding.typography.fontSizes`, `fontWeights` | `font` or future typography rule | Candidate only unless approval schema expands |
| Spacing and radius | `branding.spacing`, `branding.components` | `visual_rule` future field or source summary | Do not force into current `BrandCandidate` unless field type is accepted |
| Button/component styles | `branding.components` | Source summary or future rule candidate | Candidate only |
| Imagery style | screenshots/images | `imagery` future field or source summary | Needs reviewer judgement and rights basis |

Current `apps/api/src/brand-extraction.mjs` supports only `color`, `font` and `logo` visual candidate field types. Spacing, component style and imagery should be retained as source summary evidence or added through an explicit contract update before UI depends on them.

### 5.3 Brand Text And Positioning Assets

Acquire these from page markdown and metadata:

| Candidate | Extraction source | V0 `fieldType` | Notes |
|---|---|---|---|
| Brand summary | First useful page sentence / structured JSON if added | `summary` | Existing extractor supports this |
| Positioning statement | Homepage/about/project pages | `summary` now; future `positioning` preferred | Required for approval, but current extractor does not produce a dedicated type |
| Differentiators/USPs | Copy containing proof/difference statements | `usp` | Existing extractor supports `USPs:` and selected patterns |
| Voice/tone attributes | Copy style, summary, examples | future `tone` or `voice` | Required for approval; needs explicit extractor addition |
| Calls to action | Buttons/link text: site visit, enquiry, brochure, callback | `cta` | Existing extractor supports common real-estate CTAs |
| Audience terms | Copy naming home buyers, urban professionals, families, investors | `audience` | Existing extractor supports limited patterns and branding target audience |
| Products/projects | Project/property pages and brochure titles | future `product` | Required for approval; needs explicit extractor addition |
| Offers | Offer/price/availability copy | future `offer` | Must carry dates/disclaimers where found |
| Publishing/social accounts | Header/footer/social links | future `publishing` | Credentials/tokens are never collected |

### 5.4 Real-Estate Claim Evidence

Acquire these as high-risk claim candidates with source evidence:

| Claim class | Examples to detect | Approval treatment |
|---|---|---|
| Regulatory registration | RERA IDs, registration copy links, legal pages | Cannot be used without evidence and disclaimer review |
| Completion/possession | Ready-to-move, completion date, possession date | Evidence expiry/date required |
| Price/payment | Starting price, EMI, discounts, booking amount | Time-bound; needs disclaimer and expiry |
| Distance/travel time | Metro distance, airport minutes, school/hospital proximity | Needs source and wording lock |
| Availability/inventory | Units available, limited stock | Time-bound; likely expires quickly |
| Amenities | Clubhouse, pool, parking, security, green space | Evidence from project page/brochure |
| Awards/certifications | Best developer, green certification | Evidence required |
| Return/appreciation | Assured returns, guaranteed appreciation | Prohibited unless contract changes; current extractor flags prohibited phrases |

Current extractor supports only `prohibited_claim` for phrases like guaranteed appreciation and assured returns. It does not yet create positive `claim` candidates for RERA, distance, price, completion or amenities. Implementing Firecrawl without extending this would scrape useful evidence but not expose all required approval candidates.

### 5.5 Downloadable Public Documents

Firecrawl can parse PDFs when `parsers: ["pdf"]` is enabled. From a company URL, the worker should discover and classify links to:

- brochures;
- fact sheets;
- RERA/legal documents;
- floor plan PDFs;
- price sheets;
- approved ad PDFs;
- brand guideline PDFs, if public.

Retention rule:

- Text extracted from public PDFs can become candidate evidence when crawl permission allows downloadable documents.
- The binary PDF should be retained as a private `Artifact` only if the crawl policy and rights acknowledgement allow it.
- Parsed PDF evidence must preserve page number or locator where available.

## 6. Adapter Translation Contract

Firecrawl output should be normalized into the existing worker completion input:

```json
{
  "workspaceId": "<workspace id>",
  "leaseToken": "<worker lease token>",
  "schemaVersion": "brand.extraction.output.v1",
  "scrape": {
    "pages": [
      {
        "url": "https://example.com/",
        "title": "Example",
        "markdown": "...",
        "text": "...",
        "branding": {
          "colors": {
            "primary": "#173B57"
          },
          "typography": {
            "fontFamilies": {
              "heading": "Manrope"
            }
          },
          "images": {
            "logo": "https://example.com/logo.svg",
            "logoAlt": "Example"
          },
          "personality": {
            "targetAudience": "urban professionals and families"
          }
        }
      }
    ]
  }
}
```

The adapter must:

- map Firecrawl `metadata.sourceURL` or `metadata.url` to `page.url`;
- map `metadata.title` to `page.title`;
- map `markdown` to `page.markdown` and optionally `page.text`;
- map Firecrawl branding fields into the shape already expected by `extractVisualCandidates`;
- preserve per-page observed time;
- hash excerpts and locators through the existing candidate builder;
- reject empty, refused, malformed or evidence-free output with `PROVIDER_OUTPUT_INVALID`;
- avoid returning raw HTML, raw provider payloads, API keys, object keys, signed URLs or Firecrawl request IDs to the browser.

## 7. UI Implications For The First Step

The first implemented screen should show:

- Company URL input.
- URL validation and normalized URL preview.
- Crawl scope preview: allowed root, page cap, included paths, excluded paths, subdomain/external-link policy.
- Source-use attestation required before starting crawl.
- Optional attached files only if uploaded through the existing artifact upload flow and carrying rights basis/permitted use.
- Start crawl CTA.
- After start: durable crawl run ID, status, queued job, page count progress, completed pages, failed/skipped pages, policy warnings, retry/recovery action.

It must not show:

- A questionnaire for brand name, tone, audience, product, offers or claims before crawl.
- Firecrawl API key, provider payload, cache key, raw HTML or internal worker lease.
- Extracted brand values as approved truth.

## 8. Implementation Gaps To Close Before Real Firecrawl Use

The current local implementation is deterministic and Firecrawl-like, but not a real Firecrawl adapter. Required gaps:

1. Add provider credential metadata for Firecrawl without exposing the API key.
2. Add a server/worker-side Firecrawl adapter behind the provider boundary.
3. Decide whether the provider call happens in NestJS processor code or a private worker; browser code must never call Firecrawl directly.
4. Extend `brand.extraction.output.v1` fixtures to include Firecrawl status, metadata, branding and PDF-derived evidence.
5. Extend candidate extraction for required approval fields that current code does not produce: product/project, positioning, tone/voice, positive claims, legal disclaimers, markets and offers.
6. Add contract tests for malformed Firecrawl payloads, empty pages, refused output, prompt injection, low-confidence visual extraction and partial result UI.
7. Add UI states for Firecrawl-backed progress without exposing provider names unless the operations/admin view requires it.
8. Update configuration catalog for `FIRECRAWL_API_KEY` or secret-manager reference if the implementation introduces a new env/credential requirement.

## 9. Acceptance Criteria For The First Firecrawl-Backed Brand Step

- User enters only a company URL as the initial brand input.
- System displays normalized URL and crawl scope before execution.
- User must acknowledge source rights before the crawl run is created.
- Private, localhost, link-local, metadata, invalid and unsafe redirect targets are blocked.
- Firecrawl API key is server-side only and never appears in browser code, logs, analytics or retained artifacts.
- Crawl progress is visible through V0 job status, page counts and sanitized warnings.
- Extracted logo, colours, fonts, summary, USP, CTA, audience and prohibited-claim candidates show source, evidence, confidence and extraction state.
- Required approval fields not supported by extraction are shown as unresolved, not fabricated.
- Empty, malformed, refused or evidence-free provider output fails with `PROVIDER_OUTPUT_INVALID` and cannot become approved truth.
- Approved production use remains blocked until V0-B3 creates an immutable approved `BrandProfile` version.

