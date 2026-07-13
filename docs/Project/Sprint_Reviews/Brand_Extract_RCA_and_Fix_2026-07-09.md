# Brand Extraction — RCA & Fix (Detailed Documentation)

Branch: `landing-page-fixing-and-ui-fixing`. Scope: `/brand-extract` (the "branding-extract URL" sub-page) and its backend in `apps/api`. All findings are confirmed by direct file reads (no guesswork); every claim cites `file:line`.

Date: 2026-07-09. Method: systematic-debugging (Phase 1 evidence → root cause → fix with failing test) + first-principles + chain-of-thought.

---

## 1. Context

Three reported defects on the brand-extraction flow:

1. **Brand assets not coming in** on the brand-assets page after extraction.
2. **USPs not being extracted** — "the whole system is not getting the actual USPs out." Required deliverable: every prompt in the branding-extract service listed verbatim with its location.
3. **"Crawl not deep enough"** — homepage images not fetched; user suspects a missing trailing slash on the normalized start URL.

Method: three read-only Explore agents mapped the code; all decision-critical claims were then confirmed by direct reads of `candidate-adapter.ts`, `brand-extraction.mjs`, `demo-complete-crawl/route.ts`, `workspace-store.mjs`, `BrandExtractionStudio.tsx`, `firecrawl-provider.mjs`, `brand-llm-extraction.mjs`, and `workers/queue/src/processor.mjs`, plus targeted greps.

---

## 2. Executive summary (root causes)

- **Issue 1 (assets):** A stack of independent wiring/shape bugs that each empty the Asset Pack Viewer — the frontend polls `getBrandCrawlRun` which returns **no `assetPack`**; the fallback candidate→asset builder has **no `logo` branch** (the only asset candidate the demo path produces); uploaded `brandAssets` are returned by the backend but **never read** by the adapter; and the rich v3 asset candidates (`visual_identity`/`rights_asset`) are never produced because **no live crawler runs**. (`candidate-adapter.ts:189,299-324,173`; `workspace-store.mjs:694-710`; `brand-extraction.mjs:152-155`.)
- **Issue 2 (USPs):** No prompt anywhere asks for USPs. USPs come only from a regex (`extractBrandUsps`) that matches a literal `USPs:` label or three hardcoded real-estate adjectives — so real sites yield none. Even when a USP candidate *is* produced (e.g. the demo fixture prints `USPs: …`), `buildApprovalDraftFromCandidates` has **no `usp` branch**, so approved USPs are silently dropped and never reach the approval draft. (`brand-extraction.mjs:107-120`; `candidate-adapter.ts:219-287`.)
- **Issue 3 (crawl depth):** There is **no live crawler** — `firecrawl-provider.mjs` is dead code (imported only by its own unit test), the queue worker is a 9-line heartbeat stub, and the only active completion path is a demo mock returning one canned page + one fake `{url}/logo.svg`. In `manual` mode the job hangs `QUEUED` forever. The **trailing-slash hypothesis is wrong**: `normalizeCrawlUrl` force-adds the slash (`workspace-store.mjs:15859-15861`). The user's "not deep enough" perception maps to the Asset Pack Viewer empty-state copy *"Provide direct uploads or **run depth crawls** to harvest high-resolution visual anchors."* (`BrandExtractionStudio.tsx:1571`) plus the maxPages slider — not a code error string (verified: no such string exists in the project's app code).

**Common root of Issues 1 & 3:** the frontend adapter was rewritten to consume `brand.extraction.output.v3` (visual_identity/rights_asset candidates — `docs/V0/Features/Firecrawl/brand-extract-frontend-gap-analysis.md`), and the backend *supports* v3 (`extractFirecrawlV3Candidates`, `brand-extraction.mjs:193-268`), but **nothing produces v3 output**. The real Firecrawl provider/worker was never wired, so only the v1 demo mock runs.

---

## 3. Issue 1 — Brand assets not landing (RCA)

### 3.1 The real brand-assets page
- Route `/brand-extract` → `apps/web/app/brand-extract/page.tsx` → `BrandExtractApp` → `BrandExtractionStudio` (`apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`). "Asset Pack Viewer" is Step 5 (`BrandExtractionStudio.tsx:1550-1636`). State `assetPack` init `[]` (`:228`); set only at `:617` `setAssetPack(adapted.assetPack)`.
- The `apps/web/app/app/branding/` page is an unrelated hardcoded mockup (no API calls) — not this feature.

