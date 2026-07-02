---
name: firecrawl-brand-specific-video-assets
summary: Per-brand execution Skill that turns one brand URL into a video-ready asset pack using the universal Firecrawl Brand Video Assets Skill plus vertical-specific extraction prompts.
version: 1.0.0
owner: video-generator
requires: firecrawl-brand-video-assets
applies_to: one brand at a time
---

# Firecrawl Brand-Specific Video Assets Skill

## 1. Purpose

Use this Skill after the operator gives a brand URL and wants Firecrawl to extract the assets required to create videos for that specific brand.

This Skill converts a brand website into a **brand-specific Video Generator brief**. It decides what to crawl, what to extract, what to ignore, which vertical rules apply, and what must be reviewed by a human before video generation.

## 2. Activation trigger

Run this Skill when the user or automation says anything like:

- "Crawl this brand for video creation."
- "Use Firecrawl to collect brand assets."
- "Create a brand asset pack from this website."
- "Prepare this brand for the Video Generator."
- "Extract brand details, visuals, copy, proof, CTA, and offers from this URL."

## 3. Brand intake form

The brand intake is intentionally simple. The minimum required input is the company/brand URL.

```yaml
brand_name: ""              # optional; detect if not provided
website_url: ""             # required
vertical_override: "unknown" # optional: ecommerce, real_estate, healthcare, saas, etc.
video_goal: "lead_generation" # awareness | demo | booking | enquiry | purchase | donation | appointment | recruitment
primary_market: "unknown"   # optional country/city/region
language: "auto"
target_platforms:
  - "short_form_vertical"
  - "landing_page_video"
  - "ad_creative"
allowed_domains:
  - "{{root_domain}}"
exclude_paths:
  - "/login"
  - "/account"
  - "/cart"
  - "/checkout"
  - "/admin"
  - "/wp-admin"
  - "/privacy"
  - "/terms"
  - "/tag"
  - "/author"
max_pages: 75
max_detail_pages_per_type: 10
human_notes: ""
```

## 4. First-principles execution logic

For every brand, answer these in order:

1. **What is the brand?** Name, vertical, geography, positioning.
2. **What is the offer?** Product, service, property, course, treatment, plan, menu, room, event, cause, or expertise.
3. **What is the proof?** Reviews, results, awards, credentials, clients, certifications, statistics, case studies.
4. **What can be shown?** Images, screenshots, logos, UI, facilities, people, product shots, listings, menus, floor plans, dashboards.
5. **What should the viewer do?** Buy, enquire, book, call, order, donate, subscribe, schedule demo, visit, apply.
6. **What cannot be assumed?** Missing claims, missing assets, image rights, medical/financial/legal guarantees, outdated offers.

## 5. Tree-of-thought selection policy

Use Tree-of-Thought as an internal decision method. Do not dump hidden reasoning. Produce only the final decision and a short rationale.

Evaluate three possible crawl strategies:

| Strategy | When to choose | Risk |
|---|---|---|
| Narrow scrape | Small site or one landing page | May miss proof/deep assets. |
| Guided crawl | Normal brand website | Best default. |
| Domain extract | Large but well-structured site | Can be expensive/noisy if not constrained. |

Select the best strategy based on:

- Number of discoverable URLs.
- Whether vertical is known.
- Whether media assets are spread across many pages.
- Whether the site has detail pages such as products, listings, doctors, rooms, courses, vehicles, or case studies.
- Whether regulated claims need full evidence capture.

Default choice: **guided crawl + targeted scrapes + schema extraction**.

## 6. Per-brand workflow

### Step 1 — Normalize the brand

Return:

```json
{
  "brand_name_detected": "",
  "root_domain": "",
  "canonical_homepage": "",
  "allowed_domains": [],
  "language_detected": "",
  "geo_detected": "",
  "initial_vertical_guess": "",
  "initial_vertical_confidence": "high|medium|low"
}
```

### Step 2 — Discover URLs

Use URL mapping or a light crawl to find:

- Homepage.
- About/story.
- Products/services/listings/courses/menu/rooms/vehicles.
- Pricing/plans/packages.
- Reviews/testimonials/results/case studies.
- Gallery/portfolio/projects.
- Team/doctors/trainers/faculty/advisors.
- FAQ/help.
- Blog/resources/insights.
- Contact/book/demo/enquire/order/donate.

