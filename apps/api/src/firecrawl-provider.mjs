const defaultIncludePrefixes = ["/", "/about", "/projects", "/properties", "/contact", "/brochure", "/rera", "/legal"];
const defaultExcludePrefixes = ["/blog", "/careers", "/privacy", "/terms"];
const defaultFormats = ["markdown", "links", "images", "screenshot", "branding", "json"];
const universalSourceGuide = "docs/V0/Features/Firecrawl/brand-crawl-universal.md";
const verticalSourceGuide = "docs/V0/Features/Firecrawl/brand-crawl-verticals.md";
const sharedVerticalAssetFields = ["image_asset_labels", "visual_asset_contexts"];
const universalPriorityGroups = [
  { key: "about", aliases: ["/about", "/about-us", "/our-story", "/story", "/who-we-are"], fallback: "/about" },
  { key: "reviews", aliases: ["/reviews", "/testimonials", "/customers", "/case-studies", "/success-stories"], fallback: "/reviews" },
  { key: "faq", aliases: ["/faq", "/frequently-asked-questions", "/help", "/support"], fallback: "/faq" },
  { key: "blog_index", aliases: ["/blog", "/news", "/insights", "/articles", "/resources"], fallback: "/blog" }
];

const brandTypeConfig = {
  d2c_ecommerce: verticalConfig("G6", "D2C", [
    verticalPass("d2c_catalog", "/products", ["product_names", "collection_names", "price_range", "sale_indicators", "product_card_urls", "subscription_or_bundle", "shipping_hook", "label_tags"], { detailUrlField: "product_card_urls", detailKey: "d2c_product_detail", detailLimit: 3, detailFields: ["product_name", "price", "currency", "variant_options", "ingredients_or_materials", "product_certifications", "size_guide", "care_instructions"] }),
    verticalPass("d2c_materials", "/ingredients", ["ingredients_or_materials", "product_certifications", "size_guide", "care_instructions"])
  ], ["product_names", "collection_names"]),
  b2b_saas: verticalConfig("G7", "SaaS", [
    verticalPass("saas_features", "/features", ["feature_names", "feature_descriptions", "roi_claims", "integration_count", "dashboard_described", "api_mentioned", "security_claims", "use_case_labels", "product_screenshots_alt"]),
    verticalPass("saas_pricing", "/pricing", ["plan_names", "plan_prices", "free_tier", "free_trial", "enterprise_cta", "most_popular_plan", "key_differentiators"]),
    verticalPass("saas_integrations", "/integrations", ["integration_names", "integration_categories", "competitor_names", "comparison_claims"])
  ], ["feature_names", "use_case_labels"]),
  real_estate: verticalConfig("G8", "RealEstate", [
    verticalPass("real_estate_listing_index", "/listings", ["listing_names", "listing_urls", "property_types", "price_range", "location_names", "status_labels", "developer_name", "rera_numbers", "filter_options"], { detailUrlField: "listing_urls", detailKey: "real_estate_listing_detail", detailLimit: 3, detailFields: ["property_name", "address_or_locality", "specs", "price", "possession_date", "amenities", "floor_plan_description", "nearby_landmarks", "rera_number", "virtual_tour_url"] })
  ], ["listing_names"]),
  healthcare: verticalConfig("G9", "Healthcare", [
    verticalPass("healthcare_services", "/services", ["treatment_names", "specializations", "technology_equipment", "outcome_stats", "accreditations", "insurance_accepted", "booking_cta", "teleconsult_available", "languages_spoken"]),
    verticalPass("healthcare_team", "/doctors", ["doctors", "professional_names", "qualifications", "specializations", "languages_spoken"])
  ], ["treatment_names", "specializations"]),
  education: verticalConfig("G10", "Education", [
    verticalPass("education_courses", "/courses", ["course_names", "course_urls", "subject_domains", "certification_types", "format_options", "duration_range", "price_range", "free_resource_offer", "enrollment_urgency"]),
    verticalPass("education_outcomes", "/placements", ["placement_rate", "average_salary", "hiring_companies", "salary_range", "student_success_stories", "alumni_count", "outcome_stats"])
  ], ["course_names", "subject_domains"]),
  financial_services: verticalConfig("G11", "Fintech", [
    verticalPass("financial_products", "/products", ["product_names", "key_rates", "regulatory_badges", "security_features", "eligibility_requirements", "min_investment_or_premium", "returns_claim", "claims_settlement_stat", "app_availability", "disclaimer_present", "disclaimer_text"]),
    verticalPass("financial_calculator", "/calculator", ["calculator_type", "input_labels", "result_labels"])
  ], ["product_names"]),
  restaurant_fb: verticalConfig("G12", "Restaurant", [
    verticalPass("restaurant_menu", "/menu", ["menu_sections", "menu_items", "signature_dishes", "cuisine_types"], { format: "menu" }),
    verticalPass("restaurant_gallery", "/gallery", ["food_photography_urls", "interior_urls", "exterior_urls", "chef_team_urls", "event_urls"]),
    verticalPass("restaurant_delivery", "/delivery", ["delivery_platforms", "operating_hours", "reservation_cta", "signature_dishes", "cuisine_types", "catering_available"])
  ], ["menu_sections", "menu_items", "signature_dishes", "cuisine_types"]),
  fitness_wellness: verticalConfig("G13", "Fitness", [
    verticalPass("fitness_classes", "/classes", ["class_names", "class_descriptions", "class_schedule_preview", "difficulty_levels", "format_types", "trial_offer"]),
    verticalPass("fitness_results", "/transformations", ["transformation_stories", "aggregate_results", "before_after_image_pairs", "trainer_names_in_stories"])
  ], ["class_names"]),
  automotive: verticalConfig("G14", "Auto", [
    verticalPass("automotive_inventory", "/inventory", ["vehicle_names", "vehicle_urls", "price_range", "vehicle_types", "fuel_types", "year_range", "finance_hook", "trade_in_offer"], { detailUrlField: "vehicle_urls", detailKey: "automotive_vehicle_detail", detailLimit: 3, detailFields: ["vehicle_name", "specs", "price", "color_options", "safety_ratings", "key_features", "image_angles_available", "test_drive_cta"] })
  ], ["vehicle_names"]),
  legal_professional: verticalConfig("G15", "Legal", [
    verticalPass("legal_practice_areas", "/practice-areas", ["practice_area_names", "practice_area_urls", "jurisdiction", "case_types", "bar_associations", "languages_served", "consultation_cta"]),
    verticalPass("legal_team", "/team", ["professionals", "qualifications", "bar_admissions", "languages_served", "firm_size"])
  ], ["practice_area_names", "case_types"]),
  travel_hospitality: verticalConfig("G16", "Hospitality", [
    verticalPass("hospitality_rooms", "/rooms", ["room_types", "room_urls", "price_range", "max_occupancy", "amenity_highlights", "view_types", "booking_cta", "urgency_language", "sustainability_claims"], { detailUrlField: "room_urls", detailKey: "hospitality_room_detail", detailLimit: 3, detailFields: ["room_name", "room_description", "room_specs", "in_room_amenities", "price_per_night", "virtual_tour_url"] }),
    verticalPass("hospitality_gallery", "/gallery", ["gallery_image_categories"])
  ], ["room_types"]),
  home_services: verticalConfig("G17", "HomeServices", [
    verticalPass("home_services", "/services", ["service_names", "service_areas", "license_and_insurance", "brand_partnerships", "portfolio_urls", "process_steps", "warranty_terms", "estimate_cta", "typical_timeline"]),
    verticalPass("home_services_portfolio", "/portfolio", ["project_names", "project_types", "before_after_pairs", "client_testimonials_on_portfolio", "materials_featured"])
  ], ["service_names", "portfolio_urls"])
};

const schemaTypeToBrandType = new Map([
  ["Product", "d2c_ecommerce"],
  ["Store", "d2c_ecommerce"],
  ["ClothingStore", "d2c_ecommerce"],
  ["OnlineStore", "d2c_ecommerce"],
  ["SoftwareApplication", "b2b_saas"],
  ["WebApplication", "b2b_saas"],
  ["RealEstateListing", "real_estate"],
  ["Apartment", "real_estate"],
  ["House", "real_estate"],
  ["MedicalBusiness", "healthcare"],
  ["Hospital", "healthcare"],
  ["Physician", "healthcare"],
  ["Dentist", "healthcare"],
  ["EducationalOrganization", "education"],
  ["Course", "education"],
  ["FinancialService", "financial_services"],
  ["FoodEstablishment", "restaurant_fb"],
  ["SportsActivityLocation", "fitness_wellness"],
  ["HealthClub", "fitness_wellness"],
  ["Spa", "fitness_wellness"],
  ["AutoDealer", "automotive"],
  ["CarDealer", "automotive"],
  ["MotorizedVehicle", "automotive"],
  ["LegalService", "legal_professional"],
  ["Attorney", "legal_professional"],
  ["AccountingService", "legal_professional"],
  ["LodgingBusiness", "travel_hospitality"],
  ["Hotel", "travel_hospitality"],
  ["TouristAttraction", "travel_hospitality"],
  ["HomeAndConstructionBusiness", "home_services"],
  ["GeneralContractor", "home_services"],
  ["InteriorDesigner", "home_services"],
  ["LocalBusiness", "home_services"]
]);