### 3.2 How the asset pack is populated (the only path)
- `startPollingCrawl` (`BrandExtractionStudio.tsx:597-638`) polls `client.getBrandCrawlRun(runId)` (`:604`) every 1s → `adaptBrandCrawlRunResponse(body)` (`:611`) → on `ready`, `setAssetPack(adapted.assetPack)` (`:617`).
- A dedicated `client.getBrandAssetPack` (`GET .../asset-pack`, `v0-client.mjs:56-58`) exists but **no frontend code calls it** (grep-confirmed; only route-contract strings + tests reference it).

### 3.3 Backend return shapes
- `getBrandCrawlRun` (`workspace-store.mjs:694-710`) returns `{ crawlRun, brandAssets, candidates }` — **no `assetPack`**.
- `getBrandAssetPack` (`workspace-store.mjs:712-739`) returns `{ crawlRun, assetPack: { identity, messaging, …, mediaInventory, readiness } }` — but this is **grouped candidates by section**, not `UiAsset[]` with locators. (And it's unused by the UI.)
- `publicBrandAsset` (`workspace-store.mjs:16020-16032`) returns `{ id, workspaceId, crawlRunId, artifactId, rightsBasis, permittedUse, status, … }` — **no `locator`, `name`, `category`**. The UI requires `locator/category/name` (`BrandExtractionStudio.tsx:1590,1596,1602`; `UiAsset` `candidate-adapter.ts:64-72`).

### 3.4 The adapter drops assets three ways (`candidate-adapter.ts`)
1. `:189` `assetPack: extractAssetPack(candidates, response.assetPack)` — `response.assetPack` is `undefined` from `getBrandCrawlRun`, so it falls back to building from candidates.
2. `:173` declares `brandAssets?: unknown[]` but the function **never reads** `response.brandAssets` → user-uploaded assets silently dropped.
3. `:289-324` `extractAssetPack` → `assetsFromCandidate`: handles **only** `visual_identity` (`:301`) and `rights_asset`/`media_asset` (`:312`); the `logo` candidate falls through to `return []` (`:323`).

### 3.5 What the extraction actually produces
- `completeBrandCrawlJob` (`workspace-store.mjs:6606-6662`) writes **only candidates** to `brandCandidates` (`:6637`); it writes **no new `brandAssets`**. Uploaded assets were stored earlier in `createBrandCrawlRun` (`:560-563`).
- For schemaVersion `v1` (what the demo sends), `buildBrandExtractionCandidates` runs only the simple extractors (`brand-extraction.mjs:35-43`). `extractVisualCandidates` (`:138-157`) emits a single `logo` candidate `{src, alt}` when `page.branding.images.logo` starts with `http` (`:152-155`). The demo fixture's logo is `{websiteUrl}/logo.svg` (`demo-complete-crawl/route.ts:31`) → one `logo` candidate. `extractFirecrawlSkillCandidates` emits `media_asset` only if `page.branding.media` exists (`:183-188`) — the demo fixture has none.
- Net: the only asset candidate on the demo path is `logo`, which `assetsFromCandidate` drops → `assetPack === []` → empty state.

### 3.6 Root-cause chain (Issue 1)
1. Frontend polls the wrong endpoint for assets (poll returns no `assetPack`; dedicated `getBrandAssetPack` never called).
2. Uploaded `brandAssets` returned by backend but never read by adapter.
3. `assetsFromCandidate` has no `logo` branch → the one asset candidate the demo produces is dropped.
4. v3 asset candidates (`visual_identity`/`rights_asset`) never produced (no live crawler).
5. `publicBrandAsset` shape doesn't match `UiAsset` (no locator/name/category) — uploaded assets unrenderable even if read.

---

## 4. Issue 2 — USPs not extracted (RCA + full prompt inventory)

### 4.1 Two prompt mechanisms; both fail to extract USPs
- **(A) Firecrawl LLM prompts** in `firecrawl-provider.mjs` — passed as the `json` format `prompt` to Firecrawl `/scrape`. Assembled by `buildFirecrawlBrandPassPlan`/`buildFirecrawlVerticalPassPlan`, would be sent by `runFirecrawlBrandExtraction`. **Dead code**: `runFirecrawlBrandExtraction` is never imported/called in the app (grep: only `firecrawl-provider.mjs` itself + `tests/unit/firecrawl-provider.test.mjs` reference it). `runFirecrawlBrandExtraction` early-returns 503 when `BRAND_CRAWL_MODE !== "firecrawl"` (`firecrawl-provider.mjs:156-158`); default config is `simulator` (`.env.example:48-50`).
- **(B) Regex/heuristic extractors** in `brand-extraction.mjs` — the **active** path. `completeBrandCrawlJob` → `buildBrandExtractionCandidates` runs these. **No LLM.**

### 4.2 Full prompt inventory (verbatim, with file:line) — Task 2 deliverable

| # | File:line | Step | Provider call site | Requests USP? |
|---|-----------|------|--------------------|----------------|
| 1 | `firecrawl-provider.mjs:89` | homepage LLM pass | `buildFirecrawlBrandPassPlan:129` → `runFirecrawlBrandExtraction:168-175` (dead) | No |
| 2 | `firecrawl-provider.mjs:98` | about LLM pass | same (dead) | No |
| 3 | `firecrawl-provider.mjs:104` | reviews LLM pass | same (dead) | No |
| 4 | `firecrawl-provider.mjs:110` | faq LLM pass | same (dead) | No |
| 5 | `firecrawl-provider.mjs:116` | blog_index LLM pass | same (dead) | No |
| 6 | `firecrawl-provider.mjs:387` | vertical LLM pass (templated) | `buildFirecrawlVerticalPassPlan:150` (dead) | No |
| 7 | `brand-llm-extraction.mjs:24-46` | structured LLM input (object, not NL prompt; UNUSED) | `runBrandLlmExtraction:85-105` (stub, never calls LLM) | No (`usp` absent from `allowedFieldTypes:1-22`) |

**Prompt 1 — homepage** (`firecrawl-provider.mjs:89`), schema `homepageSchema` (`:58-73`):
> "You are extracting brand identity and marketing copy from a company homepage. Extract BRAND NAME, TAGLINE, HERO_H1, HERO_SUBHEADLINE, FEATURE_HEADLINES, CTA_BUTTONS, PAIN_POINTS, WHO_ITS_FOR, SOCIAL_LINKS, SCHEMA_TYPE, META_DESCRIPTION, VERTICAL_SIGNALS, TRUST_SIGNALS, GUARANTEE_LANGUAGE. Return only explicitly present values."

**Prompt 2 — about** (`firecrawl-provider.mjs:98`):
> "Extract mission_statement, origin_story, brand_values, founder_names, founder_story, company_age_or_year, team_size, community_language, awards_accolades, certifications, media_mentions, locations_served and vocabulary_patterns explicitly present on this About page."

**Prompt 3 — reviews** (`firecrawl-provider.mjs:104`):
> "Extract testimonials, aggregate_rating, case_study_headlines, before_after_stats, client_company_names, video_testimonial_urls and trust_badges explicitly present on this reviews page."

**Prompt 4 — faq** (`firecrawl-provider.mjs:110`):
> "Extract faq_items, objection_themes, refund_policy_summary, shipping_info, guarantee_terms and contact_methods explicitly present on this FAQ page."

**Prompt 5 — blog_index** (`firecrawl-provider.mjs:116`):
> "Extract post_headlines, post_urls, topic_themes, tone_signals and content_categories visible on this blog index page. Do not follow links."

**Prompt 6 — vertical** (`firecrawl-provider.mjs:387`, template; `config.productFields`/`claimFields` per vertical at `:7-20`):
> `Extract ${[...config.productFields, ...config.claimFields].join(", ")} explicitly present for ${config.label}. Return null or empty arrays for absent fields.`
> Example (real_estate): "Extract listing_names, price_range, status_labels, developer_name, rera_numbers, location_names, property_types, filter_options explicitly present for RealEstate. Return null or empty arrays for absent fields."

**Prompt 7 — structured LLM input** (`brand-llm-extraction.mjs:24-46`) — a structured object, not a natural-language prompt; `task: "v0_brand_evidence_extraction"`, `schemaVersion: "brand.llm.extraction.input.v1"`, `rules: ["evidence only","no invented facts","no model memory","mark inference separately","missing items return null, [] or needs_human_input"]`, `brandContext`, `pages` (≤20, markdown/text ≤3000 chars). Output parsed by `parseBrandLlmExtraction` (`:48-83`) into `units` each `{fieldType, value, confidence, sourceUrl, evidenceSnippet, inference}`. `allowedFieldTypes` (`:1-22`) = `positioning, tone, product, service, offer, pricing, testimonial, rating, certification, award, case_study, metric, media_asset, social_link, disclaimer, regulated_claim, rights_warning, missing_asset, video_format, readiness_score` — **no `usp`**. `runBrandLlmExtraction` (`:85-105`) is a stub: simulator → empty units; otherwise returns `invalidProvider()`/`DEPENDENCY_UNAVAILABLE` — **never calls the LLM**. Never imported by app code.

> Note: hits at `workspace-store.mjs:16302/18503` (`prompt: prompt.prompt`) are the unrelated V0-P5 "Director Prompt" script-generation feature, not brand extraction.

### 4.3 USP extraction is regex-only (`brand-extraction.mjs:107-120`)
```js
export function extractBrandUsps(page) {
  const text = stripPromptInjection(cleanText(page.text ?? page.markdown ?? ""));
  const uspMatch = text.match(/\bUSPs?:\s*([^.!?]+)/i);          // matches ONLY a literal "USP:"/"USPs:" label
  if (uspMatch) { /* split on ,/;/and, filter len>=4, slice 5 → usp candidates @0.84 */ }
  const offers = text.match(/\b(practical [^.]+|metro-connected [^.]+|transparent [^.]+)\b/gi) ?? [];  // three hardcoded real-estate adjectives
  return offers.slice(0, 5).map((item) => evidenceCandidate("usp", item.trim(), 0.72, page, item));
}
```
- fieldType = literal `"usp"`. Persisted via `brandCandidates` (`workspace-store.mjs:6637`), returned in `completeJob` response (`response.candidates`, `:6661`). Frontend routes `usp`→"copy" section, label "USP" (`candidate-adapter.ts:98,138`).
- **Why USPs don't come out:** the primary regex only fires on pages that literally print "USPs:"; the fallback only matches `practical…/metro-connected…/transparent…` (real-estate-flavored). For any other real site → `[]`.

### 4.4 Second drop — approved USPs silently discarded
`buildApprovalDraftFromCandidates` (`candidate-adapter.ts:219-287`) handles `identity`, `copy_messaging`, `visual_identity`, `voice`, `social_proof`, `audience`, `product_service`, `claim*`, `publishing_social` — **no `if (candidate.fieldType === "usp")` branch.** `positioning.differentiators` is instead filled from `copy_messaging.featureHeadlines + painPoints` (`:234-239`). So even the demo's matched USP never reaches the approval draft.
- Also: `extractedCandidates.usps` (`types.ts:14`, demo brands `data.ts`) is initialized `[]` (`BrandExtractApp.tsx:21`) and never repopulated from live candidates.

### 4.5 Root-cause chain (Issue 2)
1. No prompt requests USPs (6 Firecrawl prompts + structured extractor all omit it; `allowedFieldTypes` excludes `usp`).
2. The LLM paths are dead code anyway (no live crawler).
3. USPs come only from a regex that almost never fires for real sites.
4. Even when a `usp` candidate exists, `buildApprovalDraftFromCandidates` drops it (no `usp` branch).

---

## 5. Issue 3 — "Crawl not deep enough" / images not fetched (RCA)

### 5.1 There is no live crawler
- `apps/api/src/firecrawl-provider.mjs` exports `runFirecrawlBrandExtraction`, `startBrandCrawl`, `buildFirecrawlCrawlRequest`, `getBrandCrawlStatus` — **none imported/called by any app file** (grep: only self + `tests/unit/firecrawl-provider.test.mjs`).
- `workers/queue/src/processor.mjs` is a 9-line heartbeat stub: *"BullMQ integration is introduced by V0-F4; this process is a local wake-up boundary stub."* It claims/completes no `brand_crawl` jobs.
- `workers/python/fake_worker.py` is a fake stub.
- The **only** active completion path is the demo mock `apps/web/app/api/brand-extract/demo-complete-crawl/route.ts` → posts a canned `demoScrapeFixture` (one page, one fake logo `{websiteUrl}/logo.svg`, `:7-36`) with `schemaVersion: 'brand.extraction.output.v1'` (`:87`).

### 5.2 The trailing-slash hypothesis is WRONG
`normalizeCrawlUrl` (`workspace-store.mjs:15839-15863`) force-adds a trailing slash:
```js
parsed.pathname = collapsePath(parsed.pathname || "/");
if (!parsed.pathname.endsWith("/")) {
  parsed.pathname = `${parsed.pathname}/`;
}
```
`https://example.com` → `https://example.com/`; `…/products` → `…/products/`. `crawlRun` stores only `sourceUrl` (raw) and `normalizedUrl` (slashed) (`workspace-store.mjs:499-500`); the Firecrawl provider's `normalizeBaseUrl` (`firecrawl-provider.mjs:707-713`) also sets pathname `/`. So the start URL always carries a slash wherever used. **The user's hypothesis is refuted.**

### 5.3 Why "images not fetched from the homepage"
- No in-repo code fetches homepage HTML or parses `<img>`, `og:image`, `<link rel=icon>`, or CSS backgrounds. `apps/api` has no cheerio/playwright/jsdom (deps = NestJS + Prisma only). Image discovery is delegated entirely to Firecrawl's `images`/`branding` formats (`firecrawl-provider.mjs:3,564-580`) — which never run.
- In `manual` mode (`BrandExtractionStudio.tsx:297,343`) the demo route is skipped (`:564` guard) → the `brand_crawl` job stays `QUEUED` forever (no worker). This is the most likely real-world "crawl that doesn't go deep" experience.

### 5.4 Where "crawl is not deep enough" comes from
- The literal string **does not exist** in the project's app code (grep-verified across `apps/**`). The only depth-related hits are: the vendored `firecrawl-main/firecrawl-main/apps/api/src/services/worker/scrape-worker.ts:537` (a dropped-in copy of Firecrawl's *own* source, which the project does **not** run), and UI copy.
- The user's perception maps to: the Asset Pack Viewer empty state (`BrandExtractionStudio.tsx:1571`) *"Provide direct uploads or **run depth crawls** to harvest high-resolution visual anchors."* + the "Crawl Depth Limits (maxPages)" slider (`:997`) + helper *"Increasing limits gathers deep blog/claims context, but raises latency."* (`:1009`). An empty pack + this copy reads as "the crawl wasn't deep enough" — but the lever (maxPages) has no effect because no crawler runs.

