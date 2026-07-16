type BackendCandidate = {
  id?: string;
  fieldType?: string;
  value?: unknown;
  confidence?: number;
  decision?: string;
  extractionState?: string;
  sourceEvidence?: Array<{
    sourceType?: string;
    locator?: string;
    pageTitle?: string | null;
    excerpt?: string;
    excerptHash?: string;
    observedAt?: string;
  }>;
  conflict?: boolean;
};

type BackendCrawlRun = {
  id?: string;
  status?: string;
  selectedBrandType?: string | null;
  detectedBrandType?: string | null;
  extractionSchemaVersion?: string | null;
  providerCreditTelemetry?: {
    estimatedCredits?: number;
    observedCredits?: number;
  } | null;
  crawlProvider?: { mode?: string; configured?: boolean } | null;
};

type CandidateSection =
  | "identity"
  | "visual"
  | "copy"
  | "voice"
  | "proof"
  | "products"
  | "offers"
  | "compliance"
  | "audiences"
  | "social"
  | "metadata"
  | "missing";

export type UiCandidate = {
  id: string;
  field: string;
  fieldType: string;
  value: unknown;
  displayValue: string;
  section: CandidateSection;
  confidence: number;
  status: "candidate" | "approved" | "rejected" | "low-confidence" | "conflict";
  conflict: boolean;
  evidence: {
    type: string;
    locator: string;
    excerpt: string;
    hash: string;
    observedAt?: string;
  };
};

export type UiAsset = {
  id: string;
  category: string;
  locator: string;
  rightsBasis: string;
  permittedUse: string;
  name: string;
  status?: string;
};

export type AdaptedBrandCrawlRun = {
  id: string;
  status: string;
  progress: number;
  selectedBrandType: string;
  detectedBrandType: string | null;
  extractionSchemaVersion: string;
  providerCreditTelemetry: BackendCrawlRun["providerCreditTelemetry"];
  candidates: UiCandidate[];
  assetPack: UiAsset[];
  readinessScore: number;
  basisBreakdown: Record<string, number>;
  crawlProvider: BackendCrawlRun["crawlProvider"];
};

type CanonicalApprovalDraft = {
  name: { public: string };
  industry: string;
  markets: string[];
  positioning: { statement: string };
  products: unknown[];
  audiences: unknown[];
  calls_to_action: unknown[];
  voice: {
    attributes: string[];
    avoid_list: string[];
    formality: string;
    languages: string[];
  };
  visual_identity: unknown;
  claims: unknown[];
  rightsAttestationChecked: boolean;
  rules: {
    required_phrases: string[];
    prohibited_phrases: string[];
    required_disclosures: string[];
  };
  version: string;
};

export function buildCanonicalApprovalInput(
  draft: CanonicalApprovalDraft,
  context: { workspaceId: string; crawlRunId: string }
) {
  const displayedVersion = Number.parseInt(draft.version.split(".")[0] ?? "", 10);
  const optimisticVersion = Number.isInteger(displayedVersion) && displayedVersion > 0 ? displayedVersion - 1 : 0;

  return {
    workspaceId: context.workspaceId,
    crawlRunId: context.crawlRunId,
    decision: "approve" as const,
    optimisticVersion,
    profile: {
      publicName: draft.name.public,
      industry: draft.industry,
      markets: draft.markets,
      positioningStatement: draft.positioning.statement,
      products: draft.products,
      audiences: draft.audiences,
      callsToAction: draft.calls_to_action,
      voice: {
        attributes: draft.voice.attributes,
        avoid: draft.voice.avoid_list,
        formality: draft.voice.formality,
        languages: draft.voice.languages
      },
      visualIdentity: draft.visual_identity,
      claims: draft.claims,
      rightsAttestation: draft.rightsAttestationChecked
    },
    rules: [
      ...draft.rules.required_phrases.map(value => ({ type: "required_phrase", value, severity: "warning", rationale: "Approved brand phrase." })),
      ...draft.rules.prohibited_phrases.map(value => ({ type: "prohibited_phrase", value, severity: "critical", rationale: "Prohibited by approved brand rules." })),
      ...draft.rules.required_disclosures.map(value => ({ type: "required_disclosure", value, severity: "critical", rationale: "Required approved disclosure." }))
    ]
  };
}

