# Feature 1 — Brand Extraction Front-End Design

> End-state integration spec for the Firecrawl brand-crawl feature's front-end. Defines the
> **input fields** the user supplies, the **output fields** the crawl/API expose, and **what is
> visible in the front-end** per screen. Use this as the front-end integration checklist.
>
> Source specs: `docs/V0/Features/Firecrawl/brand-crawl-universal.md` (G1–G5, 42 universal
> assets), `docs/V0/Features/Firecrawl/brand-crawl-verticals.md` (G6–G17, 12 verticals).
> Contract: `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`. API: `packages/contracts/src/openapi.v0.json`.
> Current surfaces: mockup at `/app/branding` (`<BrandAtelier/>`, hardcoded `DEMO_BRAND`, no API)
> and workflow shell at `/w/[workspaceSlug]` (calls 3 of 7 brand methods).

---

## A. Input Fields — what the user supplies

### A1. Brand intake / crawl run (`POST /brands/crawl-runs`)

| Field | Type | Required | Allowed / notes |
|---|---|---|---|
| `workspaceId` | UUID | yes | From session; not typed by user |
| `websiteUrl` | string | yes | `http:`/`https:`; SSRF-guarded; normalized |
| `rightsAcknowledged` | boolean | yes | Must be exactly `true` or crawl is rejected |
| `brandType` | enum | optional | `real_estate` · `local_service` · `ecommerce` · `b2b_saas` · `education` · `healthcare` · `hospitality` · `financial_services` · `consumer_brand`. Selects vertical crawl depth. **Front-end must add a selector** (currently missing). |
| `crawlScope.maxPages` | int | optional | Default 5, range [1, 50] |
| `crawlScope.permittedPathPrefixes` | string[] | optional | Default `["/"]`; each must start with `/` |
| `assets[].artifactId` | UUID | yes if asset attached | Must reference a `CLEAN` artifact |
| `assets[].rightsBasis` | string | yes if asset attached | Ownership/licence basis |
| `assets[].permittedUse` | string | yes if asset attached | Permitted product use |

### A2. Onboarding brand context (`POST /onboarding/brand-context`)

Optional pre-crawl context. Currently a dead static form — integration wires it to the API.

| Field | Type | Required | Default |
|---|---|---|---|
| `workspaceId` | UUID | yes | — |
| `brandName` | string | yes | — |
| `websiteUrl` | string | optional | — |
| `industry` | string | optional | `null` |
| `videoGoal` | string | optional | `null` |
| `primaryMarket` | string | optional | `"India"` |
| `language` | string | optional | `"en-IN"` |
| `targetPlatforms` | string[] | optional | `[]` |

### A3. Brand-type / vertical selection

The Firecrawl verticals doc defines 12 verticals (G6–G17). The API enum covers 9 and is missing
**Restaurant/F&B, Fitness/Wellness, Automotive, Legal, Home Services**. Integration must:
- extend the `brandType` enum to cover all 12 vertical labels, **or** add a documented mapping
  to the spec's `detected_vertical` codes (G6–G17);
- render a selector in the intake UI so the user picks the crawl-depth vertical.

### A4. Approval input (`POST /brands/{brand_id}/approvals`)

Today the front-end sends only `publicName, positioning, targetAudience, cta, tone,
rightsAttestation` and hardcodes `industry: "real_estate"`. Integration expands this to the full
approved-field set (see §C5).

---

## B. Output Fields — what the crawl produces and the API exposes

### B1. `brand_universal.json` (universal crawl output, G1–G5)

- `brand_id`, `domain`, `crawl_date`, `detected_vertical`
- **`visual_identity`**: `logo_url`, `favicon_url`, `og_image_url`, `colors{primary, secondary,
  accent, background, text_primary, text_secondary, link, success, warning, error}`,
  `typography{primary_font, heading_font, code_font, font_sizes, font_weights}`,
  `color_scheme`, `hero_screenshot_url`, `full_page_screenshot_url`, `downloaded_images[]`
- **`copy_messaging`**: `brand_name`, `tagline`, `meta_description`, `hero_h1`,
  `hero_subheadline`, `feature_headlines[]`, `cta_buttons[]`, `pain_points[]`, `who_its_for`,
  `guarantee_language`
- **`social_proof`**: `testimonials[]`, `aggregate_rating`, `case_study_headlines[]`,
  `before_after_stats[]`, `client_company_names[]`, `video_testimonial_urls[]`, `trust_badges[]`
