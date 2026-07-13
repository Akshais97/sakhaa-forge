---
name: firecrawl-brand-video-assets
summary: Universal Skill for crawling any public brand website with Firecrawl and extracting evidence-backed assets needed by a video generation system.
version: 1.0.0
owner: video-generator
applies_to: all brands, all verticals, public websites
---

# Firecrawl Brand Video Assets Skill

## 1. Purpose

Use this Skill when a brand website must be crawled with Firecrawl so the Video Generator can create brand-faithful videos.

The crawl is not a generic website summary. The crawl must produce a **video-ready brand asset pack** containing the exact evidence, visuals, copy, offers, proof, tone, compliance notes, and calls to action needed for scriptwriting, scene planning, captions, lower thirds, end cards, avatar direction, b-roll selection, and final creative validation.

## 2. First-principles objective

A video generator needs five things before it can produce useful brand videos:

1. **Identity** — what the brand looks and sounds like.
2. **Offer** — what the brand sells, promises, teaches, lists, serves, or provides.
3. **Proof** — why the viewer should trust the brand.
4. **Visual material** — what can appear on-screen without inventing assets.
5. **Action** — what the viewer should do after watching.

Every scrape, screenshot, extract call, and downloaded asset must map to one of those five needs.

## 3. Non-negotiable rules

- No guesswork. If a fact is not present in the crawled source, return `null`, `not_found`, or `needs_human_input`.
- Use the brand website and explicitly approved public sources as ground truth.
- Preserve exact brand wording for headlines, CTAs, testimonials, guarantees, legal claims, pricing, medical/financial/regulatory claims, and disclaimers.
- Every extracted asset must include `source_url`, `source_page_title`, `captured_at`, `extraction_method`, and `confidence`.
- Separate direct evidence from inference. Vertical detection, tone labels, and audience guesses are inferences and must be marked as such.
- Do not scrape private/authenticated/customer-only pages unless the operator has explicit permission and credentials.
- Do not assume that every image can be used commercially. Flag `rights_status: unknown` unless the site explicitly grants usage rights.
- Do not use social profile content unless it was explicitly included in the crawl scope.
- Do not hallucinate missing images, missing products, missing prices, missing doctors, missing listings, missing offers, or missing compliance badges.
- Do not overcrawl admin, login, cart, checkout, account, payment, policy-only, tag archive, duplicate, or infinite calendar URLs.

## 4. Firecrawl capability selection

Use the Firecrawl capability according to the job:

| Need | Use | Reason |
|---|---|---|
| Discover important URLs on a domain | `map` | Builds a URL inventory before expensive crawling. |
| Capture one known page exactly | `scrape` | Best for homepage, product pages, pricing pages, team pages, and landing pages. |
| Collect many pages from one website | `crawl` | Best for public-site discovery and page-level metadata collection. |
| Convert known URLs or a domain into structured JSON | `extract` | Best for schema-driven asset packs with prompts and validation. |
| Estimate crawl settings before running | crawl params preview | Use before broad crawls to inspect derived crawl behavior. |

Recommended Firecrawl formats for brand/video work:

- `markdown` for clean readable page copy.
- `html` or `rawHtml` for CSS variables, JSON-LD, image attributes, and hidden metadata.
- `links` for internal page discovery.
- `images` for media inventory.
- `screenshot` for layout, hero sections, pricing tables, menus, floor plans, schedules, and proof sections.
- `branding` for brand identity extraction where available.
- `json` with an explicit schema for reliable structured extraction.
- `product` for product detail pages where supported.
- `menu` for restaurant/F&B pages where supported.

## 5. Required operator input

Before running this Skill, collect:

```yaml
brand_name: ""
website_url: ""
known_vertical: "unknown" # optional override
crawl_country: "" # optional, e.g. IN, US, AE
crawl_language: "" # optional, e.g. en-IN
video_goal: "" # awareness, lead-gen, product demo, real-estate enquiry, booking, etc.
allowed_domains:
  - ""
blocked_paths:
  - "/login"
  - "/account"
  - "/cart"
  - "/checkout"
  - "/wp-admin"
max_pages: 75
max_depth: 3
human_notes: ""
```

