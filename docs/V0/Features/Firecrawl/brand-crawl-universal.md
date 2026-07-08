# TRIBEv2 — Universal Brand Asset Crawl Guide
> Groups 1–5 · 42 universal assets · Applies to ALL brand verticals
> Used by: Brand Extraction Feature · Firecrawl API v2

---

## Overview

This guide defines the exact Firecrawl API calls, parameters, and LLM extraction prompts to collect the 42 universal brand assets that every TRIBEv2 brand profile requires — regardless of vertical. This runs first, before any vertical-specific crawl pass.

**Cost estimate:** ~8–15 credits per brand (5 page scrapes + branding format on homepage)
**Output:** A structured `brand_universal.json` profile + downloaded image assets

---

## Firecrawl API Reference — Formats Used

| Format | What It Returns | Credits |
|---|---|---|
| `markdown` | Clean text content of the page | 1/page (base) |
| `branding` | Colors, fonts, logo URL, typography, personality | +0 (included) |
| `screenshot` | PNG of rendered page | +0 (included) |
| `images` | All image URLs on the page | +0 (included) |
| `links` | All hyperlinks on the page | +0 (included) |
| `json` | LLM-structured extraction against a schema | +4/page |
| `rawHtml` | Unmodified HTML (for CSS/meta parsing) | +0 (included) |

> **Rule:** Use `markdown` + `branding` + `images` + `links` on most passes.  
> Reserve `json` extraction for pages where structured output is required (pricing, testimonials, FAQ).  
> Use `screenshot` only on homepage and hero sections — not on every page.

---

## Pass 1 — Homepage (Always First)

**Purpose:** Visual identity, hero copy, brand colors, fonts, OG image, social links, Schema.org detection, above-fold screenshot.

### API Call

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/",
  "formats": [
    { "type": "markdown" },
    { "type": "branding" },
    { "type": "images" },
    { "type": "links" },
    { "type": "rawHtml" },
    {
      "type": "screenshot",
      "fullPage": false,
      "quality": 90,
      "viewport": { "width": 1440, "height": 900 }
    },
    {
      "type": "screenshot",
      "fullPage": true,
      "quality": 80
    },
    {
      "type": "json",
      "prompt": "SEE PROMPT: P1-HOMEPAGE below",
      "schema": "SEE SCHEMA: S1-HOMEPAGE below"
    }
  ],
  "onlyMainContent": false,
  "onlyCleanContent": false,
  "blockAds": true,
  "proxy": "auto",
  "waitFor": 1500,
  "timeout": 60000,
  "removeBase64Images": true,
  "location": { "country": "US", "languages": ["en-US"] }
}
```

### Prompt P1-HOMEPAGE

```
You are extracting brand identity and marketing copy from a company homepage.

Extract the following with zero inference — only extract what is explicitly present on this page:

1. BRAND NAME: The company's official name (from logo alt text, H1, or <title> tag)
2. TAGLINE: Any short positioning statement that appears as a slogan or sub-brand phrase (not the H1 unless it reads as a slogan)
3. HERO_H1: The exact text of the primary H1 heading
4. HERO_SUBHEADLINE: The paragraph or subtitle directly below the H1
5. FEATURE_HEADLINES: All H2 or H3 headings in feature/benefit sections (array, max 10)
6. CTA_BUTTONS: All call-to-action button texts found on the page (array, deduplicated)
7. PAIN_POINTS: Any explicit problem or pain statements the brand uses (e.g. "Tired of X?", "Stop wasting time on Y")
8. WHO_ITS_FOR: Any explicit audience targeting language (e.g. "For teams of 10+", "Built for founders")
9. SOCIAL_LINKS: All social media profile URLs found (array of {platform, url})
10. SCHEMA_TYPE: The Schema.org @type value from any JSON-LD script tags (e.g. "Organization", "LocalBusiness", "Product")
11. META_DESCRIPTION: The content of <meta name="description">
12. VERTICAL_SIGNALS: Any words, phrases, or section names that indicate the business category (e.g. "listings", "book a session", "shop now", "request a quote")
13. TRUST_SIGNALS: Any numbers, stats, or credentials displayed prominently (e.g. "10,000 customers", "Since 1998", "ISO certified")
14. GUARANTEE_LANGUAGE: Any guarantee, refund, or risk-reversal statements