const homepageSchema = objectSchema({
  brand_name: stringSchema(),
  tagline: nullableStringSchema(),
  hero_h1: nullableStringSchema(),
  hero_subheadline: nullableStringSchema(),
  feature_headlines: stringArraySchema(),
  cta_buttons: stringArraySchema(),
  pain_points: stringArraySchema(),
  who_its_for: nullableStringSchema(),
  social_links: { type: "array", items: { type: "object", properties: { platform: stringSchema(), url: stringSchema() } } },
  logo_url: nullableStringSchema(),
  favicon_url: nullableStringSchema(),
  og_image_url: nullableStringSchema(),
  hero_image_urls: stringArraySchema(),
  homepage_image_assets: {
    type: "array",
    items: {
      type: "object",
      properties: {
        url: stringSchema(),
        alt: nullableStringSchema(),
        context: nullableStringSchema(),
        category: nullableStringSchema()
      }
    }
  },
  schema_type: nullableStringSchema(),
  meta_description: nullableStringSchema(),
  vertical_signals: stringArraySchema(),
  trust_signals: stringArraySchema(),
  unique_selling_points: stringArraySchema(),
  guarantee_language: nullableStringSchema()
});

const universalPasses = [
  {
    key: "homepage",
    path: "/",
    formats: [
      { type: "markdown" },
      { type: "branding" },
      { type: "images" },
      { type: "links" },
      { type: "rawHtml" },
      { type: "screenshot", fullPage: true, quality: 80 },
      {
        type: "json",
        prompt: `You are extracting brand identity, marketing copy and homepage visual asset locators from a company homepage.

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

Return ONLY fields that are explicitly present. Use null for absent fields. Do not infer or hallucinate.`,
        schema: homepageSchema
      }
    ],
    options: {
      onlyMainContent: false,
      onlyCleanContent: false,
      waitFor: 1500,
      timeout: 60000,
      actions: [{ type: "screenshot", fullPage: false, quality: 90, viewport: { width: 1440, height: 900 } }]
    }
  },
  {
    key: "about",
    path: "/about",
    formats: [{ type: "markdown" }, { type: "images" }, jsonFormat(`You are extracting brand identity and story content from a company About page.

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

Return ONLY fields explicitly present. null for absent fields.`, ["mission_statement", "origin_story", "brand_values", "founder_names", "founder_story", "company_age_or_year", "team_size", "community_language", "awards_accolades", "certifications", "media_mentions", "locations_served", "vocabulary_patterns"])],
    options: { waitFor: 1000, timeout: 45000 }
  },
  {
    key: "reviews",
    path: "/reviews",
    formats: [{ type: "markdown" }, { type: "images" }, jsonFormat(`You are extracting social proof and trust assets from a customer reviews or testimonials page.

Extract only what is explicitly present:

1. TESTIMONIALS: Array of individual testimonials. For each: quote (verbatim), author_name, author_descriptor (e.g. "CEO at Acme", "mother of 3"), star_rating (if shown), outcome_stat (any specific result mentioned e.g. "saved 10 hours/week")
2. AGGREGATE_RATING: Overall star rating and total review count if displayed (e.g. "4.9 stars, 2,847 reviews")
3. CASE_STUDY_HEADLINES: Headlines of any case studies or success stories linked or previewed (array)
4. BEFORE_AFTER_STATS: Any before/after or improvement statistics ("From X to Y", "Increased by Z%") (array)
5. CLIENT_COMPANY_NAMES: Any named client or customer companies referenced (array)
6. VIDEO_TESTIMONIAL_URLS: Any embedded video testimonial URLs (array)
7. TRUST_BADGES: Any certification, award, or verification badges described in text (array)

Extract up to 10 testimonials. Prioritize ones with specific outcomes or measurable results.
Return ONLY fields explicitly present. null or empty array for absent fields.`, ["testimonials", "aggregate_rating", "case_study_headlines", "before_after_stats", "client_company_names", "video_testimonial_urls", "trust_badges"])],
    options: { waitFor: 2000, timeout: 60000 }
  },
  {
    key: "faq",
    path: "/faq",
    formats: [{ type: "markdown" }, jsonFormat(`You are extracting FAQ content for use in video script writing. This page reveals the objections customers have and how the brand handles them.

Extract:

1. FAQ_ITEMS: All question-answer pairs on this page (array of {question, answer})
2. OBJECTION_THEMES: Group the FAQs into objection themes — what are customers worried about? (e.g. "price concerns", "delivery time", "effectiveness doubts") (array of strings)
3. REFUND_POLICY_SUMMARY: Any refund, return, or cancellation policy described (1-2 sentences)
4. SHIPPING_INFO: Any delivery or shipping information (if present)
5. GUARANTEE_TERMS: Any money-back, satisfaction, or outcome guarantee (verbatim if short, summarized if long)
6. CONTACT_METHODS: Any support contact options listed (email, phone, chat, etc.)

Extract up to 20 FAQ items. Prioritize objection-handling questions over purely operational ones.`, ["faq_items", "objection_themes", "refund_policy_summary", "shipping_info", "guarantee_terms", "contact_methods"])],
    options: { waitFor: 800, timeout: 45000 }
  },
  {
    key: "blog_index",
    path: "/blog",
    formats: [{ type: "markdown" }, { type: "links" }, jsonFormat(`You are scanning a blog index page to calibrate brand voice and identify content themes.

Extract:

1. POST_HEADLINES: The titles of the most recent blog posts visible on this page (array, up to 15)
2. POST_URLS: The URLs of the most recent blog posts (array, up to 15, paired with headlines)
3. TOPIC_THEMES: The primary content themes or categories this blog covers (e.g. "productivity tips", "industry trends", "customer stories") (array)
4. TONE_SIGNALS: From the headlines alone, describe the writing tone in 3-5 adjectives (e.g. "authoritative", "casual", "technical", "storytelling-led")
5. CONTENT_CATEGORIES: Any explicit category or tag labels used on the blog (array)

Return ONLY what is visible on the index page. Do not follow links.`, ["post_headlines", "post_urls", "topic_themes", "tone_signals", "content_categories"])],
    options: { waitFor: 800, timeout: 45000 }
  }
];

const blogPostDeepReadFormat = jsonFormat(`You are analyzing a single blog post to extract brand voice signals for video script generation.

Extract:

1. POST_TITLE: The title of this post
2. AUTHOR_NAME: Author name if present
3. SENTENCE_OPENERS: The first words of the first 5 sentences (reveals sentence structure preference)
4. VOCABULARY_SIGNATURE: 10-15 distinctive words or phrases used in this post that feel uniquely "this brand" — words that reveal personality, not generic industry terms
5. WRITING_STYLE_TAGS: Characterize the writing style in 3-5 descriptors from this list: [conversational, formal, technical, storytelling, data-driven, motivational, educational, humorous, minimalist, verbose]
6. KEY_CLAIMS: The 3-5 most important claims or assertions made in this post (what the brand believes or argues)
7. CUSTOMER_REFERENCES: Any references to customers, users, or clients and how they are described

This data feeds directly into LLM system prompts for video script generation — be specific and quote directly where useful.`, ["post_title", "author_name", "sentence_openers", "vocabulary_signature", "writing_style_tags", "key_claims", "customer_references"]);

export function buildFirecrawlBrandPassPlan(crawlRun, brandContext = {}, options = {}) {
  const baseUrl = normalizeBaseUrl(crawlRun?.normalizedUrl ?? crawlRun?.websiteUrl ?? crawlRun?.url);
  const language = brandContext.language || "en-IN";
  return {
    sourceGuide: universalSourceGuide,
    universal: universalPasses.map((pass) => ({
      key: pass.key,
      endpoint: "/scrape",
      request: scrapeRequest(resolveUrl(baseUrl, pass.path), pass.formats, { ...pass.options, timeout: options.timeoutMs ?? pass.options.timeout, language })
    }))
  };
}

