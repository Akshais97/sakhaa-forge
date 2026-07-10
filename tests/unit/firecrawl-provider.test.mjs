import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFirecrawlBrandPassPlan,
  buildFirecrawlCrawlRequest,
  buildFirecrawlVerticalPassPlan,
  runFirecrawlBrandExtraction,
  normaliseFirecrawlPages,
  startBrandCrawl
} from "../../apps/api/src/firecrawl-provider.mjs";

test("Firecrawl adapter builds a scoped V0 brand crawl request without unsafe expansion", () => {
  const request = buildFirecrawlCrawlRequest(
    {
      id: "crawl-1",
      websiteUrl: "https://aster.example.com",
      crawlScope: {
        permittedPathPrefixes: ["/", "/about", "/projects", "/rera"],
        excludedPathPrefixes: ["/blog", "/careers"],
        maxPages: 75
      }
    },
    {
      brandName: "Aster Heights",
      industry: "real_estate",
      primaryMarket: "Bengaluru",
      language: "en-IN"
    },
    {
      defaultMaxPages: 5,
      maxPages: 50,
      timeoutMs: 60000
    }
  );

  assert.equal(request.url, "https://aster.example.com");
  assert.deepEqual(request.includePaths, ["^/$", "^/about", "^/projects", "^/rera"]);
  assert.deepEqual(request.excludePaths, ["^/blog.*", "^/careers.*"]);
  assert.equal(request.limit, 50);
  assert.equal(request.maxDiscoveryDepth, 1);
  assert.equal(request.allowExternalLinks, false);
  assert.equal(request.allowSubdomains, false);
  assert.equal(request.ignoreRobotsTxt, false);
  assert.deepEqual(request.scrapeOptions.formats, ["markdown", "links", "images", "screenshot", "branding", "json"]);
  assert.equal(request.scrapeOptions.timeout, 60000);
  assert.equal(request.scrapeOptions.location.country, "IN");
  assert.deepEqual(request.scrapeOptions.location.languages, ["en-IN"]);
});

test("Firecrawl adapter normalises provider pages into the brand extraction worker contract", () => {
  const normalised = normaliseFirecrawlPages({
    status: "completed",
    data: [
      {
        markdown: "Aster Heights offers practical 2 and 3 BHK homes. Book a site visit.",
        metadata: {
          sourceURL: "https://aster.example.com/projects",
          title: "Aster Heights projects",
          language: "en-IN"
        },
        links: ["https://aster.example.com/contact"],
        images: ["https://aster.example.com/logo.svg"],
        branding: {
          logo: "https://aster.example.com/logo.svg",
          colors: { primary: "#173B57" },
          typography: { fontFamilies: { heading: "Manrope" } },
          personality: { targetAudience: "urban professionals and families" }
        }
      }
    ]
  });

  assert.deepEqual(normalised, {
    pages: [
      {
        url: "https://aster.example.com/projects",
        title: "Aster Heights projects",
        markdown: "Aster Heights offers practical 2 and 3 BHK homes. Book a site visit.",
        text: "Aster Heights offers practical 2 and 3 BHK homes. Book a site visit.",
        links: ["https://aster.example.com/contact"],
        images: ["https://aster.example.com/logo.svg"],
        language: "en-IN",
        branding: {
          colors: { primary: "#173B57" },
          typography: { fontFamilies: { heading: "Manrope" } },
          images: { logo: "https://aster.example.com/logo.svg", logoAlt: "" },
          personality: { targetAudience: "urban professionals and families" }
        }
      }
    ]
  });
});

