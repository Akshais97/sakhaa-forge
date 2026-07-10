# Branding and Firecrawl extraction remediation plan

**Slice:** V0-B1/V0-B2/V0-B2A, before V0-B3 approval  
**Gate:** V0-G1 Brand  
**Behaviour:** A permitted website crawl uses the server-side Firecrawl credential, collects at least five eligible internal pages by default, retains evidence-backed brand facts and usable visual assets, exposes USPs and all required review groups, and reports missing video-ad inputs honestly.

## Sources and audit scope

- Canonical sources: `docs/V0/V0.md`, `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`, `docs/V0/V0_API.md`, `docs/V0/V0_JOBS.md`, `docs/V0/V0_SECURITY.md`, `docs/V0/V0_ERROR_CATALOG.md`, `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`, `docs/V0/V0_FIRECRAWL_BRAND_ASSET_ACQUISITION_PLAN.md`, both Firecrawl feature guides, the B1/B2/B2A sprint contracts, project guardrails, design, language, configuration, architecture and governance documents.
- Runtime traced: browser crawl submission and polling, generated client, API controller, in-memory and Prisma stores, internal job completion, queue/Python stubs, Firecrawl adapter, extraction/LLM modules, OpenAPI, Prisma, UI candidate/asset adapters and current unit/integration/end-to-end tests.
- Existing uncommitted changes were treated as user work and not reverted.
- Fresh baseline: 32 focused branding/Firecrawl tests pass, but they prove fixture and adapter behaviour only; none proves that the running queue processor calls Firecrawl or retains downloaded crawl assets.

## Confirmed root causes

1. `apps/api/src/firecrawl-provider.mjs` is not imported by any runtime application or worker file. Only its unit test imports it.
2. `workers/queue/src/processor.mjs` is a heartbeat stub. It does not claim or complete `brand_crawl` jobs.
3. Local demo completion uses one hardcoded v1 page from `apps/web/app/api/brand-extract/demo-complete-crawl/route.ts`; therefore `FIRECRAWL_API_KEY` cannot change the visible result.
4. The v3 homepage schema now asks for `unique_selling_points`, but `buildUniversalProfile()` discards that field and `extractUniversalProfileCandidates()` never emits it. The legacy path still relies on narrow regex heuristics.
5. The UI maps `usp` into the general `Copy & Messaging` section and approval differentiators, but it has no explicit USP review block. Existing support is not the requested dedicated frontend treatment.
6. The active multi-pass adapter hardcodes five `/scrape` URLs (`/`, `/about`, `/reviews`, `/faq`, `/blog`) and one vertical URL. It does not use homepage link discovery, route aliases or the full pass sequence from the guides. A missing fixed page can abort the whole run.
7. The separate `/crawl` request builder defaults to five pages, but it is unused. Its `/` include prefix becomes `^/$`, so the UI's `/all` -> `/` normalisation would allow only the homepage, not all internal paths.
8. `maxPages` and permitted path prefixes are not applied by `runFirecrawlBrandExtraction()`; the UI currently describes controls that do not govern that execution path.
9. Image handling inventories provider URLs; it does not download bytes, quarantine, validate, hash, promote or create crawled `Artifact`/`BrandAsset` rows. Job completion persists candidates only.
10. Asset categorisation is based mainly on URL substrings. Extracted alt/caption/context fields are requested but not used. The frontend renders transient provider locators directly in `<img>`, which is not the retained private-artifact contract and can fail because of hotlink protection, expiry or remote-image policy.
11. Current hardcoded/fallback facts can look like extraction: demo brand facts, `readiness_score: 60`, initial UI readiness `78`, real-estate CTA/audience/claim regexes, default Real Estate UI selection, default D2C vertical fallback, fixed paths and generic product descriptions.
12. Existing end-to-end coverage completes the hardcoded demo job. It does not prove credential use, five-page discovery, prompt/schema fidelity, asset byte retention, multi-page evidence or video-ad readiness.

## Required implementation plan

### 1. USPs are not extracted and the frontend has no USP section

