# V0 Firecrawl Brand Asset Acquisition Plan

**Status:** Supporting integration note for V0-B1, V0-B2 and the backend-only
Firecrawl revamp sprint; not the extraction-detail source of truth
**Scope:** Product V0 only
**Primary flow:** Company URL -> safe crawl -> fixed universal Firecrawl pass ->
selected or detected vertical pass -> evidence-backed candidates -> human approval
**Do not treat this document as approval to use extracted assets in production.** The
canonical approval contract remains `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`.

## 1. Source Documents And Authority

Authoritative V0 and project sources:

- `docs/V0/V0.md`
- `docs/V0/V0_PRODUCT_SPECIFICATION.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`
- `docs/V0/V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`
- `docs/Project/Governance/karpathy_SKILL.md`

Current Firecrawl extraction sources of truth:

- `docs/V0/Features/Firecrawl/brand-crawl-universal.md`
- `docs/V0/Features/Firecrawl/brand-crawl-verticals.md`

These two feature guides supersede this plan and older V0 documents for crawl passes,
request parameters, prompts, schemas, extracted fields, asset harvesting and output
shapes. This plan supplies integration, security, tenancy, evidence and approval context
only. Where a safety rule conflicts with an extraction detail, the owning safety contract
continues to take priority.

## 2. First-Principles Workflow

The brand workflow starts from a permitted company URL and optional approved files. The
system's job is to collect evidence-backed brand candidates and retained asset references,
not to approve brand truth.

The crawl engine runs in this order:

1. Normalize and validate the public website URL.
2. Block private, local, metadata and unsafe targets.
3. Record crawl scope, robots/policy result, source-use attestation and optional requested
   brand type.
4. Create `BrandCrawlRun`, associated clean `BrandAsset` rows when approved files exist,
   a `brand_crawl` `Job`, and outbox wake-up evidence.
5. Run the fixed universal Firecrawl pass from `brand-crawl-universal.md`.
6. Derive `schema_org_type`, `vertical_signals`, universal assets, source evidence and
   Firecrawl credit telemetry from the universal pass.
7. Resolve vertical routing:
   - if the user selected a brand type, run that vertical pass after universal evidence is
     retained;
   - if no type was selected, use universal `schema_org_type` and `vertical_signals`;
   - if selected and detected types disagree, retain both and surface a conflict candidate
     for review instead of silently overriding either value.
8. Run only the matching section from `brand-crawl-verticals.md`.
9. Download, quarantine, validate and promote eligible crawled images and screenshots to
   retained `Artifact`/`BrandAsset` records when rights and policy permit retention.
10. Normalise universal plus vertical output into `brand.extraction.output.v3`.
11. Persist `BrandCandidate` rows with field type, value, confidence, extraction state,
    source evidence, source fingerprint and any conflict marker.
12. Keep all extracted values as candidates until V0-B3 human approval creates an immutable
    approved `BrandProfile` version.

## 3. Brand Type Selection Contract

The intake UI may let the user select one brand type before crawl execution. Backend truth
must still run the universal pass first.

Allowed V0 brand types map to the vertical groups in
`brand-crawl-verticals.md`:

| Brand type key | Vertical group | Label |
|---|---|---|
| `d2c_ecommerce` | `G6` | D2C / ecommerce |
| `b2b_saas` | `G7` | B2B SaaS |
| `real_estate` | `G8` | Real estate |
| `healthcare` | `G9` | Healthcare |
| `education` | `G10` | Education |
| `financial_services` | `G11` | Financial services |
| `restaurant_fb` | `G12` | Restaurant / F&B |
| `fitness_wellness` | `G13` | Fitness / wellness |
| `automotive` | `G14` | Automotive |
| `legal_professional` | `G15` | Legal / professional services |
| `travel_hospitality` | `G16` | Travel / hospitality |
| `home_services` | `G17` | Home services / interior design |

The selected type changes the vertical pass and candidate grouping, not the approval gate.
Universal extraction is always present. For V0 acceptance, `real_estate` remains the
reference path and must retain RERA, possession, price, location, project and amenity
evidence when present.

## 4. Firecrawl Provider Boundary

Firecrawl is a provider adapter, not browser logic.