export function selectUniversalPagePlan({ baseUrl, links = [], crawlScope = {} }) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const maxPages = clampPositiveInteger(crawlScope.maxPages, 5, 50);
  const minimumExpectedPages = Math.min(5, maxPages);
  const prefixes = Array.isArray(crawlScope.permittedPathPrefixes) && crawlScope.permittedPathPrefixes.length > 0
    ? crawlScope.permittedPathPrefixes.map(cleanPrefix)
    : ["/"];
  const eligibleLinks = uniqueValues(links)
    .map((value) => safeInternalUrl(value, normalizedBase))
    .filter(Boolean)
    .filter((value) => pathAllowed(new URL(value).pathname, prefixes));
  const used = new Set([normalizedBase]);
  const pages = [{ key: "homepage", url: normalizedBase, discovered: true }];

  for (const group of universalPriorityGroups) {
    if (pages.length >= maxPages) break;
    const discovered = eligibleLinks.find((url) => !used.has(url) && group.aliases.some((alias) => pathMatchesAlias(new URL(url).pathname, alias)));
    if (discovered) {
      used.add(discovered);
      pages.push({ key: group.key, url: discovered, discovered: true });
    }
  }

  for (const url of eligibleLinks) {
    if (pages.length >= maxPages) break;
    if (used.has(url)) continue;
    used.add(url);
    pages.push({ key: `internal_${pages.length}`, url, discovered: true });
  }

  const broadScope = prefixes.includes("/");
  if (broadScope) {
    for (const group of universalPriorityGroups) {
      if (pages.length >= maxPages) break;
      if (pages.some((page) => page.key === group.key)) continue;
      const fallbackUrl = resolveUrl(normalizedBase, group.fallback);
      if (used.has(fallbackUrl)) continue;
      used.add(fallbackUrl);
      pages.push({ key: group.key, url: fallbackUrl, discovered: false, fallback: true });
    }
  }

  const partial = pages.length < minimumExpectedPages;
  return {
    pages,
    minimumExpectedPages,
    partial,
    warnings: partial
      ? [{ code: "CRAWL_MINIMUM_PAGE_COUNT_NOT_MET", expected: minimumExpectedPages, planned: pages.length }]
      : []
  };
}

export function buildImageInventory(entries = []) {
  const all = [];
  const seen = new Set();
  for (const entry of entries) {
    const descriptor = typeof entry === "string" ? { url: entry } : entry ?? {};
    if (typeof descriptor.url !== "string" || !/^https?:\/\//i.test(descriptor.url)) continue;
    const url = descriptor.url.trim();
    if (!url || seen.has(url) || isDiscardedImage(descriptor)) continue;
    seen.add(url);
    all.push({
      url,
      alt: typeof descriptor.alt === "string" ? descriptor.alt.trim() : "",
      context: typeof descriptor.context === "string" ? descriptor.context.trim() : "",
      category: classifyImageDescriptor(descriptor)
    });
  }
  const urlsFor = (categories) => all.filter((asset) => categories.includes(asset.category)).map((asset) => asset.url);
  return {
    all,
    productImages: urlsFor(["product", "project", "listing", "vehicle", "room", "menu"]),
    lifestyleImages: urlsFor(["lifestyle", "hero", "campaign"]),
    facilityImages: urlsFor(["facility", "office", "clinic", "restaurant", "hotel", "space"]),
    teamImages: urlsFor(["team", "doctor", "trainer", "attorney", "founder", "people"]),
    badges: urlsFor(["badge"]),
    logos: urlsFor(["logo"])
  };
}

export function buildFirecrawlVerticalPassPlan({ baseUrl, selectedBrandType = null, detectedBrandType = null, universalProfile = {}, language = "en-IN" }) {
  const resolvedDetected = detectedBrandType ?? detectBrandType(universalProfile);
  const resolvedSelected = selectedBrandType ?? resolvedDetected ?? "d2c_ecommerce";
  const config = brandTypeConfig[resolvedSelected] ?? brandTypeConfig.d2c_ecommerce;
  return {
    sourceGuide: verticalSourceGuide,
    selectedBrandType: resolvedSelected,
    detectedBrandType: resolvedDetected,
    conflict: Boolean(resolvedSelected && resolvedDetected && resolvedSelected !== resolvedDetected),
    group: config.group,
    label: config.label,
    passes: config.passes.map((pass) => ({
      key: pass.key,
      endpoint: "/scrape",
      group: config.group,
      label: config.label,
      detail: pass.detail ?? null,
      request: scrapeRequest(resolveUrl(normalizeBaseUrl(baseUrl), pass.path), verticalFormats(config, pass), { waitFor: 1200, timeout: 60000, language })
    }))
  };
}

export async function runFirecrawlBrandExtraction(crawlRun, { env = process.env, fetchImpl = globalThis.fetch, brandContext = {} } = {}) {
  const configuration = validateFirecrawlConfiguration(env);
  if (!configuration.ok) {
    return configuration;
  }
  if (configuration.mode !== "firecrawl") {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider is disabled.", true);
  }
  const apiKey = env.FIRECRAWL_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider is not configured.", true);
  }
  const baseUrl = (env.FIRECRAWL_API_BASE_URL || "https://api.firecrawl.dev/v2").replace(/\/$/, "");
  const selectedBrandType = crawlRun?.crawlScope?.brandExtraction?.selectedBrandType ?? crawlRun?.selectedBrandType ?? null;
  const universalResponses = [];
  const skippedPages = [];
  let estimatedCredits = 0;
  try {
    const homepageDefinition = universalPasses.find((pass) => pass.key === "homepage");
    const homepagePass = materializeUniversalPass(homepageDefinition, crawlRun.normalizedUrl ?? crawlRun.websiteUrl, brandContext, parseTimeout(env));
    const homepageResponse = await scrapeFirecrawl(`${baseUrl}${homepagePass.endpoint}`, homepagePass.request, apiKey, fetchImpl);
    universalResponses.push({ pass: homepagePass, response: homepageResponse.payload });
    estimatedCredits += estimatePassCredits(homepagePass.request);

    const homepagePage = normaliseScrapePayload(homepageResponse.payload);
    const pagePlan = selectUniversalPagePlan({
      baseUrl: crawlRun.normalizedUrl ?? crawlRun.websiteUrl,
      links: homepagePage.links,
      crawlScope: crawlRun.crawlScope ?? {}
    });
    for (const plannedPage of pagePlan.pages.slice(1)) {
      const definition = universalPasses.find((pass) => pass.key === plannedPage.key) ?? genericInternalPass(plannedPage.key);
      const pass = materializeUniversalPass(definition, plannedPage.url, brandContext, parseTimeout(env), true);
      try {
        const response = await scrapeFirecrawl(`${baseUrl}${pass.endpoint}`, pass.request, apiKey, fetchImpl);
        universalResponses.push({ pass, response: response.payload });
        estimatedCredits += estimatePassCredits(pass.request);
      } catch (error) {
        if (error?.problem && [403, 404, 409, 422].includes(error.problem.status)) {
          skippedPages.push({ key: pass.key, url: pass.request.url, code: error.problem.code, status: error.problem.status });
          continue;
        }
        throw error;
      }
    }
    const blogIndex = universalResponses.find(({ pass }) => pass.key === "blog_index");
    const blogPostUrls = asArray(normaliseScrapePayload(blogIndex?.response).json?.post_urls)
      .map((url) => safeInternalUrl(url, crawlRun.normalizedUrl ?? crawlRun.websiteUrl))
      .filter(Boolean)
      .slice(0, 2);
    for (const [index, blogPostUrl] of blogPostUrls.entries()) {
      const pass = {
        key: `blog_post_${index + 1}`,
        sourceGuide: universalSourceGuide,
        endpoint: "/scrape",
        request: scrapeRequest(blogPostUrl, [{ type: "markdown" }, blogPostDeepReadFormat], {
          onlyMainContent: true,
          onlyCleanContent: true,
          blockAds: true,
          waitFor: 500,
          timeout: Math.min(parseTimeout(env), 45000),
          removeBase64Images: true
        })
      };
      try {
        const response = await scrapeFirecrawl(`${baseUrl}${pass.endpoint}`, pass.request, apiKey, fetchImpl);
        universalResponses.push({ pass, response: response.payload });
        estimatedCredits += estimatePassCredits(pass.request);
      } catch (error) {
        if (error?.problem && [403, 404, 409, 422].includes(error.problem.status)) {
          skippedPages.push({ key: pass.key, url: pass.request.url, code: error.problem.code, status: error.problem.status });
          continue;
        }
        throw error;
      }
    }
    if (universalResponses.length === 0) {
      return failure("PROVIDER_OUTPUT_INVALID", 422, "The crawl provider returned no usable universal evidence.");
    }
    const universalProfile = buildUniversalProfile({
      crawlRun,
      baseUrl: crawlRun.normalizedUrl ?? crawlRun.websiteUrl,
      responses: universalResponses
    });
    const verticalPlan = buildFirecrawlVerticalPassPlan({
      baseUrl: crawlRun.normalizedUrl ?? crawlRun.websiteUrl,
      selectedBrandType,
      universalProfile,
      language: brandContext.language || "en-IN"
    });
    const verticalResponses = [];
    const skippedVerticalPages = [];
    for (const pass of verticalPlan.passes) {
      try {
        const response = await scrapeFirecrawl(`${baseUrl}${pass.endpoint}`, pass.request, apiKey, fetchImpl);
        verticalResponses.push({ pass, response: response.payload });
        estimatedCredits += estimatePassCredits(pass.request);
        if (pass.detail?.urlField) {
          const detailUrls = asArray(normaliseScrapePayload(response.payload).json?.[pass.detail.urlField]).slice(0, pass.detail.limit);
          for (const [index, detailUrl] of detailUrls.entries()) {
            const safeUrl = safeInternalUrl(detailUrl, crawlRun.normalizedUrl ?? crawlRun.websiteUrl);
            if (!safeUrl) continue;
            const detailPass = {
              key: `${pass.detail.key}_${index + 1}`,
              endpoint: "/scrape",
              group: pass.group,
              label: pass.label,
              request: scrapeRequest(safeUrl, verticalFormats(
                brandTypeConfig[verticalPlan.selectedBrandType],
                { key: pass.detail.key, fields: pass.detail.fields, format: "markdown" }
              ), { waitFor: 1200, timeout: 60000, language: brandContext.language || "en-IN" })
            };
            try {
              const detailResponse = await scrapeFirecrawl(`${baseUrl}${detailPass.endpoint}`, detailPass.request, apiKey, fetchImpl);
              verticalResponses.push({ pass: detailPass, response: detailResponse.payload });
              estimatedCredits += estimatePassCredits(detailPass.request);
            } catch (error) {
              if (error?.problem && [403, 404, 409, 422].includes(error.problem.status)) {
                skippedVerticalPages.push({ key: detailPass.key, url: detailPass.request.url, code: error.problem.code, status: error.problem.status });
                continue;
              }
              throw error;
            }
          }
        }
      } catch (error) {
        if (error?.problem && [403, 404, 409, 422].includes(error.problem.status)) {
          skippedVerticalPages.push({ key: pass.key, url: pass.request.url, code: error.problem.code, status: error.problem.status });
          continue;
        }
        throw error;
      }
    }

    // 1. Gather all unique image entries for LLM classification
    const allEntries = [];
    if (Array.isArray(universalProfile?.visual_identity?.downloaded_images)) {
      allEntries.push(...universalProfile.visual_identity.downloaded_images.map(img => ({
        url: img.url,
        alt: img.alt || "",
        context: "Homepage asset"
      })));
    }
    allEntries.push(...collectVerticalImageEntries(verticalResponses));

    const uniqueMap = new Map();
    for (const entry of allEntries) {
      if (entry.url && !uniqueMap.has(entry.url)) {
        uniqueMap.set(entry.url, entry);
      }
    }
    const uniqueEntries = Array.from(uniqueMap.values());

    // 2. Classify using LLM (if configured)
    const classifiedEntries = await classifyImagesWithLlm(uniqueEntries, verticalPlan.selectedBrandType, env, fetchImpl);
    const categoryMap = new Map(classifiedEntries.map(e => [e.url, e.category]));

    // 3. Update universal downloaded images with their LLM-classified categories
    if (Array.isArray(universalProfile?.visual_identity?.downloaded_images)) {
      for (const img of universalProfile.visual_identity.downloaded_images) {
        if (categoryMap.has(img.url)) {
          img.category = categoryMap.get(img.url);
        }
      }
    }

    const output = {
      schemaVersion: "brand.extraction.output.v3",
      provider: "firecrawl",
      crawlRunId: crawlRun.id ?? null,
      universal: {
        sourceGuide: universalSourceGuide,
        profile: universalProfile
      },
      vertical: {
        sourceGuide: verticalSourceGuide,
        selectedBrandType: verticalPlan.selectedBrandType,
        detectedBrandType: verticalPlan.detectedBrandType,
        conflict: verticalPlan.conflict,
        assets: await buildVerticalAssets(verticalPlan, verticalResponses, categoryMap),
        pageInventory: {
          planned: verticalPlan.passes.map((pass) => ({ key: pass.key, url: pass.request.url })),
          completed: verticalResponses.map(({ pass }) => ({ key: pass.key, url: pass.request.url })),
          skipped: skippedVerticalPages,
          partial: skippedVerticalPages.length > 0
        }
      },
      pages: universalResponses.concat(verticalResponses).map(({ response }) => normaliseScrapePayload(response)),
      assets: collectRightsAssets(universalProfile, verticalResponses, categoryMap),
      pageInventory: {
        minimumExpectedPages: Math.min(5, clampPositiveInteger(crawlRun?.crawlScope?.maxPages, 5, 50)),
        planned: pagePlan.pages.map((page) => ({ key: page.key, url: page.url, discovered: page.discovered === true, fallback: page.fallback === true })),
        completed: universalResponses.map(({ pass }) => ({ key: pass.key, url: pass.request.url })),
        skipped: skippedPages,
        partial: universalResponses.length < pagePlan.minimumExpectedPages,
        warnings: [
          ...pagePlan.warnings,
          ...(universalResponses.length < pagePlan.minimumExpectedPages
            ? [{ code: "CRAWL_MINIMUM_PAGE_COUNT_NOT_MET", expected: pagePlan.minimumExpectedPages, completed: universalResponses.length }]
            : [])
        ]
      },
      creditUsage: {
        estimatedCredits,
        observedCredits: observedCredits(universalResponses.concat(verticalResponses).map((item) => item.response))
      }
    };
    return { ok: true, output };
  } catch (error) {
    if (error?.code === "CRAWL_TIMEOUT") {
      return failure("CRAWL_TIMEOUT", 504, "The website did not respond in time.", true);
    }
    if (error?.problem) {
      return { ok: false, problem: error.problem };
    }
    return failure("DEPENDENCY_UNAVAILABLE", 503, "This service is temporarily unavailable.", true);
  }
}