const fieldTypeToSection: Record<string, CandidateSection> = {
  identity: "identity",
  summary: "identity",
  positioning: "identity",
  visual_identity: "visual",
  color: "visual",
  font: "visual",
  logo: "visual",
  media_asset: "visual",
  copy_messaging: "copy",
  usp: "copy",
  cta: "copy",
  offer: "offers",
  pricing: "offers",
  voice: "voice",
  tone: "voice",
  social_proof: "proof",
  testimonial: "proof",
  rating: "proof",
  certification: "proof",
  award: "proof",
  case_study: "proof",
  metric: "proof",
  audience: "audiences",
  product_service: "products",
  product: "products",
  service: "products",
  claim: "compliance",
  prohibited_claim: "compliance",
  regulated_claim: "compliance",
  disclaimer: "compliance",
  rights_asset: "compliance",
  rights_warning: "compliance",
  publishing_social: "social",
  metadata: "metadata",
  vertical_conflict: "metadata",
  missing_asset: "missing",
  readiness_score: "metadata"
};

const fieldLabels: Record<string, string> = {
  identity: "Identity",
  summary: "Summary",
  positioning: "Positioning",
  visual_identity: "Visual identity",
  color: "Colour",
  font: "Font",
  logo: "Logo",
  media_asset: "Media asset",
  copy_messaging: "Copy messaging",
  usp: "USP",
  cta: "CTA",
  offer: "Offer",
  pricing: "Pricing",
  voice: "Voice",
  tone: "Tone",
  social_proof: "Social proof",
  testimonial: "Testimonial",
  rating: "Rating",
  certification: "Certification",
  award: "Award",
  case_study: "Case study",
  metric: "Metric",
  audience: "Audience",
  product_service: "Product or service",
  product: "Product",
  service: "Service",
  claim: "Claim",
  prohibited_claim: "Prohibited claim",
  regulated_claim: "Regulated claim",
  disclaimer: "Disclaimer",
  rights_asset: "Rights asset",
  rights_warning: "Rights warning",
  publishing_social: "Publishing social",
  metadata: "Metadata",
  vertical_conflict: "Selected/detected conflict",
  missing_asset: "Missing asset",
  readiness_score: "Readiness score"
};

const completeStatuses = new Set(["SUCCEEDED", "READY", "ready", "succeeded"]);
const failedStatuses = new Set(["FAILED", "failed"]);

export function shouldCompleteCrawlWithLocalDemo(input: {
  source?: string;
  jobId?: unknown;
  crawlProvider?: { mode?: string; configured?: boolean } | null;
}): boolean {
  return input.source === "local-demo"
    && typeof input.jobId === "string"
    && input.jobId.trim().length > 0
    && input.crawlProvider?.mode === "simulator";
}

export function adaptBrandCrawlRunResponse(response: {
  crawlRun?: BackendCrawlRun;
  data?: { crawlRun?: BackendCrawlRun; candidates?: BackendCandidate[]; brandAssets?: unknown[] };
  candidates?: BackendCandidate[];
  brandAssets?: unknown[];
  assetPack?: unknown;
}): AdaptedBrandCrawlRun {
  const crawlRun = response.crawlRun ?? response.data?.crawlRun ?? {};
  const candidates = (response.candidates ?? response.data?.candidates ?? []).map(adaptCandidate);
  const brandAssets = (response.brandAssets ?? response.data?.brandAssets ?? []).flatMap(adaptBrandAsset);
  const status = crawlRun.status ?? "unknown";
  return {
    id: crawlRun.id ?? "",
    status: completeStatuses.has(status) ? "ready" : failedStatuses.has(status) ? "failed" : status.toLowerCase(),
    progress: completeStatuses.has(status) ? 100 : 0,
    selectedBrandType: crawlRun.selectedBrandType ?? "",
    detectedBrandType: crawlRun.detectedBrandType ?? null,
    extractionSchemaVersion: crawlRun.extractionSchemaVersion ?? "unknown",
    providerCreditTelemetry: crawlRun.providerCreditTelemetry ?? null,
    candidates,
    assetPack: uniqueAssets([...brandAssets, ...extractAssetPack(candidates, response.assetPack)]),
    readinessScore: readinessScore(candidates),
    basisBreakdown: basisBreakdown(candidates),
    crawlProvider: crawlRun.crawlProvider ?? null
  };
}