- Browser code never calls Firecrawl and never receives `FIRECRAWL_API_KEY`.
- Provider SDK/client code lives behind the crawl adapter used by the NestJS queue
  processor or a private worker boundary.
- The API key comes from server-side configuration or credential metadata only.
- Raw Firecrawl payloads, provider request IDs that grant access, raw HTML, prompt
  material, object keys and signed URLs never appear in browser responses, analytics,
  job events or retained public artifacts.
- Provider output is normalised into versioned V0 contracts before the domain layer
  persists candidates.
- Deterministic simulator fixtures remain the default for local, test and CI.

## 5. Universal Pass

The universal pass uses `docs/V0/Features/Firecrawl/brand-crawl-universal.md` without
modification. It produces the canonical universal asset structure:

- `visual_identity`: logos, favicon, OG image, colour palette, typography, screenshots and
  downloaded image references.
- `copy_messaging`: brand name, tagline, meta description, hero copy, CTAs, pain points,
  audience and guarantee language.
- `social_proof`: testimonials, ratings, case studies, stats, client names, video
  testimonials and trust badges.
- `brand_personality`: mission, origin, values, founders, community language, awards,
  certifications, vocabulary and tone signals.
- `metadata`: schema type, vertical signals, locations, language, FAQ and objection data.
- `raw_pages`: retained markdown evidence for approved pages.

The V0 adapter may adapt location to India-first defaults where legally and technically
supported, but must preserve the fixed universal extraction fields and prompts as the
source guide defines them.

## 6. Vertical Pass

After universal extraction, run exactly one matching vertical section from
`brand-crawl-verticals.md`. The result appends a `vertical_assets` block to the universal
profile shape and is then normalised into V0 candidate and asset records.

Second-order frontend implication: the brand review screen should group candidates by
universal sections first, then show the selected/detected vertical group. Users should be
able to see why the system chose a vertical, whether the user-selected type disagreed with
detection, which pages were skipped, and which required approval fields remain unresolved.

## 7. Artifact And Asset Retention

Firecrawl-discovered assets are useful later for scripts, composition, thumbnails, review
and final media, but they remain unapproved until B3.

Retention rules:

- Crawled images and screenshots enter quarantine before becoming `CLEAN`.
- Retained public assets create private `Artifact` rows with workspace ownership, hash,
  content type, producer, retention class and source evidence.
- Eligible brand images create `BrandAsset` candidates linked to the crawl run.
- Provider URLs are transient locators, not production asset sources.
- PDF/brochure binaries are retained only when the crawl permission and rights
  acknowledgement allow downloadable document collection.
- Every retained asset has a rights basis and permitted use; missing rights keeps the
  asset as source evidence only.

## 8. Normalised Output Contract

The backend revamp should introduce `brand.extraction.output.v3` for Firecrawl universal
plus vertical output. V2 remains accepted only for existing deterministic fixtures until
the migration is complete.

Minimum shape:

```json
{
  "schemaVersion": "brand.extraction.output.v3",
  "provider": "firecrawl|simulator",
  "crawlRunId": "uuid",
  "universal": {
    "sourceGuide": "docs/V0/Features/Firecrawl/brand-crawl-universal.md",
    "profile": {}
  },
  "vertical": {
    "sourceGuide": "docs/V0/Features/Firecrawl/brand-crawl-verticals.md",
    "selectedBrandType": "real_estate",
    "detectedBrandType": "real_estate",
    "conflict": false,
    "assets": {}
  },
  "pages": [],
  "assets": [],
  "creditUsage": {
    "estimatedCredits": 64,
    "observedCredits": null
  }
}
```

The adapter must:

- map universal and vertical fields into existing or newly documented `BrandCandidate`
  field types;
- retain source locators, observed timestamps and excerpt hashes;
- reject empty, refused, malformed, schema-invalid or evidence-free output with
  `PROVIDER_OUTPUT_INVALID`;
- map provider timeout to `CRAWL_TIMEOUT` or `DEPENDENCY_UNAVAILABLE` according to cause;
- record skipped pages and 404 fallbacks as crawl evidence, not extraction success;
- store Firecrawl credit usage as operational telemetry and cost evidence, not approved
  brand truth.