export function validateFirecrawlConfiguration(env = process.env) {
  const mode = resolveBrandCrawlMode(env);
  if (!new Set(["simulator", "firecrawl"]).has(mode)) {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Brand crawl mode is invalid.");
  }
  if (mode === "simulator") return { ok: true, mode };
  if (typeof env.FIRECRAWL_API_KEY !== "string" || env.FIRECRAWL_API_KEY.trim().length === 0) {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider is not configured.");
  }
  try {
    const parsed = new URL(env.FIRECRAWL_API_BASE_URL || "https://api.firecrawl.dev/v2");
    if (parsed.protocol !== "https:") return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider URL is invalid.");
  } catch {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider URL is invalid.");
  }
  const timeout = Number.parseInt(env.FIRECRAWL_TIMEOUT_MS || "60000", 10);
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 120000) {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl timeout configuration is invalid.");
  }
  return { ok: true, mode };
}

function materializeUniversalPass(definition, targetUrl, brandContext, timeoutMs, targetIsExact = false) {
  const baseUrl = targetIsExact ? targetUrl : normalizeBaseUrl(targetUrl);
  const url = targetIsExact ? targetUrl : resolveUrl(baseUrl, definition.path);
  return {
    key: definition.key,
    endpoint: "/scrape",
    request: scrapeRequest(url, definition.formats, {
      ...definition.options,
      timeout: timeoutMs ?? definition.options?.timeout,
      language: brandContext.language || "en-IN"
    })
  };
}

function genericInternalPass(key) {
  return {
    key,
    formats: [{ type: "markdown" }, { type: "images" }, { type: "links" }],
    options: { waitFor: 800, timeout: 45000 }
  };
}

export function buildFirecrawlCrawlRequest(crawlRun, brandContext = {}, options = {}) {
  const crawlScope = crawlRun?.crawlScope ?? crawlRun?.crawl_scope ?? {};
  const maxPages = clampPositiveInteger(crawlScope.maxPages, options.defaultMaxPages ?? 5, options.maxPages ?? 50);
  const includePrefixes = Array.isArray(crawlScope.permittedPathPrefixes) && crawlScope.permittedPathPrefixes.length > 0
    ? crawlScope.permittedPathPrefixes
    : defaultIncludePrefixes;
  const excludePrefixes = Array.isArray(crawlScope.excludedPathPrefixes) && crawlScope.excludedPathPrefixes.length > 0
    ? crawlScope.excludedPathPrefixes
    : defaultExcludePrefixes;

  return {
    url: crawlRun.websiteUrl ?? crawlRun.normalizedUrl ?? crawlRun.url,
    includePaths: includePrefixes.map(includePathRegex),
    excludePaths: excludePrefixes.map(excludePathRegex),
    maxDiscoveryDepth: 1,
    sitemap: "include",
    ignoreQueryParameters: true,
    limit: maxPages,
    crawlEntireDomain: true,
    allowExternalLinks: false,
    allowSubdomains: false,
    ignoreRobotsTxt: false,
    delay: 1,
    maxConcurrency: 1,
    scrapeOptions: {
      formats: defaultFormats,
      onlyMainContent: true,
      onlyCleanContent: false,
      waitFor: 1000,
      mobile: false,
      timeout: options.timeoutMs ?? 60000,
      parsers: ["pdf"],
      location: {
        country: "IN",
        languages: [brandContext.language || "en-IN"]
      },
      removeBase64Images: true,
      blockAds: true,
      proxy: "auto",
      storeInCache: false,
      redactPII: true
    },
    zeroDataRetention: options.zeroDataRetention === true
  };
}