If `known_vertical` is unknown, auto-detect it using Schema.org/JSON-LD, nav labels, page titles, product/service language, and page structure.

## 6. Output contract

The final asset pack must be emitted as Markdown plus machine-readable JSON.

```json
{
  "brand": {
    "name": "string|null",
    "website_url": "string",
    "detected_vertical": "string|null",
    "vertical_confidence": 0,
    "description": "string|null",
    "source_urls": []
  },
  "visual_identity": {
    "logos": [],
    "colors": [],
    "typography": [],
    "hero_images": [],
    "og_images": [],
    "screenshots": []
  },
  "messaging": {
    "hero_headlines": [],
    "sub_headlines": [],
    "taglines": [],
    "benefit_claims": [],
    "pain_points": [],
    "audience_language": [],
    "ctas": [],
    "faqs": []
  },
  "offers": {
    "products": [],
    "services": [],
    "plans_or_packages": [],
    "pricing": [],
    "promotions": [],
    "lead_magnets": []
  },
  "trust_and_proof": {
    "testimonials": [],
    "ratings": [],
    "client_logos": [],
    "certifications": [],
    "awards": [],
    "case_studies": [],
    "metrics": [],
    "press_mentions": []
  },
  "brand_voice": {
    "tone_labels": [],
    "recurring_phrases": [],
    "vocabulary": [],
    "do_say": [],
    "do_not_say": [],
    "inference_notes": []
  },
  "media_assets": [],
  "compliance": {
    "regulated_vertical": false,
    "required_disclaimers": [],
    "claims_requiring_review": [],
    "rights_warnings": []
  },
  "video_generation_readiness": {
    "ready": false,
    "readiness_score": 0,
    "best_video_formats": [],
    "missing_assets": [],
    "human_review_required": []
  }
}
```

Every array item must follow this evidence wrapper:

```json
{
  "value": "string|object",
  "source_url": "string",
  "source_page_title": "string|null",
  "evidence_snippet": "string|null",
  "extraction_method": "text|html|image|screenshot|json_ld|css|llm_inference",
  "confidence": "high|medium|low",
  "captured_at": "ISO-8601 timestamp"
}
```

## 7. Crawl execution map

### Pass 0 — Crawl planning

Goal: prevent random crawling.

Actions:

1. Validate website URL.
2. Normalize domain and allowed domains.
3. Run URL discovery/map.
4. Detect obvious blocked paths.
5. Pick universal asset groups plus relevant vertical-specific groups.
6. Prepare crawl limits.

Output:

```json
{
  "crawl_plan": {
    "priority_urls": [],
    "likely_vertical": "string|null",
    "vertical_reasoning_summary": "string",
    "include_patterns": [],
    "exclude_patterns": [],
    "expected_asset_groups": []
  }
}
```

### Pass 1 — Homepage capture

Always scrape the homepage first.

Collect:

- Full-page screenshot.
- Above-fold screenshot.
- Markdown.
- HTML/raw HTML where needed.
- Links.
- Images.
- Branding extraction where available.
- JSON-LD/schema metadata.
- Head tags: title, meta description, OG tags, favicon, hreflang.
- Header and footer assets.

Reason: the homepage usually contains identity, positioning, CTA, social proof, hero visuals, navigation, and vertical signals.

### Pass 2 — Priority pages

Crawl or scrape these pages if present:

| Page type | Common paths | Why |
|---|---|---|
| About/story | `/about`, `/story`, `/our-story` | Mission, founder story, values, voice. |
| Product/service/listing | `/products`, `/services`, `/listings`, `/solutions`, `/rooms`, `/menu`, `/courses` | Core offer. |
| Pricing/plans/packages | `/pricing`, `/plans`, `/packages`, `/membership` | Offer framing, urgency, plan comparison. |
| Reviews/testimonials | `/reviews`, `/testimonials` | Verbatim trust proof. |
| FAQ | `/faq`, `/help` | Objection-handling scripts. |
| Gallery/portfolio | `/gallery`, `/portfolio`, `/projects` | B-roll, before/after, proof visuals. |
| Team/doctors/trainers | `/team`, `/doctors`, `/trainers`, `/faculty` | Expert-led formats and credibility. |
| Case studies/results | `/case-studies`, `/results`, `/success-stories` | Data hooks and story arcs. |
| Blog/resources | `/blog`, `/resources`, `/insights` | Tone calibration and content themes. |
| Contact/book/demo | `/contact`, `/book`, `/demo`, `/enquire` | Final CTA and lead path. |