test("Firecrawl adapter maps missing credentials, timeouts and malformed output to stable V0 errors", async () => {
  const missing = await startBrandCrawl({ url: "https://aster.example.com" }, { env: {}, fetchImpl: async () => assert.fail("fetch should not be called") });
  assert.equal(missing.ok, false);
  assert.equal(missing.problem.code, "DEPENDENCY_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(missing.problem), /FIRECRAWL_API_KEY|secret/i);

  const timeout = await startBrandCrawl(
    { url: "https://aster.example.com" },
    {
      env: { FIRECRAWL_API_KEY: "fc-secret", FIRECRAWL_API_BASE_URL: "https://api.firecrawl.dev/v2" },
      fetchImpl: async () => {
        throw Object.assign(new Error("timed out"), { name: "AbortError" });
      }
    }
  );
  assert.equal(timeout.ok, false);
  assert.equal(timeout.problem.code, "CRAWL_TIMEOUT");
  assert.doesNotMatch(JSON.stringify(timeout.problem), /fc-secret/);

  const malformed = await startBrandCrawl(
    { url: "https://aster.example.com" },
    {
      env: { FIRECRAWL_API_KEY: "fc-secret", FIRECRAWL_API_BASE_URL: "https://api.firecrawl.dev/v2" },
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ unexpected: true }) })
    }
  );
  assert.equal(malformed.ok, false);
  assert.equal(malformed.problem.code, "PROVIDER_OUTPUT_INVALID");
});

test("Firecrawl adapter builds documented universal scrape passes with typed json prompts", () => {
  const plan = buildFirecrawlBrandPassPlan({
    normalizedUrl: "https://aster.example.com/",
    crawlScope: { maxPages: 5 }
  });

  assert.deepEqual(plan.universal.map((pass) => pass.key), ["homepage", "about", "reviews", "faq", "blog_index"]);
  const homepage = plan.universal.find((pass) => pass.key === "homepage");
  assert.equal(homepage.endpoint, "/scrape");
  assert.equal(homepage.request.url, "https://aster.example.com/");
  assert.equal(homepage.request.formats.some((format) => format.type === "rawHtml"), true);
  assert.equal(homepage.request.formats.filter((format) => format.type === "screenshot").length, 2);
  const jsonFormat = homepage.request.formats.find((format) => format.type === "json");
  assert.match(jsonFormat.prompt, /BRAND NAME/);
  assert.match(jsonFormat.prompt, /UNIQUE_SELLING_POINTS/);
  assert.match(jsonFormat.prompt, /LOGO_URL/);
  assert.match(jsonFormat.prompt, /HOMEPAGE_IMAGE_ASSETS/);
  assert.deepEqual(Object.keys(jsonFormat.schema.properties).sort(), [
    "brand_name",
    "cta_buttons",
    "feature_headlines",
    "guarantee_language",
    "hero_image_urls",
    "hero_h1",
    "hero_subheadline",
    "homepage_image_assets",
    "favicon_url",
    "meta_description",
    "pain_points",
    "logo_url",
    "og_image_url",
    "schema_type",
    "social_links",
    "tagline",
    "trust_signals",
    "unique_selling_points",
    "vertical_signals",
    "who_its_for"
  ].sort());
});

test("Firecrawl adapter builds the documented real-estate vertical pass and preserves selected/detected conflict", () => {
  const plan = buildFirecrawlVerticalPassPlan({
    baseUrl: "https://aster.example.com/",
    selectedBrandType: "real_estate",
    detectedBrandType: "b2b_saas",
    universalProfile: {
      metadata: { schema_org_type: "SoftwareApplication", vertical_signals: ["dashboard"] }
    }
  });

  assert.equal(plan.selectedBrandType, "real_estate");
  assert.equal(plan.detectedBrandType, "b2b_saas");
  assert.equal(plan.conflict, true);
  assert.equal(plan.group, "G8");
  assert.equal(plan.label, "RealEstate");
  assert.deepEqual(plan.passes.map((pass) => pass.key), ["real_estate_listing_index"]);
  assert.equal(plan.passes[0].request.url, "https://aster.example.com/listings");
  assert.equal(plan.passes[0].request.formats.some((format) => format.type === "links"), true);
  assert.equal(plan.passes[0].request.formats.some((format) => format.type === "json" && format.schema.properties.rera_numbers), true);
  const jsonFormat = plan.passes[0].request.formats.find((format) => format.type === "json");
  assert.match(jsonFormat.prompt, /VISUAL_ASSET_CONTEXTS/);
  assert.equal(Boolean(jsonFormat.schema.properties.visual_asset_contexts), true);
});