- First failing public tests:
  - A v3 homepage response containing `unique_selling_points` must create evidence-backed `usp` candidates with the homepage locator and must not fall back to regex-derived values.
  - The candidate dossier must show a dedicated `Unique selling points` review group with empty, candidate, low-confidence, approved and rejected states.
  - Approved USPs must populate `positioning.differentiators` without overwriting other approved differentiators.
- Preserve `unique_selling_points` in the universal normalised output, map every non-empty value to its own candidate/evidence record, deduplicate by normalised value plus source, and keep heuristic extraction explicitly low-confidence and simulator-only/backward-compatible.
- Add the explicit USP UI section and approval summary using backend candidates, not `BrandData.extractedCandidates.usps` demo data.
- Affected files: `apps/api/src/firecrawl-provider.mjs`, `apps/api/src/brand-extraction.mjs`, `apps/web/app/brand-extract/_components/candidate-adapter.ts`, `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`, generated contracts/schema sources and focused tests.

### 2. Prompts do not match the universal and vertical Firecrawl guides

- First failing contract test: every implemented pass must identify its guide prompt/schema ID and match the guide's required fields, formats, limits and pass order. A shortened generic prompt must fail the test.
- Replace inline prompt fragments with versioned, named prompt/schema definitions owned by the provider adapter. Implement homepage, About, reviews, FAQ, blog index, two blog deep reads, image harvest/metadata handling, and the complete selected vertical section rather than one generic vertical pass.
- Route priority pages from discovered homepage links using the aliases in the universal guide; only attempt the documented direct fallback when no eligible discovered link exists. Record missing/skipped/fallback pages as evidence.
- Do not revise prompt wording in this change until the product owner supplies the revised prompts. The inventory below is the hand-off list.
- Suggested new files:
  - `apps/api/src/brand-crawl/prompts/universal.mjs`
  - `apps/api/src/brand-crawl/prompts/verticals.mjs`
  - `apps/api/src/brand-crawl/schemas/brand-extraction-output-v3.mjs`
  - `apps/api/src/brand-crawl/page-router.mjs`
  - deterministic fixtures under `tests/fixtures/brand-crawl/`

### 3. Low-quality prompts and hardcoded extracted-looking values

#### Prompt hand-off: goal intended and current prompt