- **`brand_personality`**: `mission_statement`, `origin_story`, `brand_values[]`,
  `founder_names[]`, `founder_story`, `community_language`, `awards_accolades[]`,
  `certifications[]`, `media_mentions[]`, `vocabulary_signature[]`, `writing_style_tags[]`,
  `tone_signals[]`, `key_claims[]`, `social_links[]`
- **`metadata`**: `schema_org_type`, `vertical_signals[]`, `trust_signals[]`, `locations_served`,
  `language`, `hreflang_locales[]`, `faq_items[]`, `objection_themes[]`,
  `refund_policy_summary`, `guarantee_terms`
- **`raw_pages`**: `homepage_markdown`, `about_markdown`, `blog_posts_markdown[]`

### B2. `vertical_assets` append block (vertical crawl output, G6–G17)

- `detected_vertical` (G6–G17 code), `vertical_label`
- `products_or_services[]`
- `visual_assets{product_images[], lifestyle_images[], facility_images[], team_images[],
  before_after_pairs[], screenshots[]}`
- `copy_assets{service_descriptions[], outcome_stats[], pricing_summary, cta_language,
  urgency_language, compliance_disclaimers[]}`
- `raw_vertical_data{}` (per-vertical structured fields — see B3)

### B3. Per-vertical `raw_vertical_data` fields (by detected vertical)

- **G6 D2C**: `product_names, collection_names, price_range, sale_indicators, product_card_urls,
  subscription_or_bundle, shipping_hook, label_tags`; product variants; `ingredients_or_materials,
  product_certifications, size_guide, care_instructions`
- **G7 SaaS**: `feature_names/descriptions, roi_claims, integration_count, dashboard_described,
  api_mentioned, security_claims, use_case_labels, product_screenshots_alt`; `plan_names,
  plan_prices, free_tier, free_trial, enterprise_cta, most_popular_plan, key_differentiators`;
  `integration_names, integration_categories, integration_logos`; competitor compare
- **G8 Real Estate**: `listing_names, listing_urls, property_types, price_range, location_names,
  status_labels, developer_name, rera_numbers, filter_options`; detail `property_name,
  address_or_locality, specs, price, possession_date, amenities, floor_plan_description,
  nearby_landmarks, rera_number, virtual_tour_url`
- **G9 Healthcare**: `treatment_names, specializations, technology_equipment, outcome_stats,
  accreditations, insurance_accepted, booking_cta, teleconsult_available, languages_spoken`;
  doctor profiles
- **G10 Education**: `course_names, course_urls, subject_domains, certification_types,
  format_options, duration_range, price_range, free_resource_offer, enrollment_urgency`;
  `placement_rate, average_salary, hiring_companies, salary_range, student_success_stories,
  alumni_count, outcome_stats`
- **G11 Fintech**: `product_names, key_rates, regulatory_badges, security_features,
  eligibility_requirements, min_investment_or_premium, returns_claim, claims_settlement_stat,
  app_availability, disclaimer_present, disclaimer_text`; calculator screenshot
- **G12 F&B**: native `menu` sections/items; `food_photography_urls, interior_urls,
  exterior_urls, chef_team_urls, event_urls`; `delivery_platforms, operating_hours,
  reservation_cta, signature_dishes, cuisine_types, catering_available`
- **G13 Fitness**: `class_names/descriptions, class_schedule_preview, difficulty_levels,
  format_types, trial_offer`; `transformation_stories, aggregate_results,
  before_after_image_pairs, trainer_names_in_stories`
- **G14 Automotive**: `vehicle_names, vehicle_urls, price_range, vehicle_types, fuel_types,
  year_range, finance_hook, trade_in_offer`; detail `vehicle_name, specs, price, color_options,
  safety_ratings, key_features, image_angles_available, test_drive_cta`
- **G15 Legal**: `practice_area_names/urls, jurisdiction, case_types, bar_associations,
  languages_served, consultation_cta`; professional profiles + `firm_size`
- **G16 Hospitality**: `room_types, room_urls, price_range, max_occupancy, amenity_highlights,
  view_types, booking_cta, urgency_language, sustainability_claims`; room detail + gallery tagging
- **G17 Home Services**: `service_names, service_areas, license_and_insurance,
  brand_partnerships, portfolio_urls, process_steps, warranty_terms, estimate_cta,
  typical_timeline`; portfolio `project_names, project_types, before_after_pairs,
  client_testimonials_on_portfolio, materials_featured`