### 5.5 Depth settings (all in dead code or demo)
- `maxDiscoveryDepth: 1` hardcoded in `firecrawl-provider.mjs:246` (dead). Default `maxPages: 5` (`normalizeCrawlScope:15819`, UI `:197`, `.env.example:52`), hard max 50. Permitted-path-prefixes default `["/"]` (`:15820`); UI requires `pathPrefixes.length>0` and supports `/all` (`:525-526`).

### 5.6 Root-cause chain (Issue 3)
1. No live crawler is wired (Firecrawl provider dead; worker stub; only demo mock runs).
2. In `manual` mode the job hangs `QUEUED` silently (no worker claims it).
3. The trailing slash is correctly enforced — not the cause.
4. The "not deep enough" perception is the empty Asset Pack + misreading the "run depth crawls" hint + the maxPages slider that has no effect.

---

## 6. The Fix (detailed)

Guiding rule: minimal, contract-aligned changes; TDD (failing test first); never weaken tests/evidence/permissions. Per `docs/V0/Features/Firecrawl/brand-extract-frontend-gap-analysis.md`, the intended shape is v3 candidates consumed by `candidate-adapter.ts`; the missing piece is the producer (real crawler) — deferred to its own V0 slice. This pass fixes the wiring so **what is actually produced shows up**, USPs stop being dropped, and the no-crawler case fails **loudly** instead of silently.

