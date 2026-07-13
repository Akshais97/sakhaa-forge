# Firecrawl Brand-Crawl Field Implementation Audit

> Audit date: 2026-07-08
> Scope: whether all fields from `docs/V0/Features/Firecrawl/brand-crawl-universal.md` and
> `docs/V0/Features/Firecrawl/brand-crawl-verticals.md` have been implemented in the application.
> Judged against the docs' intent (real per-pass Firecrawl LLM calls).

## Verdict

**No.** The vast majority of fields, passes, formats, and the output structure defined in the two
Firecrawl docs are **not** implemented. Of the spec's coverage: 0 of 8 universal passes, 0 of 12
vertical passes, 0 of ~42 universal assets persisted in spec shape, and 0 of ~80 vertical fields
extracted. The implementation is a single bulk `/crawl` call plus a regex-based candidate
extractor persisted to in-memory `Map`s.

---

## Context

The two feature docs define a complete two-phase Firecrawl brand-asset acquisition pipeline:

- **Universal** (`brand-crawl-universal.md`): 5 page scrapes + branding, producing
  `brand_universal.json` with 42 universal assets grouped G1–G5, across Passes 1, 2A–2D, 3, 4, 5.
  Output sections: `visual_identity`, `copy_messaging`, `social_proof`, `brand_personality`,
  `metadata`, `raw_pages`.
- **Vertical** (`brand-crawl-verticals.md`): runs after universal + vertical detection; 12
  verticals G6–G17, each with 2–3 passes and per-pass LLM `json` schemas (and native
  `product`/`menu` formats). Output: a `vertical_assets` append block.

The actual implementation lives in `apps/api/src/` and is a single bulk `/crawl` call plus a
regex-based candidate extractor, persisted to in-memory `Map`s. It does not reproduce the spec.

---

## 1. Firecrawl formats requested vs. spec

`apps/api/src/firecrawl-provider.mjs:3` sends one request to `POST /crawl` with:

```
formats = ["markdown", "links", "images", "screenshot", "branding", "json"]
```

| Spec format | Requested? | Gap |
|---|---|---|
| `markdown` | yes | — |
| `branding` | yes | — |
| `images` | yes | no per-pass harvesting/categorization (Pass 4) |
| `links` | yes | no `PRIORITY_PATHS` routing (Pass 2) |
| `screenshot` | yes | no `fullPage`/`quality`/`viewport` options the spec defines; not split into hero vs full-page |
| `json` | **hollow** | sent as a bare string, **not** `{ type:"json", prompt, schema }`. None of the spec's LLM extractions run. |
| `rawHtml` | **no** | blocks Pass 5 metadata (JSON-LD / meta keywords / hreflang / og:locale) |
| `product` | **no** | blocks G6-Pass-2 (native product detail extraction) |
| `menu` | **no** | blocks G12-Pass-1 (native menu extraction) |

The spec's architecture is **per-page `POST /scrape` calls with per-pass format sets and per-pass
JSON schemas**. The code does one bulk `/crawl` over the domain with `maxDiscoveryDepth:1`,
`limit:5` (default). These are fundamentally different shapes.

---

## 2. Universal passes — none implemented as specified

| Spec pass | Prompt/Schema | Implemented? |
|---|---|---|
| Pass 1 — Homepage | P1-HOMEPAGE / S1-HOMEPAGE | **Missing** (no dedicated homepage scrape; no prompt/schema) |
| Pass 2A — About | P2A-ABOUT / S2A-ABOUT | **Missing** |
| Pass 2B — Reviews | P2B-REVIEWS / S2B-REVIEWS | **Missing** |
| Pass 2C — FAQ | P2C-FAQ / S2C-FAQ | **Missing** |
| Pass 2D — Blog index | P2D-BLOG / S2D-BLOG | **Missing** — and `/blog` is in `defaultExcludePrefixes` (`firecrawl-provider.mjs:2`), the opposite of the spec |
| Pass 3 — Blog deep read (top 2) | P3-BLOGPOST / S3-BLOGPOST | **Missing** |
| Pass 4 — Image harvest (filter + categorize) | `IMAGE_FILTER_RULES` / `IMAGE_CATEGORIES` | **Missing** |
| Pass 5 — Metadata (rawHtml JSON-LD/meta) | — | **Missing** (`rawHtml` not requested) |