### Pass 3 — Vertical-specific deep crawl

After vertical detection, crawl the most important detail pages:

- Product detail pages: top 5–10 by prominence.
- Listing/detail pages: top 5–10.
- Course/program pages: top 3–5.
- Vehicle/room/detail pages: top 5.
- Doctor/attorney/trainer/faculty profiles: top 5.
- SaaS feature/integration/comparison pages.
- F&B menu and gallery pages.
- Fitness schedule/classes/transformation pages.
- Non-profit donate/impact/campaign pages.

Do not crawl endlessly. Prefer highest-navigation prominence, homepage-linked pages, sitemap priority, and pages with visible business value.

### Pass 4 — Image and media harvest

Collect all public media URLs discovered in Passes 1–3.

For each media asset, classify:

```text
logo | icon | hero | product | lifestyle | team | founder | facility | property | food | vehicle | course | app_ui | dashboard | testimonial | badge | floor_plan | menu | map | before_after | event | unknown
```

Minimum useful metadata:

```json
{
  "url": "",
  "asset_type": "",
  "alt_text": "",
  "source_url": "",
  "width": null,
  "height": null,
  "file_type": "",
  "likely_video_use": "hero|broll|overlay|end_card|proof|reference|do_not_use",
  "rights_status": "unknown|brand_owned_claimed|explicit_permission_required",
  "quality_notes": ""
}
```

Image quality rules:

- Prefer original/highest-resolution URLs.
- Flag images below 200px width as low quality unless they are logos/icons.
- Deduplicate repeated logos, thumbnails, lazy-load variants, and resized CDN variants.
- Preserve alt text and filenames because they often identify product names, people, or locations.
- Screenshot visual sections when raw image URLs are inaccessible.

### Pass 5 — Tone and messaging calibration

Extract tone from:

- Homepage hero and section headlines.
- About/story page.
- Product/service pages.
- Recent blog headlines and top 2–3 article bodies.
- Testimonials and FAQs.

Return only grounded tone labels. Example:

```json
{
  "tone_labels": ["premium", "direct", "clinical", "playful"],
  "evidence": [
    {
      "tone": "premium",
      "reason": "Repeated use of words such as curated, handcrafted, limited, signature.",
      "source_url": ""
    }
  ],
  "inference_confidence": "medium"
}
```

### Pass 6 — Validation and gap report

Before finalizing, check:

- Does every claim have a source?
- Are regulated claims flagged?
- Are all CTAs exact wording from the site?
- Are images tied to source pages?
- Are missing assets marked instead of invented?
- Are vertical-specific must-have fields present?
- Are there duplicate or low-quality media assets?
- Are old blog posts or stale offers clearly dated?
- Is there enough material for at least one video format?

## 8. Universal asset groups

### Group A — Visual identity

Must collect:

- Primary logo.
- Dark/light logo variants.
- Favicon/app icon.
- Brand colors from CSS, inline styles, screenshots, and branding extraction.
- Typography/font names/weights.
- Hero banner imagery.
- OG image.
- Visual motifs: shapes, textures, icon style, photography style, UI style.

Video use:

- Lower-third.
- End card.
- Caption styling.
- Backgrounds.
- Product or service overlay.
- Brand-world reference.

### Group B — Copy and messaging foundation

Must collect:

- H1 hero headline.
- Hero sub-headline.
- Tagline/slogan.
- Feature and benefit headlines.
- CTA button copy across pages.
- Pain-point language.
- Audience/persona wording.
- FAQ questions and answers.
- Guarantee/refund/policy language.
- Lead magnet/email opt-in copy.