| Goal intended                                                                                         | Current prompt copied from code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Why it needs owner revision                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 homepage: exact identity, copy, USP and visual locators with zero inference                        | `You are extracting brand identity, marketing copy, and homepage visual asset locators from a company homepage. Extract BRAND NAME, TAGLINE, HERO_H1, HERO_SUBHEADLINE, FEATURE_HEADLINES, CTA_BUTTONS, PAIN_POINTS, WHO_ITS_FOR, SOCIAL_LINKS, LOGO_URL, FAVICON_URL, OG_IMAGE_URL, HERO_IMAGE_URLS, HOMEPAGE_IMAGE_ASSETS, SCHEMA_TYPE, META_DESCRIPTION, VERTICAL_SIGNALS, TRUST_SIGNALS, UNIQUE_SELLING_POINTS, GUARANTEE_LANGUAGE. For HOMEPAGE_IMAGE_ASSETS return visible image URLs with alt/context/category when explicitly present. Return only explicitly present values.` | Compresses the detailed P1 field definitions, source rules and limits into field names; output is also currently dropped for USPs.                                               |
| P2A About: mission, story, people, credentials, locations and vocabulary with exact absence behaviour | `Extract mission_statement, origin_story, brand_values, founder_names, founder_story, company_age_or_year, team_size, community_language, awards_accolades, certifications, media_mentions, locations_served and vocabulary_patterns explicitly present on this About page.`                                                                                                                                                                                                                                                                                                           | Omits the guide's definitions, cardinality, examples and `null` rules.                                                                                                           |
| P2B Reviews: structured testimonials and proof prioritised by measurable outcomes                     | `Extract testimonials, aggregate_rating, case_study_headlines, before_after_stats, client_company_names, video_testimonial_urls and trust_badges explicitly present on this reviews page.`                                                                                                                                                                                                                                                                                                                                                                                             | Omits the testimonial object contract, maximum count, verbatim/source constraints and prioritisation.                                                                            |
| P2C FAQ: question/answer evidence, objection themes and policies                                      | `Extract faq_items, objection_themes, refund_policy_summary, shipping_info, guarantee_terms and contact_methods explicitly present on this FAQ page.`                                                                                                                                                                                                                                                                                                                                                                                                                                  | Omits object shape, maximum count, prioritisation and safe summarisation rules.                                                                                                  |
| P2D Blog index: paired recent posts and visible tone/category evidence                                | `Extract post_headlines, post_urls, topic_themes, tone_signals and content_categories visible on this blog index page. Do not follow links.`                                                                                                                                                                                                                                                                                                                                                                                                                                           | Omits pairing, count limits, allowed evidence and descriptor guidance.                                                                                                           |
| P3 Blog deep read                                                                                     | **No current prompt or pass exists.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Required by the universal guide for vocabulary, style, claims and customer references.                                                                                           |
| Vertical G6-G17: exact per-vertical, per-pass fields and native formats                               | ``Extract ${fields.join(", ")} explicitly present for ${config.label}. For IMAGE_ASSET_LABELS and VISUAL_ASSET_CONTEXTS, describe visible image alt text, captions, or page context that helps categorise images returned by the images format. Return null or empty arrays for absent fields.``                                                                                                                                                                                                                                                                                       | One generic template replaces every detailed vertical prompt and omits all second/detail/gallery/pricing/team passes.                                                            |
| Optional generic brand LLM evidence extraction                                                        | Structured input only: `task: "v0_brand_evidence_extraction"`; rules `evidence only`, `no invented facts`, `no model memory`, `mark inference separately`, `missing items return null, [] or needs_human_input`                                                                                                                                                                                                                                                                                                                                                                        | There is no approved natural-language prompt and the provider transport always returns unavailable outside the simulator. Do not use it to mask missing Firecrawl contract work. |

#### Hardcoded/fallback values to remove, isolate or label

- `apps/web/app/api/brand-extract/demo-complete-crawl/route.ts`: canned name/industry sentence, USPs, CTA, prohibited claims, colours, fonts, audience, tone and fabricated logo URL. Keep only as an explicitly named deterministic fixture outside production flow.
- `apps/api/src/brand-extraction.mjs`: hardcoded CTA phrases, real-estate audiences, prohibited claims, USP cues/benefits, pricing/rating/RERA regexes and `readiness_score: 60`. Retain only where the canonical simulator contract authorises them; never present them as provider extraction.
- `apps/api/src/firecrawl-provider.mjs`: fixed page paths, default D2C when detection is absent, one path per vertical, URL-substring image categories and generic schemas.
- `BrandExtractionStudio.tsx`: default Real Estate selection, readiness `78`, fixed basis breakdown, `detectedBrandType || setupForm.brandType`, fixed progress `65`, `v3/crawl` UI copy although code uses v2 `/scrape`, and claims that polling/asset caching is active when production wiring is absent.
- `candidate-adapter.ts`: generic `Extracted from the selected vertical crawl.` product description and default evidence/asset labels that can obscure missing source fields.
- Add tests that provider mode never emits demo fixture values and that missing data remains missing/blocked rather than receiving a default fact.

### 4. Brand assets do not load; use Firecrawl correctly and load images/assets