### 6.1 Issue 1 fixes — make assets land

**F1a — Add a `logo` branch to `assetsFromCandidate`** (`candidate-adapter.ts:299-324`).
Map a `logo` candidate `{src, alt}` → `UiAsset` (category "Logo", locator `src`, name `alt || "Logo"`, rightsBasis "Public website crawl evidence", permittedUse "Candidate review"). This alone makes the demo Asset Pack Viewer non-empty.
```ts
if (candidate.fieldType === "logo") {
  const value = candidate.value as { src?: string; alt?: string };
  if (!value?.src) return [];
  return [{ id: `${candidate.id}-logo`, category: "Logo", locator: value.src,
    rightsBasis: "Public website crawl evidence", permittedUse: "Candidate review",
    name: value.alt?.trim() || "Logo", status: "candidate" }];
}
```

**F1b — Surface uploaded `brandAssets`** (`candidate-adapter.ts:171-193` + backend shape).
- Adapter: read `response.brandAssets ?? response.data?.brandAssets` and map each to `UiAsset` (locator/name/category). Requires backend `publicBrandAsset` (`workspace-store.mjs:16020-16032`) to expose a short-lived `locator` (signed/relative URL), `name`, `category` — current shape has only `artifactId`/`rightsBasis`/`permittedUse`. Minimal: extend `publicBrandAsset` to include `locator`, `name`, `category` sourced from the stored artifact + a short-lived signed URL (per CLAUDE.md §8: signed URLs short-lived, never in copy/tooltips/data-attrs).
- Alternative if signed-URL plumbing is out of scope this pass: render uploaded assets from their retained artifact metadata with a "pending locator" status and a clear note; do **not** fabricate URLs.