export async function startBrandCrawl(request, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const apiKey = env.FIRECRAWL_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider is not configured.", true);
  }

  const baseUrl = (env.FIRECRAWL_API_BASE_URL || "https://api.firecrawl.dev/v2").replace(/\/$/, "");
  const timeoutMs = Number.parseInt(env.FIRECRAWL_TIMEOUT_MS || "60000", 10);
  const controller = new AbortController();
  const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(`${baseUrl}/crawl`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) {
      return failure(mapProviderStatus(response.status, payload), response.status, "The crawl provider did not accept the request.", response.status >= 500);
    }
    const providerCrawlId = payload?.id ?? payload?.crawlId ?? payload?.jobId;
    if (typeof providerCrawlId !== "string" || providerCrawlId.trim().length === 0) {
      return failure("PROVIDER_OUTPUT_INVALID", 422, "The crawl provider returned an invalid response.");
    }
    return { ok: true, providerCrawlId, rawStatus: payload.status ?? "queued" };
  } catch (error) {
    if (error?.name === "AbortError" || /timed?\s*out|timeout/i.test(String(error?.message))) {
      return failure("CRAWL_TIMEOUT", 504, "The website did not respond in time.", true);
    }
    return failure("DEPENDENCY_UNAVAILABLE", 503, "This service is temporarily unavailable.", true);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function getBrandCrawlStatus(providerCrawlId, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const apiKey = env.FIRECRAWL_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider is not configured.", true);
  }
  const baseUrl = (env.FIRECRAWL_API_BASE_URL || "https://api.firecrawl.dev/v2").replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${baseUrl}/crawl/${encodeURIComponent(providerCrawlId)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      return failure(mapProviderStatus(response.status, payload), response.status, "The crawl provider status check failed.", response.status >= 500);
    }
    return { ok: true, status: payload.status ?? "unknown", scrape: normaliseFirecrawlPages(payload), rawTotals: safeTotals(payload) };
  } catch {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "This service is temporarily unavailable.", true);
  }
}

export function normaliseFirecrawlPages(response) {
  const pages = Array.isArray(response?.data) ? response.data : Array.isArray(response?.pages) ? response.pages : null;
  if (!pages || pages.length === 0) {
    throw new Error("PROVIDER_OUTPUT_INVALID");
  }
  const normalisedPages = pages
    .map(normalisePage)
    .filter((page) => page.url && (page.markdown || page.text || Object.keys(page.branding ?? {}).length > 0));
  if (normalisedPages.length === 0) {
    throw new Error("PROVIDER_OUTPUT_INVALID");
  }
  return { pages: normalisedPages };
}

function scrapeRequest(url, formats, options = {}) {
  const req = {
    url,
    formats,
    onlyMainContent: options.onlyMainContent ?? true,
    onlyCleanContent: options.onlyCleanContent ?? true,
    blockAds: true,
    proxy: "auto",
    waitFor: options.waitFor ?? 1200,
    timeout: options.timeout ?? 60000,
    removeBase64Images: true
  };
  if (Array.isArray(options.actions) && options.actions.length > 0) {
    req.actions = options.actions;
  }
  if (options.useGeolocation || process.env.FIRECRAWL_USE_GEOLOCATION === "true") {
    req.location = { country: "IN", languages: [options.language ?? "en-IN"] };
  }
  return req;
}

function jsonFormat(prompt, fields) {
  return {
    type: "json",
    prompt,
    schema: objectSchema(Object.fromEntries(fields.map((field) => [field, genericSchemaFor(field)])))
  };
}

function verticalConfig(group, label, passes, productFields) {
  return { group, label, passes, productFields };
}

function verticalPass(key, path, fields, options = {}) {
  return {
    key,
    path,
    fields,
    format: options.format ?? "markdown",
    detail: options.detailUrlField
      ? {
          urlField: options.detailUrlField,
          key: options.detailKey,
          limit: options.detailLimit ?? 3,
          fields: options.detailFields ?? []
        }
      : null
  };
}

function getVerticalPromptDetails(label) {
  const details = {
    RealEstate: "Focus on listing names, property type, price range, locality/address, bedrooms/bathrooms/sqft specs, possession timeline, amenities, nearby connectivity/landmarks (distance in km), developer profile, and RERA numbers.",
    SaaS: "Focus on feature names/descriptions, integration count, security compliance certifications, ROI claims, and competitor comparison details (advantages, pricing plans).",
    D2C: "Focus on product names, prices/currency, sale indicators, collections, categories, tags, and product detail specs (ingredients, materials, care instructions, size guide).",
    Healthcare: "Focus on treatment names, medical specializations, technological equipment, patient outcome stats, accreditations (NABH, JCI), and insurance accepted.",
    Education: "Focus on course names, subjects, formats, duration, placements, average salary, hiring companies, and alumni success stories.",
    Fintech: "Focus on credit/financial product/insurance names, interest rates, returns claims, regulatory/compliance badges, app availability, and eligibility requirements.",
    Restaurant: "Focus on menu sections, menu items, signature dishes, cuisine types, operating hours, delivery platforms, and reservation details.",
    Fitness: "Focus on class names/descriptions, schedule, difficulty levels, and trial offers.",
    Auto: "Focus on vehicle names, prices, vehicle/fuel types, year range, and finance hooks.",
    Legal: "Focus on practice area names, case types, jurisdiction, bar associations, and languages served.",
    Hospitality: "Focus on room types, price range, max occupancy, amenity highlights, view types, and booking CTAs.",
    HomeServices: "Focus on service names, service areas, license and insurance, process steps, warranty terms, and timelines."
  };
  return details[label] ? ` ${details[label]}` : "";
}

function verticalFormats(config, pass) {
  const fields = uniqueValues([...pass.fields, ...sharedVerticalAssetFields]);
  const detailInstructions = getVerticalPromptDetails(config.label);
  return [
    { type: pass.format },
    { type: "images" },
    { type: "links" },
    {
      type: "json",
      prompt: `Extract ${fields.join(", ")} explicitly present for ${config.label}.${detailInstructions} For IMAGE_ASSET_LABELS and VISUAL_ASSET_CONTEXTS, describe visible image alt text, captions, or page context that helps categorise images returned by the images format. Return null or empty arrays for absent fields.`,
      schema: objectSchema(Object.fromEntries(fields.map((field) => [field, genericSchemaFor(field)])))
    }
  ];
}

function objectSchema(properties) {
  return { type: "object", properties };
}

function stringSchema() {
  return { type: "string" };
}

function nullableStringSchema() {
  return { type: ["string", "null"] };
}

function stringArraySchema() {
  return { type: "array", items: { type: "string" } };
}

function genericSchemaFor(field) {
  if (/^(has_|is_|disclaimer_present$)/.test(field)) {
    return { type: ["boolean", "string", "null"] };
  }
  if (/_urls?$|_names$|_signals$|_headlines$|_items$|_themes$|_badges$|_stats$|_claims$|_options$|_types$|_labels$|_methods$|_patterns$|_categories$|_descriptions$|_areas$|_features$|_images$|_pairs$|_steps$|_contexts$/.test(field)) {
    return { type: "array", items: { type: ["string", "object"] } };
  }
  if (/^(testimonials|doctors|professionals|plan_prices|feature_descriptions|process_steps|menu_items)$/.test(field)) {
    return { type: "array", items: { type: "object" } };
  }
  return nullableStringSchema();
}

