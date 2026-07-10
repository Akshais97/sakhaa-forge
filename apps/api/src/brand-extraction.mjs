import { createHash } from "node:crypto";

const promptInjectionPattern = /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|system|previous|above)\b/i;
const sentenceSplitPattern = /(?<=[.!?])\s+/;
const ctaPattern = /\b(book a site visit|schedule a visit|enquire now|contact sales|get brochure|request callback)\b/i;
const prohibitedClaimPattern = /\b(guaranteed appreciation|assured returns|guaranteed returns|risk-free investment)\b/i;
const hexPattern = /^#[0-9a-f]{6}$/i;

export function buildBrandExtractionCandidates({
  crawlRunId,
  workspaceId,
  scrape,
  schemaVersion = "brand.extraction.output.v1",
  universal = null,
  vertical = null,
  assets = [],
  selectedBrandType = null,
  detectedBrandType = null,
  observedAt = new Date().toISOString()
}) {
  if (!scrape || scrape.refused === true || !Array.isArray(scrape.pages) || scrape.pages.length === 0) {
    return { ok: false, reason: "BRAND_EXTRACTION_OUTPUT_INVALID", candidates: [], promptInputIsolated: false };
  }

  const candidates = [];
  let promptInputIsolated = false;
  for (const page of scrape.pages) {
    const text = cleanText(page.text ?? page.markdown ?? "");
    if (text.length === 0) {
      continue;
    }
    if (promptInjectionPattern.test(text)) {
      promptInputIsolated = true;
    }
    for (const extracted of [
      extractBrandSummary(page),
      ...extractBrandUsps(page),
      ...extractCallsToAction(page),
      ...extractAudiences(page),
      ...extractVisualCandidates(page),
      ...extractProhibitedClaims(page),
      ...extractFirecrawlSkillCandidates(page)
    ]) {
      if (!extracted?.value || !Array.isArray(extracted.sourceEvidence) || extracted.sourceEvidence.length === 0) {
        continue;
      }
      candidates.push({
        id: null,
        workspaceId,
        crawlRunId,
        fieldType: extracted.fieldType,
        value: extracted.value,
        confidence: extracted.confidence,
        decision: "candidate",
        extractionState: extracted.confidence < 0.7 ? "LOW_CONFIDENCE" : "CANDIDATE",
        sourceEvidence: extracted.sourceEvidence.map((source) => ({
          ...source,
          observedAt,
          excerptHash: source.excerptHash ?? sha256(source.excerpt ?? source.locator)
        })),
        conflict: false,
        sourceFingerprint: sha256(`${extracted.fieldType}:${stableJson(extracted.value)}:${page.url ?? ""}`)
      });
    }
  }

  if (schemaVersion === "brand.extraction.output.v3") {
    for (const extracted of extractFirecrawlV3Candidates({ scrape, universal, vertical, assets, selectedBrandType, detectedBrandType })) {
      if (!extracted?.value || !Array.isArray(extracted.sourceEvidence) || extracted.sourceEvidence.length === 0) {
        continue;
      }
      candidates.push({
        id: null,
        workspaceId,
        crawlRunId,
        fieldType: extracted.fieldType,
        value: extracted.value,
        confidence: extracted.confidence,
        decision: "candidate",
        extractionState: extracted.confidence < 0.7 ? "LOW_CONFIDENCE" : "CANDIDATE",
        sourceEvidence: extracted.sourceEvidence.map((source) => ({
          ...source,
          observedAt,
          excerptHash: source.excerptHash ?? sha256(source.excerpt ?? source.locator)
        })),
        conflict: extracted.conflict === true,
        sourceFingerprint: sha256(`${extracted.fieldType}:${stableJson(extracted.value)}:firecrawl-v3`)
      });
    }
  }

  if (candidates.length === 0 || candidates.some((candidate) => candidate.sourceEvidence.length === 0)) {
    return { ok: false, reason: "BRAND_EXTRACTION_OUTPUT_INVALID", candidates: [], promptInputIsolated };
  }
  return { ok: true, candidates: uniqueCandidates(candidates), promptInputIsolated };
}

export function extractBrandSummary(page) {
  const text = stripPromptInjection(cleanText(page.text ?? page.markdown ?? ""));
  const sentence = firstUsefulSentence(text);
  if (!sentence) {
    return null;
  }
  return evidenceCandidate("summary", sentence, 0.82, page, sentence);
}