Return ONLY fields that are explicitly present. Use null for absent fields. Do not infer or hallucinate.
```

### Schema S1-HOMEPAGE

```json
{
  "type": "object",
  "properties": {
    "brand_name": { "type": "string" },
    "tagline": { "type": ["string", "null"] },
    "hero_h1": { "type": ["string", "null"] },
    "hero_subheadline": { "type": ["string", "null"] },
    "feature_headlines": { "type": "array", "items": { "type": "string" } },
    "cta_buttons": { "type": "array", "items": { "type": "string" } },
    "pain_points": { "type": "array", "items": { "type": "string" } },
    "who_its_for": { "type": ["string", "null"] },
    "social_links": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "platform": { "type": "string" },
          "url": { "type": "string" }
        }
      }
    },
    "schema_type": { "type": ["string", "null"] },
    "meta_description": { "type": ["string", "null"] },
    "vertical_signals": { "type": "array", "items": { "type": "string" } },
    "trust_signals": { "type": "array", "items": { "type": "string" } },
    "guarantee_language": { "type": ["string", "null"] }
  }
}
```

### Assets Collected in Pass 1

| Asset | Source in Response | Group |
|---|---|---|
| Brand hex colors (primary, secondary, accent, bg, text) | `branding.colors.*` | G1 |
| Typography (font families, weights, sizes) | `branding.typography.*` | G1 |
| Logo URL | `branding.images.logo` | G1 |
| Favicon URL | `branding.images.favicon` | G1 |
| OG image URL | `branding.images.ogImage` | G1 |
| Brand personality (tone, energy, audience) | `branding.personality` | G4 |
| Hero screenshot (above fold) | `actions.screenshots[0]` | G1 |
| Full page screenshot | `actions.screenshots[1]` | G1 |
| All image URLs (for Pass 4 download) | `images` array | G1 |
| All page links (for Pass 2 URL routing) | `links` array | G5 |
| Social media links | `json.social_links` | G4 |
| Schema.org type (vertical detection) | `json.schema_type` | G5 |
| Meta description | `json.meta_description` | G5 |
| Hero H1, subheadline | `json.hero_h1`, `json.hero_subheadline` | G2 |
| Feature headlines | `json.feature_headlines` | G2 |
| CTA button copy | `json.cta_buttons` | G2 |
| Pain point language | `json.pain_points` | G2 |
| Who it's for | `json.who_its_for` | G2 |
| Trust signals | `json.trust_signals` | G3 |
| Guarantee language | `json.guarantee_language` | G2 |

---

## Pass 2 — Priority Pages

Run each URL discovered from Pass 1 `links` array. Use the routing logic below to identify which paths to scrape.

### URL Routing Logic

```python
PRIORITY_PATHS = [
    # Group A — About / Brand story
    ["/about", "/about-us", "/our-story", "/story", "/who-we-are"],
    # Group B — Reviews / Social proof
    ["/reviews", "/testimonials", "/customers", "/case-studies", "/success-stories"],
    # Group C — FAQ / Policy
    ["/faq", "/frequently-asked-questions", "/help", "/support"],
    # Group D — Blog index (tone calibration)
    ["/blog", "/news", "/insights", "/articles", "/resources"]
]
# Match the first path found per group. Scrape max 1 URL per group.
# If none found via links, attempt direct URL construction from domain.
```

### Pass 2A — About Page

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/about",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: P2A-ABOUT below",
      "schema": "SEE SCHEMA: S2A-ABOUT below"
    }
  ],
  "onlyMainContent": true,
  "onlyCleanContent": true,
  "blockAds": true,
  "proxy": "auto",
  "waitFor": 1000,
  "timeout": 45000,
  "removeBase64Images": true
}
```

#### Prompt P2A-ABOUT

