const allowedFieldTypes = new Set([
  "positioning",
  "usp",
  "tone",
  "product",
  "service",
  "offer",
  "pricing",
  "testimonial",
  "rating",
  "certification",
  "award",
  "case_study",
  "metric",
  "media_asset",
  "social_link",
  "disclaimer",
  "regulated_claim",
  "rights_warning",
  "missing_asset",
  "video_format",
  "readiness_score"
]);

export function buildBrandLlmPromptInput({ pages = [], brandContext = {} } = {}) {
  return {
    task: "v0_brand_evidence_extraction",
    schemaVersion: "brand.llm.extraction.input.v1",
    rules: [
      "evidence only",
      "no invented facts",
      "no model memory",
      "mark inference separately",
      "missing items return null, [] or needs_human_input"
    ],
    brandContext: {
      industry: brandContext.industry ?? null,
      primaryMarket: brandContext.primaryMarket ?? "India",
      language: brandContext.language ?? "en-IN"
    },
    pages: pages.slice(0, 20).map((page) => ({
      url: safeUrl(page.url),
      title: text(page.title).slice(0, 160),
      markdown: text(page.markdown ?? page.text).slice(0, 3000)
    }))
  };
}

export function parseBrandLlmExtraction(value) {
  if (!value || value.refused === true || !Array.isArray(value.units)) {
    return invalid();
  }
  const units = [];
  for (const unit of value.units) {
    if (
      !allowedFieldTypes.has(unit?.fieldType) ||
      unit.value === undefined ||
      typeof unit.sourceUrl !== "string" ||
      typeof unit.evidenceSnippet !== "string" ||
      unit.evidenceSnippet.trim().length === 0 ||
      !Number.isFinite(unit.confidence)
    ) {
      return invalid();
    }
    units.push({
      fieldType: unit.fieldType,
      value: unit.value,
      confidence: Math.max(0, Math.min(1, unit.confidence)),
      sourceUrl: safeUrl(unit.sourceUrl),
      evidenceSnippet: unit.evidenceSnippet.trim(),
      inference: unit.inference === true
    });
  }
  return {
    ok: true,
    output: {
      units,
      readiness: {
        score: Number.isInteger(value.readiness?.score) ? value.readiness.score : null,
        missingAssets: Array.isArray(value.readiness?.missingAssets) ? value.readiness.missingAssets.filter((item) => typeof item === "string") : []
      }
    }
  };
}

export async function runBrandLlmExtraction(input, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const provider = env.LLM_PROVIDER ?? "simulator";
  if (provider === "simulator" || provider === "simulator-brand-extraction") {
    return { ok: true, output: { units: [], readiness: { score: null, missingAssets: [] } } };
  }
  if (typeof env.LLM_API_KEY !== "string" || env.LLM_API_KEY.trim().length === 0) {
    return {
      ok: false,
      problem: {
        code: "DEPENDENCY_UNAVAILABLE",
        status: 503,
        title: "Dependency unavailable",
        detail: "LLM extraction is not configured."
      }
    };
  }
  if (typeof fetchImpl !== "function") {
    return invalidProvider();
  }
  return invalidProvider();
}

function invalid() {
  return { ok: false, problem: { code: "PROVIDER_OUTPUT_INVALID", status: 422, title: "Provider output invalid", detail: "LLM output did not match the evidence schema." } };
}

function invalidProvider() {
  return { ok: false, problem: { code: "DEPENDENCY_UNAVAILABLE", status: 503, title: "Dependency unavailable", detail: "No approved LLM provider transport is configured." } };
}

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeUrl(value) {
  const parsed = new URL(String(value ?? "https://unknown.invalid"));
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.toString();
}