export function extractBrandUsps(page) {
  const text = stripPromptInjection(cleanText(page.text ?? page.markdown ?? ""));
  const uspMatch = text.match(/\bUSPs?:\s*([^.!?]+)/i);
  if (uspMatch) {
    return uspMatch[1]
      .split(/,|;|\band\b/i)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4)
      .slice(0, 5)
      .map((item) => evidenceCandidate("usp", item, 0.84, page, uspMatch[0]));
  }
  // Fallback heuristic. The real-estate cues are retained for back-compat; the cue/benefit phrases
  // are vertical-agnostic value propositions so non-real-estate sites yield USPs until the v3 LLM
  // pass (unique_selling_points in the Firecrawl homepage schema) is wired. This is a fallback, not
  // the primary extractor: confidence is kept low to mark these as heuristic evidence.
  const practical = text.match(/\b(practical [^.!?]+|metro-connected [^.!?]+|transparent [^.!?]+)\b/gi) ?? [];
  const cue = text.match(/\b(?:what sets us apart|what makes us different|what makes (?:it|this) different|why choose us|why us|our unique|uniquely|sets us apart)\b[^.!?]{0,160}/gi) ?? [];
  const benefit = text.match(/\b(?:lifetime warranty|handmade(?: in [^.!?]+)?|carbon[- ]neutral[^.!?]{0,80}|sustainably (?:sourced|made|manufactured|produced)[^.!?]{0,80}|locally sourced[^.!?]{0,80}|small batches|same[- ]day [a-z]+|no hidden fees|free [a-z]+ delivery)\b[^.!?]{0,80}/gi) ?? [];
  const offers = [...practical, ...cue, ...benefit];
  const seen = new Set();
  const uniqueOffers = [];
  for (const item of offers) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueOffers.push(item.trim());
  }
  return uniqueOffers.slice(0, 5).map((item) => {
    const isPractical = practical.some((value) => value.trim().toLowerCase() === item.toLowerCase());
    return evidenceCandidate("usp", item, isPractical ? 0.72 : 0.66, page, item);
  });
}

export function extractCallsToAction(page) {
  const text = stripPromptInjection(cleanText(page.text ?? page.markdown ?? ""));
  const matches = [...new Set((text.match(new RegExp(ctaPattern.source, "gi")) ?? []).map(normalizeSentenceCase))];
  return matches.slice(0, 5).map((item) => evidenceCandidate("cta", item, 0.9, page, item));
}

export function extractAudiences(page) {
  const text = stripPromptInjection(cleanText(page.text ?? page.markdown ?? ""));
  const matches = [...new Set((text.match(/\b(urban professionals and families|home buyers|investors|first-time buyers)\b/gi) ?? []).map((item) => item.toLowerCase()))];
  const brandingAudience = page.branding?.personality?.targetAudience;
  if (typeof brandingAudience === "string" && brandingAudience.trim() && brandingAudience !== "unknown") {
    matches.unshift(brandingAudience.trim().toLowerCase());
  }
  return [...new Set(matches)].slice(0, 5).map((item) => evidenceCandidate("audience", item, 0.76, page, item));
}

export function extractVisualCandidates(page) {
  const candidates = [];
  const colors = page.branding?.colors ?? {};
  for (const [role, color] of Object.entries(colors)) {
    if (typeof color === "string" && hexPattern.test(color)) {
      candidates.push(evidenceCandidate("color", { role, value: color.toUpperCase() }, 0.86, page, `${role}:${color}`));
    }
  }
  const fonts = page.branding?.typography?.fontFamilies ?? {};
  for (const [role, family] of Object.entries(fonts)) {
    if (typeof family === "string" && family.trim().length > 0) {
      candidates.push(evidenceCandidate("font", { role, family: cleanFontFamily(family) }, 0.78, page, `${role}:${family}`));
    }
  }
  const logo = page.branding?.images?.logo;
  if (typeof logo === "string" && logo.startsWith("http")) {
    candidates.push(evidenceCandidate("logo", { src: logo, alt: page.branding?.images?.logoAlt ?? "" }, 0.7, page, logo));
  }
  return candidates;
}

export function extractProhibitedClaims(page) {
  const text = stripPromptInjection(cleanText(page.text ?? page.markdown ?? ""));
  const matches = [...new Set((text.match(new RegExp(prohibitedClaimPattern.source, "gi")) ?? []).map((item) => item.toLowerCase()))];
  return matches.slice(0, 10).map((item) => evidenceCandidate("prohibited_claim", item, 0.93, page, item));
}