```
You are extracting brand identity and story content from a company About page.

Extract only what is explicitly stated on this page:

1. MISSION_STATEMENT: The company's stated mission or purpose (1-3 sentences)
2. ORIGIN_STORY: Any founding story, how/why the company was started (paragraph)
3. BRAND_VALUES: Explicitly listed values or principles (array of strings)
4. FOUNDER_NAMES: Names of founders or key people mentioned (array)
5. FOUNDER_STORY: Any personal story about the founder (paragraph)
6. COMPANY_AGE_OR_YEAR: Year founded or years in operation if mentioned
7. TEAM_SIZE: Any mention of number of employees or team size
8. COMMUNITY_LANGUAGE: Any language about community, tribe, movement, or belonging
9. AWARDS_ACCOLADES: Any awards, recognitions, or notable achievements listed
10. CERTIFICATIONS: Any certifications, accreditations, or professional memberships
11. MEDIA_MENTIONS: Any "as seen in" or press mention brand names
12. LOCATIONS_SERVED: Geographic coverage or headquarters location
13. VOCABULARY_PATTERNS: Note 5-10 distinctive words or phrases this brand uses repeatedly that reveal their tone (e.g. "hustle", "craft", "empower", "precision")

Return ONLY fields explicitly present. null for absent fields.
```

#### Schema S2A-ABOUT

```json
{
  "type": "object",
  "properties": {
    "mission_statement": { "type": ["string", "null"] },
    "origin_story": { "type": ["string", "null"] },
    "brand_values": { "type": "array", "items": { "type": "string" } },
    "founder_names": { "type": "array", "items": { "type": "string" } },
    "founder_story": { "type": ["string", "null"] },
    "company_age_or_year": { "type": ["string", "null"] },
    "team_size": { "type": ["string", "null"] },
    "community_language": { "type": ["string", "null"] },
    "awards_accolades": { "type": "array", "items": { "type": "string" } },
    "certifications": { "type": "array", "items": { "type": "string" } },
    "media_mentions": { "type": "array", "items": { "type": "string" } },
    "locations_served": { "type": ["string", "null"] },
    "vocabulary_patterns": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

### Pass 2B — Reviews / Testimonials Page

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/reviews",
  "formats": [
    { "type": "markdown" },
    { "type": "images" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: P2B-REVIEWS below",
      "schema": "SEE SCHEMA: S2B-REVIEWS below"
    }
  ],
  "onlyMainContent": true,
  "onlyCleanContent": true,
  "blockAds": true,
  "proxy": "auto",
  "waitFor": 2000,
  "timeout": 60000,
  "removeBase64Images": true
}
```

#### Prompt P2B-REVIEWS

```
You are extracting social proof and trust assets from a customer reviews or testimonials page.

Extract only what is explicitly present:

1. TESTIMONIALS: Array of individual testimonials. For each: quote (verbatim), author_name, author_title_or_descriptor (e.g. "CEO at Acme", "mother of 3"), star_rating (if shown), outcome_stat (any specific result mentioned e.g. "saved 10 hours/week")
2. AGGREGATE_RATING: Overall star rating and total review count if displayed (e.g. "4.9 stars, 2,847 reviews")
3. CASE_STUDY_HEADLINES: Headlines of any case studies or success stories linked or previewed (array)
4. BEFORE_AFTER_STATS: Any before/after or improvement statistics ("From X to Y", "Increased by Z%") (array)
5. CLIENT_COMPANY_NAMES: Any named client or customer companies referenced (array)
6. VIDEO_TESTIMONIAL_URLS: Any embedded video testimonial URLs (array)
7. TRUST_BADGES: Any certification, award, or verification badges described in text (array)

Extract up to 10 testimonials. Prioritize ones with specific outcomes or measurable results.
Return ONLY fields explicitly present. null or empty array for absent fields.
```

#### Schema S2B-REVIEWS

```json
{
  "type": "object",
  "properties": {
    "testimonials": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "quote": { "type": "string" },
          "author_name": { "type": ["string", "null"] },
          "author_descriptor": { "type": ["string", "null"] },
          "star_rating": { "type": ["number", "null"] },
          "outcome_stat": { "type": ["string", "null"] }
        }
      }
    },
    "aggregate_rating": { "type": ["string", "null"] },
    "case_study_headlines": { "type": "array", "items": { "type": "string" } },
    "before_after_stats": { "type": "array", "items": { "type": "string" } },
    "client_company_names": { "type": "array", "items": { "type": "string" } },
    "video_testimonial_urls": { "type": "array", "items": { "type": "string" } },
    "trust_badges": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

### Pass 2C — FAQ Page

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/faq",
  "formats": [
    { "type": "markdown" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: P2C-FAQ below",
      "schema": "SEE SCHEMA: S2C-FAQ below"
    }
  ],
  "onlyMainContent": true,
  "onlyCleanContent": true,
  "blockAds": true,
  "proxy": "auto",
  "waitFor": 800,
  "timeout": 45000,
  "removeBase64Images": true
}
```

