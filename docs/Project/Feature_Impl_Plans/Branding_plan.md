• Proposed Plan





&#x20; # Brand Extraction and Branding App Implementation Plan



&#x20; > For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use

&#x20; > checkbox syntax for tracking.



&#x20; Goal: Build the first real Sakhaa Forge V0 application flow: sign up, optional onboarding/profile, then /app/branding brand extraction from URL or uploaded assets,

&#x20; producing evidence-backed brand candidates and an approvable brand profile.



&#x20; Architecture: Keep PostgreSQL/API as the source of truth. The browser never calls Firecrawl, OpenAI/LLM providers, Supabase tables, or Backblaze directly. Brand crawl

&#x20; starts in the API, runs through the worker/provider boundary, stores artifacts in B2, stores candidates in Postgres, and returns only redacted evidence/status to the

&#x20; frontend.



&#x20; Tech Stack: Next.js + TypeScript frontend, Nest/Fastify-style API in apps/api, Prisma/PostgreSQL, generated OpenAPI client, Firecrawl v2, generic LLM\_PROVIDER/

&#x20; LLM\_API\_KEY/LLM\_MODEL\_ID, Backblaze B2 object storage.



&#x20; ———



&#x20; ## Summary



&#x20; The current /branding page is a mock, static, client-only scan. The current backend creates BrandCrawlRun, BrandAsset, Job, and OutboxEvent, then expects an

&#x20; authenticated worker to complete brand\_crawl with deterministic Firecrawl-like output. There is no real Firecrawl adapter yet.



&#x20; The implementation will make /app/branding the primary route. It will replace the mock flow with real API calls, add optional onboarding/profile before brand

&#x20; extraction, add a manual asset upload path, wire Firecrawl behind the worker boundary, use the LLM only to classify/extract evidence from crawled data, and expand the

&#x20; brand extraction contract to match the Firecrawl skill docs.



&#x20; The desired result is: a signed-in user can enter profile/onboarding details, open /app/branding, scan a brand URL or upload brand assets, watch a 24-step evidence

&#x20; workflow, review extracted source-backed brand assets, see missing/compliance/rights warnings, and approve one exact brand profile version before any later video

&#x20; generation.



&#x20; ## Key Decisions



&#x20; - Use /app/branding as the primary branding UI.

&#x20; - Use query state for details: /app/branding?crawlRunId=<uuid>.

&#x20; - Keep /branding as a redirect to /app/branding.

&#x20; - Use canonical generic LLM config: LLM\_PROVIDER, LLM\_API\_KEY, LLM\_MODEL\_ID.

&#x20; - Add FIRECRAWL\_API\_KEY and BRAND\_CRAWL\_MODE=simulator|firecrawl to project config.

&#x20; - Do not expose Firecrawl, LLM, B2, signed URLs, object keys, raw HTML, raw provider payloads, or prompts to the browser.

&#x20; - Keep current B1/B2/B3 behavior passing; extend it instead of replacing it.

&#x20; - Treat the user-provided OPEN\_API\_KEY name as non-canonical. The implementation should use LLM\_API\_KEY and update .env.example/docs accordingly.



&#x20; ## Backend Decision Chain



&#x20; 1. User intent enters through authenticated API, not provider SDKs in browser.

&#x20; 2. API validates workspace, auth, URL safety, rights acknowledgement, upload metadata, and idempotency.

&#x20; 3. API creates durable BrandCrawlRun, BrandAsset, Job, and outbox state before provider work.

&#x20; 4. Worker claims brand\_crawl, calls Firecrawl only in provider mode, runs the fixed universal pass before one selected or detected vertical pass, and normalises results into brand.extraction.output.v3.

&#x20; 5. Worker stores raw crawl/page/media/asset-pack artifacts in B2/private artifacts where required.

&#x20; 6. LLM receives bounded Firecrawl-derived data only, never secrets, and returns schema-validated extraction units.

&#x20; 7. API persists source-backed BrandCandidate rows and references retained artifact ids.