Video use:

- Hook candidates.
- Problem-solution script skeletons.
- On-screen supers.
- Objection handling.
- CTA end card.

### Group C — Social proof and trust

Must collect:

- Testimonials verbatim.
- Star ratings and review counts if shown on-site.
- Client/partner logos.
- Media logos and press mentions.
- Certification/accreditation badges.
- Awards.
- Case study headlines and results.
- Before/after statistics.
- Video testimonial URLs.

Video use:

- Social proof hooks.
- Authority overlays.
- Data-backed claims.
- Testimonial-led scripts.

### Group D — Brand personality and tone

Must collect:

- Mission statement.
- Founder/origin story.
- Brand values.
- Community/tribe language.
- Recent blog topics.
- Blog voice patterns.
- Social links.
- YouTube/Instagram/LinkedIn links.

Video use:

- Founder-led video formats.
- Brand-safe vocabulary.
- Tone guardrails.
- Emotional positioning.

### Group E — Metadata and technical structure

Must collect:

- Meta description.
- Title tags.
- Schema.org/JSON-LD.
- Structured data type.
- hreflang/language tags.
- App store links.
- Sitemap links.
- Canonical URLs.

Video use:

- Brand summary.
- Vertical detection.
- Localization.
- App/demo video identification.

## 9. Vertical-specific asset groups

### D2C / E-commerce / Fashion / Apparel / Luxury

Must collect product names, card descriptions, long PDP descriptions, prices, product images, lifestyle images, variant images, collection names, discount/sale copy, shipping info, unboxing/packaging visuals, size guides, material/ingredient/fabric details, bundle/subscription options, and UGC-style review photos.

Highest-value video formats:

- Product reveal.
- Problem-solution product demo.
- UGC testimonial.
- Offer/drop announcement.
- Collection montage.
- Before/after if applicable.

### B2B SaaS / Software / Platforms

Must collect product UI screenshots, feature screenshots, demo GIFs/animations, integration logos, integration count/list, pricing tables, free trial CTA, ROI/performance claims, comparison pages, API/docs presence, dashboard previews, onboarding screenshots, security/compliance badges, and enterprise logos.

Highest-value video formats:

- Problem-agitate-solution demo.
- Feature walkthrough.
- ROI proof video.
- Integration proof video.
- Founder/product-led explainer.

### Real Estate / Property / Construction / Co-working

Must collect property/project photography, address/neighborhood, floor plans, amenity photography, map/neighborhood screenshot, price/sqft/BHK/specs, virtual tour links, construction progress imagery, developer/builder trust identity, RERA/registration numbers, possession/handover timeline, nearby infrastructure, master/site plans, and render/CGI visuals.

Highest-value video formats:

- Property walkthrough.
- Amenity lifestyle reel.
- Location advantage video.
- Floor-plan explainer.
- Construction/progress update.
- Lead-generation enquiry video.

### Healthcare / Clinics / Medical / Wellness Centers

Must collect practitioner profiles, headshots, credentials, treatment/procedure descriptions, before/after imagery, facility photography, equipment/technology imagery, insurance/payment info, patient outcome statistics, accreditations, appointment booking CTA, tele-health availability, and specialization/department list.

Highest-value video formats:

- Doctor-led explainer.
- Treatment myth-buster.
- Before/after transformation.
- Facility trust tour.
- Appointment CTA video.

Compliance rule: medical outcomes and treatment claims require human review.

### Education / EdTech / Courses / Institutes

Must collect course/program names, descriptions, learning outcomes, curriculum/syllabus, instructor/faculty bios/photos, student placement/outcome stats, testimonials, campus/facility imagery, certification/accreditation logos, lead magnets, pricing/EMI, demo lessons, enrollment deadlines, and alumni/community size.

Highest-value video formats:

- Course outcome video.
- Instructor-led intro.
- Placement proof video.
- Curriculum walkthrough.
- Batch deadline video.

### Financial Services / Fintech / Insurance