export function adaptCandidate(candidate: BackendCandidate): UiCandidate {
  const fieldType = candidate.fieldType ?? "metadata";
  const evidence = candidate.sourceEvidence?.[0] ?? {};
  const conflict = candidate.conflict === true || fieldType === "vertical_conflict";
  return {
    id: candidate.id ?? `${fieldType}-${hashText(stableDisplay(candidate.value))}`,
    field: fieldLabels[fieldType] ?? sentenceLabel(fieldType),
    fieldType,
    value: candidate.value,
    displayValue: stableDisplay(candidate.value),
    section: fieldTypeToSection[fieldType] ?? "metadata",
    confidence: Math.round((candidate.confidence ?? 0) * 100),
    status: conflict ? "conflict" : candidate.extractionState === "LOW_CONFIDENCE" ? "low-confidence" : normalizeDecision(candidate.decision),
    conflict,
    evidence: {
      type: evidence.sourceType ?? "website",
      locator: evidence.locator ?? "unknown",
      excerpt: evidence.excerpt ?? stableDisplay(candidate.value),
      hash: evidence.excerptHash ?? hashText(evidence.excerpt ?? stableDisplay(candidate.value)),
      observedAt: evidence.observedAt
    }
  };
}

export function buildApprovalDraftFromCandidates(candidates: UiCandidate[], baseDraft: any, source: {
  selectedBrandType: string;
  detectedBrandType: string | null;
  extractionSchemaVersion: string;
  crawlRunId: string | null;
}) {
  const draft = structuredClone(baseDraft);
  for (const candidate of candidates.filter((item) => item.status === "approved")) {
    const value = candidate.value as any;
    if (candidate.fieldType === "identity") {
      draft.name.public = value.brandName ?? draft.name.public;
      draft.name.legal = value.legalName ?? draft.name.legal;
      draft.industry = value.schemaOrgType ?? draft.industry;
      draft.markets = value.market ? [value.market] : draft.markets;
    }
    if (candidate.fieldType === "copy_messaging") {
      draft.positioning.statement = value.tagline ?? value.heroH1 ?? draft.positioning.statement;
      draft.positioning.differentiators = [...asArray(value.featureHeadlines), ...asArray(value.painPoints)];
      draft.calls_to_action = asArray(value.ctaButtons);
      if (value.guaranteeLanguage) draft.claims.push(claimFrom(value.guaranteeLanguage, candidate));
    }
    if (candidate.fieldType === "usp") {
      const uspValues = Array.isArray(value)
        ? value.map((item: any) => String(item ?? "")).filter((item) => item.trim().length > 0)
        : [String(candidate.displayValue || (typeof value === "string" ? value : "") || "")].filter((item) => item.trim().length > 0);
      draft.positioning.differentiators = unique([...draft.positioning.differentiators, ...uspValues]);
    }
    if (candidate.fieldType === "visual_identity") {
      draft.visual_identity.logos = [value.logoUrl, value.faviconUrl, value.ogImageUrl].filter(Boolean);
      draft.visual_identity.colors = Object.entries(value.colors ?? {}).filter(([, hex]) => Boolean(hex)).map(([role, hex]) => ({
        role,
        value: String(hex),
        usage: "Candidate brand colour from Firecrawl branding evidence.",
        prohibited: "Do not use without human approval."
      }));
      draft.visual_identity.fonts = {
        primary: value.typography?.primary_font ?? draft.visual_identity.fonts.primary,
        heading: value.typography?.heading_font ?? draft.visual_identity.fonts.heading,
        code: value.typography?.code_font ?? draft.visual_identity.fonts.code
      };
    }
    if (candidate.fieldType === "voice") {
      draft.voice.attributes = unique([...asArray(value.toneSignals), ...asArray(value.writingStyleTags), ...asArray(value.brandValues)]);
      draft.voice.approved_examples = asArray(value.vocabularySignature);
      draft.positioning.proof_points = unique([...draft.positioning.proof_points, ...asArray(value.keyClaims)]);
    }
    if (candidate.fieldType === "social_proof") {
      draft.positioning.proof_points = unique([
        ...draft.positioning.proof_points,
        ...asArray(value.trustBadges),
        ...asArray(value.beforeAfterStats),
        ...asArray(value.caseStudyHeadlines)
      ]);
    }
    if (candidate.fieldType === "audience") {
      const audiences = [value.whoItsFor, ...asArray(value.objectionThemes)].filter(Boolean);
      draft.audiences = audiences.map((item: string) => ({ name: item, needs: "", objections: "" }));
    }
    if (candidate.fieldType === "product_service") {
      draft.products.push({ title: candidate.displayValue, description: "Extracted from the selected vertical crawl.", pricing: "" });
    }
    if (candidate.fieldType === "claim" || candidate.fieldType === "regulated_claim" || candidate.fieldType === "prohibited_claim") {
      draft.claims.push(claimFrom(candidate.displayValue, candidate));
    }
    if (candidate.fieldType === "publishing_social") {
      draft.voice.languages = unique([...draft.voice.languages, ...asArray(value.socialLinks).map((item: any) => item.platform ?? item.url ?? String(item))]);
    }
  }
  draft.source_summary.selected_brand_type = source.selectedBrandType;
  draft.source_summary.detected_brand_type = source.detectedBrandType ?? "";
  draft.source_summary.conflict_flag = Boolean(source.selectedBrandType && source.detectedBrandType && source.selectedBrandType !== source.detectedBrandType);
  draft.source_summary.extraction_schema_version = source.extractionSchemaVersion;
  draft.source_summary.crawl_run_ref = source.crawlRunId ?? "simulated";
  return draft;
}