### B4. API-exposed read models (what the front-end fetches)

| Endpoint | Returns | Currently called by web? |
|---|---|---|
| `GET /brands/crawl-runs/{id}` | crawl-run status, `selectedBrandType`, `detectedBrandType`, `extractionSchemaVersion`, provider credit telemetry, artifact refs (universal/vertical/asset-pack) | **No** — wire for status polling |
| `GET /brands/crawl-runs/{id}/asset-pack` | logos, imagery, brand-guideline docs, downloaded images | **No** — wire |
| `GET /brands/crawl-runs/{id}/candidates` | `BrandCandidate[]`: `{fieldType, value, confidence, decision, extractionState, sourceEvidence[{sourceType, locator, excerpt, excerptHash, observedAt}], conflict}` | Yes — but **not rendered as structured UI** |
| `GET /onboarding/brand-context` | saved onboarding context (A2) | **No** — wire |
| `POST /brands/{brand_id}/approvals` | approved profile version, approval audit | Yes |

`BrandCandidate.fieldType` values the front-end must render: `summary, usp, cta, audience, color,
font, logo, prohibited_claim, positioning, pricing, rating, regulated_claim, missing_asset, tone,
media_asset, readiness_score, vertical_conflict, product_service, claim, rights_asset, metadata`
(plus the structured universal/vertical fields once the v3 schema is implemented).

---

## C. Front-End Visibility — what the user sees

Two surfaces today: a static mockup at `/app/branding` (`<BrandAtelier/>`, hardcoded
`DEMO_BRAND`, no API) and a real workflow shell at `/w/[workspaceSlug]` (calls 3 of 7 brand
methods, renders almost nothing structured). Integration consolidates to the workflow shell and
makes the mockup's dossier real.

### C1. Brand intake screen (`brand-intake` step)

- **Website URL** input (validated `http/https`).
- **Rights acknowledgement** checkbox (gates submit).
- **NEW: Brand-type / vertical selector** (dropdown of the 12 verticals) → sends `brandType`.
- **NEW: Crawl scope controls** — `maxPages` (1–50) and `permittedPathPrefixes` editor.
- **NEW: Asset upload** — attach brand files (logo, guideline PDF, product images) with
  `rightsBasis` + `permittedUse` per file (replaces the current simulated upload).
- Submit → `createBrandCrawlRun`; show crawl-run id.

### C2. Crawl status / scan console (NEW — replaces fake `setTimeout` progression)

- Poll `getBrandCrawlRun`; show live status: queued → crawling → extracting → ready.
- Show pass progress: Pass 1 homepage, 2A–D priority pages, 3 blog, 4 image harvest, 5 metadata,
  then vertical passes for the detected vertical.
- Show provider credit telemetry (sanitized) and `detected_vertical` once detected.
- **Vertical-conflict banner** when `selectedBrandType` ≠ `detectedBrandType`: both retained, user
  must resolve before approval (per contract `source_summary.brand_type_conflict`).

### C3. Candidate dossier screen (`brand-candidates` step) — structured, not raw JSON

Render `listBrandCandidates` output as grouped, selectable cards. Each candidate shows its
`value`, `confidence`, `decision` (candidate/approved/rejected), `sourceEvidence` (locator,
excerpt, excerpt hash, observed-at), and a per-candidate approve/reject control. Groups:

- **Identity & positioning**: brand name, tagline, hero H1/subheadline, meta description,
  mission, origin story, who-its-for.
- **Visual identity**: logo candidates (rendered as images), favicon, OG image, color swatches
  (role: primary/secondary/accent/background/text), typography (font families/weights).
- **Copy & messaging**: feature headlines, CTA buttons, pain points, guarantee language.
- **Voice & tone**: tone signals, vocabulary signature, writing-style tags, key claims.
- **Social proof**: testimonials (quote/author/rating/outcome), aggregate rating, case-study
  headlines, before/after stats, client company names, video testimonial URLs, trust badges.
- **Products / services** (vertical): from `vertical_assets.products_or_services` + the
  per-vertical `raw_vertical_data` fields (B3).
- **Offers / pricing**: pricing summary, plan details (SaaS), price ranges, sale indicators.
- **Compliance**: regulated claims (RERA numbers, regulatory badges), disclaimers, refund/guarantee
  terms, FAQ items, objection themes.