Must collect product/account/policy/plan names, interest/return/yield data, calculator screenshots, regulatory/license badges, security badges, comparison tables, app UI screenshots, partner/bank logos, claim/return statistics, advisor/team profiles, eligibility criteria, KYC/document requirements, and risk disclaimers.

Highest-value video formats:

- Trust-first explainer.
- Calculator result video.
- App walkthrough.
- Plan comparison.
- Eligibility CTA.

Compliance rule: finance claims and performance numbers require source evidence and human review.

### Restaurants / F&B / Cloud Kitchens

Must collect menu items, dish descriptions, food photography, styled/flat-lay imagery, ambiance/interior photos, chef/founder story, operating hours, delivery platform links, signature dish/bestseller copy, dietary labels, reservation/order CTA, kitchen/BTS imagery, catering/events info, and price range indicators.

Highest-value video formats:

- Signature dish reveal.
- Menu montage.
- Chef story.
- Ambience reel.
- Order-now CTA.

### Fitness / Gyms / Wellness / Spas

Must collect class/program names, schedule/timetable, trainer profiles/photos, transformation photos, facility/equipment photography, membership tiers/pricing, trial offer language, workout/session preview imagery, client success stories with metrics, app screenshots if relevant, nutrition/meal plan previews, and community photos.

Highest-value video formats:

- Transformation proof.
- Trainer-led hook.
- Trial offer video.
- Facility tour.
- Class schedule CTA.

### Automotive / Dealerships / EV / Fleet

Must collect vehicle inventory, models/years, vehicle hero photography, interior photos, specs, pricing/EMI/finance options, showroom photos, test-drive CTA, trade-in offers, comparison tables, accessories, service/maintenance info, safety ratings/awards, and color/variant swatches.

Highest-value video formats:

- Vehicle reveal.
- Spec comparison.
- Test-drive CTA.
- EMI/finance offer.
- Interior walkthrough.

### Legal / Professional Services / Consulting / Accounting

Must collect attorney/consultant profiles, headshots, practice areas, practice descriptions, notable case results where public, professional body badges, client logos if public, thought leadership titles, office photography, consultation CTA, and jurisdictions/locations served.

Highest-value video formats:

- Expert-led authority video.
- Practice-area explainer.
- Consultation CTA.
- Trust proof video.

Compliance rule: legal outcomes and guarantees require human review.

### Travel / Hospitality / Hotels / Resorts

Must collect room photography, exterior/aerial photography, destination photos, room types/pricing, amenity descriptions/images, dining photos, spa/wellness photos, guest reviews, itinerary/experience descriptions, booking CTA/urgency, seasonal banners, map/proximity screenshots, virtual tours, and sustainability badges.

Highest-value video formats:

- Stay experience reel.
- Room reveal.
- Destination montage.
- Offer/seasonal promo.
- Guest-review proof.

### Home Services / Contractors / Interior Design / Architecture

Must collect service list, project/portfolio photos, before/after project images, service areas, licensed/insured/bonded badges, team/crew photos, material/brand partner logos, process steps, estimate/consultation CTA, project reviews, and warranty/guarantee terms.

Highest-value video formats:

- Before/after transformation.
- Project showcase.
- Process explainer.
- Free-estimate CTA.
- Trust badge video.

### Personal Brands / Coaches / Consultants

Must collect founder headshot, personal bio/origin story, signature methodology/framework, speaking/media photos, book cover, displayed follower counts, lead magnet/freebie, program/course names/pricing, podcast/YouTube show art and URL, event schedule, and signature phrases.

Highest-value video formats:

- Founder story.
- Framework explainer.
- Lead magnet CTA.
- Authority reel.
- Quote-led short.

### Non-profit / NGO / Social Enterprise

Must collect mission/cause statement, impact statistics, beneficiary/field photography, donation CTA and amounts, donor/supporter logos, volunteer/team photos, annual report cover/key stats, campaign names/goals, tax benefit info, founder/director story, SDG/alignment badges, and event/fundraiser details.

Highest-value video formats:

- Mission-led emotional video.
- Impact statistics video.
- Donation CTA.
- Beneficiary story.
- Campaign fundraiser.

### Events / Weddings / Entertainment