function extractAssetPack(candidates: UiCandidate[], rawAssetPack: unknown): UiAsset[] {
  const candidateAssets = candidates
    .filter((candidate) => ["rights_asset", "visual_identity", "logo", "media_asset"].includes(candidate.fieldType))
    .flatMap((candidate) => assetsFromCandidate(candidate));
  if (!rawAssetPack || typeof rawAssetPack !== "object") return candidateAssets;
  const grouped = (rawAssetPack as any).assetPack ?? rawAssetPack;
  const groupedCandidates = Object.values(grouped).flatMap((value) => Array.isArray(value) ? value : []);
  return uniqueAssets([...candidateAssets, ...groupedCandidates.flatMap((item) => assetsFromCandidate(adaptCandidate(item as BackendCandidate)))]);
}

function assetsFromCandidate(candidate: UiCandidate): UiAsset[] {
  const value = candidate.value as any;
  if (candidate.fieldType === "logo") {
    const src = value?.src;
    if (typeof src !== "string" || src.trim().length === 0) return [];
    return [{
      id: `${candidate.id}-logo`,
      category: "Logo",
      locator: src,
      rightsBasis: "Public website crawl evidence",
      permittedUse: "Candidate review",
      name: (typeof value.alt === "string" && value.alt.trim().length > 0) ? value.alt.trim() : "Logo",
      status: "candidate"
    }];
  }
  if (candidate.fieldType === "visual_identity") {
    return [value.logoUrl, value.faviconUrl, value.ogImageUrl, ...(value.screenshots ?? [])].filter(Boolean).map((locator, index) => ({
      id: `${candidate.id}-visual-${index}`,
      category: index < 3 ? "Brand visual" : "Screenshot",
      locator: String(locator),
      rightsBasis: "Public website crawl evidence",
      permittedUse: "Candidate review",
      name: index < 3 ? "Brand visual asset" : "Crawl screenshot",
      status: "candidate"
    }));
  }
  if (candidate.fieldType === "rights_asset" || candidate.fieldType === "media_asset") {
    return [{
      id: `${candidate.id}-asset`,
      category: value.type ?? "Asset",
      locator: value.locator ?? candidate.displayValue,
      rightsBasis: value.rightsBasis ?? "Public website crawl evidence",
      permittedUse: value.permittedUse ?? "Candidate review",
      name: value.type ? `${sentenceLabel(value.type)} asset` : candidate.field,
      status: "candidate"
    }];
  }
  return [];
}