&#x20; 8. UI displays candidates as unapproved data until approveBrandProfile creates an approved versioned BrandProfile.



&#x20; ## Frontend Decision Chain



&#x20; 1. Landing sign-up collects email, username, password.

&#x20; 2. Optional onboarding collects brand name, website URL, industry, market, language, and video goal.

&#x20; 3. Profile page lets the user update name, email display, URL, industry, market, and language.

&#x20; 4. /app/branding opens blank by default.

&#x20; 5. User chooses Scan URL or Upload brand assets.

&#x20; 6. After submit, route becomes /app/branding?crawlRunId=<uuid>.

&#x20; 7. UI polls/refreshes canonical job and candidate state.

&#x20; 8. UI shows the 24-step crawl/extraction workflow, not a fake timer.

&#x20; 9. UI shows evidence-backed candidates, missing assets, readiness, compliance flags, and approval CTA.

&#x20; 10. UI never treats extracted values as approved truth before human approval.



&#x20; ## Public Interfaces and Data Changes



&#x20; - Add app routes:

&#x20;     - /app/signup

&#x20;     - /app/onboarding

&#x20;     - /app/profile

&#x20;     - /app/branding

&#x20;     - /branding redirect to /app/branding



&#x20; - Add/extend API contracts:

&#x20;     - GET /users/me/profile

&#x20;     - PATCH /users/me/profile

&#x20;     - POST /onboarding/brand-context

&#x20;     - GET /onboarding/brand-context

&#x20;     - GET /brands/crawl-runs/{crawl\_run\_id}

&#x20;     - GET /brands/crawl-runs/{crawl\_run\_id}/asset-pack

&#x20;     - extend POST /brands/crawl-runs

&#x20;     - extend GET /brands/crawl-runs/{id}/candidates

&#x20;     - keep POST /brands/assets/uploads

&#x20;     - keep POST /brands/assets/uploads/{artifact\_id}/complete



&#x20; - Add/extend config:

&#x20;     - BRAND\_CRAWL\_MODE=simulator|firecrawl

&#x20;     - FIRECRAWL\_API\_BASE\_URL=https://api.firecrawl.dev/v2

&#x20;     - FIRECRAWL\_API\_KEY

&#x20;     - FIRECRAWL\_TIMEOUT\_MS

&#x20;     - BRAND\_CRAWL\_DEFAULT\_MAX\_PAGES

&#x20;     - BRAND\_CRAWL\_MAX\_PAGES

&#x20;     - canonical LLM vars remain LLM\_PROVIDER, LLM\_API\_KEY, LLM\_MODEL\_ID, LLM\_REQUEST\_TIMEOUT\_MS



&#x20; - Add Prisma models or fields:

&#x20;     - UserProfile: userId, name, contactEmail, websiteUrl, industry, primaryMarket, language, onboardingSkipped

&#x20;     - BrandContext: workspaceId, userId, brandName, websiteUrl, industry, videoGoal, primaryMarket, language, targetPlatforms

&#x20;     - Add nullable artifact references to BrandCrawlRun: crawlPlanArtifactId, pageInventoryArtifactId, assetPackArtifactId, mediaInventoryArtifactId,

&#x20;       readinessReportArtifactId



&#x20;     - Extend BrandCandidate.fieldType usage to include Firecrawl skill fields such as positioning, tone, product, service, offer, pricing, testimonial, rating,

&#x20;       certification, award, case\_study, metric, media\_asset, social\_link, disclaimer, regulated\_claim, rights\_warning, missing\_asset, video\_format, readiness\_score



&#x20; ## Implementation Tasks



&#x20; ### Task 1: Contract and Docs Alignment



&#x20; - Update docs/V0/V0\_INFORMATION\_ARCHITECTURE.md to make /app/branding the active branding route family.

&#x20; - Update docs/Project/Operations/PROJECT\_CONFIGURATION\_CATALOG.md and docs/Project/Operations/API\_INTEGRATION\_KEYS.md to promote Firecrawl from non-canonical to