Return a `page_inventory.json` with page type, URL, priority, and reason.

### Step 3 — Confirm vertical

Vertical detection evidence priority:

1. Schema.org/JSON-LD type.
2. Main navigation labels.
3. Homepage H1 and meta description.
4. Offer page labels.
5. Repeated domain-specific words.
6. Business address/LocalBusiness category.

Return:

```json
{
  "detected_vertical": "",
  "confidence": "high|medium|low",
  "evidence": [],
  "vertical_overrides_applied": []
}
```

### Step 4 — Apply universal extraction

Always extract:

- Logo variants.
- Brand colors and typography.
- Hero imagery and OG image.
- H1, subhead, tagline, CTAs.
- Product/service/offer summary.
- Testimonials, ratings, badges, awards, case studies.
- Founder/story/mission/values.
- Social links.
- Metadata and schema.
- Compliance/disclaimers.
- Contact/conversion path.

### Step 5 — Apply vertical overlay

Select only the matching vertical overlay below.

## 7. Vertical overlays

### 7.1 D2C / E-commerce / Fashion / Luxury

Priority pages:

- `/products`, `/shop`, `/collections`, PDPs, `/reviews`, `/shipping`, `/returns`, `/size-guide`, `/bundles`.

Must extract:

- Product names.
- Product descriptions.
- Prices and discounts.
- Hero product images.
- Lifestyle/in-use images.
- Variant images.
- Collection names.
- Shipping/return/guarantee language.
- Material/ingredient/fabric/spec details.
- UGC/review photos if public.

Best video outputs:

- Product reveal.
- UGC-style product proof.
- Collection launch.
- Offer/discount short.
- Problem-solution demo.

### 7.2 B2B SaaS / Software / App / Platform

Priority pages:

- `/features`, `/product`, `/solutions`, `/pricing`, `/integrations`, `/customers`, `/case-studies`, `/security`, `/docs`, `/compare`, `/vs`.

Must extract:

- Product UI screenshots.
- Feature-specific screenshots.
- Dashboard/analytics previews.
- Demo GIF/video URLs.
- Integration logos and counts.
- Pricing tiers.
- Free trial/demo CTAs.
- ROI claims.
- Customer logos.
- Security/compliance badges.
- API/docs presence.

Best video outputs:

- Product demo.
- Pain-to-solution ad.
- Integration proof.
- ROI/case-study creative.
- Founder/product explainer.

### 7.3 Real Estate / Property / Construction

Priority pages:

- Project/listing pages, `/amenities`, `/floor-plans`, `/gallery`, `/location`, `/master-plan`, `/construction-updates`, `/contact`, `/enquire`.

Must extract:

- Project/listing names.
- Location and neighborhood.
- Price, BHK, sqft, possession timeline.
- Floor plans.
- Master/site plan.
- Amenity images and descriptions.
- Property renders/photos.
- Map/location screenshot.
- RERA/registration numbers.
- Nearby infrastructure.
- Enquiry/call/visit CTA.

Best video outputs:

- Property reveal.
- Location advantage video.
- Amenities lifestyle reel.
- Floor-plan explainer.
- Site visit CTA.

Human review:

- RERA claims, availability, pricing, possession dates, and legal claims.

### 7.4 Healthcare / Clinic / Medical

Priority pages:

- `/doctors`, `/team`, `/services`, `/treatments`, `/results`, `/gallery`, `/technology`, `/insurance`, `/appointment`, `/contact`.

Must extract:

- Doctor/practitioner names.
- Specializations.
- Credentials and degrees.
- Treatment descriptions.
- Before/after images if public.
- Clinic/facility images.
- Equipment/technology visuals.
- Accreditations.
- Outcome statistics.
- Appointment CTA.
- Disclaimers.

Best video outputs:

- Doctor-led explainer.
- Treatment awareness video.
- Facility trust video.
- Before/after transformation.
- Appointment booking CTA.

Human review:

- All medical outcomes, treatment guarantees, before/after use, and claims.

### 7.5 Education / EdTech / Courses

Priority pages:

- `/courses`, `/programs`, `/curriculum`, `/faculty`, `/instructors`, `/placements`, `/outcomes`, `/testimonials`, `/pricing`, `/resources`, `/webinars`, `/apply`.

