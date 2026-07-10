const defaultIncludePrefixes = ["/", "/about", "/projects", "/properties", "/contact", "/brochure", "/rera", "/legal"];
const defaultExcludePrefixes = ["/blog", "/careers", "/privacy", "/terms"];
const defaultFormats = ["markdown", "links", "images", "screenshot", "branding", "json"];
const universalSourceGuide = "docs/V0/Features/Firecrawl/brand-crawl-universal.md";
const verticalSourceGuide = "docs/V0/Features/Firecrawl/brand-crawl-verticals.md";
const sharedVerticalAssetFields = ["image_asset_labels", "visual_asset_contexts"];

const brandTypeConfig = {
  d2c_ecommerce: { group: "G6", label: "D2C", paths: ["/products"], passKey: "d2c_catalog", productFields: ["product_names", "collection_names"], claimFields: ["price_range", "sale_indicators", "shipping_hook", "label_tags"] },
  b2b_saas: { group: "G7", label: "SaaS", paths: ["/features"], passKey: "saas_features", productFields: ["feature_names", "use_case_labels"], claimFields: ["roi_claims", "integration_count", "security_claims"] },
  real_estate: { group: "G8", label: "RealEstate", paths: ["/listings"], passKey: "real_estate_listing_index", productFields: ["listing_names"], claimFields: ["price_range", "status_labels", "developer_name", "rera_numbers", "location_names", "property_types", "filter_options"] },
  healthcare: { group: "G9", label: "Healthcare", paths: ["/services"], passKey: "healthcare_services", productFields: ["treatment_names", "specializations"], claimFields: ["technology_equipment", "outcome_stats", "accreditations", "insurance_accepted", "booking_cta", "teleconsult_available", "languages_spoken"] },
  education: { group: "G10", label: "Education", paths: ["/courses"], passKey: "education_courses", productFields: ["course_names", "subject_domains"], claimFields: ["certification_types", "format_options", "duration_range", "price_range", "free_resource_offer", "enrollment_urgency"] },
  financial_services: { group: "G11", label: "Fintech", paths: ["/products"], passKey: "financial_products", productFields: ["product_names"], claimFields: ["key_rates", "regulatory_badges", "security_features", "eligibility_requirements", "min_investment_or_premium", "returns_claim", "claims_settlement_stat", "app_availability", "disclaimer_present", "disclaimer_text"] },
  restaurant_fb: { group: "G12", label: "Restaurant", paths: ["/menu"], passKey: "restaurant_menu", productFields: ["menu_sections", "menu_items", "signature_dishes", "cuisine_types"], claimFields: ["delivery_platforms", "operating_hours", "reservation_cta", "catering_available"] },
  fitness_wellness: { group: "G13", label: "Fitness", paths: ["/classes"], passKey: "fitness_classes", productFields: ["class_names"], claimFields: ["class_descriptions", "class_schedule_preview", "difficulty_levels", "format_types", "trial_offer"] },
  automotive: { group: "G14", label: "Auto", paths: ["/inventory"], passKey: "automotive_inventory", productFields: ["vehicle_names"], claimFields: ["price_range", "vehicle_types", "fuel_types", "year_range", "finance_hook", "trade_in_offer"] },
  legal_professional: { group: "G15", label: "Legal", paths: ["/practice-areas"], passKey: "legal_practice_areas", productFields: ["practice_area_names", "case_types"], claimFields: ["jurisdiction", "bar_associations", "languages_served", "consultation_cta"] },
  travel_hospitality: { group: "G16", label: "Hospitality", paths: ["/rooms"], passKey: "hospitality_rooms", productFields: ["room_types"], claimFields: ["price_range", "max_occupancy", "amenity_highlights", "view_types", "booking_cta", "urgency_language", "sustainability_claims"] },
  home_services: { group: "G17", label: "HomeServices", paths: ["/services"], passKey: "home_services_portfolio", productFields: ["service_names", "portfolio_urls"], claimFields: ["service_areas", "license_and_insurance", "brand_partnerships", "process_steps", "warranty_terms", "estimate_cta", "typical_timeline"] }
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
      { type: "screenshot", fullPage: false, quality: 90, viewport: { width: 1440, height: 900 } },
      { type: "screenshot", fullPage: true, quality: 80 },
      {
        type: "json",
        prompt: "You are extracting brand identity, marketing copy, and homepage visual asset locators from a company homepage. Extract BRAND NAME, TAGLINE, HERO_H1, HERO_SUBHEADLINE, FEATURE_HEADLINES, CTA_BUTTONS, PAIN_POINTS, WHO_ITS_FOR, SOCIAL_LINKS, LOGO_URL, FAVICON_URL, OG_IMAGE_URL, HERO_IMAGE_URLS, HOMEPAGE_IMAGE_ASSETS, SCHEMA_TYPE, META_DESCRIPTION, VERTICAL_SIGNALS, TRUST_SIGNALS, UNIQUE_SELLING_POINTS, GUARANTEE_LANGUAGE. For HOMEPAGE_IMAGE_ASSETS return visible image URLs with alt/context/category when explicitly present. Return only explicitly present values.",
        schema: homepageSchema
      }
    ],
    options: { onlyMainContent: false, onlyCleanContent: false, waitFor: 1500, timeout: 60000 }
  },
  {
    key: "about",
    path: "/about",
    formats: [{ type: "markdown" }, { type: "images" }, jsonFormat("Extract mission_statement, origin_story, brand_values, founder_names, founder_story, company_age_or_year, team_size, community_language, awards_accolades, certifications, media_mentions, locations_served and vocabulary_patterns explicitly present on this About page.", ["mission_statement", "origin_story", "brand_values", "founder_names", "founder_story", "company_age_or_year", "team_size", "community_language", "awards_accolades", "certifications", "media_mentions", "locations_served", "vocabulary_patterns"])],
    options: { waitFor: 1000, timeout: 45000 }
  },
  {
    key: "reviews",
    path: "/reviews",
    formats: [{ type: "markdown" }, { type: "images" }, jsonFormat("Extract testimonials, aggregate_rating, case_study_headlines, before_after_stats, client_company_names, video_testimonial_urls and trust_badges explicitly present on this reviews page.", ["testimonials", "aggregate_rating", "case_study_headlines", "before_after_stats", "client_company_names", "video_testimonial_urls", "trust_badges"])],
    options: { waitFor: 2000, timeout: 60000 }
  },
  {
    key: "faq",
    path: "/faq",
    formats: [{ type: "markdown" }, jsonFormat("Extract faq_items, objection_themes, refund_policy_summary, shipping_info, guarantee_terms and contact_methods explicitly present on this FAQ page.", ["faq_items", "objection_themes", "refund_policy_summary", "shipping_info", "guarantee_terms", "contact_methods"])],
    options: { waitFor: 800, timeout: 45000 }
  },
  {
    key: "blog_index",
    path: "/blog",
    formats: [{ type: "markdown" }, { type: "links" }, jsonFormat("Extract post_headlines, post_urls, topic_themes, tone_signals and content_categories visible on this blog index page. Do not follow links.", ["post_headlines", "post_urls", "topic_themes", "tone_signals", "content_categories"])],
    options: { waitFor: 800, timeout: 45000 }
  }
];

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
    passes: config.paths.map((path, index) => ({
      key: index === 0 ? config.passKey : `${config.passKey}_${index + 1}`,
      endpoint: "/scrape",
      group: config.group,
      label: config.label,
      request: scrapeRequest(resolveUrl(normalizeBaseUrl(baseUrl), path), verticalFormats(config), { waitFor: 1200, timeout: 60000, language })
    }))
  };
}

