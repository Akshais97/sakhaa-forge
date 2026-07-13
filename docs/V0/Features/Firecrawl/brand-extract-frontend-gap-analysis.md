# Brand extract frontend gap analysis

**Scope:** `/brand-extract` page alignment with the current Firecrawl backend extraction contract.

**Sources used:** `apps/api/src/firecrawl-provider.mjs`, `apps/api/src/brand-extraction.mjs`,
`apps/api/src/workspace-store.mjs`, `docs/V0/Features/Firecrawl/brand-crawl-universal.md` and
`docs/V0/Features/Firecrawl/brand-crawl-verticals.md`.

Sprint documents were not used as source of truth.

## RCA

The backend now emits `brand.extraction.output.v3`: a universal Firecrawl pass, one selected or
detected vertical pass, grouped candidates, selected/detected brand-type metadata, asset evidence
and provider credit telemetry. The `/brand-extract` page still expected an older ad hoc UI shape:
`brandName`, `tagline`, `colorSwatches`, `ctaButton`, `products_or_services`, `pricingSummary`,
`reraNumbers` and `audienceCandidates`.

Because the page filtered by `candidate.section` and mapped approval by `candidate.field`, any
backend candidate that only had `fieldType` was either invisible or could not prefill the final
approval form.

## Missing backend values and ideal frontend stage

| Backend value | Where backend exposes it | Previous frontend gap | Ideal frontend stage |
|---|---|---|---|
| `identity` candidate: brand name, legal name, schema type, market | `BrandCandidate.fieldType=identity` | Not rendered or mapped unless renamed to `brandName` | Candidate dossier: Identity; approval: name, industry, markets |
| `visual_identity`: logo, favicon, OG image, colors, typography, screenshots | `BrandCandidate.fieldType=visual_identity` | Only legacy `colorSwatches` rendered; logos, screenshots and fonts mostly lost | Candidate dossier: Visual; asset pack; approval: visual identity |
| `copy_messaging`: tagline, meta description, hero H1/subheadline, feature headlines, CTA buttons, pain points, guarantee language | `BrandCandidate.fieldType=copy_messaging` | Only `tagline` and `ctaButton` mapped | Candidate dossier: Copy; approval: positioning and calls to action |
| `social_proof`: testimonials, aggregate rating, case studies, stats, clients, videos, trust badges | `BrandCandidate.fieldType=social_proof` | Only legacy `testimonials` checked | Candidate dossier: Social proof; approval: proof points |
| `voice`: mission, origin story, values, founders, vocabulary, tone, key claims | `BrandCandidate.fieldType=voice` | Only legacy `toneSignals` mapped | Candidate dossier: Voice; approval: voice attributes and examples |
| `audience`: who it is for, objection themes, FAQ items | `BrandCandidate.fieldType=audience` | Only legacy `audienceCandidates` mapped | Candidate dossier: Audiences; approval: audiences |
| `publishing_social`: social profile links | `BrandCandidate.fieldType=publishing_social` | Not displayed | Candidate dossier: Publishing social; approval: social/language references |
| `product_service` | `BrandCandidate.fieldType=product_service` | Legacy field name mismatch | Candidate dossier: Products and services; approval: products |
| `claim`: pricing, RERA, amenities, disclaimers and vertical claims | `BrandCandidate.fieldType=claim` | Only `pricingSummary` and `reraNumbers` handled | Candidate dossier: Compliance/offers; approval: claims |
| `rights_asset` | `BrandCandidate.fieldType=rights_asset` and `assets` | Not consistently rendered in asset pack | Candidate dossier: Compliance; asset pack |
| `metadata`: schema.org type | `BrandCandidate.fieldType=metadata` | Not displayed | Candidate dossier: Metadata |
| `vertical_conflict`: selected vs detected brand type | `BrandCandidate.fieldType=vertical_conflict` and crawl run metadata | Only a local comparison was shown | Live scan conflict; metadata dossier; approval source summary |
| `selectedBrandType`, `detectedBrandType`, `extractionSchemaVersion` | `publicBrandCrawlRun()` | Schema was hard-coded as `v3.0.4` | Live scan inspector; approval source summary |
| `providerCreditTelemetry.estimatedCredits` and `observedCredits` | `publicBrandCrawlRun()` | Not shown | Live scan inspector |
| `assetPack` grouped backend categories | `getBrandAssetPack()` and candidate groups | Page used flat local asset objects only | Asset pack viewer |

## Fix

The page now uses `candidate-adapter.ts` to normalize backend `fieldType` candidates into UI
sections, preserve evidence/source hashes, expose provider credit telemetry and build the approval
draft from backend candidate groups instead of legacy UI-only field names.