async function scrapeFirecrawl(url, request, apiKey, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), clampPositiveInteger(request?.timeout, 60000, 120000));
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) {
      throw { problem: failure(mapProviderStatus(response.status, payload), response.status, "The crawl provider scrape failed.", response.status >= 500).problem };
    }
    return { ok: true, payload };
  } catch (error) {
    if (error?.problem) {
      throw error;
    }
    if (error?.name === "AbortError" || /timed?\s*out|timeout/i.test(String(error?.message))) {
      throw Object.assign(new Error("Firecrawl scrape timed out"), { code: "CRAWL_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildUniversalProfile({ crawlRun, baseUrl, responses }) {
  const byKey = new Map(responses.map((item) => [item.pass.key, normaliseScrapePayload(item.response)]));
  const homepage = byKey.get("homepage") ?? {};
  const about = byKey.get("about") ?? {};
  const reviews = byKey.get("reviews") ?? {};
  const faq = byKey.get("faq") ?? {};
  const blog = byKey.get("blog_index") ?? {};
  const homepageJson = homepage.json ?? {};
  const aboutJson = about.json ?? {};
  const reviewsJson = reviews.json ?? {};
  const faqJson = faq.json ?? {};
  const blogJson = blog.json ?? {};
  const blogPosts = responses
    .filter((item) => item.pass.key.startsWith("blog_post_"))
    .map((item) => normaliseScrapePayload(item.response));
  const blogPostJson = blogPosts.map((page) => page.json ?? {});
  const branding = homepage.branding ?? {};
  const metadata = parseRawHtmlMetadata(homepage.rawHtml);
  const schemaType = homepageJson.schema_type ?? metadata.schemaOrgType ?? null;
  return {
    brand_id: crawlRun.id ?? null,
    domain: baseUrl ?? homepage.url ?? null,
    crawl_date: new Date().toISOString(),
    detected_vertical: detectBrandType({ metadata: { schema_org_type: schemaType, vertical_signals: homepageJson.vertical_signals ?? [] } }),
    visual_identity: {
      logo_url: branding.images?.logo ?? branding.logo ?? homepageJson.logo_url ?? null,
      favicon_url: branding.images?.favicon ?? branding.favicon ?? homepageJson.favicon_url ?? null,
      og_image_url: branding.images?.ogImage ?? branding.ogImage ?? homepageJson.og_image_url ?? null,
      colors: normalizeUniversalColors(branding.colors ?? branding.palette ?? {}),
      typography: normalizeUniversalTypography(branding.typography ?? {}),
      color_scheme: branding.colorScheme ?? null,
      hero_screenshot_url: screenshotAt(homepage, 0),
      full_page_screenshot_url: homepage.formatScreenshot ?? null,
      downloaded_images: collectDownloadedImages(responses, homepageJson)
    },
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
      guarantee_language: homepageJson.guarantee_language ?? faqJson.guarantee_terms ?? null,
      unique_selling_points: asArray(homepageJson.unique_selling_points)
    },
    social_proof: {
      testimonials: asArray(reviewsJson.testimonials),
      aggregate_rating: reviewsJson.aggregate_rating ?? null,
      case_study_headlines: asArray(reviewsJson.case_study_headlines),
      before_after_stats: asArray(reviewsJson.before_after_stats),
      client_company_names: asArray(reviewsJson.client_company_names),
      video_testimonial_urls: asArray(reviewsJson.video_testimonial_urls),
      trust_badges: uniqueValues([...asArray(reviewsJson.trust_badges), ...asArray(homepageJson.trust_signals)])
    },
    brand_personality: {
      mission_statement: aboutJson.mission_statement ?? null,
      origin_story: aboutJson.origin_story ?? null,
      brand_values: asArray(aboutJson.brand_values),
      founder_names: asArray(aboutJson.founder_names),
      founder_story: aboutJson.founder_story ?? null,
      community_language: aboutJson.community_language ?? null,
      awards_accolades: asArray(aboutJson.awards_accolades),
      certifications: asArray(aboutJson.certifications),
      media_mentions: asArray(aboutJson.media_mentions),
      vocabulary_signature: uniqueValues([...asArray(aboutJson.vocabulary_patterns), ...blogPostJson.flatMap((item) => asArray(item.vocabulary_signature))]),
      writing_style_tags: uniqueValues([...asArray(blogJson.tone_signals), ...blogPostJson.flatMap((item) => asArray(item.writing_style_tags))]),
      tone_signals: uniqueValues([...asArray(blogJson.tone_signals), branding.personality?.tone].filter(Boolean)),
      key_claims: uniqueValues(blogPostJson.flatMap((item) => asArray(item.key_claims))),
      social_links: asArray(homepageJson.social_links)
    },
    metadata: {
      schema_org_type: schemaType,
      vertical_signals: asArray(homepageJson.vertical_signals),
      trust_signals: asArray(homepageJson.trust_signals),
      locations_served: aboutJson.locations_served ?? null,
      language: homepage.language ?? null,
      hreflang_locales: asArray(metadata.hreflangLocales),
      faq_items: asArray(faqJson.faq_items),
      objection_themes: asArray(faqJson.objection_themes),
      refund_policy_summary: faqJson.refund_policy_summary ?? null,
      guarantee_terms: faqJson.guarantee_terms ?? null
    },
    raw_pages: {
      homepage_markdown: homepage.markdown ?? null,
      about_markdown: about.markdown ?? null,
      blog_posts_markdown: blogPosts.map((page) => page.markdown).filter(Boolean)
    }
  };
}

function buildVerticalAssets(plan, responses, categoryMap = new Map()) {
  const jsonBlocks = responses.map((item) => normaliseScrapePayload(item.response).json ?? {});
  const merged = Object.assign({}, ...jsonBlocks);
  const config = brandTypeConfig[plan.selectedBrandType] ?? brandTypeConfig.d2c_ecommerce;
  const rawEntries = collectVerticalImageEntries(responses);
  const entries = rawEntries.map((e) => ({
    ...e,
    category: categoryMap.get(e.url) || classifyImageDescriptor(e)
  }));
  const imageInventory = buildImageInventory(entries);
  return {
    detected_vertical: plan.group,
    vertical_label: plan.label,
    products_or_services: uniqueValues(config.productFields.flatMap((field) => asArrayOrValue(merged[field]))),
    visual_assets: {
      product_images: imageInventory.productImages,
      lifestyle_images: imageInventory.lifestyleImages,
      facility_images: imageInventory.facilityImages,
      team_images: imageInventory.teamImages,
      uncategorised_images: imageInventory.all.filter((asset) => asset.category === "uncategorised").map((asset) => asset.url),
      before_after_pairs: asArray(merged.before_after_pairs),
      screenshots: responses.map((item) => screenshotAt(normaliseScrapePayload(item.response), 0)).filter(Boolean)
    },
    copy_assets: {
      service_descriptions: uniqueValues(["service_descriptions", "feature_descriptions", "class_descriptions", "room_description"].flatMap((field) => asArrayOrValue(merged[field]))),
      outcome_stats: uniqueValues(["outcome_stats", "roi_claims", "aggregate_results"].flatMap((field) => asArrayOrValue(merged[field]))),
      pricing_summary: merged.price_range ?? merged.price ?? merged.key_rates ?? null,
      cta_language: merged.booking_cta ?? merged.consultation_cta ?? merged.estimate_cta ?? merged.reservation_cta ?? null,
      urgency_language: merged.urgency_language ?? merged.enrollment_urgency ?? null,
      compliance_disclaimers: uniqueValues(["disclaimer_text", "security_claims", "regulatory_badges", "accreditations", "rera_numbers", "license_and_insurance"].flatMap((field) => asArrayOrValue(merged[field])))
    },
    raw_vertical_data: merged
  };
}

function normaliseScrapePayload(payload) {
  const data = payload?.data ?? payload;
  const metadata = data?.metadata ?? {};
  return {
    url: metadata.sourceURL ?? metadata.url ?? data?.url ?? null,
    title: metadata.title ?? data?.title ?? "",
    markdown: typeof data?.markdown === "string" ? data.markdown : "",
    text: typeof data?.text === "string" && data.text.trim() ? data.text : typeof data?.markdown === "string" ? data.markdown : "",
    links: Array.isArray(data?.links) ? data.links.filter((item) => typeof item === "string") : [],
    images: Array.isArray(data?.images) ? data.images.filter((item) => typeof item === "string") : [],
    language: metadata.language ?? null,
    rawHtml: typeof data?.rawHtml === "string" ? data.rawHtml : "",
    screenshots: Array.isArray(data?.actions?.screenshots)
      ? data.actions.screenshots
      : Array.isArray(data?.screenshots)
        ? data.screenshots
        : [],
    formatScreenshot: typeof data?.screenshot === "string" ? data.screenshot : null,
    branding: data?.branding ?? {},
    json: data?.json ?? data?.extract ?? {}
  };
}

function detectBrandType(profile) {
  const schemaType = profile?.metadata?.schema_org_type;
  if (typeof schemaType === "string" && schemaTypeToBrandType.has(schemaType)) {
    return schemaTypeToBrandType.get(schemaType);
  }
  const signals = asArray(profile?.metadata?.vertical_signals).join(" ").toLowerCase();
  if (/\brera|bhk|floor plan|listing|property\b/.test(signals)) return "real_estate";
  if (/\bintegration|dashboard|api|free trial|pricing plans?\b/.test(signals)) return "b2b_saas";
  if (/\bshop|cart|product|collection\b/.test(signals)) return "d2c_ecommerce";
  if (/\bdoctor|clinic|appointment|treatment\b/.test(signals)) return "healthcare";
  if (/\bcourse|curriculum|enroll|certificate\b/.test(signals)) return "education";
  if (/\bmenu|reservation|cuisine|delivery\b/.test(signals)) return "restaurant_fb";
  return null;
}

function parseRawHtmlMetadata(rawHtml) {
  const html = typeof rawHtml === "string" ? rawHtml : "";
  const schemaMatch = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  let schemaOrgType = null;
  if (schemaMatch) {
    try {
      const parsed = JSON.parse(schemaMatch[1]);
      schemaOrgType = Array.isArray(parsed?.["@type"]) ? parsed["@type"][0] : parsed?.["@type"] ?? null;
    } catch {
      schemaOrgType = null;
    }
  }
  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  const hreflangLocales = [...html.matchAll(/<link[^>]+hreflang=["']([^"']+)["']/gi)].map((match) => match[1]);
  return { schemaOrgType, metaDescription, hreflangLocales };
}

function normalizeUniversalColors(colors) {
  return {
    primary: colors.primary ?? null,
    secondary: colors.secondary ?? null,
    accent: colors.accent ?? null,
    background: colors.background ?? colors.bg ?? null,
    text_primary: colors.textPrimary ?? colors.text ?? null,
    text_secondary: colors.textSecondary ?? null,
    link: colors.link ?? null,
    success: colors.success ?? null,
    warning: colors.warning ?? null,
    error: colors.error ?? null
  };
}

function normalizeUniversalTypography(typography) {
  const fontFamilies = typography.fontFamilies ?? typography.fonts ?? {};
  return {
    primary_font: fontFamilies.primary ?? fontFamilies.body ?? null,
    heading_font: fontFamilies.heading ?? null,
    code_font: fontFamilies.code ?? null,
    font_sizes: typography.fontSizes ?? {},
    font_weights: typography.fontWeights ?? {}
  };
}

function collectDownloadedImages(responses, homepageJson = {}) {
  const entries = [
    ...responses.flatMap(({ response }) => normaliseScrapePayload(response).images.map((url) => ({ url }))),
    ...asArray(homepageJson.hero_image_urls).map((url) => ({ url, category: "hero", context: "Homepage hero" })),
    ...asArray(homepageJson.homepage_image_assets).map((asset) => typeof asset === "string" ? { url: asset } : asset)
  ];
  return buildImageInventory(entries).all;
}

function collectRightsAssets(universalProfile, verticalResponses, categoryMap = new Map()) {
  const urls = [
    universalProfile.visual_identity.logo_url,
    universalProfile.visual_identity.og_image_url,
    universalProfile.visual_identity.hero_screenshot_url,
    universalProfile.visual_identity.full_page_screenshot_url,
    ...universalProfile.visual_identity.downloaded_images.map((image) => image.url),
    ...verticalResponses.flatMap(({ response }) => normaliseScrapePayload(response).images)
  ].filter(Boolean);
  return uniqueValues(urls).slice(0, 50).map((locator) => ({
    type: categoryMap.get(locator) || categorizeImage(locator),
    locator,
    rightsBasis: "public website crawl evidence",
    permittedUse: "candidate review"
  }));
}

function collectVerticalImageEntries(responses) {
  const entries = [];
  for (const { response } of responses) {
    const page = normaliseScrapePayload(response);
    entries.push(...page.images.map((url) => ({ url, context: page.title || page.url || "Vertical page" })));
    for (const context of asArray(page.json?.visual_asset_contexts)) {
      if (typeof context === "object" && context?.url) entries.push(context);
    }
    for (const label of asArray(page.json?.image_asset_labels)) {
      if (typeof label === "object" && label?.url) entries.push(label);
    }
  }
  return entries;
}

function categorizeImage(url) {
  const value = String(url).toLowerCase();
  if (/logo|wordmark|brand/.test(value)) return "logo";
  if (/product|shop|item|sku|listing|project|vehicle|room/.test(value)) return "product";
  if (/team|staff|founder|doctor|trainer|attorney|people/.test(value)) return "team";
  if (/office|facility|clinic|store|restaurant|hotel|space/.test(value)) return "facility";
  if (/badge|award|cert|trust|secure|partner/.test(value)) return "badge";
  return "lifestyle";
}

const verticalImagePrompts = {
  d2c_ecommerce: {
    system: `You are an expert D2C brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Brand logos, secondary logos, wordmarks, brand icons, and favicons.
    2. product: Physical products, apparel, retail goods, close-up product packaging, or items listed for sale.
    3. team: Company founders, design teams, customer support agents, or staff members.
    4. facility: Corporate headquarters, physical retail storefronts, or warehouses.
    5. lifestyle: Models wearing or using the products, influencers, customer lifestyle shots, or hero/lifestyle banners.
    6. badge: Secure checkout badges, trust seals, organic/cruelty-free certification shields, or partner logos.
    7. uncategorised: Generic icons, UI buttons, decorative dividers, spacer gifs, background textures, or unidentifiable assets.`
  },
  b2b_saas: {
    system: `You are an expert B2B SaaS brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Brand logos, company logos, product logos, and favicons.
    2. product: Software dashboard screenshots, analytics graphs, workflow diagrams, product interface elements, or feature visual mockups.
    3. team: Company founders, engineering teams, support staff, or executive portraits.
    4. facility: Corporate offices, conference rooms, or company headquarters.
    5. lifestyle: Professionals collaborating, teams at desks, client success portraits, or hero/lifestyle banners.
    6. badge: Security compliance badges (SOC2, ISO), trust seals, partner certifications, or software review badges (G2, Capterra).
    7. uncategorised: Generic UI icons, tech pattern backgrounds, spacer graphics, or unidentifiable assets.`
  },
  real_estate: {
    system: `You are an expert real estate brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Brand logos, company logos, wordmarks, brand icons, and favicons.
    2. product: Property listings, construction sites, building elevations, project designs, floor plans, apartment layouts, villas, or architectural site maps.
    3. team: Executive board members, real estate agents, property consultants, founders, or client portraits.
    4. facility: Corporate offices, physical sales galleries, sales galleries/office buildings, experience centres, or project locations.
    5. lifestyle: People interacting, happy residents, home interiors showing lifestyle elements, green community spaces, amenities (swimming pool, gym), or hero/lifestyle banners.
    6. badge: Accreditations, RERA registration badges, developer awards, or security/trust badges.
    7. uncategorised: Generic icons, UI buttons, decorative dividers, spacer gifs, background textures, or unidentifiable assets.`
  },
  healthcare: {
    system: `You are an expert healthcare brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Hospital/clinic logos, brand marks, and favicons.
    2. product: Medical equipment, diagnostic charts, treatment processes, surgical instruments, or treatment packages.
    3. team: Doctors, nurses, medical specialists, surgeons, or clinical staff.
    4. facility: Clinic receptions, hospital facades, operating theatres, ward interiors, or laboratory spaces.
    5. lifestyle: Doctors talking to smiling patients, patients recovering, healthy families, wellness lifestyle shots, or hero banners.
    6. badge: Medical accreditations (NABH, JCI), insurance partner badges, trust shields, or clinical certifications.
    7. uncategorised: Generic medical icons, UI buttons, decorative elements, or unidentifiable assets.`
  },
  education: {
    system: `You are an expert education brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: School/university logos, academy marks, and favicons.
    2. product: Classrooms, lecture slides, study materials, certificate templates, online learning platforms, or course syllabus cards.
    3. team: Professors, teachers, academic trainers, mentors, or educational consultants.
    4. facility: School campus facades, library halls, study areas, science labs, or university gates.
    5. lifestyle: Students studying, group projects, graduation scenes, campus life activities, or hero banners.
    6. badge: University affiliations, state accreditations, educational awards, or partner trust badges.
    7. uncategorised: Generic academic icons, UI dividers, spacer elements, or unidentifiable assets.`
  },
  financial_services: {
    system: `You are an expert fintech and financial services brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Bank/fintech logos, card network marks (Visa, Mastercard), and favicons.
    2. product: Credit card designs, mobile banking app screenshots, interest calculators, credit reports, or financial products.
    3. team: Financial advisors, portfolio managers, executives, or customer support staff.
    4. facility: Bank branches, wealth management centres, or corporate headquarters.
    5. lifestyle: Families looking at homes, clients signing documents, shopping transactions, financial freedom imagery, or hero banners.
    6. badge: Regulatory registration badges (SEBI, RBI), security compliance seals, encryption trust badges.
    7. uncategorised: Generic currency/chart icons, UI buttons, security padlocks, or unidentifiable assets.`
  },
  restaurant_fb: {
    system: `You are an expert restaurant and food brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Restaurant logos, brand symbols, delivery partner badges, and favicons.
    2. product: Prepared food dishes, chef creations, plating styles, beverages, cocktails, or printed menu cards.
    3. team: Kitchen chefs, culinary teams, wait staff, or bartenders.
    4. facility: Restaurant facades, dining rooms, kitchen lines, bar counters, or outdoor patio setups.
    5. lifestyle: Guests dining, sharing plates, cheering glasses, social dining experiences, or hero banners.
    6. badge: Food safety ratings, culinary awards, organic sourcing badges, or review badges (Yelp, TripAdvisor).
    7. uncategorised: Generic cutlery/food icons, UI dividers, background textures, or unidentifiable assets.`
  },
  fitness_wellness: {
    system: `You are an expert fitness and wellness brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Gym/studio logos, brand marks, and favicons.
    2. product: Fitness equipment, weights, yoga mats, athletic wear, transformation comparison cards (before/after), or supplement bottles.
    3. team: Personal trainers, coaches, yoga instructors, or wellness experts.
    4. facility: Gym floors, spin studios, spa treatment rooms, wellness clinic facades.
    5. lifestyle: People working out, running, doing yoga, healthy cooking scenes, fitness lifestyle shots, or hero banners.
    6. badge: Certified trainer badges, league affiliations, wellness awards, or security trust seals.
    7. uncategorised: Generic exercise icons, UI buttons, background textures, or unidentifiable assets.`
  },
  automotive: {
    system: `You are an expert automotive brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Car manufacturer logos, dealership emblems, and favicons.
    2. product: Car exterior views (different angles), engine bays, interior dashboards, wheels, accessory kits, or vehicle listings.
    3. team: Dealership sales advisors, service technicians, mechanics, or customer support staff.
    4. facility: Showroom floors, service bays, mechanic workshops, or dealership facades.
    5. lifestyle: Families on road trips, off-road driving adventures, driving experiences, client keys delivery, or hero banners.
    6. badge: Safety ratings (NCAP), warranty coverage badges, manufacturer certified seals.
    7. uncategorised: Generic dashboard/car icons, UI dividers, background textures, or unidentifiable assets.`
  },
  legal_professional: {
    system: `You are an expert legal brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Law firm logos, brand marks, and favicons.
    2. product: Law books, document folders, contract drafts, scales of justice, gavel icons, or legal document templates.
    3. team: Attorneys, partners, legal associates, paralegals, or administrative staff.
    4. facility: Law offices, client meeting rooms, courtrooms, or firm receptions.
    5. lifestyle: Lawyers consulting with clients, signing contracts, handshakes, or hero banners.
    6. badge: Bar association badges, legal directories accreditations (Super Lawyers, Chambers), security trust seals.
    7. uncategorised: Generic legal icons, UI buttons, decorative dividers, or unidentifiable assets.`
  },
  travel_hospitality: {
    system: `You are an expert travel and hospitality brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Hotel/resort logos, travel brand marks, and favicons.
    2. product: Hotel rooms, suites, guest amenities, rental packages, flight cabins, cruise decks, or tourist destination guides.
    3. team: Hotel staff, concierge teams, tour guides, flight attendants, or receptionists.
    4. facility: Resort lobby, hotel facades, pools, beaches, hotel restaurants, or wellness areas.
    5. lifestyle: Guests swimming, walking on the beach, sightseeing, luxury travel moments, or hero banners.
    6. badge: Sustainability certs, hospitality awards, TripAdvisor review badges, booking safety badges.
    7. uncategorised: Generic travel icons, UI buttons, map graphics, or unidentifiable assets.`
  },
  home_services: {
    system: `You are an expert home services brand asset classifier. Your job is to classify a list of crawled brand images into the most appropriate category for video ad generation.
    
    Target Categories:
    1. logo: Service brand logos, company emblems, and favicons.
    2. product: Repair tools, plumbing pipes, electrical panels, HVAC units, clean installations, or work-in-progress repair steps.
    3. team: Plumbers, electricians, HVAC technicians, customer service representatives.
    4. facility: Dispatch offices, workshop spaces, or fleet service vans.
    5. lifestyle: Happy homeowners, smiling technicians talking to clients, clean home interiors, or hero banners.
    6. badge: Licensing accreditations, insurance verified badges, review ratings (HomeAdvisor, Yelp), trust shields.
    7. uncategorised: Generic wrench/gear icons, UI buttons, dividers, or unidentifiable assets.`
  }
};

async function classifyImagesWithLlm(entries, selectedBrandType, env, fetchImpl = globalThis.fetch) {
  const apiKey = env.OPENAI_API_KEY;
  const promptConfig = verticalImagePrompts[selectedBrandType] ?? verticalImagePrompts.d2c_ecommerce;
  if (!apiKey || !promptConfig || entries.length === 0) return entries;

  // Limit to top 50 unique images to control cost and latency
  const batch = entries.slice(0, 50).map(e => ({
    url: e.url,
    alt: e.alt || "",
    context: e.context || ""
  }));

  try {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: promptConfig.system
          },
          {
            role: "user",
            content: `Classify these brand images:\n${JSON.stringify(batch, null, 2)}`
          }
        ],
        response_format: {
          type: "json_object"
        },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      console.warn("OpenAI image classification failed:", response.statusText);
      return entries;
    }

    const body = await response.json();
    let content = body.choices?.[0]?.message?.content;
    if (!content) return entries;
    
    // Parse response
    const parsed = JSON.parse(content);
    const classifications = new Map(
      (parsed.classifications || []).map(c => [c.url, c.category])
    );

    return entries.map(entry => ({
      ...entry,
      category: classifications.get(entry.url) || entry.category
    }));
  } catch (err) {
    console.warn("Failed to classify images with LLM:", err);
    return entries;
  }
}