function adaptBrandAsset(asset: unknown): UiAsset[] {
  if (!asset || typeof asset !== "object") return [];
  const value = asset as any;
  const artifactId = typeof value.artifactId === "string" ? value.artifactId : "";
  const locator = typeof value.locator === "string" && value.locator.trim().length > 0
    ? value.locator.trim()
    : artifactId
      ? `artifact:${artifactId}`
      : "";
  if (!locator) return [];
  const id = typeof value.id === "string" && value.id.trim().length > 0 ? value.id : `asset-${hashText(locator)}`;
  const name = typeof value.name === "string" && value.name.trim().length > 0
    ? value.name.trim()
    : artifactId
      ? `Artifact ${artifactId.slice(0, 8)}`
      : "Uploaded brand asset";
  return [{
    id,
    category: typeof value.category === "string" && value.category.trim().length > 0 ? value.category.trim() : "Uploaded brand asset",
    locator,
    rightsBasis: typeof value.rightsBasis === "string" && value.rightsBasis.trim().length > 0 ? value.rightsBasis.trim() : "Uploaded brand asset",
    permittedUse: typeof value.permittedUse === "string" && value.permittedUse.trim().length > 0 ? value.permittedUse.trim() : "Candidate review",
    name,
    status: typeof value.status === "string" ? value.status : "ACTIVE"
  }];
}

function readinessScore(candidates: UiCandidate[]) {
  if (candidates.length === 0) return 0;
  const coverage = new Set(candidates.map((candidate) => candidate.section)).size;
  const confidence = candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / candidates.length;
  return Math.min(100, Math.round(confidence * 0.7 + coverage * 3));
}

function basisBreakdown(candidates: UiCandidate[]) {
  const scoreFor = (sections: CandidateSection[]) => {
    const scoped = candidates.filter((candidate) => sections.includes(candidate.section));
    if (scoped.length === 0) return 0;
    return Math.round(scoped.reduce((sum, candidate) => sum + candidate.confidence, 0) / scoped.length);
  };
  return {
    identity: scoreFor(["identity", "metadata"]),
    visual: scoreFor(["visual"]),
    copy: scoreFor(["copy", "offers"]),
    proof: scoreFor(["proof", "compliance"]),
    voice: scoreFor(["voice", "audiences"]),
    vertical: scoreFor(["products", "metadata"])
  };
}

function normalizeDecision(value: unknown): UiCandidate["status"] {
  return value === "approved" || value === "rejected" ? value : "candidate";
}

function stableDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function claimFrom(statement: string, candidate: UiCandidate) {
  return {
    statement,
    status: candidate.fieldType === "prohibited_claim" ? "prohibited" : "pending_evidence",
    evidence_artifact: candidate.evidence.locator,
    required_disclaimer: "",
    allowed_channels: ["Review only"]
  };
}

function sentenceLabel(value: string) {
  return String(value).replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueAssets(assets: UiAsset[]) {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (!asset.locator || seen.has(asset.locator)) return false;
    seen.add(asset.locator);
    return true;
  });
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return `h${hash.toString(16)}`;
}