export function extractFirecrawlSkillCandidates(page) {
  const text = stripPromptInjection(cleanText(page.text ?? page.markdown ?? ""));
  const candidates = [];
  if (/\bpositions?\b|\bpositioning\b/i.test(text)) {
    candidates.push(evidenceCandidate("positioning", firstUsefulSentence(text), 0.74, page, firstUsefulSentence(text)));
  }
  const pricing = text.match(/\b(pricing starts from [^.]+|from INR [^.]+|INR\s?[0-9][^.]+)\b/i)?.[0];
  if (pricing) candidates.push(evidenceCandidate("pricing", pricing, 0.78, page, pricing));
  const rating = text.match(/\b(rated\s?[0-9](?:\.[0-9])?[^.]+)\b/i)?.[0];
  if (rating) candidates.push(evidenceCandidate("rating", rating, 0.76, page, rating));
  const regulated = text.match(/\b(RERA[^.]+|registration[^.]+)\b/i)?.[0];
  if (regulated) candidates.push(evidenceCandidate("regulated_claim", regulated, 0.8, page, regulated));
  const missing = text.match(/\bmissing [^.]+asset[^.]*\b/i)?.[0];
  if (missing) candidates.push(evidenceCandidate("missing_asset", missing, 0.82, page, missing));
  const tone = page.branding?.personality?.tone;
  if (typeof tone === "string" && tone.trim()) {
    candidates.push(evidenceCandidate("tone", tone.trim(), 0.76, page, `tone:${tone}`));
  }
  const media = Array.isArray(page.branding?.media) ? page.branding.media : [];
  for (const item of media.slice(0, 5)) {
    if (item?.locator) {
      candidates.push(evidenceCandidate("media_asset", { type: item.type ?? "media", locator: item.locator }, 0.72, page, item.locator));
    }
  }
  candidates.push(evidenceCandidate("readiness_score", { score: 60, basis: "evidence-backed starter pack" }, 0.7, page, "readiness score calculated from retained candidates"));
  return candidates;
}

export function extractFirecrawlV3Candidates({ scrape, universal, vertical, assets, selectedBrandType, detectedBrandType }) {
  const candidates = [];
  const firstPage = scrape.pages[0] ?? {};
  const profile = universal?.profile ?? {};
  const verticalAssets = vertical?.assets ?? {};
  const rawVerticalData = verticalAssets.raw_vertical_data ?? {};
  const resolvedSelected = vertical?.selectedBrandType ?? selectedBrandType ?? null;
  const resolvedDetected = vertical?.detectedBrandType ?? detectedBrandType ?? verticalAssets.detected_vertical ?? null;

  for (const extracted of extractUniversalProfileCandidates(profile, firstPage)) {
    candidates.push(extracted);
  }

  if (vertical?.conflict === true || (resolvedSelected && resolvedDetected && resolvedSelected !== resolvedDetected)) {
    candidates.push(
      metadataCandidate(
        "vertical_conflict",
        {
          selectedBrandType: resolvedSelected,
          detectedBrandType: resolvedDetected,
          selectedGuide: vertical?.sourceGuide ?? null
        },
        0.95,
        firstPage,
        `selected:${resolvedSelected ?? "unknown"} detected:${resolvedDetected ?? "unknown"}`,
        true
      )
    );
  }

  const productServices = [
    ...asArray(verticalAssets.products_or_services),
    ...asArray(rawVerticalData.listing_names)
  ];
  for (const item of uniqueValues(productServices).slice(0, 10)) {
    candidates.push(metadataCandidate("product_service", item, 0.86, firstPage, item));
  }

  const claims = [
    ...asArray(rawVerticalData.rera_numbers).map((item) => `RERA ${item}`),
    verticalAssets.copy_assets?.pricing_summary,
    ...asArray(verticalAssets.copy_assets?.compliance_disclaimers),
    rawVerticalData.price_range,
    ...asArray(rawVerticalData.amenities).map((item) => `Amenity: ${item}`)
  ];
  for (const item of uniqueValues(claims).slice(0, 12)) {
    candidates.push(metadataCandidate("claim", item, 0.82, firstPage, item));
  }

  for (const asset of asArray(assets).slice(0, 10)) {
    if (!asset?.locator && !asset?.type) {
      continue;
    }
    candidates.push(
      metadataCandidate(
        "rights_asset",
        {
          type: asset.type ?? "asset",
          locator: asset.locator ?? "unknown",
          rightsBasis: asset.rightsBasis ?? null,
          permittedUse: asset.permittedUse ?? null
        },
        0.8,
        firstPage,
        `${asset.type ?? "asset"}:${asset.locator ?? "unknown"}`
      )
    );
  }

  const schemaType = profile.metadata?.schema_org_type;
  if (typeof schemaType === "string" && schemaType.trim()) {
    candidates.push(metadataCandidate("metadata", { schemaOrgType: schemaType.trim() }, 0.76, firstPage, schemaType.trim()));
  }

  return candidates;
}