Include/exclude prefixes (`firecrawl-provider.mjs:1-2`) are real-estate-flavored
(`/projects`, `/properties`, `/rera`, `/brochure`) and exclude `/blog`. `/reviews`, `/faq`,
`/testimonials`, `/help` are not included. This is a path filter on one crawl, not discrete passes.

---

## 3. Universal output fields — `brand_universal.json` not produced

The spec output file (`brand_universal.json`) is **never created**. Persistence is in-memory
`Map`s (`workspace-store.mjs:149-156`): `brandCrawlRuns`, `brandAssets`, `brandCandidates`,
`brandProfiles`. No file, no DB backing for the brand store.

Spec top-level keys and their status in the persisted profile (`normalizeBrandProfile`,
`workspace-store.mjs:18516-18535`):

| Spec key | In persisted profile? | Notes |
|---|---|---|
| `brand_id` | no | only as a column on `BrandProfile`/`BrandCandidate`, not in the spec's output object |
| `domain` | no | stored on `BrandCrawlRun.sourceUrl`, not in profile |
| `crawl_date` | no | only `createdAt` on rows |
| `detected_vertical` | no | read from worker input only (`brand-extraction.mjs:199`); never computed |
| `visual_identity` | **name only** | passthrough `{}` (`profile.visualIdentity ?? {}`); not the spec's `{logo_url, favicon_url, og_image_url, colors{...}, typography{...}, color_scheme, hero_screenshot_url, full_page_screenshot_url, downloaded_images}` |
| `copy_messaging` | **absent** | none of `brand_name, tagline, meta_description, hero_h1, hero_subheadline, feature_headlines, cta_buttons, pain_points, who_its_for, guarantee_language` are persisted in this shape |
| `social_proof` | **absent** | `testimonials, aggregate_rating, case_study_headlines, before_after_stats, client_company_names, video_testimonial_urls, trust_badges` — none persisted |
| `brand_personality` | **absent** | `mission_statement, origin_story, brand_values, founder_names, founder_story, community_language, awards_accolades, certifications, media_mentions, vocabulary_signature, writing_style_tags, tone_signals, key_claims, social_links` — none persisted |
| `metadata` | **absent** | `schema_org_type, vertical_signals, trust_signals, locations_served, language, hreflang_locales, faq_items, objection_themes, refund_policy_summary, guarantee_terms` — none persisted |
| `raw_pages` | **absent** | `homepage_markdown, about_markdown, blog_posts_markdown` — not retained |

### What the implementation extracts instead

`brand-extraction.mjs` produces ~16 loose `fieldType` candidate tags via regex + reading
`branding.*`, stored as flat `BrandCandidate` rows:

`summary, usp, cta, audience, color, font, logo, prohibited_claim, positioning, pricing, rating,
regulated_claim, missing_asset, tone, media_asset, readiness_score` (hardcoded 60).

The v3 extractor (`extractFirecrawlV3Candidates`, gated on
`schemaVersion === "brand.extraction.output.v3"`) reads `vertical.assets` / `universal.profile`
that a **worker is expected to supply** — it does not produce them. It emits:
`vertical_conflict, product_service, claim, rights_asset, metadata{schemaOrgType}`.

These are candidate tags, not the spec's structured fields. The LLM-extracted arrays the spec
defines (e.g. `feature_headlines`, `testimonials[]`, `faq_items[]`, `objection_themes[]`) are
never produced.

---

## 4. Vertical crawl (G6–G17) — not implemented

- **No vertical passes.** None of G6–G17 run. No routing to `/products`, `/pricing`,
  `/integrations`, `/listings`, `/doctors`, `/courses`, `/menu`, `/classes`, `/inventory`,
  `/practice-areas`, `/rooms`, `/portfolio`, etc.
- **Native formats missing.** `product` (G6-Pass-2) and `menu` (G12-Pass-1) are not requested.
- **No vertical detection/routing.** The spec's `VERTICAL_MAP` (Schema.org @type → vertical file)
  is not reproduced in code. `detected_vertical` is only ever read, never computed.