#### Prompt P2C-FAQ

```
You are extracting FAQ content for use in video script writing. This page reveals the objections customers have and how the brand handles them.

Extract:

1. FAQ_ITEMS: All question-answer pairs on this page (array of {question, answer})
2. OBJECTION_THEMES: Group the FAQs into objection themes — what are customers worried about? (e.g. "price concerns", "delivery time", "effectiveness doubts") (array of strings)
3. REFUND_POLICY_SUMMARY: Any refund, return, or cancellation policy described (1-2 sentences)
4. SHIPPING_INFO: Any delivery or shipping information (if present)
5. GUARANTEE_TERMS: Any money-back, satisfaction, or outcome guarantee (verbatim if short, summarized if long)
6. CONTACT_METHODS: Any support contact options listed (email, phone, chat, etc.)

Extract up to 20 FAQ items. Prioritize objection-handling questions over purely operational ones.
```

#### Schema S2C-FAQ

```json
{
  "type": "object",
  "properties": {
    "faq_items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "question": { "type": "string" },
          "answer": { "type": "string" }
        }
      }
    },
    "objection_themes": { "type": "array", "items": { "type": "string" } },
    "refund_policy_summary": { "type": ["string", "null"] },
    "shipping_info": { "type": ["string", "null"] },
    "guarantee_terms": { "type": ["string", "null"] },
    "contact_methods": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

### Pass 2D — Blog Index (Tone Calibration)

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/blog",
  "formats": [
    { "type": "markdown" },
    { "type": "links" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: P2D-BLOG below",
      "schema": "SEE SCHEMA: S2D-BLOG below"
    }
  ],
  "onlyMainContent": true,
  "onlyCleanContent": true,
  "blockAds": true,
  "proxy": "auto",
  "waitFor": 800,
  "timeout": 45000,
  "removeBase64Images": true
}
```

#### Prompt P2D-BLOG

```
You are scanning a blog index page to calibrate brand voice and identify content themes.

Extract:

1. POST_HEADLINES: The titles of the most recent blog posts visible on this page (array, up to 15)
2. POST_URLS: The URLs of the most recent blog posts (array, up to 15, paired with headlines)
3. TOPIC_THEMES: The primary content themes or categories this blog covers (e.g. "productivity tips", "industry trends", "customer stories") (array)
4. TONE_SIGNALS: From the headlines alone, describe the writing tone in 3-5 adjectives (e.g. "authoritative", "casual", "technical", "storytelling-led")
5. CONTENT_CATEGORIES: Any explicit category or tag labels used on the blog (array)

Return ONLY what is visible on the index page. Do not follow links.
```

#### Schema S2D-BLOG

```json
{
  "type": "object",
  "properties": {
    "post_headlines": { "type": "array", "items": { "type": "string" } },
    "post_urls": { "type": "array", "items": { "type": "string" } },
    "topic_themes": { "type": "array", "items": { "type": "string" } },
    "tone_signals": { "type": "array", "items": { "type": "string" } },
    "content_categories": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

## Pass 3 — Blog Deep Read (Top 2 Posts)

Take the top 2 URLs from `post_urls` in Pass 2D. Run this call on each.

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "[BLOG_POST_URL]",
  "formats": [
    { "type": "markdown" },
    {
      "type": "json",
      "prompt": "SEE PROMPT: P3-BLOGPOST below",
      "schema": "SEE SCHEMA: S3-BLOGPOST below"
    }
  ],
  "onlyMainContent": true,
  "onlyCleanContent": true,
  "blockAds": true,
  "proxy": "auto",
  "waitFor": 500,
  "timeout": 45000,
  "removeBase64Images": true
}
```

### Prompt P3-BLOGPOST