test("Firecrawl adapter runs universal before vertical with the server-side API key and returns v3 output", async () => {
  const calls = [];
  const result = await runFirecrawlBrandExtraction(
    {
      id: "crawl-1",
      normalizedUrl: "https://aster.example.com/",
      crawlScope: { brandExtraction: { selectedBrandType: "real_estate" } }
    },
    {
      env: { FIRECRAWL_API_KEY: "fc-secret", FIRECRAWL_API_BASE_URL: "https://api.firecrawl.dev/v2", FIRECRAWL_TIMEOUT_MS: "60000" },
      fetchImpl: async (url, init) => {
        calls.push({ url, init: { ...init, body: JSON.parse(init.body) } });
        assert.equal(init.headers.authorization, "Bearer fc-secret");
        assert.equal(url, "https://api.firecrawl.dev/v2/scrape");
        return {
          ok: true,
          status: 200,
          json: async () => firecrawlScrapeFixture(init.body)
        };
      }
    }
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(calls.every((call) => call.url.endsWith("/scrape")), true);
  assert.equal(calls.some((call) => call.url.endsWith("/crawl")), false);
  assert.equal(calls[0].init.body.url, "https://aster.example.com/");
  assert.equal(calls.at(-1).init.body.url, "https://aster.example.com/listings");
  assert.equal(result.output.schemaVersion, "brand.extraction.output.v3");
  assert.equal(result.output.provider, "firecrawl");
  assert.equal(result.output.universal.profile.copy_messaging.brand_name, "Aster Heights");
  assert.equal(result.output.universal.profile.visual_identity.logo_url, "https://aster.example.com/logo.svg");
  assert.equal(result.output.universal.profile.metadata.schema_org_type, "RealEstateListing");
  assert.equal(result.output.vertical.assets.detected_vertical, "G8");
  assert.deepEqual(result.output.vertical.assets.raw_vertical_data.rera_numbers, ["RERA-KA-123"]);
  assert.equal(/fc-secret|authorization/i.test(JSON.stringify(result.output)), false);
});

function firecrawlScrapeFixture(bodyText) {
  const body = JSON.parse(bodyText);
  if (body.url.endsWith("/listings")) {
    return {
      success: true,
      data: {
        metadata: { sourceURL: body.url, title: "Aster listings" },
        markdown: "Aster Heights Phase 1. RERA-KA-123. From INR 90 lakh.",
        links: ["https://aster.example.com/projects/aster-heights"],
        images: ["https://aster.example.com/project.jpg"],
        json: {
          listing_names: ["Aster Heights Phase 1"],
          listing_urls: ["https://aster.example.com/projects/aster-heights"],
          property_types: ["2 BHK apartment"],
          price_range: "From INR 90 lakh",
          location_names: ["Bengaluru"],
          status_labels: ["Under Construction"],
          developer_name: "Aster Developers",
          rera_numbers: ["RERA-KA-123"],
          filter_options: ["2 BHK", "3 BHK"]
        }
      }
    };
  }
  return {
    success: true,
    data: {
      metadata: { sourceURL: body.url, title: "Aster Heights", language: "en-IN" },
      markdown: "Aster Heights offers premium homes near the metro. Book a site visit.",
      rawHtml: "<script type=\"application/ld+json\">{\"@type\":\"RealEstateListing\"}</script><meta name=\"description\" content=\"Premium homes near the metro\">",
      links: ["https://aster.example.com/about", "https://aster.example.com/reviews", "https://aster.example.com/faq", "https://aster.example.com/blog", "https://aster.example.com/listings"],
      images: ["https://aster.example.com/logo.svg", "https://aster.example.com/project.jpg"],
      branding: {
        images: { logo: "https://aster.example.com/logo.svg", favicon: "https://aster.example.com/favicon.ico", ogImage: "https://aster.example.com/og.jpg" },
        colors: { primary: "#173B57", secondary: "#D8B46A" },
        typography: { fontFamilies: { heading: "Manrope", primary: "Source Sans 3" } },
        personality: { tone: "premium", targetAudience: "home buyers" }
      },
      actions: { screenshots: ["hero-shot", "full-shot"] },
      json: {
        brand_name: "Aster Heights",
        hero_h1: "Premium homes near the metro",
        hero_subheadline: "Thoughtfully planned homes in Bengaluru",
        cta_buttons: ["Book a site visit"],
        schema_type: "RealEstateListing",
        meta_description: "Premium homes near the metro",
        vertical_signals: ["RERA", "BHK", "floor plan"],
        trust_signals: ["RERA registered"]
      }
    }
  };
}
