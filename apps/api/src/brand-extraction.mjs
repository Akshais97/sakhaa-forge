import { createHash } from "node:crypto";

const promptInjectionPattern = /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|system|previous|above)\b/i;
const sentenceSplitPattern = /(?<=[.!?])\s+/;
const ctaPattern = /\b(book a site visit|schedule a visit|enquire now|contact sales|get brochure|request callback)\b/i;
const prohibitedClaimPattern = /\b(guaranteed appreciation|assured returns|guaranteed returns|risk-free investment)\b/i;
const hexPattern = /^#[0-9a-f]{6}$/i;

export function buildBrandExtractionCandidates({ crawlRunId, workspaceId, scrape, observedAt = new Date().toISOString() }) {
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
      ...extractProhibitedClaims(page)
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
  const offers = text.match(/\b(practical [^.]+|metro-connected [^.]+|transparent [^.]+)\b/gi) ?? [];
  return offers.slice(0, 5).map((item) => evidenceCandidate("usp", item.trim(), 0.72, page, item));
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