export async function runFirecrawlBrandExtraction(crawlRun, { env = process.env, fetchImpl = globalThis.fetch, brandContext = {} } = {}) {
  if (resolveBrandCrawlMode(env) !== "firecrawl") {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider is disabled.", true);
  }
  const apiKey = env.FIRECRAWL_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return failure("DEPENDENCY_UNAVAILABLE", 503, "Firecrawl provider is not configured.", true);
  }
  const baseUrl = (env.FIRECRAWL_API_BASE_URL || "https://api.firecrawl.dev/v2").replace(/\/$/, "");
  const selectedBrandType = crawlRun?.crawlScope?.brandExtraction?.selectedBrandType ?? crawlRun?.selectedBrandType ?? null;
  const passPlan = buildFirecrawlBrandPassPlan(crawlRun, brandContext, { timeoutMs: parseTimeout(env) });
  const universalResponses = [];
  let estimatedCredits = 0;
  try {
    for (const pass of passPlan.universal) {
      const response = await scrapeFirecrawl(`${baseUrl}${pass.endpoint}`, pass.request, apiKey, fetchImpl);
      if (response.ok) {
        universalResponses.push({ pass, response: response.payload });
        estimatedCredits += estimatePassCredits(pass.request);
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
    for (const pass of verticalPlan.passes) {
      const response = await scrapeFirecrawl(`${baseUrl}${pass.endpoint}`, pass.request, apiKey, fetchImpl);
      if (response.ok) {
        verticalResponses.push({ pass, response: response.payload });
        estimatedCredits += estimatePassCredits(pass.request);
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
        assets: buildVerticalAssets(verticalPlan, verticalResponses)
      },
      pages: universalResponses.concat(verticalResponses).map(({ response }) => normaliseScrapePayload(response)),
      assets: collectRightsAssets(universalProfile, verticalResponses),
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
  return {
    url,
    formats,
    onlyMainContent: options.onlyMainContent ?? true,
    onlyCleanContent: options.onlyCleanContent ?? true,
    blockAds: true,
    proxy: "auto",
    waitFor: options.waitFor ?? 1200,
    timeout: options.timeout ?? 60000,
    removeBase64Images: true,
    location: { country: "IN", languages: [options.language ?? "en-IN"] }
  };
}

function jsonFormat(prompt, fields) {
  return {
    type: "json",
    prompt,
    schema: objectSchema(Object.fromEntries(fields.map((field) => [field, genericSchemaFor(field)])))
  };
}

function verticalFormats(config) {
  const fields = [...config.productFields, ...config.claimFields, ...sharedVerticalAssetFields];
  return [
    { type: config.passKey === "restaurant_menu" ? "menu" : "markdown" },
    { type: "images" },
    { type: "links" },
    {
      type: "json",
      prompt: `Extract ${fields.join(", ")} explicitly present for ${config.label}. For IMAGE_ASSET_LABELS and VISUAL_ASSET_CONTEXTS, describe visible image alt text, captions, or page context that helps categorise images returned by the images format. Return null or empty arrays for absent fields.`,
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
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(request)
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
      full_page_screenshot_url: screenshotAt(homepage, 1),
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
      guarantee_language: homepageJson.guarantee_language ?? faqJson.guarantee_terms ?? null
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
      vocabulary_signature: uniqueValues([...asArray(aboutJson.vocabulary_patterns), ...asArray(blogJson.tone_signals)]),
      writing_style_tags: asArray(blogJson.tone_signals),
      tone_signals: uniqueValues([...asArray(blogJson.tone_signals), branding.personality?.tone].filter(Boolean)),
      key_claims: [],
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
      blog_posts_markdown: blog.markdown ? [blog.markdown] : []
    }
  };
}

function buildVerticalAssets(plan, responses) {
  const jsonBlocks = responses.map((item) => normaliseScrapePayload(item.response).json ?? {});
  const merged = Object.assign({}, ...jsonBlocks);
  const config = brandTypeConfig[plan.selectedBrandType] ?? brandTypeConfig.d2c_ecommerce;
  return {
    detected_vertical: plan.group,
    vertical_label: plan.label,
    products_or_services: uniqueValues(config.productFields.flatMap((field) => asArrayOrValue(merged[field]))),
    visual_assets: {
      product_images: collectVerticalImages(responses, ["product", "listing", "vehicle", "room", "menu"]),
      lifestyle_images: collectVerticalImages(responses, ["lifestyle", "hero", "campaign"]),
      facility_images: collectVerticalImages(responses, ["facility", "office", "clinic", "restaurant", "hotel"]),
      team_images: collectVerticalImages(responses, ["team", "doctor", "trainer", "attorney", "founder"]),
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
    screenshots: data?.actions?.screenshots ?? data?.screenshots ?? [],
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
  const imageUrls = [
    ...responses.flatMap(({ response }) => normaliseScrapePayload(response).images),
    ...asArray(homepageJson.hero_image_urls),
    ...asArray(homepageJson.homepage_image_assets).map((asset) => asset?.url ?? asset)
  ];
  return uniqueValues(imageUrls).map((url) => ({
    url,
    category: categorizeImage(url)
  }));
}

function collectRightsAssets(universalProfile, verticalResponses) {
  const urls = [
    universalProfile.visual_identity.logo_url,
    universalProfile.visual_identity.og_image_url,
    ...universalProfile.visual_identity.downloaded_images.map((image) => image.url),
    ...verticalResponses.flatMap(({ response }) => normaliseScrapePayload(response).images)
  ].filter(Boolean);
  return uniqueValues(urls).slice(0, 50).map((locator) => ({
    type: categorizeImage(locator),
    locator,
    rightsBasis: "public website crawl evidence",
    permittedUse: "candidate review"
  }));
}

function collectVerticalImages(responses, patterns) {
  return uniqueValues(responses.flatMap(({ response }) => normaliseScrapePayload(response).images))
    .filter((url) => patterns.some((pattern) => url.toLowerCase().includes(pattern)))
    .slice(0, 50);
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