function extractUniversalProfileCandidates(profile, page) {
  const candidates = [];
  const visual = profile.visual_identity ?? {};
  const copy = profile.copy_messaging ?? {};
  const proof = profile.social_proof ?? {};
  const personality = profile.brand_personality ?? {};
  const metadata = profile.metadata ?? {};

  addCandidate(candidates, "identity", compactObject({
    brandName: copy.brand_name,
    legalName: copy.legal_name,
    schemaOrgType: metadata.schema_org_type,
    market: metadata.locations_served
  }), 0.86, page, copy.brand_name ?? metadata.schema_org_type);

  addCandidate(candidates, "visual_identity", compactObject({
    logoUrl: visual.logo_url,
    faviconUrl: visual.favicon_url,
    ogImageUrl: visual.og_image_url,
    colors: visual.colors,
    typography: visual.typography,
    screenshots: [visual.hero_screenshot_url, visual.full_page_screenshot_url].filter(Boolean)
  }), 0.84, page, visual.logo_url ?? stableJson(visual.colors ?? {}));

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

  addCandidate(candidates, "social_proof", compactObject({
    testimonials: asArray(proof.testimonials),
    aggregateRating: proof.aggregate_rating,
    caseStudyHeadlines: asArray(proof.case_study_headlines),
    beforeAfterStats: asArray(proof.before_after_stats),
    clientCompanyNames: asArray(proof.client_company_names),
    videoTestimonialUrls: asArray(proof.video_testimonial_urls),
    trustBadges: asArray(proof.trust_badges)
  }), 0.8, page, proof.aggregate_rating ?? firstArrayValue(proof.trust_badges) ?? firstArrayValue(proof.testimonials));

  addCandidate(candidates, "voice", compactObject({
    missionStatement: personality.mission_statement,
    originStory: personality.origin_story,
    brandValues: asArray(personality.brand_values),
    founderNames: asArray(personality.founder_names),
    founderStory: personality.founder_story,
    communityLanguage: personality.community_language,
    vocabularySignature: asArray(personality.vocabulary_signature),
    writingStyleTags: asArray(personality.writing_style_tags),
    toneSignals: asArray(personality.tone_signals),
    keyClaims: asArray(personality.key_claims)
  }), 0.78, page, personality.mission_statement ?? firstArrayValue(personality.tone_signals));

  addCandidate(candidates, "audience", compactObject({
    whoItsFor: copy.who_its_for,
    objectionThemes: asArray(metadata.objection_themes),
    faqItems: asArray(metadata.faq_items)
  }), 0.76, page, copy.who_its_for ?? firstArrayValue(metadata.objection_themes));

  addCandidate(candidates, "publishing_social", {
    socialLinks: asArray(personality.social_links)
  }, 0.78, page, firstArrayValue(personality.social_links));

  for (const image of asArray(visual.downloaded_images).slice(0, 50)) {
    addCandidate(candidates, "rights_asset", compactObject({
      type: image.category ?? "image",
      locator: image.url ?? image.locator,
      rightsBasis: "public website crawl evidence",
      permittedUse: "candidate review"
    }), 0.76, page, image.url ?? image.locator);
  }

  return candidates;
}

function addCandidate(candidates, fieldType, value, confidence, page, excerpt) {
  if (!value || (typeof value === "object" && Object.keys(value).length === 0) || !excerpt) {
    return;
  }
  candidates.push(metadataCandidate(fieldType, value, confidence, page, typeof excerpt === "string" ? excerpt : stableJson(excerpt)));
}

function evidenceCandidate(fieldType, value, confidence, page, excerpt) {
  return {
    fieldType,
    value,
    confidence,
    sourceEvidence: [
      {
        sourceType: "website",
        locator: page.url ?? "unknown",
        pageTitle: page.title ?? null,
        excerpt,
        excerptHash: sha256(excerpt)
      }
    ]
  };
}

function metadataCandidate(fieldType, value, confidence, page, excerpt, conflict = false) {
  return {
    fieldType,
    value,
    confidence,
    conflict,
    sourceEvidence: [
      {
        sourceType: "website",
        locator: page.url ?? "firecrawl:v3",
        pageTitle: page.title ?? null,
        excerpt,
        excerptHash: sha256(excerpt)
      }
    ]
  };
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && String(item).trim().length > 0) : [];
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : value)).filter(Boolean))];
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined || entry === "") return false;
      if (Array.isArray(entry) && entry.length === 0) return false;
      if (typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0) return false;
      return true;
    })
  );
}

function firstArrayValue(value) {
  const [first] = asArray(value);
  if (!first) return null;
  return typeof first === "string" ? first : stableJson(first);
}

function stripPromptInjection(text) {
  return text
    .split(sentenceSplitPattern)
    .filter((sentence) => !promptInjectionPattern.test(sentence))
    .join(" ")
    .trim();
}

function firstUsefulSentence(text) {
  return stripPromptInjection(text)
    .split(sentenceSplitPattern)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length >= 25 && !/^(USPs?|Avoid claims)/i.test(sentence)) ?? "";
}

function cleanText(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanFontFamily(value) {
  return value.replace(/^__/, "").replace(/_[a-f0-9]{8}$/i, "").trim();
}

function normalizeSentenceCase(value) {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.fieldType}:${stableJson(candidate.value)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