- **`brandType` enum mismatch.** `supportedBrandTypes` (`workspace-store.mjs:15611-15621`) is
  `real_estate, local_service, ecommerce, b2b_saas, education, healthcare, hospitality,
  financial_services, consumer_brand`. The spec's vertical labels are
  `D2C, SaaS, RealEstate, Healthcare, Education, Fintech, Restaurant, Fitness, Auto, Legal,
  Hospitality, HomeServices`. No mapping between them. Missing from the enum entirely:
  Restaurant/F&B, Fitness/Wellness, Automotive, Legal, Home Services.
- **`vertical_assets` block absent from persisted output.** It appears only as input read by
  `extractFirecrawlV3Candidates` (`brand-extraction.mjs:196-197`): `vertical?.assets` and
  `raw_vertical_data`. The spec's append block
  (`detected_vertical, vertical_label, products_or_services, visual_assets{...}, copy_assets{...},
  raw_vertical_data`) is never built or persisted.

### Per-vertical field gaps (all missing)

Each vertical defines 2–3 passes with structured schemas. Examples of fields never extracted:

- **G6 D2C**: `product_names, collection_names, price_range, sale_indicators, product_card_urls,
  subscription_or_bundle, shipping_hook, label_tags` (catalog); native `product` variants
  (Pass 2); `ingredients_or_materials, product_certifications, size_guide, care_instructions` (Pass 3).
- **G7 SaaS**: `feature_names/descriptions, roi_claims, integration_count, dashboard_described,
  api_mentioned, security_claims, use_case_labels, product_screenshots_alt`; pricing
  `plan_names, plan_prices, free_tier, free_trial, enterprise_cta, most_popular_plan,
  key_differentiators`; integrations + competitor compare.
- **G8 Real Estate**: `listing_names, listing_urls, property_types, price_range, location_names,
  status_labels, developer_name, rera_numbers, filter_options`; detail `property_name,
  address_or_locality, specs, price, possession_date, amenities, floor_plan_description,
  nearby_landmarks, rera_number, virtual_tour_url`.
- **G9 Healthcare**: `treatment_names, specializations, technology_equipment, outcome_stats,
  accreditations, insurance_accepted, booking_cta, teleconsult_available, languages_spoken`;
  doctor profiles.
- **G10 Education**: `course_names, course_urls, subject_domains, certification_types,
  format_options, duration_range, price_range, free_resource_offer, enrollment_urgency`;
  placements `placement_rate, average_salary, hiring_companies, salary_range,
  student_success_stories, alumni_count, outcome_stats`.
- **G11 Fintech**: `product_names, key_rates, regulatory_badges, security_features,
  eligibility_requirements, min_investment_or_premium, returns_claim, claims_settlement_stat,
  app_availability, disclaimer_present, disclaimer_text`; calculator screenshot.
- **G12 F&B**: native `menu` sections/items (not requested); gallery categorization
  `food_photography_urls, interior_urls, exterior_urls, chef_team_urls, event_urls`;
  `delivery_platforms, operating_hours, reservation_cta, signature_dishes, cuisine_types,
  catering_available`.
- **G13 Fitness**: `class_names/descriptions, class_schedule_preview, difficulty_levels,
  format_types, trial_offer`; transformations `transformation_stories, aggregate_results,
  before_after_image_pairs, trainer_names_in_stories`.
- **G14 Automotive**: `vehicle_names, vehicle_urls, price_range, vehicle_types, fuel_types,
  year_range, finance_hook, trade_in_offer`; detail `vehicle_name, specs, price, color_options,
  safety_ratings, key_features, image_angles_available, test_drive_cta`.
- **G15 Legal**: `practice_area_names/urls, jurisdiction, case_types, bar_associations,
  languages_served, consultation_cta`; professional profiles + `firm_size`.
- **G16 Hospitality**: `room_types, room_urls, price_range, max_occupancy, amenity_highlights,
  view_types, booking_cta, urgency_language, sustainability_claims`; room detail + gallery
  tagging.
- **G17 Home Services**: `service_names, service_areas, license_and_insurance,
  brand_partnerships, portfolio_urls, process_steps, warranty_terms, estimate_cta,
  typical_timeline`; portfolio `project_names, project_types, before_after_pairs,
  client_testimonials_on_portfolio, materials_featured`.

All ~80 vertical-specific fields across G6–G17 are unimplemented.