- **Audiences**: audience candidates with geography, funnel stage, needs, objections.
- **Prohibited claims**: crawled prohibited-claim candidates (feed the prohibition list).
- **Missing assets**: `missing_asset` candidates with what's absent and why.
- **Media assets**: `media_asset` candidates (image/screen URLs by category: product/lifestyle/
  facility/team/before-after/screenshot).
- **Readiness score**: `readiness_score` with basis breakdown (not a hardcoded 78).
- **Raw pages**: collapsible markdown for homepage/about/blog posts (evidence view).

### C4. Asset pack viewer (NEW)

- `getBrandAssetPack` → render downloaded images by category (logo/product/lifestyle/team/
  facility/badge per `IMAGE_CATEGORIES`), brand-guideline PDFs, hero + full-page screenshots.
- Per-asset rights basis + permitted use label.

### C5. Brand approval screen (`brand-approval` step) — full field set

Today: 6 free-text fields + hardcoded `industry`. End-state: editable, pre-populated from
approved candidates, covering the `BrandProfile.profile` contract:

- `name.public`, `name.legal`, `industry` (selectable, not hardcoded), `markets[]`
- `positioning.statement`, `positioning.differentiators[]`, `positioning.proof_points[]`,
  `competitors[]`
- `visual_identity`: selected logos, colors (role/value/usage/prohibited_usage), fonts, imagery,
  layout rules
- `voice`: attributes, avoid, formality (formal/balanced/conversational), languages,
  approved examples, pronunciations
- `products[]`, `audiences[]`, `offers[]`, `calls_to_action[]`
- `claims[]` with status (approved / approved_with_disclaimer / pending_evidence / prohibited /
  expired), evidence artifact, required disclaimer, allowed channels
- `rules[]`: required/prohibited phrases, required disclosures, visual required/prohibited,
  competitor reference, channel/avatar restrictions
- `source_summary`: selected/detected brand type + conflict flag
- `rights_attestation` + approval actor + profile version + review hash

### C6. Onboarding context screen (NEW — wire the dead `/app/onboarding` form)

- Collect A2 fields, `saveOnboardingBrandContext` on save, `getOnboardingBrandContext` on load.
- Pre-fill intake `websiteUrl`/`brandName` from saved context.

### C7. Cross-cutting UI requirements (V0 front-end rules)

- Status labels/icons mapped to backend truth (`V0_STATUS_ENUMS.md`); preserve `unknown` state.
- Empty / loading / progress / failure / retry / recovery states for the async crawl workflow.
- No optimistic UI for approval (irreversible) — wait for server confirmation.
- Signed URLs short-lived, self-healing, never rendered as copy/tooltip/data-attr.
- Keyboard, focus, screen-reader, contrast, reduced-motion met.
- No secrets, signed URLs, or provider payloads in browser code/responses.

---

## D. Integration Summary — what "done" means

1. **Input**: intake screen collects website URL, rights, brand-type/vertical selector, crawl
   scope, asset uploads with rights; onboarding screen wired and persisting.
2. **Output**: crawl produces the full `brand_universal.json` (B1) + `vertical_assets` (B2/B3);
   API exposes crawl-run status, asset pack, candidates, profile; `brand.extraction.output.v3`
   JSON Schema exists and validates output.
3. **Front-end**: workflow shell renders live crawl status, a structured candidate dossier with
   per-candidate evidence + approve/reject, an asset-pack viewer, and a full approval form
   pre-populated from candidates — replacing the static mockup and the raw-JSON rendering.
4. **Wiring**: all 7 v0-client brand methods called (`getBrandCrawlRun`, `getBrandAssetPack`,
   `getOnboardingBrandContext`, `saveOnboardingBrandContext` added to the 3 already wired).
5. **Contract**: OpenAPI gains `components.schemas` for `BrandProfile`, `BrandCandidate`,
   `BrandAssetPack`; `BrandCrawlRun` gains the spec columns (`selectedBrandType`,
   `detectedBrandType`, `extractionSchemaVersion`, `universalOutputArtifactId`,
   `verticalOutputArtifactId`).

> Note: the Firecrawl docs assume real paid Firecrawl LLM calls while `CLAUDE.md §2` mandates
> deterministic simulators for provider boundaries. That reconciliation (real calls vs simulator)
> is a separate decision and is not resolved by this document.