```
You are analyzing a single blog post to extract brand voice signals for video script generation.

Extract:

1. POST_TITLE: The title of this post
2. AUTHOR_NAME: Author name if present
3. SENTENCE_OPENERS: The first words of the first 5 sentences (reveals sentence structure preference)
4. VOCABULARY_SIGNATURE: 10-15 distinctive words or phrases used in this post that feel uniquely "this brand" — words that reveal personality, not generic industry terms
5. WRITING_STYLE_TAGS: Characterize the writing style in 3-5 descriptors from this list: [conversational, formal, technical, storytelling, data-driven, motivational, educational, humorous, minimalist, verbose]
6. KEY_CLAIMS: The 3-5 most important claims or assertions made in this post (what the brand believes or argues)
7. CUSTOMER_REFERENCES: Any references to customers, users, or clients and how they are described

This data feeds directly into LLM system prompts for video script generation — be specific and quote directly where useful.
```

### Schema S3-BLOGPOST

```json
{
  "type": "object",
  "properties": {
    "post_title": { "type": "string" },
    "author_name": { "type": ["string", "null"] },
    "sentence_openers": { "type": "array", "items": { "type": "string" } },
    "vocabulary_signature": { "type": "array", "items": { "type": "string" } },
    "writing_style_tags": { "type": "array", "items": { "type": "string" } },
    "key_claims": { "type": "array", "items": { "type": "string" } },
    "customer_references": { "type": ["string", "null"] }
  }
}
```

---

## Pass 4 — Image Harvest

After Passes 1–3, collect all image URLs from `images` arrays across all responses. Apply this filter and download logic.

### Filtering Rules

```python
IMAGE_FILTER_RULES = {
    "min_width_px": 200,           # Ignore icons and thumbnails
    "exclude_extensions": [".svg", ".ico", ".gif"],  # SVG logos are handled separately
    "exclude_url_patterns": [      # Skip known non-brand images
        "gravatar.com",
        "googletagmanager",
        "analytics",
        "pixel",
        "beacon",
        "1x1",
        "spacer"
    ],
    "max_images_to_download": 50,  # Per brand per pass
    "prefer_extensions": [".jpg", ".jpeg", ".png", ".webp"]
}
```

### Categorization Logic

```python
IMAGE_CATEGORIES = {
    "logo": ["logo", "brand", "wordmark"],
    "product": ["product", "shop", "item", "sku", "listing"],
    "lifestyle": ["lifestyle", "hero", "banner", "campaign"],
    "team": ["team", "staff", "founder", "headshot", "people"],
    "facility": ["office", "facility", "location", "store", "space"],
    "badge": ["badge", "award", "cert", "trust", "secure", "partner"]
}
# Match against URL path and alt text. Tag each image with its category.
```

---

## Pass 5 — Metadata Extraction (Supplementary)

Run only if Schema.org type was not found in Pass 1.

```json
POST https://api.firecrawl.dev/v2/scrape
{
  "url": "https://[BRAND_DOMAIN]/",
  "formats": [{ "type": "rawHtml" }],
  "onlyMainContent": false,
  "blockAds": true,
  "proxy": "basic",
  "timeout": 30000
}
```

Parse `rawHtml` response for:
- All `<script type="application/ld+json">` blocks → extract `@type`, `@context`, and any nested structured data
- `<meta name="keywords">` content
- `<link rel="alternate" hreflang>` tags → multi-language signal
- `<meta property="og:locale">` → primary locale

---

## Output: brand_universal.json Structure

All data from Passes 1–5 collapses into this file:

```json
{
  "brand_id": "[GENERATED_UUID]",
  "domain": "https://example.com",
  "crawl_date": "2026-01-01T00:00:00Z",
  "detected_vertical": null,

  "visual_identity": {
    "logo_url": null,
    "favicon_url": null,
    "og_image_url": null,
    "colors": {
      "primary": null, "secondary": null, "accent": null,
      "background": null, "text_primary": null, "text_secondary": null,
      "link": null, "success": null, "warning": null, "error": null
    },
    "typography": {
      "primary_font": null, "heading_font": null, "code_font": null,
      "font_sizes": {}, "font_weights": {}
    },
    "color_scheme": null,
    "hero_screenshot_url": null,
    "full_page_screenshot_url": null,
    "downloaded_images": []
  },

  "copy_messaging": {
    "brand_name": null,
    "tagline": null,
    "meta_description": null,
    "hero_h1": null,
    "hero_subheadline": null,
    "feature_headlines": [],
    "cta_buttons": [],
    "pain_points": [],
    "who_its_for": null,
    "guarantee_language": null
  },

  "social_proof": {
    "testimonials": [],
    "aggregate_rating": null,
    "case_study_headlines": [],
    "before_after_stats": [],
    "client_company_names": [],
    "video_testimonial_urls": [],
    "trust_badges": []
  },

  "brand_personality": {
    "mission_statement": null,
    "origin_story": null,
    "brand_values": [],
    "founder_names": [],
    "founder_story": null,
    "community_language": null,
    "awards_accolades": [],
    "certifications": [],
    "media_mentions": [],
    "vocabulary_signature": [],
    "writing_style_tags": [],
    "tone_signals": [],
    "key_claims": [],
    "social_links": []
  },

  "metadata": {
    "schema_org_type": null,
    "vertical_signals": [],
    "trust_signals": [],
    "locations_served": null,
    "language": null,
    "hreflang_locales": [],
    "faq_items": [],
    "objection_themes": [],
    "refund_policy_summary": null,
    "guarantee_terms": null
  },

  "raw_pages": {
    "homepage_markdown": null,
    "about_markdown": null,
    "blog_posts_markdown": []
  }
}
```

---

## Credit Budget Per Brand

| Pass | Pages | Base Credits | JSON Extraction | Total |
|---|---|---|---|---|
| Pass 1 — Homepage | 1 | 1 | 4 | 5 |
| Pass 2A — About | 1 | 1 | 4 | 5 |
| Pass 2B — Reviews | 1 | 1 | 4 | 5 |
| Pass 2C — FAQ | 1 | 1 | 4 | 5 |
| Pass 2D — Blog index | 1 | 1 | 4 | 5 |
| Pass 3 — Blog posts (×2) | 2 | 2 | 8 | 10 |
| Pass 4 — Image harvest | 0 | 0 | 0 | 0 |
| Pass 5 — Metadata (if needed) | 1 | 1 | 0 | 1 |
| **TOTAL** | **8–9** | | | **~36 credits** |

> Skip any pass where the page does not exist (404). Do not retry more than once per URL.
> Enhanced proxy (`proxy: "enhanced"`) costs up to 5 additional credits per page — use `"auto"` as default.

---

## Error Handling

```python
RETRY_POLICY = {
    "max_retries": 2,
    "retry_on_status": [429, 500, 502, 503],
    "backoff_seconds": [5, 15],
    "fallback_on_404": True,   # Try alternate URL slugs from PRIORITY_PATHS
    "skip_on_timeout": True    # Do not block pipeline on single page failure
}

FALLBACK_URL_MAP = {
    "/about": ["/about-us", "/our-story", "/company", "/who-we-are"],
    "/reviews": ["/testimonials", "/customers", "/success", "/feedback"],
    "/faq": ["/help", "/support", "/questions", "/help-center"],
    "/blog": ["/news", "/insights", "/articles", "/journal", "/updates"]
}
```

---

## Vertical Detection (Post-Pass 1)

Use `schema_org_type` + `vertical_signals` from Pass 1 JSON output to route to the correct vertical-specific crawl file.

```python
VERTICAL_MAP = {
    "Product": "brand-crawl-d2c-ecommerce.md",
    "Store": "brand-crawl-d2c-ecommerce.md",
    "SoftwareApplication": "brand-crawl-b2b-saas.md",
    "LocalBusiness": "brand-crawl-home-services.md",
    "RealEstateListing": "brand-crawl-real-estate.md",
    "MedicalBusiness": "brand-crawl-healthcare.md",
    "EducationalOrganization": "brand-crawl-education.md",
    "FinancialService": "brand-crawl-financial-services.md",
    "FoodEstablishment": "brand-crawl-restaurant-fb.md",
    "SportsActivityLocation": "brand-crawl-fitness-wellness.md",
    "AutoDealer": "brand-crawl-automotive.md",
    "LegalService": "brand-crawl-legal-professional.md",
    "LodgingBusiness": "brand-crawl-travel-hospitality.md"
}
# If schema_org_type not found, use vertical_signals array for fuzzy matching.
# If vertical is still ambiguous, default to brand-crawl-d2c-ecommerce.md as fallback.
```