Must collect past event photography, videography/embed URLs, venue photography, service packages/pricing, vendor/partner list, event type list, testimonials, availability/calendar screenshot, setup/BTS imagery, highlight reel links, and capacity/specs per space.

Highest-value video formats:

- Portfolio reel.
- Venue reveal.
- Package comparison.
- Availability urgency video.
- Testimonial-led booking CTA.

## 10. Video-readiness scoring

Score each brand from 0–100.

| Category | Points |
|---|---:|
| Visual identity complete | 15 |
| Offer/product/service data complete | 20 |
| Usable media assets available | 20 |
| Trust proof available | 15 |
| Exact CTA and lead path found | 10 |
| Brand voice/tone extracted | 10 |
| Compliance/rights risks flagged | 10 |

Readiness levels:

- `80–100`: Ready for video generation.
- `60–79`: Usable, but needs human review or missing assets.
- `40–59`: Can create only generic/limited videos; request missing assets.
- `<40`: Not enough evidence for brand-faithful video generation.

## 11. Prompt library

### 11.1 Crawl planning prompt

```text
ROLE: Senior brand asset crawler for a video generation system.
TASK: Plan a Firecrawl crawl for the brand website below.

Rules:
- No guesswork.
- Use first principles: identity, offer, proof, visual material, and action.
- Separate direct evidence, assumptions, and inferred vertical.
- Do not include login, checkout, cart, account, admin, or duplicate archive pages.
- Prefer pages that contain video-usable assets: visuals, offers, CTAs, proof, pricing, listings, products, services, team, gallery, FAQ, case studies, reviews, and contact/book/demo pages.

Input:
brand_name: {{brand_name}}
website_url: {{website_url}}
known_vertical: {{known_vertical_or_unknown}}
video_goal: {{video_goal}}
max_pages: {{max_pages}}

Output JSON:
{
  "likely_vertical": "",
  "vertical_confidence": "high|medium|low",
  "priority_pages_to_scrape": [],
  "pages_to_avoid": [],
  "required_asset_groups": [],
  "recommended_firecrawl_formats": [],
  "crawl_risks": [],
  "missing_information": []
}
```

### 11.2 Universal extraction prompt

```text
ROLE: Evidence-backed brand asset extractor for a video generation pipeline.
TASK: Extract only the assets that are directly useful for creating brand-faithful videos.

Ground truth:
Use only the crawled page content, HTML, screenshots, links, images, metadata, and JSON-LD available in this Firecrawl result.

Rules:
- No guesswork.
- Preserve exact wording for headlines, CTAs, testimonials, pricing, claims, guarantees, and disclaimers.
- Every item must include source_url, evidence_snippet, extraction_method, and confidence.
- If an item is missing, return null or an empty array. Do not invent.
- Mark inferred values as inference.
- Flag compliance-sensitive claims and rights-sensitive assets.

Extract:
1. Brand identity.
2. Visual assets.
3. Messaging and copy.
4. Product/service/offer data.
5. Social proof and trust.
6. CTA and conversion path.
7. Brand voice.
8. Compliance and rights warnings.
9. Missing assets required for video generation.

Return JSON matching the Video Generator Brand Asset Pack schema.
```

### 11.3 Visual media classification prompt

```text
ROLE: Video production asset librarian.
TASK: Classify website images and screenshots by likely video usage.

Rules:
- Do not assume image contents if not visible or described by alt text/filename/context.
- Use source page context to classify.
- Flag low-resolution, duplicate, decorative, irrelevant, or rights-unclear assets.
- Separate brand-owned-looking assets from third-party embeds.

For each asset return:
url, source_url, alt_text, inferred_asset_type, likely_video_use, quality_score_1_to_5, rights_status, confidence, notes.
```

### 11.4 Brand voice prompt

```text
ROLE: Brand voice analyst for short-form video scripting.
TASK: Extract the brand's voice from crawled website copy.

Rules:
- Use exact phrases as evidence.
- Do not label tone unless the copy supports it.
- Separate what the brand says from what you infer.
- Build do_say and do_not_say guidance for video scripts.

Output:
{
  "tone_labels": [],
  "evidence_phrases": [],
  "recurring_words": [],
  "sentence_style": "",
  "emotional_positioning": "",
  "do_say": [],
  "do_not_say": [],
  "script_hook_candidates": []
}
```