Must extract:

- Course/program names.
- Learning outcomes.
- Curriculum/syllabus.
- Faculty/instructor bios and photos.
- Placement/outcome stats.
- Student testimonials.
- Certification/accreditation logos.
- Pricing/EMI.
- Batch dates/deadlines.
- Free resources/lead magnets.
- Enrollment CTA.

Best video outputs:

- Course explainer.
- Placement proof video.
- Instructor-led video.
- Deadline/batch announcement.
- Lead magnet ad.

### 7.6 Finance / Fintech / Insurance

Priority pages:

- `/products`, `/plans`, `/pricing`, `/calculator`, `/security`, `/about`, `/partners`, `/advisors`, `/compare`, `/apply`, `/disclosures`.

Must extract:

- Financial product names.
- Interest/return/yield/fee data.
- Calculator screenshots.
- Regulatory/license badges.
- Security/encryption claims.
- Comparison tables.
- App UI screenshots.
- Partner/bank logos.
- Claim settlement or performance statistics.
- Eligibility criteria.
- KYC/document requirements.
- Risk disclaimers.

Best video outputs:

- Trust-first explainer.
- Calculator result video.
- Plan comparison.
- App walkthrough.
- Apply/check-eligibility CTA.

Human review:

- Returns, guarantees, risk, compliance, investment, insurance, tax, and lending claims.

### 7.7 Restaurant / F&B / Cloud Kitchen

Priority pages:

- `/menu`, `/gallery`, `/about`, `/order`, `/reservation`, `/catering`, `/events`, `/locations`.

Must extract:

- Menu item names.
- Dish descriptions.
- Food photography.
- Interior/ambience photos.
- Chef/founder story.
- Operating hours.
- Delivery platform links.
- Signature dish/bestseller language.
- Dietary labels.
- Reservation/order CTA.
- Catering/event info.
- Price range indicators.

Best video outputs:

- Signature dish reel.
- Menu montage.
- Chef story.
- Ambience video.
- Order/reserve CTA.

### 7.8 Fitness / Gym / Wellness / Spa

Priority pages:

- `/classes`, `/programs`, `/schedule`, `/trainers`, `/transformations`, `/results`, `/gallery`, `/pricing`, `/membership`, `/trial`.

Must extract:

- Class/program names.
- Schedule/timetable.
- Trainer names/photos.
- Transformation photos.
- Facility/equipment images.
- Membership pricing.
- Trial offer.
- Client success stories and metrics.
- App screenshots if relevant.
- Nutrition/meal plan previews.
- Community images.

Best video outputs:

- Transformation proof.
- Trainer-led short.
- Trial offer video.
- Facility tour.
- Class schedule CTA.

### 7.9 Automotive / Dealership

Priority pages:

- `/inventory`, `/vehicles`, vehicle detail pages, `/finance`, `/test-drive`, `/trade-in`, `/compare`, `/service`, `/accessories`.

Must extract:

- Vehicle names, models, years.
- Exterior and interior photography.
- Specs.
- Pricing/EMI/finance.
- Showroom images.
- Test-drive CTA.
- Trade-in offers.
- Safety ratings and awards.
- Color/variant swatches.
- Service/maintenance info.

Best video outputs:

- Vehicle reveal.
- Interior walkthrough.
- Spec comparison.
- Finance offer.
- Test-drive CTA.

### 7.10 Legal / Professional Services / Consulting

Priority pages:

- `/team`, `/attorneys`, `/partners`, `/practice-areas`, `/services`, `/results`, `/clients`, `/insights`, `/publications`, `/contact`.

Must extract:

- Expert profiles and headshots.
- Practice/service categories.
- Practice descriptions.
- Case results if public.
- Professional body badges.
- Client logos if public.
- Thought leadership titles.
- Office photos.
- Consultation CTA.
- Jurisdictions/locations served.

Best video outputs:

- Expert authority video.
- Practice-area explainer.
- Consultation CTA.
- Trust proof video.

Human review:

- Legal outcomes, guarantees, testimonials, and jurisdiction-sensitive claims.

### 7.11 Travel / Hospitality / Hotels / Resorts

Priority pages:

- `/rooms`, `/suites`, `/gallery`, `/amenities`, `/dining`, `/spa`, `/experiences`, `/packages`, `/reviews`, `/location`, `/book`.