## 9. Candidate Field Expansion

The current V0 candidate contract covers the core fields but must be extended for the
new crawl detail. Required backend candidate groups:

| Candidate group | Examples |
|---|---|
| `identity` | brand name, legal name, schema.org type, market |
| `visual_identity` | logo, favicon, OG image, colours, typography, screenshots |
| `copy_messaging` | tagline, hero copy, CTAs, pain points, guarantee language |
| `social_proof` | testimonials, ratings, trust badges, awards, certifications |
| `voice` | tone signals, vocabulary, writing style tags, approved examples |
| `product_service` | product, service, project, listing, course, menu or programme data |
| `claim` | RERA, price, possession, amenities, ROI, accreditation and other evidenced claims |
| `prohibited_claim` | guaranteed returns, unsupported performance claims or unsafe rewrites |
| `audience` | explicit who-it-is-for language and objection themes |
| `publishing_social` | public social links and external profile references |
| `rights_asset` | retained image/PDF/screenshot candidates with permitted use |
| `vertical_conflict` | selected/detected type disagreement requiring human review |

Approval still uses `V0_BRAND_PROFILE_CONTRACT.md`. New field types must be documented in
OpenAPI and tested through generated clients before UI consumption.

## 10. Backend-First Sprint Plan

The backend revamp is split from frontend execution so provider wiring, schema and evidence
contracts are correct before new UI screens depend on them. The sprint lives in
`docs/V0/Sprints/V0-B2A_FIRECRAWL_BRAND_CRAWL_BACKEND_REVAMP_SPRINT.md`.

Backend implementation order:

1. Contract tests for `POST /brands/crawl-runs` accepting optional `brandType`.
2. Contract tests for rejection of unsupported brand types and protected targets.
3. Schema/data update for selected and detected brand type, universal artifact,
   vertical artifact, asset inventory, crawl cost and extraction schema version.
4. Firecrawl adapter interface with deterministic simulator parity.
5. Universal pass normalisation using the fixed guide.
6. Vertical pass routing and conflict retention.
7. Asset download, quarantine and validation for crawled image/PDF/screenshot assets.
8. Candidate extraction expansion and source evidence preservation.
9. Job progress and error mapping for multi-pass crawl.
10. OpenAPI/client regeneration and contract diff inspection.
11. Nearby integration, RLS, redaction and restore checks.

## 11. Known Gaps Before Implementation

These are not blockers to writing the sprint, but they must be closed before claiming the
Firecrawl revamp works:

1. The exact executable `BrandCrawlRun` schema must confirm whether selected/detected
   brand type fields become columns or live inside `crawlScope`.
2. `brand.extraction.output.v3` JSON Schema and fixtures do not exist yet.
3. Candidate field types for vertical assets and positive claim evidence need OpenAPI and
   approval-screen support.
4. Firecrawl observed credit usage must be captured without turning provider cost into
   user billing unless a later price-version contract authorises it.
5. Asset retention needs a clear policy for public images whose page permits viewing but
   not production reuse.
6. Retained crawl artifacts use the existing private-artifact access contract; browser
   rendering must resolve `artifactId` through authorised short-lived access and must not
   treat `artifact:<id>` or a provider URL as a public image URL.

## 12. Acceptance Criteria For The Backend Revamp

- The universal Firecrawl guide remains unchanged.
- User-selected brand type is accepted, validated and retained.
- Universal extraction always runs before any vertical extraction.
- Exactly one vertical section runs for the selected or detected type; every documented
  index, detail, gallery, pricing or team pass inside that section may run.
- Selected/detected disagreement creates visible conflict evidence.
- Firecrawl API key is server-side only and is absent from browser code, logs, analytics,
  job events and retained artifacts.
- Crawled images/screenshots/documents are retained only through quarantine, validation,
  hash and rights evidence.
- Extracted values remain candidates and cannot become production truth before B3 approval.
- Empty, malformed, refused, prompt-injected or evidence-free output fails with stable
  errors and cannot create approved brand truth.
- Contract tests prove same-workspace access, cross-workspace hiding, idempotency,
  malformed provider output and deterministic simulator parity.