### 11.5 Gap report prompt

```text
ROLE: Strict QA reviewer for a brand video asset crawl.
TASK: Audit the extracted asset pack before it reaches the Video Generator.

Rules:
- Find missing evidence, contradictions, stale offers, weak claims, duplicate media, low-quality images, and unsupported inferences.
- Do not be a cheerleader.
- If the brand is regulated, flag claims requiring human review.
- Rate readiness from 0 to 100.

Output:
1. Readiness score.
2. Assets strong enough for video generation.
3. Missing assets.
4. Claims needing human review.
5. Media assets needing replacement.
6. Recommended first 3 video formats.
7. Final decision: ready | needs review | not ready.
```

## 12. Firecrawl payload patterns

### Single-page scrape pattern

Use for homepage, pricing, product detail, doctor profile, listing detail, menu, schedule, or any high-value known URL.

```json
{
  "url": "{{page_url}}",
  "formats": [
    "markdown",
    "links",
    "images",
    "html",
    { "type": "screenshot", "fullPage": true },
    {
      "type": "json",
      "prompt": "{{universal_extraction_prompt}}",
      "schema": "{{brand_asset_page_schema}}"
    }
  ],
  "onlyMainContent": false,
  "maxAge": 0
}
```

### Domain extract pattern

Use only after URL discovery and crawl planning.

```json
{
  "urls": ["{{website_url}}/*"],
  "prompt": "{{universal_extraction_prompt}}",
  "schema": "{{brand_asset_pack_schema}}"
}
```

### Crawl prompt pattern

Use crawl params preview first when broad crawling.

```text
Extract public pages needed to build a video-generation brand asset pack for {{brand_name}}.
Prioritize homepage, about/story, products/services/listings/menu/courses, pricing/plans/packages, testimonials/reviews, gallery/portfolio, case studies/results, team/doctors/trainers/faculty, FAQ, blog/resources, and contact/book/demo/enquiry pages.
Avoid login, cart, checkout, account, admin, tag archives, duplicate filtered pages, and infinite calendars.
Collect markdown, metadata, links, images, screenshots for key visual pages, and structured JSON for brand identity, offers, trust proof, media assets, CTAs, compliance, and missing assets.
```

## 13. Final deliverables

A completed run must produce:

```text
/brand-crawl-output/{{brand_slug}}/
  crawl_plan.json
  page_inventory.json
  brand_asset_pack.json
  media_asset_inventory.json
  trust_and_claims_review.json
  video_readiness_report.md
  missing_assets_request.md
```

## 14. Human handoff format

```markdown
# {{brand_name}} Video Asset Crawl Report

## Decision
Ready / Needs review / Not ready

## What we can create now
- Video format 1
- Video format 2
- Video format 3

## Strongest assets found
| Asset | Why it matters | Source |
|---|---|---|

## Missing assets
| Missing asset | Why needed | Recommended request |
|---|---|---|

## Claims needing review
| Claim | Risk | Source |
|---|---|---|

## Best CTAs found
| CTA | Source | Use case |
|---|---|---|

## Notes for Video Generator
- Brand tone:
- Visual direction:
- Do not use:
- Human review required:
```

## 15. Completion checklist

- [ ] Homepage scraped with screenshot, links, images, metadata, and page copy.
- [ ] URL map/page inventory created.
- [ ] Vertical detected or confirmed.
- [ ] Universal asset groups collected.
- [ ] Vertical-specific assets collected.
- [ ] Media assets classified.
- [ ] CTAs extracted exactly.
- [ ] Testimonials/proof extracted exactly.
- [ ] Pricing/claims/disclaimers source-backed.
- [ ] Compliance risks flagged.
- [ ] Rights warnings included.
- [ ] Missing assets listed.
- [ ] Readiness score calculated.
- [ ] Final brand asset pack generated.