Must extract:

- Room/accommodation photos.
- Exterior/aerial photos.
- Destination/location images.
- Room types and pricing.
- Amenity descriptions/images.
- Dining/spa/wellness images.
- Guest reviews.
- Itineraries/experiences.
- Booking CTA and offer language.
- Seasonal promos.
- Map/proximity screenshots.
- Sustainability badges.

Best video outputs:

- Stay experience reel.
- Room reveal.
- Destination montage.
- Seasonal offer.
- Guest review proof.

### 7.12 Home Services / Contractors / Interior Design

Priority pages:

- `/services`, `/portfolio`, `/projects`, `/gallery`, `/before-after`, `/service-areas`, `/team`, `/process`, `/warranty`, `/reviews`, `/estimate`.

Must extract:

- Service list.
- Project photos.
- Before/after images.
- Service areas.
- Licensed/insured/bonded badges.
- Team/crew photos.
- Material/brand partner logos.
- Process steps.
- Free estimate CTA.
- Customer project reviews.
- Warranty/guarantee terms.

Best video outputs:

- Before/after transformation.
- Project showcase.
- Process explainer.
- Trust/guarantee video.
- Estimate CTA.

### 7.13 Personal Brands / Coaches / Consultants

Priority pages:

- Homepage, `/about`, `/programs`, `/work-with-me`, `/media`, `/press`, `/book`, `/podcast`, `/events`, `/freebie`, `/resources`.

Must extract:

- Founder headshot.
- Bio/origin story.
- Signature framework/methodology.
- Speaking/media photos.
- Book cover.
- Displayed follower counts if on-site.
- Lead magnet/freebie.
- Program names and pricing.
- Podcast/YouTube show art and URLs.
- Event/speaking schedule.
- Signature phrases.

Best video outputs:

- Founder story.
- Framework explainer.
- Quote-led short.
- Authority reel.
- Lead magnet CTA.

### 7.14 Non-profit / NGO / Social Enterprise

Priority pages:

- `/about`, `/mission`, `/impact`, `/stories`, `/gallery`, `/donate`, `/campaigns`, `/partners`, `/reports`, `/volunteer`, `/events`.

Must extract:

- Mission/cause statement.
- Impact statistics.
- Beneficiary/field photos.
- Donation CTA and amounts.
- Donor/supporter logos.
- Volunteer/team photos.
- Annual report key stats.
- Campaign names and goals.
- Tax benefit/deductibility info.
- Founder/director story.
- SDG/alignment badges.
- Event/fundraiser details.

Best video outputs:

- Mission video.
- Impact statistics video.
- Donation CTA.
- Beneficiary story.
- Fundraiser campaign.

### 7.15 Events / Weddings / Entertainment

Priority pages:

- `/portfolio`, `/gallery`, `/videos`, `/venue`, `/spaces`, `/packages`, `/pricing`, `/vendors`, `/reviews`, `/availability`, `/book`.

Must extract:

- Past event photography.
- Videography/embed URLs.
- Venue photos.
- Service packages and pricing.
- Vendor/partner list.
- Event type list.
- Testimonials.
- Booking/availability screenshots.
- Setup/BTS imagery.
- Highlight reel links.
- Capacity/specs per space.

Best video outputs:

- Portfolio reel.
- Venue reveal.
- Package comparison.
- Availability urgency video.
- Booking CTA.

## 8. Prompt library for actual per-brand execution

### Prompt A — Brand-specific crawl strategy

```text
ROLE: Award-winning prompt engineer and senior crawling architect for a brand video generator.
TASK: Create the Firecrawl execution plan for one brand.

Use first principles. The Video Generator needs identity, offer, proof, visual material, and action.
Use Tree-of-Thought internally to compare: narrow scrape, guided crawl, and domain extract. Select the best plan. Do not expose hidden reasoning; show only the selected plan and concise rationale.

Rules:
- No guesswork.
- Use only the given brand URL and discovered public pages.
- Separate facts, assumptions, and inferences.
- Do not crawl private, login, checkout, cart, account, admin, or duplicate archive pages.
- Prioritize pages that create usable video assets.
- Return a crawl plan that can be executed by Firecrawl.

Input:
brand_name: {{brand_name}}
website_url: {{website_url}}
vertical_override: {{vertical_override}}
video_goal: {{video_goal}}
max_pages: {{max_pages}}
human_notes: {{human_notes}}

Output JSON:
{
  "selected_strategy": "narrow_scrape|guided_crawl|domain_extract",
  "strategy_rationale": "",
  "detected_or_assumed_vertical": "",
  "priority_url_patterns": [],
  "exclude_url_patterns": [],
  "firecrawl_formats_by_page_type": {},
  "vertical_asset_groups_to_apply": [],
  "risk_flags": [],
  "expected_outputs": []
}
```