&#x20;   approved V0 brand crawl provider.



&#x20; - Update docs/V0/V0\_API.md, docs/V0/V0\_JOBS.md, docs/V0/V0\_BRAND\_PROFILE\_CONTRACT.md, and docs/V0/V0\_FIRECRAWL\_BRAND\_ASSET\_ACQUISITION\_PLAN.md.

&#x20; - Record that /app/branding?crawlRunId=<uuid> is the refresh-safe detail URL.



&#x20; ### Task 2: Database and Generated Contract Changes



&#x20; - Add Prisma migration for UserProfile, BrandContext, and BrandCrawlRun artifact references.

&#x20; - Keep RLS/workspace predicates on every tenant-owned table.

&#x20; - Update packages/contracts/src/openapi.v0.json.

&#x20; - Regenerate packages/contracts/generated.

&#x20; - Extend DB validation tests for the new tables, indexes, RLS, and artifact references.



&#x20; ### Task 3: Firecrawl Provider Adapter



&#x20; - Create apps/api/src/firecrawl-provider.mjs.

&#x20; - Implement:

&#x20;     - buildFirecrawlCrawlRequest(crawlRun, brandContext)

&#x20;     - startBrandCrawl(request)

&#x20;     - getBrandCrawlStatus(providerCrawlId)

&#x20;     - normaliseFirecrawlPages(response)



&#x20; - Use Firecrawl v2 /crawl with scoped includePaths, excludePaths, limit, maxDiscoveryDepth, allowExternalLinks:false, allowSubdomains:false, ignoreRobotsTxt:false,

&#x20;   and scrapeOptions.formats including markdown, links, images, screenshot, branding, and schema json.



&#x20; - Map provider failures to stable V0 errors: DEPENDENCY\_UNAVAILABLE, PROVIDER\_OUTPUT\_INVALID, CRAWL\_POLICY\_BLOCKED, CRAWL\_TIMEOUT.

&#x20; - Add simulator mode fixtures for deterministic tests.



&#x20; ### Task 4: LLM Extraction Adapter



&#x20; - Create apps/api/src/brand-llm-extraction.mjs.

&#x20; - Use generic LLM\_PROVIDER/LLM\_API\_KEY/LLM\_MODEL\_ID.

&#x20; - Implement schema-validated prompt calls for:

&#x20;     - crawl strategy

&#x20;     - page-level extraction

&#x20;     - domain-level brand asset pack

&#x20;     - media classification

&#x20;     - brand voice

&#x20;     - missing-assets request

&#x20;     - readiness report



&#x20; - Prompts must be concise and evidence-only:

&#x20;     - no model memory

&#x20;     - no invented facts

&#x20;     - every non-obvious item has source URL and evidence snippet

&#x20;     - missing items return null, \[], or needs\_human\_input

&#x20;     - inference is marked separately



&#x20; - Rejected, malformed, empty, or schema-invalid LLM output fails the job and writes no candidates.



&#x20; ### Task 5: Worker Execution for brand\_crawl



&#x20; - Replace the fake queue stub for this job with a real handler path.

&#x20; - Worker flow:

&#x20;     - claim brand\_crawl

&#x20;     - call Firecrawl adapter in provider mode or simulator fixture in simulator mode

&#x20;     - retain crawl plan, page inventory, raw page extracts, media inventory, asset pack, readiness report, and missing-assets request as private artifacts

&#x20;     - call LLM extraction

&#x20;     - complete the job through existing authenticated worker completion endpoint



&#x20; - Do not give the worker database, Redis, provider-secret, or B2 secret access beyond approved runtime config and API worker token.



&#x20; ### Task 6: Expand Brand Extraction Candidate Builder



&#x20; - Extend apps/api/src/brand-extraction.mjs from basic candidates to the Firecrawl skill contract.

&#x20; - Preserve existing field types and tests.

&#x20; - Add candidate builders for:

&#x20;     - visual identity

&#x20;     - messaging

&#x20;     - offers

&#x20;     - trust/proof

&#x20;     - brand voice

&#x20;     - media assets

&#x20;     - compliance/rights

&#x20;     - video readiness

&#x20;     - missing assets

&#x20;     - vertical-specific groups



&#x20; - Add industry overlay mapping from onboarding/profile:

&#x20;     - if industry is selected, apply that overlay plus universal groups

&#x20;     - if industry is blank/skipped, apply universal groups only



&#x20; - Keep every candidate as unapproved until approval.



&#x20; ### Task 7: Manual Brand Asset Upload



&#x20; - Extend existing upload UI/API usage rather than creating a parallel upload system.

&#x20; - Frontend upload accepts logo, image, PDF, brand guideline, and video reference files within configured limits.

&#x20; - Backend stores uploads as Artifact rows and B2/private object storage.

&#x20; - User must provide rightsBasis and permittedUse per file.

&#x20; - Uploaded assets attach to a crawl run through BrandAsset.

&#x20; - Manual-only flow can create a crawl run with uploads and no website crawl only if the URL is absent and rights evidence exists; otherwise URL plus uploads both

&#x20;   contribute to one run.



&#x20; ### Task 8: Signup, Onboarding, and Profile



&#x20; - Replace placeholder /sign-in with a real auth flow or add /app/signup while keeping /sign-in for existing login.

&#x20; - Sign-up fields: email, username, password.

&#x20; - Onboarding page fields:

&#x20;     - brand name

&#x20;     - website URL

&#x20;     - industry

&#x20;     - primary market

&#x20;     - language

&#x20;     - video goal

&#x20;     - target platforms

&#x20;     - skip option



&#x20; - Profile page fields:

&#x20;     - name

&#x20;     - email/contact email

&#x20;     - website URL

&#x20;     - industry

&#x20;     - primary market

&#x20;     - language



&#x20; - Add top-left profile icon/menu in the app shell.

&#x20; - Onboarding is optional; skipped onboarding means brand extraction uses universal asset groups only.



&#x20; ### Task 9: /app/branding Frontend



&#x20; - Move current mock branding screen into real app route components.

&#x20; - Replace static BRANDS data with generated API client calls.

&#x20; - Layout fix:

&#x20;     - remove h-screen overflow-hidden from the page root

&#x20;     - use min-h-dvh

&#x20;     - make result panels independently scrollable only where needed

&#x20;     - ensure mobile and desktop expose the full asset pack after scan



&#x20; - UI actions:

&#x20;     - Scan URL

&#x20;     - Upload brand assets

&#x20;     - Review candidates

&#x20;     - Request missing assets

&#x20;     - Approve profile



&#x20; - UI states:

&#x20;     - blank

&#x20;     - onboarding missing

&#x20;     - ready to scan

&#x20;     - upload pending

&#x20;     - queued

&#x20;     - running

&#x20;     - partial

&#x20;     - failed

&#x20;     - candidates ready

&#x20;     - approval required

&#x20;     - approved



&#x20; - No external links from the new landing/app route except internal app routes.



&#x20; ### Task 10: 24-Step Brand Workflow UI



&#x20; Use the same numbered/step-by-step visual language as the landing footer and existing Sakhaa Forge stepper, but bind it to real backend state.



&#x20; Steps:



&#x20; 1. Account created

&#x20; 2. Onboarding selected or skipped

&#x20; 3. Profile context loaded

&#x20; 4. Brand source selected

&#x20; 5. URL normalised

&#x20; 6. Crawl scope previewed

&#x20; 7. Source rights acknowledged

&#x20; 8. Manual assets attached

&#x20; 9. Crawl job queued

&#x20; 10. Homepage captured

&#x20; 11. URL inventory mapped

&#x20; 12. Priority pages scraped

&#x20; 13. Vertical confirmed

&#x20; 14. Universal assets extracted

&#x20; 15. Industry overlay applied