**F1c — Consume the grouped asset pack** (frontend).
- On `ready`, call `client.getBrandAssetPack(runId)` once and pass `body.assetPack` into `adaptBrandCrawlRunResponse` (or extend `getBrandCrawlRun` to embed `assetPack`). Keep `extractAssetPack(candidates, rawAssetPack)` (`:289-297`) as the merger so candidate-derived assets (logo/visual_identity) + grouped assets combine. This aligns with the gap-analysis row *"assetPack grouped backend categories → getBrandAssetPack() → Asset pack viewer."*

**F1d — Keep the v3 producer path correct (no change needed now).** `assetsFromCandidate` already handles `visual_identity`/`rights_asset`/`media_asset`. Once a real crawler posts v3 (follow-up slice), assets appear automatically. No code change this pass; document as follow-up.

### 6.2 Issue 2 fixes — extract and keep USPs

**F2a — Stop dropping approved USPs** (`candidate-adapter.ts:219-287`).
Add a `usp` branch to `buildApprovalDraftFromCandidates`:
```ts
if (candidate.fieldType === "usp") {
  draft.positioning.differentiators = unique([...draft.positioning.differentiators, String(candidate.value)]);
}
```
(If the approval draft schema has a dedicated `positioning.usps`, populate that too.) This fixes the silent drop for every USP that *is* extracted (including the demo's).

**F2b — Add USPs to the v3 extraction contract** (so a real crawler extracts them).
- `firecrawl-provider.mjs`: add `unique_selling_points` (string array) to `homepageSchema` (`:58-73`) and to the homepage prompt (`:89`) — e.g. append `…, UNIQUE_SELLING_POINTS. Return only explicitly present values.` Also add `usp`/`unique_selling_points` to the vertical prompt fields where relevant.
- `brand-llm-extraction.mjs:1-22`: add `"usp"` to `allowedFieldTypes` so the structured extractor accepts model-produced USPs; map `usp` candidates through `buildBrandExtractionCandidates`.
- This only takes effect once the real crawler is wired (follow-up), but the contract is correct now (no silent rejection).

**F2c — Broaden the regex fallback (interim, until a real crawler runs)** (`brand-extraction.mjs:107-120`).
Replace the three hardcoded real-estate adjectives with a vertical-agnostic value-proposition heuristic (e.g. match phrases near "why us / what sets us apart / uniquely / only <brand> / guarantee" cues) and lower confidence. Keep the literal `USPs?:` match. Document that regex is a fallback, not the primary extractor (the primary is the v3 LLM pass in F2b).

### 6.3 Issue 3 fixes — make the no-crawler case loud (not silent)

**F3a — Fail fast when no crawler is configured.**
In `createBrandCrawlRun` (`workspace-store.mjs:480-577`) or at job creation: if `BRAND_CRAWL_MODE !== "firecrawl"` (or `FIRECRAWL_API_KEY` absent) **and** the request is not `local-demo`, mark the `brand_crawl` job `FAILED` with a stable error code (e.g. `CRAWL_PROVIDER_UNCONFIGURED`) and a user-facing detail: *"No crawl provider is configured, so website assets could not be harvested. Configure a crawl provider or attach direct uploads."* — instead of leaving it `QUEUED` forever. (Honors CLAUDE.md: "if the system does not know, it must say `unknown`"; and never claim crawl success before verification.)

**F3b — Correct the misleading empty-state copy** (`BrandExtractionStudio.tsx:1571`).
Replace *"Provide direct uploads or run depth crawls to harvest high-resolution visual anchors."* with copy that reflects the real failure reason (e.g. when no provider: *"No crawl provider is configured. Attach direct uploads or configure a crawl provider to harvest brand visuals."*). Removes the false "depth" lever implication.

**F3c — (Follow-up V0 slice) Wire a real crawl provider.**
Stand up `runFirecrawlBrandExtraction` (or an external worker) to claim + complete `brand_crawl` jobs with `brand.extraction.output.v3` output (`universal`/`vertical`/`assets`). Requires `BRAND_CRAWL_MODE=firecrawl` + a real `FIRECRAWL_API_KEY` + the provider/worker running. This is its own V0 slice (per CLAUDE.md §2/§5/§12 — do not introduce paid provider dependencies without the owning plan). Out of scope for this pass; documented as the structural fix so Issue 3 doesn't recur for real crawls.

### 6.4 Files to change (summary)
- `apps/web/app/brand-extract/_components/candidate-adapter.ts` — F1a (logo branch), F1b (read brandAssets), F1c (asset pack source), F2a (usp branch).
- `apps/api/src/workspace-store.mjs` — F1b (extend `publicBrandAsset`: locator/name/category + signed URL; include uploaded assets in asset pack), F3a (fail-fast job on no provider).
- `apps/api/src/firecrawl-provider.mjs` — F2b (add USP to homepage schema + prompt; vertical prompt). Dead-code still, but contract-correct for the follow-up.
- `apps/api/src/brand-llm-extraction.mjs` — F2b (add `usp` to `allowedFieldTypes`).
- `apps/api/src/brand-extraction.mjs` — F2c (broaden `extractBrandUsps` fallback).
- `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx` — F1c (call `getBrandAssetPack` on ready), F3b (empty-state copy).
- Tests + this RCA/fix doc.

---

## 7. Verification (Tests + Screenshots) — per user principle #4

### 7.1 TDD — failing tests first (red before green)
Build on existing tests: `tests/integration/branding-plan-flow.test.mjs`, `tests/unit/brand-extraction-script.test.mjs`, `tests/unit/firecrawl-provider.test.mjs`, `tests/unit/brand-llm-extraction.test.mjs`, `tests/unit/brand-extract-frontend-contract.test.mjs`.

- **T1 (assets, integration):** After a demo crawl completion, `getBrandAssetPack` (and the UI's adapted pack) returns a **non-empty** asset list containing the harvested logo (and uploaded assets). Currently fails (empty). Asserts F1a/F1b/F1c.
- **T2 (USP drop, unit):** Given an approved `usp` candidate, `buildApprovalDraftFromCandidates` places its value into `positioning.differentiators`. Currently fails (usp dropped). Asserts F2a.
- **T3 (USP extraction, unit):** `extractBrandUsps` returns ≥1 usp for a page that states value propositions without a literal `USPs:` label and is not real-estate. Currently fails. Asserts F2c.
- **T4 (USP in v3 contract, unit):** `homepageSchema`/homepage prompt include a USP field; `allowedFieldTypes` includes `usp`. Currently fails. Asserts F2b.
- **T5 (no-crawler guardrail, integration):** A `brand_crawl` job created with `BRAND_CRAWL_MODE !== "firecrawl"` (non-demo) ends `FAILED` with code `CRAWL_PROVIDER_UNCONFIGURED`, not `QUEUED`. Currently fails. Asserts F3a.
- **T6 (regression):** Re-run `tests/integration/branding-plan-flow.test.mjs` + `brand-extract-frontend-contract.test.mjs`; they must stay green (no weakened assertions).

### 7.2 Screenshots (before/after) — captured locally, then read
Run the stack: `apps/api` dev (port 3001) + `apps/web` dev (Next.js; `/api/v0` rewrites to `apps/api` per `apps/web/next.config.mjs:5-12`). Open `/brand-extract`, set API context (workspaceId + token), run a **demo** crawl against e.g. `https://auraestates.in`, walk Steps 1→6.

- **Before:** (1) Step 5 Asset Pack Viewer showing *"No assets were extracted yet"* + the misleading "run depth crawls…" hint; (2) Step 4 dossier showing the `USP` candidate (label "USP") present; (3) Step 6 approval draft with **empty** differentiators; (4) crawl status `ready` with empty pack.
- **After:** (1) Step 5 showing the harvested **logo** asset rendered (thumbnail + locator + basis/use); uploaded assets visible if attached; (2) Step 6 approval draft with **differentiators populated** from the approved USP; (3) (manual/no-provider case) a clear `CRAWL_PROVIDER_UNCONFIGURED` failure message instead of a silent hang/empty pack; (4) corrected empty-state copy.
- Read each screenshot to confirm the rendered text/asset matches the expected contract (locator present, labels correct, no fabricated URLs, no secrets/signed URLs leaked in the DOM beyond the short-lived `<img src>`).

### 7.3 Definition of done (per CLAUDE.md §6/§20)
- All T1–T6 pass red→green; existing integration/contract tests stay green.
- No claim of "crawl works" before fresh verification; the no-crawler case explicitly says it cannot crawl (`unknown`/failed), not "done".
- RCA + fix doc persisted to the repo (evidence lineage) — this file.
- Contract-shape changes (asset pack fields, USP field, error code) reflected in docs/changelog per CLAUDE.md §15.

---

## 8. Execution steps (after approval)

0. Persist this RCA + fix as a repo doc (this file). ✅
1. Write failing tests T1–T6; run narrow tests; record expected failures.
2. Implement F1a/F1b/F1c/F2a/F2b/F2c/F3a/F3b (minimal passing behaviour; one concern per change; no unrelated refactors).
3. Run narrow tests green; run nearby unit/contract/integration tests; regenerate/inspect any generated client diffs.
4. Run the stack locally; capture before/after screenshots; read them to confirm.
5. Update owning docs + changelog for contract changes (asset-pack fields, USP field, `CRAWL_PROVIDER_UNCONFIGURED`).
6. Report fresh verification commands + outcomes; flag any contract/tenant/billing/provider/UI impacts.
7. Follow-up (separate slice): F3c — wire the real Firecrawl provider/worker to produce v3 output.

---

## 9. Out of scope / open items (named, not guessed)
- **Real crawler wiring (F3c)** is a separate V0 slice (paid provider + worker boundary). This pass makes the failure loud and fixes the wiring for what already runs; it does not stand up a live Firecrawl crawl.
- **`V0_RUNTIME_DB=prisma`** is unset in `apps/api/.env`, so the in-memory store runs by default. The Prisma store lacks `getBrandCrawlRun`/`getBrandAssetPack` (`workspace-store.mjs:15535-15604`); if Prisma is later enabled, those must be implemented or the poll throws. Not in scope this pass (default config is in-memory) but flagged.
- **`firecrawl-main/firecrawl-main/`** is a vendored copy of Firecrawl's own source (not wired to this project). Its `scrape-worker.ts:537` depth message is Firecrawl's, not ours. Not used.

---

## 10. Quick-answer recap (for the original three questions)

1. **Is the backend wiring done properly? Why aren't brand assets coming in?** No. The wiring is broken at multiple layers: the frontend polls `getBrandCrawlRun` (which returns no `assetPack`), never calls the dedicated `getBrandAssetPack`; the adapter never reads the returned `brandAssets`; `assetsFromCandidate` has no `logo` branch so the only asset candidate the demo produces is dropped; and no live crawler exists to produce the v3 asset candidates the adapter was built to consume. (See §3.)
2. **Every prompt + why USPs aren't extracted:** Six Firecrawl LLM prompts + one structured-LLM input are listed verbatim in §4.2 (none request USPs; the LLM paths are dead code). USPs come only from `extractBrandUsps` regex (`brand-extraction.mjs:107-120`) which matches a literal `USPs:` label or three real-estate adjectives — so real sites yield none — and even matched USPs are dropped by `buildApprovalDraftFromCandidates` (no `usp` branch). (See §4.)
3. **Why is the crawl "not deep enough" / images not fetched; is it the missing `/`?** No live crawler is wired, so nothing is fetched at all — the only active path is a one-page demo mock. The trailing slash IS correctly added (`normalizeCrawlUrl:15859-15861`), so the `/` hypothesis is wrong. The "not deep enough" perception comes from the Asset Pack Viewer empty-state copy ("run depth crawls to harvest…") + the maxPages slider, which has no effect without a crawler. (See §5.)