---

## 5. Contract/schema-side gaps (corroborating)

From `V0_BRAND_PROFILE_CONTRACT.md`, `V0_PRISMA_SCHEMA.md`,
`V0_FIRECRAWL_BRAND_ASSET_ACQUISITION_PLAN.md`:

- **`brand.extraction.output.v3` JSON Schema does not exist** (acquisition plan §11 gap #2). This
  is the intended normalised intermediate that would carry the Firecrawl-output → profile field
  mapping. Its absence means there is no field-level mapping from any Firecrawl output key to any
  brand profile contract field — only a group-level intent in acquisition plan §9.
- **OpenAPI models no brand structures.** `packages/contracts/src/openapi.v0.json` brand/crawl
  responses carry only prose `description` strings; no `components.schemas` for `BrandProfile`,
  `BrandCandidate`, `BrandAssetPack`, or nested objects. So the contract fields are documented in
  markdown but not encoded in the generated contract.
- **`BrandCrawlRun` executable schema missing spec columns** (`schema.prisma:433-463` vs
  `V0_PRISMA_SCHEMA.md:129-158`): `selectedBrandType`, `detectedBrandType`,
  `extractionSchemaVersion`, `providerCreditTelemetry`, `universalOutputArtifactId`,
  `verticalOutputArtifactId` are not columns. The spec index
  `@@index([workspaceId, selectedBrandType, detectedBrandType])` is replaced by
  `@@index([workspaceId, normalizedUrl])`.
- **No `getBrandProfile`/`listBrandProfiles` client methods** (`v0-client.mjs`); only
  `approveBrandProfile` mutates a profile.
- **No mapping file** under `docs/V0/Features/Firecrawl/` (only the two docs; no index/README).

---

## 6. Summary count

- **Universal**: 0 of 8 passes implemented; 0 of ~42 assets persisted in spec shape (only ~16 loose
  regex candidate tags produced; `visual_identity` key name shared but empty passthrough).
- **Vertical**: 0 of 12 verticals implemented; 0 of ~80 vertical fields extracted; no detection/
  routing; native `product`/`menu` formats not requested.
- **Formats**: 3 of 9 effectively usable (`markdown`, `branding`, `images`/`links`/`screenshot`
  requested but not used per-pass); `json` hollow; `rawHtml`, `product`, `menu` absent.
- **Output**: `brand_universal.json` not produced; persistence is in-memory `Map`s, not the spec
  file or the Prisma-backed store.

---

## 7. Tension worth noting (not resolved here)

The two docs describe **real paid Firecrawl LLM calls** (per-pass `json` extractions, native
`product`/`menu` formats, ~50–65 credits/brand). `CLAUDE.md §2` requires "deterministic
simulators by default for paid, publishing, provider and worker boundaries," and §5 keeps
providers behind adapters. The current implementation's simulator-style, regex-based approach is
closer to the V0 guardrail than to the docs. Reconciling the docs' real-call intent with §2 is a
decision for the implementation phase, not this audit.

---

## Key files

- `apps/api/src/firecrawl-provider.mjs` — single `/crawl` request, format list (line 3), include/exclude prefixes (lines 1-2)
- `apps/api/src/brand-extraction.mjs` — regex candidate extractor (lines 9-264); v3 extractor reads worker-supplied `vertical.assets`/`universal.profile` (lines 193-264)
- `apps/api/src/brand-llm-extraction.mjs` — stubbed LLM path, not wired into crawl completion
- `apps/api/src/workspace-store.mjs` — in-memory Maps (149-156), `completeBrandCrawlJob` (6605-6661), `normalizeBrandProfile` (18516-18535), `supportedBrandTypes` (15611)
- `apps/api/src/server.mjs` — brand routes (1910-1911); no pass/vertical routes
- `packages/db/prisma/schema.prisma` — `BrandCrawlRun` (433), `BrandAsset` (465), `BrandCandidate` (484), `BrandProfile` (507)
- `packages/contracts/src/openapi.v0.json` — brand/crawl endpoints, no structured schemas
- `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`, `docs/V0/V0_FIRECRAWL_BRAND_ASSET_ACQUISITION_PLAN.md`, `docs/V0/V0_PRISMA_SCHEMA.md` — contract/spec side