### Prompt B — Firecrawl crawl params preview prompt

```text
Extract a video-generation brand asset pack for {{brand_name}} from {{website_url}}.
Prioritize public pages containing brand identity, product/service/listing/course/menu/room/vehicle data, pricing/plans/packages, CTAs, proof, testimonials, case studies, reviews, gallery/portfolio, team/doctors/trainers/faculty, FAQ, blog/resources, contact/book/demo/enquire/order/donate pages, metadata, JSON-LD, images, and screenshots.
Avoid login, account, cart, checkout, admin, privacy-only, terms-only, duplicate tag/archive/filter/search pages, and infinite calendar pages.
The output must support scriptwriting, scene planning, caption styling, lower thirds, b-roll selection, end cards, compliance review, and human missing-asset requests.
```

### Prompt C — Page-level extraction prompt

```text
ROLE: Evidence-backed page extractor for a video generation system.
TASK: Extract video-usable brand assets from this single crawled page.

Rules:
- No guesswork.
- Use only this page's markdown, HTML, metadata, links, images, and screenshot.
- Preserve exact wording for headlines, CTAs, claims, prices, testimonials, guarantees, and disclaimers.
- If missing, return null or [].
- Mark inference separately.
- Include source_url, evidence_snippet, extraction_method, and confidence for every item.

Return JSON:
{
  "page_summary": "",
  "page_type": "homepage|about|product|service|listing|pricing|testimonial|gallery|team|faq|blog|contact|other",
  "brand_identity_assets": [],
  "messaging_assets": [],
  "offer_assets": [],
  "proof_assets": [],
  "cta_assets": [],
  "media_assets": [],
  "compliance_claims": [],
  "links_to_follow": [],
  "missing_or_unclear": []
}
```

### Prompt D — Domain-level brand asset pack extraction

```text
ROLE: Senior brand evidence extractor for a video generator.
TASK: Convert all crawled pages for {{brand_name}} into one brand-specific Video Generator Asset Pack.

Ground truth:
Use only crawled public pages and media assets. Do not use model memory.

Rules:
- No guesswork.
- Every non-obvious claim must cite a source URL.
- Preserve exact brand wording where useful for video scripts.
- Deduplicate repeated assets.
- Prefer high-confidence evidence from homepage, offer pages, pricing/listing/product pages, testimonials, case studies, gallery, team, FAQ, and contact pages.
- Mark vertical detection and brand voice as inference.
- Flag regulated claims and image rights issues.

Output JSON:
{
  "brand_profile": {},
  "detected_vertical": {},
  "visual_identity": {},
  "offer_catalog": {},
  "trust_and_proof": {},
  "media_asset_inventory": [],
  "cta_and_conversion_path": {},
  "brand_voice": {},
  "compliance_and_rights_review": {},
  "video_generation_recommendations": {},
  "missing_assets_request": []
}
```

### Prompt E — Video Generator conversion prompt

```text
ROLE: Video strategist converting crawled brand evidence into video-ready creative inputs.
TASK: Use the Brand Asset Pack to recommend what videos can be generated safely and strongly.

Rules:
- Use only extracted evidence.
- Do not invent scenes, claims, testimonials, prices, logos, people, locations, or product visuals.
- If an asset is missing, create a missing-asset request instead of faking it.
- Match video formats to available assets.
- Separate ready-now videos from needs-human-assets videos.

Output:
1. Ready-now video formats.
2. Recommended first 5 videos.
3. Hook candidates using exact brand language.
4. Scene asset map.
5. CTA/end-card copy.
6. Brand voice rules.
7. Visual style notes.
8. Compliance/rights warnings.
9. Missing assets request.
```