&#x20; 16. Media inventory classified

&#x20; 17. PDFs/screenshots retained

&#x20; 18. LLM evidence extraction completed

&#x20; 19. Candidate evidence validated

&#x20; 20. Candidate groups prepared

&#x20; 21. Compliance and rights warnings generated

&#x20; 22. Missing assets request generated

&#x20; 23. Readiness score calculated

&#x20; 24. Brand profile ready for human approval



&#x20; ### Task 11: Approval and Asset Pack Display



&#x20; - Build BrandAssetPack from real API responses.

&#x20; - Show:

&#x20;     - brand identity

&#x20;     - messaging

&#x20;     - offers

&#x20;     - trust/proof

&#x20;     - media inventory

&#x20;     - voice

&#x20;     - compliance/rights

&#x20;     - missing assets

&#x20;     - readiness score

&#x20;     - evidence/source links as safe locators only



&#x20; - Keep raw provider payloads, object keys, prompt input, signed URLs, and secrets hidden.

&#x20; - Approval submits exact reviewed fields to approveBrandProfile.

&#x20; - Approval response redirects/stays on /app/branding?crawlRunId=<uuid> and shows approved profile version.



&#x20; ### Task 12: Tests and Verification



&#x20; Backend tests:



&#x20; - brand-intake-b1 still passes.

&#x20; - brand-extraction-b2 still passes.

&#x20; - New Firecrawl adapter tests:

&#x20;     - scoped request shape

&#x20;     - provider success

&#x20;     - provider timeout

&#x20;     - malformed provider output

&#x20;     - no API key in logs/errors



&#x20; - New LLM adapter tests:

&#x20;     - valid schema output becomes candidates

&#x20;     - refusal fails safely

&#x20;     - invented/evidence-free output rejected

&#x20;     - prompt injection isolated



&#x20; - Upload tests:

&#x20;     - B2/local storage upload init/complete

&#x20;     - rights basis required

&#x20;     - unsupported type rejected

&#x20;     - cross-workspace artifact hidden



&#x20; - Contract tests:

&#x20;     - OpenAPI includes new profile/onboarding/asset-pack routes

&#x20; - DB tests:

&#x20;     - new tables and RLS policies exist

&#x20;     - artifact refs are workspace-scoped



&#x20; Frontend tests:



&#x20; - /branding redirects to /app/branding.

&#x20; - /app/branding blank state renders.

&#x20; - Scan URL calls generated client, not fake timer.

&#x20; - Query crawlRunId reloads existing run.

&#x20; - Result panel is fully visible/scrollable after scan.

&#x20; - Upload option is visible and validates files.

&#x20; - Onboarding skip uses universal extraction only.

&#x20; - Industry selection shows industry overlay in request.

&#x20; - Profile icon/menu links to profile page.

&#x20; - No outbound anchors are present in /app/branding.



&#x20; Commands:



&#x20; pnpm test:unit

&#x20; pnpm test:contract

&#x20; pnpm test:integration

&#x20; pnpm --filter @sakhaa-forge/web lint

&#x20; pnpm verify



&#x20; ## Assumptions and Defaults



&#x20; - The implementation will not read, print, or commit real .env secret values.

&#x20; - Firecrawl is approved for this V0 brand crawl feature, so docs/config must be updated from the earlier “not canonical” state.

&#x20; - BRAND\_CRAWL\_MODE=simulator remains the safe local/test default.

&#x20; - Production requires explicit BRAND\_CRAWL\_MODE=firecrawl.

&#x20; - LLM extraction is provider-neutral; use LLM\_PROVIDER=openai if OpenAI is the deployed provider.

&#x20; - Backblaze B2 stores retained artifacts; browser receives only short-lived signed upload/download contracts where existing artifact APIs permit it.

&#x20; - /app/branding is now the product route authority for this feature, and docs must reflect that route update.

&#x20; - Plan file target during execution: docs/superpowers/plans/2026-07-03-brand-extraction-branding-app.md.