function estimatePassCredits(request) {
  const formats = Array.isArray(request.formats) ? request.formats : [];
  return 1 + formats.filter((format) => format.type === "json").length * 4;
}

function observedCredits(payloads) {
  const credits = payloads
    .map((payload) => payload?.creditsUsed ?? payload?.metadata?.creditsUsed)
    .filter((value) => Number.isFinite(value));
  return credits.length > 0 ? credits.reduce((sum, value) => sum + value, 0) : null;
}

function screenshotAt(page, index) {
  return Array.isArray(page?.screenshots) ? page.screenshots[index] ?? null : null;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && String(item).trim().length > 0) : [];
}

function asArrayOrValue(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined || value === "" ? [] : [value];
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : value)).filter(Boolean))];
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = "/";
  return parsed.toString();
}

function safeInternalUrl(value, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const parsed = new URL(value, base);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== base.origin) return null;
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");
  } catch {
    return null;
  }
}

function pathAllowed(pathname, prefixes) {
  if (prefixes.includes("/")) return true;
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function pathMatchesAlias(pathname, alias) {
  return pathname === alias || pathname.startsWith(`${alias}/`);
}

function isDiscardedImage(descriptor) {
  const haystack = `${descriptor.url ?? ""} ${descriptor.alt ?? ""} ${descriptor.context ?? ""}`.toLowerCase();
  return /(?:tracking|analytics|pixel|spacer|sprite|favicon|1x1)/.test(haystack) || /(?:^|[\/_-])(?:16|24|32|48)x(?:16|24|32|48)(?:[\/_-]|\.)/.test(haystack);
}

function classifyImageDescriptor(descriptor) {
  const explicit = typeof descriptor.category === "string" ? descriptor.category.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  const haystack = `${explicit} ${descriptor.alt ?? ""} ${descriptor.context ?? ""} ${descriptor.url ?? ""}`.toLowerCase();
  if (/logo|wordmark|brand mark/.test(haystack)) return "logo";
  if (/badge|award|certif|trust|secure|partner/.test(haystack)) return "badge";
  if (/team|staff|founder|doctor|trainer|attorney|people/.test(haystack)) return "team";
  if (/office|facility|clinic|store|restaurant|hotel|workspace|sales centre|sales center/.test(haystack)) return "facility";
  if (/product|project|listing|property|vehicle|room|menu|floor plan|apartment|villa/.test(haystack)) return explicit || "product";
  if (/hero|campaign|lifestyle|community|family|resident/.test(haystack)) return explicit || "lifestyle";
  return explicit || "uncategorised";
}

function resolveUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString().replace(/\/$/, path === "/" ? "/" : "");
}