- First failing integration test: a deterministic Firecrawl server returns homepage, internal-page and vertical images; the running queue processor must authenticate with `Authorization: Bearer <server-side key>`, complete the v3 job, download eligible bytes, validate content type/size/hash, and expose review-safe retained assets without exposing the key or raw provider URL.
- Wire the NestJS queue processor path described in `V0_ARCHITECTURE.md`: opaque job ID -> claim through NestJS -> Firecrawl adapter -> quarantine/download -> validated completion through NestJS. Do not call Firecrawl from browser code or the request controller.
- Implement an asset acquisition module that:
  - resolves and deduplicates absolute same-site asset URLs;
  - uses alt text, captions, page/section context and dimensions, not filename alone;
  - filters tracking pixels, sprites, tiny icons, base64/blob/data URLs and duplicates per the guide;
  - downloads with SSRF/redirect/size/content-type controls;
  - hashes and stores quarantine evidence, promotes eligible clean artifacts, and creates workspace-scoped `BrandAsset` records;
  - records rights basis/permitted use and leaves non-retainable URLs as evidence only;
  - serves the UI through authorised short-lived artifact access with refresh/recovery, never raw object keys or provider URLs.
- Suggested files:
  - `workers/queue/src/brand-crawl-processor.mjs`
  - `apps/api/src/brand-crawl/asset-acquisition.mjs`
  - `apps/api/src/brand-crawl/media-inventory.mjs`
  - storage adapter additions under the existing artifact boundary
  - Prisma migration only if current artifact-reference fields cannot represent the retained outputs.

### 5. Verify that five internal pages are crawled even without a path URL or `/all`

- Current answer: **No runtime flow proves this.** The demo crawls one page; the production provider is not wired; the active adapter plans five fixed URLs rather than discovering five eligible internal pages; the unused `/crawl` builder has `limit: 5` but `/` maps to homepage-only `^/$`.
- First failing tests:
  - With no user path prefixes, homepage link discovery selects the homepage plus at least four eligible same-origin internal pages when the fixture site exposes them.
  - `/all` and omitted prefixes have the documented broad internal-scope meaning; `/` must not compile to homepage-only unless the user explicitly selects homepage-only scope.
  - When fewer than five permitted pages exist, return a partial result with exact discovered/scraped/skipped counts and reasons; do not fabricate pages or call the run complete without the warning.
  - Explicit restrictive prefixes remain authoritative even if they yield fewer than five pages.
- Define selection order from the universal guide: homepage first; one eligible About/story page; one reviews/proof page; one FAQ/help page; one blog/resources page; then documented fallbacks. Apply robots, same-origin, redirect and rights rules before counting a page.
- Apply `maxPages` consistently. The default is five; it is a page limit, not a discovery-depth label. Remove or correct misleading frontend copy.

### 6. The Firecrawl API key is not used by the actual brand flow

- Add typed startup validation: `BRAND_CRAWL_MODE=firecrawl` requires non-empty `FIRECRAWL_API_KEY`, HTTPS base URL and bounded timeout; simulator mode must not read/use the key.
- Pass the key only to the server-side provider adapter. Add a fetch-spy contract test for the bearer header and redaction scans across public responses, job events, logs, analytics, artifacts and generated fixtures.
- Make provider configuration truthful: `configured` must require both firecrawl mode and a valid key, not merely `mode === "firecrawl"`.
- Ensure provider errors map to stable RFC 9457 codes and the job records partial/skipped evidence without raw payloads. Do not silently switch provider mode to demo data.
- Add a separately approved staging smoke test against a controlled public fixture domain and a real secret; deterministic local/CI tests remain the default and incur no Firecrawl cost.

### 7. End-to-end tests for video-ad-ready extraction with many assets and facts

- Create deterministic multi-page fixture sites for at least the India-first real-estate reference path plus one non-real-estate vertical. Include responsive images, lazy-loaded images, CSS backgrounds, OG/favicon/logo, galleries, duplicate URLs, redirects, missing priority paths, prompt injection text, structured data, RERA/claim evidence, testimonials, FAQs, blog voice, products/services and prohibited/unsupported claims.
- Add a video-ad readiness matrix derived from canonical fields:
  - identity and positioning;
  - explicit USPs/differentiators;
  - audiences, pains/objections and CTAs;
  - voice/tone/vocabulary and approved examples;
  - products/services/offers/pricing where present;
  - positive, regulated and prohibited claim evidence;
  - social proof;
  - logos, colours, typography, hero/OG imagery, product/project/lifestyle/facility/team images and screenshots;
  - rights, hashes, source lineage, selected/detected vertical and missing-field evidence.