### Prompt F — Human missing-assets request

```text
ROLE: Production coordinator.
TASK: Convert crawl gaps into a clear request the brand/customer can answer.

Rules:
- Ask only for assets that materially improve video generation.
- Do not ask for assets already found.
- Be specific about required format and reason.

Output Markdown:
# Missing Assets Request for {{brand_name}}

## Needed before high-quality video generation
| Asset needed | Why it matters | Preferred format |
|---|---|---|

## Optional but valuable
| Asset | Video use |
|---|---|

## Claims needing confirmation
| Claim | Why confirmation is required | Source found |
|---|---|---|
```

## 9. Brand-specific output files

Each brand run must produce this folder:

```text
/brand-crawl-output/{{brand_slug}}/
  00_brand_intake.yaml
  01_crawl_strategy.json
  02_page_inventory.json
  03_raw_page_extracts.json
  04_brand_asset_pack.json
  05_media_asset_inventory.json
  06_video_generation_brief.md
  07_missing_assets_request.md
  08_human_review_flags.md
```

## 10. Video generation brief format

```markdown
# {{brand_name}} Video Generation Brief

## Crawl decision
- Strategy:
- Vertical:
- Confidence:
- Human review needed:

## Brand in one line

## Best available video formats
| Rank | Format | Why it fits | Required assets found |
|---:|---|---|---|

## Brand identity
- Logo:
- Colors:
- Fonts:
- Visual motifs:

## Offer catalog
| Offer | Description | Price/details | Source |
|---|---|---|---|

## Strongest proof
| Proof | Exact evidence | Source |
|---|---|---|

## Hook candidates
| Hook | Source | Use case |
|---|---|---|

## Scene asset map
| Scene need | Available asset | Source | Notes |
|---|---|---|---|

## CTA/end card
- Primary CTA:
- Secondary CTA:
- Contact path:

## Brand voice rules
### Do say

### Do not say

## Compliance and rights flags

## Missing assets
```

## 11. QA checklist before completion

- [ ] The brand URL is normalized.
- [ ] The vertical is detected or user-provided.
- [ ] URL inventory exists.
- [ ] Universal assets are extracted.
- [ ] Matching vertical overlay is applied.
- [ ] Exact CTAs are captured.
- [ ] Product/service/offer data is source-backed.
- [ ] Media assets are classified by video use.
- [ ] Testimonials and proof are verbatim.
- [ ] Regulated claims are flagged.
- [ ] Image rights are not assumed.
- [ ] Missing assets are requested clearly.
- [ ] The final brief states what videos are ready now.
- [ ] The final brief states what cannot be generated safely yet.

## 12. Failure modes and fixes

| Failure | Likely cause | Fix |
|---|---|---|
| No products/services found | Wrong page selection or JS-rendered site | Use links/map, scrape nav pages, enable screenshot/HTML, inspect sitemap. |
| Images missing | Lazy-loaded/CDN images | Use HTML/raw HTML and image formats; inspect `srcset`, `data-src`, OpenGraph images. |
| Site blocks crawl | Bot protection or region issue | Retry with allowed settings, correct location/language, or request human-provided assets. |
| Too many irrelevant pages | Broad crawl | Tighten include/exclude patterns and use guided crawl. |
| Vertical misdetected | Mixed business model | Return multiple possible verticals with confidence and ask human to confirm in output. |
| Strong claims without source | LLM inference leak | Remove claim or mark as needs_human_input. |
| Low video readiness | Site lacks visuals/proof | Generate missing-assets request before video generation. |

## 13. Final decision labels

Use only these final labels:

```text
ready_for_video_generation
ready_with_human_review
needs_missing_assets
not_ready_insufficient_evidence
blocked_by_access_or_crawl_failure
```

## 14. Final response contract for an agent using this Skill

When the brand crawl finishes, respond with:

```markdown
Done. I created the brand-specific Video Generator asset pack for {{brand_name}}.

Decision: {{decision_label}}
Readiness score: {{score}}/100
Best first video formats: {{formats}}
Human review needed: {{yes_no}}
Missing critical assets: {{count}}

Files:
- 04_brand_asset_pack.json
- 05_media_asset_inventory.json
- 06_video_generation_brief.md
- 07_missing_assets_request.md
- 08_human_review_flags.md
```