function parseTimeout(env) {
  const parsed = Number.parseInt(env.FIRECRAWL_TIMEOUT_MS || "60000", 10);
  return Number.isFinite(parsed) ? parsed : 60000;
}

function resolveBrandCrawlMode(env) {
  return env.BRAND_CRAWL_MODE || (env.FIRECRAWL_API_KEY ? "firecrawl" : "simulator");
}

function normalisePage(page) {
  const metadata = page.metadata ?? {};
  const sourceUrl = metadata.sourceURL ?? metadata.url ?? page.url;
  const markdown = typeof page.markdown === "string" ? page.markdown : "";
  const text = typeof page.text === "string" && page.text.trim() ? page.text : markdown;
  return {
    url: sourceUrl,
    title: metadata.title ?? page.title ?? "",
    markdown,
    text,
    links: Array.isArray(page.links) ? page.links.filter((item) => typeof item === "string") : [],
    images: Array.isArray(page.images) ? page.images.filter((item) => typeof item === "string") : [],
    language: metadata.language ?? null,
    branding: normaliseBranding(page.branding ?? {})
  };
}

function normaliseBranding(branding) {
  return {
    colors: branding.colors ?? branding.palette ?? {},
    typography: {
      fontFamilies: branding.typography?.fontFamilies ?? branding.typography?.fonts ?? {}
    },
    images: {
      logo: branding.images?.logo ?? branding.logo ?? "",
      logoAlt: branding.images?.logoAlt ?? branding.logoAlt ?? ""
    },
    personality: {
      targetAudience: branding.personality?.targetAudience ?? branding.targetAudience ?? undefined
    }
  };
}

function includePathRegex(prefix) {
  const clean = cleanPrefix(prefix);
  return clean === "/" ? "^/$" : `^${escapeRegex(clean)}`;
}

function excludePathRegex(prefix) {
  const clean = cleanPrefix(prefix);
  return clean === "/" ? "^/.*" : `^${escapeRegex(clean)}.*`;
}

function cleanPrefix(prefix) {
  const value = String(prefix || "/").trim();
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.replace(/\/+$/, "") || "/";
}

function clampPositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, maximum);
}

function mapProviderStatus(status, payload) {
  const message = String(payload?.error || payload?.message || "");
  if (status === 408 || status === 504 || /timeout/i.test(message)) {
    return "CRAWL_TIMEOUT";
  }
  if (status === 403 || /robots|policy|forbidden/i.test(message)) {
    return "CRAWL_POLICY_BLOCKED";
  }
  if (status >= 500 || status === 429) {
    return "DEPENDENCY_UNAVAILABLE";
  }
  return "PROVIDER_OUTPUT_INVALID";
}

function safeTotals(payload) {
  return {
    total: Number.isFinite(payload?.total) ? payload.total : null,
    completed: Number.isFinite(payload?.completed) ? payload.completed : null,
    creditsUsed: Number.isFinite(payload?.creditsUsed) ? payload.creditsUsed : null
  };
}

function failure(code, status, detail, retryable = false) {
  return {
    ok: false,
    problem: {
      type: `https://errors.sakhaa-forge.invalid/v0/${code}`,
      title: titleFor(code),
      status,
      code,
      detail,
      trace_id: "v0-local-trace",
      retryable
    }
  };
}

function titleFor(code) {
  return code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