- Do not invent minimum asset counts. The canonical documents require broad asset collection but do not define a release threshold for “a lot of assets”. Add that threshold to the owning V0 contract/readiness document before encoding it in tests. Until then, tests assert exact fixture-derived inventory and explicit missing/partial states.
- Test layers:
  1. prompt/schema fidelity and page routing unit tests;
  2. provider/auth/error/redaction unit tests;
  3. queue -> adapter -> completion integration test;
  4. asset download/quarantine/hash/rights integration tests;
  5. generated API/client contract tests;
  6. Prisma/RLS cross-workspace tests for crawl outputs and assets;
  7. browser end-to-end review of USP, evidence, partial states and a populated asset pack;
  8. recovery tests for timeout, missing pages, malformed JSON, partial assets and worker lease expiry.

## Behaviour-by-behaviour execution order

1. **Contract and decision gate** -> define v3 JSON Schema, page-count semantics and video-ad asset readiness threshold; verify with documentation/contract tests.
2. **Prompt fidelity** -> add named prompt/schema definitions after owner supplies revised wording; observe red then green against both guide inventories.
3. **Universal page routing** -> implement link discovery, alias selection, five-page default and partial evidence; verify deterministic fixtures.
4. **USP preservation** -> carry structured USPs to candidates and the dedicated UI section; verify API and browser behaviour.
5. **Complete vertical routing** -> implement exactly one selected/detected vertical section with its required sub-passes; verify conflict evidence.
6. **Runtime provider wiring** -> make the NestJS queue processor invoke Firecrawl with the server-side key; verify no controller/browser shortcut.
7. **Asset acquisition and retention** -> download, quarantine, validate, hash, promote and authorise display; verify cross-tenant and signed-access behaviour.
8. **Truthful UI states** -> remove demo-looking defaults/fake progress and show queued/running/partial/failed/blocked/ready states from backend truth.
9. **End-to-end readiness** -> prove the controlled real-estate fixture yields the complete evidence matrix and recoverable partial states.
10. **Regenerate and document** -> update OpenAPI/client, Prisma only if needed, owning V0 docs, configuration catalogue, screen/state inventory, tests, changelog and retained V0-G1 evidence.

## Verification commands required before completion

```text
node --test tests/unit/firecrawl-provider.test.mjs
node --test tests/unit/brand-extraction-script.test.mjs tests/unit/brand-llm-extraction.test.mjs
node --test tests/integration/brand-extract-crawl-provider.test.mjs
node --test tests/integration/brand-intake-b1.test.mjs tests/integration/brand-extraction-b2.test.mjs
node --test tests/contract/openapi-generation.test.mjs
node --test tests/rls/workspace-isolation.test.mjs
node --test tests/e2e/brand-extract-demo-flow.test.mjs tests/e2e/brand-extract-browser-automation.test.mjs
pnpm generate
pnpm verify
```

Completion evidence must include observed red/green output, five-page routing inventory, provider-call trace with secret redacted, retained artifact IDs/hashes, candidate-source trace, selected/detected vertical evidence, asset screenshots, recovery output, generated-contract diff review and a secret/redaction scan.

## Impact summary

- **Contract:** v3 schema and generated API/client must become executable rather than prose-only.
- **Migration/data:** likely additive artifact references or crawl metadata only after schema inspection proves existing fields insufficient; every row stays workspace-scoped with RLS.
- **Security/tenant:** server-side key only, SSRF/redirect/robots/rights checks, quarantined bytes, cross-workspace hiding and short-lived asset access.
- **Billing/provider:** Firecrawl credits remain operational telemetry, not creator-credit billing; deterministic provider simulation remains the default.
- **UI:** dedicated USP review, truthful progress/partial states, retained-asset rendering and no fake defaults.
- **Documentation/changelog:** update B1/B2/B2A owning contracts, API/jobs/testing/configuration/screen state and the V0-G1 changelog/evidence in the same implementation change.
