# Antigravity Brand Crawl Review, RCA, and Action Plan

This document provides a First Principles Root Cause Analysis (RCA) and a detailed implementation plan to resolve the brand crawl, prompt quality, and asset extraction issues.

---

## 1. Root Cause Analysis (RCA)

### Issue 1: USP Extraction & UI Display
* **Backend Root Cause:**
  In [firecrawl-provider.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/api/src/firecrawl-provider.mjs#L498-L509), the universal profile builder (`buildUniversalProfile`) does not extract or copy the `unique_selling_points` array from the `homepageJson` object into `copy_messaging`. Additionally, in [brand-extraction.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/api/src/brand-extraction.mjs#L288-L366), the `extractUniversalProfileCandidates` function does not map `unique_selling_points` to candidates of fieldType `"usp"`.
* **Frontend Root Cause:**
  In [BrandExtractionStudio.tsx](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx#L1720-L1728) (Step 6 - Approval Form), the text area labeled "Differentiators & Proof Points" binds to `proof_points`, leaving `positioning.differentiators` (which represents the USPs) completely uneditable and unrendered.

### Issue 2: Prompt Alignment with Features Markdown
* **Root Cause:**
  The prompts defined in [firecrawl-provider.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/api/src/firecrawl-provider.mjs#L107-L137) are single-line compressed strings instead of the structured, high-recall prompts defined in [brand-crawl-universal.md](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/docs/V0/Features/Firecrawl/brand-crawl-universal.md) and [brand-crawl-verticals.md](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/docs/V0/Features/Firecrawl/brand-crawl-verticals.md).

### Issue 3: Hardcoded Values due to Bad Prompts
* **Root Cause:**
  In [brand-extraction.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/api/src/brand-extraction.mjs#L107-L155), because the scraped content is low-quality due to poor prompts, the extractor falls back to strict heuristic pattern matching with low confidence scores (e.g., hardcoded CTAs, hardcoded target audiences, hardcoded prohibited claims, and a fallback readiness score of 60).

### Issue 4: Brand Assets (Images) Not Loading
* **Root Cause:**
  1. The Firecrawl provider collects images from `responses.flatMap(({ response }) => normaliseScrapePayload(response).images)`.
  2. However, it filters vertical image collection to exact pattern matching via `collectVerticalImages(responses, patterns)` (e.g., matching `"product"`, `"listing"`, `"vehicle"`, `"room"`, `"menu"` in URLs). If image URLs on a site do not contain these specific string patterns in their filenames or paths, they are filtered out, and only the logo or OG image is loaded.
  3. No metadata-driven fallback or comprehensive harvesting is used when patterns fail.

### Issue 5: Scraped Pages Behavior Check
* **Root Cause:**
  The backend executes a static pass plan consisting of 5 separate `/scrape` calls to common subpages (`/`, `/about`, `/reviews`, `/faq`, `/blog`) rather than using Firecrawl's `/crawl` endpoint. It will always scrape exactly those 5 pages, regardless of whether a subpath was provided or whether links actually exist on the homepage.

### Issue 6: Improper Firecrawl API Key Usage
* **Root Cause:**
  In [firecrawl-provider.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/api/src/firecrawl-provider.mjs#L748-L750), the system defaults to `"simulator"` mode if `FIRECRAWL_API_KEY` is not explicitly set in the active environment. In simulated mode, it returns mockup mock data rather than executing actual API requests.

### Issue 7: Missing End-to-End Test Cases
* **Root Cause:**
  There are no integration tests under [tests/integration/](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/tests/integration/) verifying that all required assets (USPs, colors, typography, hero images, product details) are present in the final approved brand profile draft.

---

## 2. Proposed Code Changes

### A. Backend Prompt Revisions (Goal vs. Current)

Here is the comparison and copy-paste reference of the current low-quality prompts vs. the goals from our documentation:

#### 1. Homepage Scrape Prompt
* **Current Prompt in Code:**
  ```javascript
  "You are extracting brand identity, marketing copy, and homepage visual asset locators from a company homepage. Extract BRAND NAME, TAGLINE, HERO_H1, HERO_SUBHEADLINE, FEATURE_HEADLINES, CTA_BUTTONS, PAIN_POINTS, WHO_ITS_FOR, SOCIAL_LINKS, LOGO_URL, FAVICON_URL, OG_IMAGE_URL, HERO_IMAGE_URLS, HOMEPAGE_IMAGE_ASSETS, SCHEMA_TYPE, META_DESCRIPTION, VERTICAL_SIGNALS, TRUST_SIGNALS, UNIQUE_SELLING_POINTS, GUARANTEE_LANGUAGE. For HOMEPAGE_IMAGE_ASSETS return visible image URLs with alt/context/category when explicitly present. Return only explicitly present values."
  ```
* **Goal Intended Prompt:**
  ```
  You are extracting brand identity, marketing copy and homepage visual asset locators from a company homepage.
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
  10. LOGO_URL: Logo or wordmark URL visible in the page, logo alt text, branding output or raw HTML if explicitly present
  11. FAVICON_URL: Favicon or icon URL visible in raw HTML or branding output if explicitly present
  12. OG_IMAGE_URL: Open Graph image URL from raw HTML or branding output if explicitly present
  13. HERO_IMAGE_URLS: Image URLs that appear in the hero or above-fold visual area (array)
  14. HOMEPAGE_IMAGE_ASSETS: Visible homepage image URLs with alt text, nearby section/caption context and category when explicitly present (array of {url, alt, context, category})
  15. SCHEMA_TYPE: The Schema.org @type value from any JSON-LD script tags (e.g. "Organization", "LocalBusiness", "Product")
  16. META_DESCRIPTION: The content of <meta name="description">
  17. VERTICAL_SIGNALS: Any words, phrases, or section names that indicate the business category (e.g. "listings", "book a session", "shop now", "request a quote")
  18. TRUST_SIGNALS: Any numbers, stats, or credentials displayed prominently (e.g. "10,000 customers", "Since 1998", "ISO certified")
  19. UNIQUE_SELLING_POINTS: Explicit differentiators, "why choose us" statements, unique benefits or value propositions stated on the page (array)
  20. GUARANTEE_LANGUAGE: Any guarantee, refund, or risk-reversal statements
  Return ONLY fields that are explicitly present. Use null for absent fields. Do not infer or hallucinate.
  ```

#### 2. About Page Scrape Prompt
* **Current Prompt in Code:**
  ```javascript
  "Extract mission_statement, origin_story, brand_values, founder_names, founder_story, company_age_or_year, team_size, community_language, awards_accolades, certifications, media_mentions, locations_served and vocabulary_patterns explicitly present on this About page."
  ```
* **Goal Intended Prompt:**
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

#### 3. Reviews Page Scrape Prompt
* **Current Prompt in Code:**
  ```javascript
  "Extract testimonials, aggregate_rating, case_study_headlines, before_after_stats, client_company_names, video_testimonial_urls and trust_badges explicitly present on this reviews page."
  ```
* **Goal Intended Prompt:**
  ```
  You are extracting social proof and trust assets from a customer reviews or testimonials page.
  Extract only what is explicitly present:
  1. TESTIMONIALS: Array of individual testimonials. For each: quote (verbatim), author_name, author_descriptor (e.g. "CEO at Acme", "mother of 3"), star_rating (if shown), outcome_stat (any specific result mentioned e.g. "saved 10 hours/week")
  2. AGGREGATE_RATING: Overall star rating and total review count if displayed (e.g. "4.9 stars, 2,847 reviews")
  3. CASE_STUDY_HEADLINES: Headlines of any case studies or success stories linked or previewed (array)
  4. BEFORE_AFTER_STATS: Any before/after or improvement statistics ("From X to Y", "Increased by Z%") (array)
  5. CLIENT_COMPANY_NAMES: Any named client or customer companies referenced (array)
  6. VIDEO_TESTIMONIAL_URLS: Any embedded video testimonial URLs (array)
  7. TRUST_BADGES: Any certification, award, or verification badges described in text (array)
  Extract up to 10 testimonials. Prioritize ones with specific outcomes or measurable results.
  Return ONLY fields explicitly present. null or empty array for absent fields.
  ```

#### 4. FAQ Page Scrape Prompt
* **Current Prompt in Code:**
  ```javascript
  "Extract faq_items, objection_themes, refund_policy_summary, shipping_info, guarantee_terms and contact_methods explicitly present on this FAQ page."
  ```
* **Goal Intended Prompt:**
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

#### 5. Blog Index Page Scrape Prompt
* **Current Prompt in Code:**
  ```javascript
  "Extract post_headlines, post_urls, topic_themes, tone_signals and content_categories visible on this blog index page. Do not follow links."
  ```
* **Goal Intended Prompt:**
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

---

### B. Code Modifications to Fix USP & Image Harvesting

#### 1. Map `unique_selling_points` inside `buildUniversalProfile` in [firecrawl-provider.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/api/src/firecrawl-provider.mjs#L498-L509):
```diff
    copy_messaging: {
      brand_name: homepageJson.brand_name ?? null,
      tagline: homepageJson.tagline ?? null,
      meta_description: homepageJson.meta_description ?? metadata.metaDescription ?? null,
      hero_h1: homepageJson.hero_h1 ?? null,
      hero_subheadline: homepageJson.hero_subheadline ?? null,
      feature_headlines: asArray(homepageJson.feature_headlines),
      cta_buttons: asArray(homepageJson.cta_buttons),
      pain_points: asArray(homepageJson.pain_points),
      who_its_for: homepageJson.who_its_for ?? null,
-     guarantee_language: homepageJson.guarantee_language ?? faqJson.guarantee_terms ?? null
+     guarantee_language: homepageJson.guarantee_language ?? faqJson.guarantee_terms ?? null,
+     unique_selling_points: asArray(homepageJson.unique_selling_points)
    },
```

#### 2. Extract `usp` field candidates in `extractUniversalProfileCandidates` in [brand-extraction.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/api/src/brand-extraction.mjs#L321-L322):
```diff
  addCandidate(candidates, "copy_messaging", compactObject({
    tagline: copy.tagline,
    metaDescription: copy.meta_description,
    heroH1: copy.hero_h1,
    heroSubheadline: copy.hero_subheadline,
    featureHeadlines: asArray(copy.feature_headlines),
    ctaButtons: asArray(copy.cta_buttons),
    painPoints: asArray(copy.pain_points),
    guaranteeLanguage: copy.guarantee_language
  }), 0.84, page, copy.hero_h1 ?? copy.tagline);

+ for (const item of asArray(copy.unique_selling_points).slice(0, 10)) {
+   candidates.push(metadataCandidate("usp", item, 0.86, page, item));
+ }
```

#### 3. Update Image Harvesting in `collectVerticalImages` in [firecrawl-provider.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/api/src/firecrawl-provider.mjs#L686-L690):
Implement a fallback that returns the first 10 images if pattern matching yields no results:
```diff
function collectVerticalImages(responses, patterns) {
- return uniqueValues(responses.flatMap(({ response }) => normaliseScrapePayload(response).images))
-   .filter((url) => patterns.some((pattern) => url.toLowerCase().includes(pattern)))
-   .slice(0, 50);
+ const allImages = uniqueValues(responses.flatMap(({ response }) => normaliseScrapePayload(response).images));
+ const matched = allImages.filter((url) => patterns.some((pattern) => url.toLowerCase().includes(pattern)));
+ if (matched.length > 0) {
+   return matched.slice(0, 50);
+ }
+ // Fallback: if no patterns matched, return a subset of all harvested images so they load on UI
+ return allImages.slice(0, 10);
}
```

#### 4. Add USP input field in [BrandExtractionStudio.tsx](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx#L1720-L1728) (Step 6 Form):
```diff
                        <div>
                          <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Differentiators & Proof Points (One per line)</label>
                          <textarea
                            rows={2}
                            value={approvalDraft.positioning.proof_points?.join('\n')}
                            onChange={(e) => setApprovalDraft(prev => ({ ...prev, positioning: { ...prev.positioning, proof_points: e.target.value.split('\n') } }))}
                            className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-white font-mono text-[10px]"
                          />
                        </div>
+                       <div>
+                         <label className="block text-[8px] font-mono uppercase text-zinc-500 mb-1">Unique Selling Propositions (USPs / Differentiators) (One per line)</label>
+                         <textarea
+                           rows={3}
+                           value={approvalDraft.positioning.differentiators?.join('\n')}
+                           onChange={(e) => setApprovalDraft(prev => ({ ...prev, positioning: { ...prev.positioning, differentiators: e.target.value.split('\n') } }))}
+                           className="w-full rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-white font-mono text-[10px]"
+                         />
+                       </div>
```

---

## 3. Verification Plan

### Automated Tests
We will add a new test file [tests/integration/brand-intake-usp-assets.test.mjs](file:///d:/Chlear%20Projects/Tribe%20V2%20Based%20Ad%20Scorer%20and%20Generator/tests/integration/brand-intake-usp-assets.test.mjs) verifying:
1. Universal profile correctly parses `unique_selling_points` from mock scrape outputs.
2. Extractor generates `usp` candidate items with correct fieldType.
3. Verticals collect images correctly with the fallback mechanism.

Run:
```powershell
node --test tests/integration/brand-intake-usp-assets.test.mjs
```

### Manual Verification
1. Run local environment and open `http://localhost:3000/brand-extract`.
2. Enter a test URL and select Real Estate.
3. Observe Step 4 displays USP candidates inside the "Copy & Messaging" section.
4. Verify Step 5 displays multiple loaded assets/images (due to the fallback mechanism).
5. Verify Step 6 displays the new "Unique Selling Propositions (USPs / Differentiators)" textarea containing the approved USPs.
