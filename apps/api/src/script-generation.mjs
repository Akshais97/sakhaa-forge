// V0-S1 deterministic script-generation simulator.
// Provider-neutral: every variant is produced locally from the approved brand
// profile, formula derivation and provider-neutral director prompt. No external
// AI provider is contacted in V0; this adapter stands in for that boundary so the
// tournament is fully auditable and reproducible.
//
// Sources: docs/V0/Sprints/V0-S1_AUDITABLE_SCRIPT_TOURNAMENT_SPRINT.md,
// docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md.

import { createHash } from "node:crypto";

export const SCRIPT_PROMPT_VERSION = "v0.director-prompt.1";
export const SCRIPT_MODEL_VERSION = "v0.script-model.1";

const HOOK_TYPES = ["question", "stat", "scene", "contrast", "promise"];

// Universal prohibited claims that no brand may make, independent of brand rules.
const UNIVERSAL_PROHIBITED_CLAIMS = [
  "guaranteed virality",
  "guaranteed reach",
  "guaranteed sales",
  "guaranteed appreciation",
  "guaranteed returns",
  "scientifically proven",
  "cures",
  "risk-free investment"
];

const SUPPORTED_MODES = new Set(["fixture_success", "insufficient_valid", "mixed_valid", "ai_refused", "malformed"]);

export function supportedScriptSimulatorModes() {
  return [...SUPPORTED_MODES];
}

// generateScriptVariants returns { ok, problemCode, retryable, variants }.
// - fixture_success: `variantCount` policy-clean, schema-valid variants.
// - insufficient_valid: `variantCount` variants where the first
//   `max(2, variantCount - 8)` carry a prohibited claim so valid count < 10.
// - mixed_valid: the first two variants carry a prohibited claim while the rest
//   stay valid, so the tournament reaches ready_for_selection with two
//   refused variants still present for selection-rejection tests.
// - ai_refused: the provider refuses under policy; no variants are produced.
// - malformed: the provider returns schema-invalid output that cannot be parsed.
export function generateScriptVariants(input) {
  const mode = input.simulatorMode ?? "fixture_success";
  if (!SUPPORTED_MODES.has(mode)) {
    return { ok: false, problemCode: "VALIDATION_FAILED", retryable: false, variants: [] };
  }
  if (mode === "ai_refused") {
    return { ok: false, problemCode: "AI_REQUEST_REFUSED", retryable: false, variants: [] };
  }
  if (mode === "malformed") {
    return { ok: false, problemCode: "AI_OUTPUT_SCHEMA_INVALID", retryable: false, variants: [] };
  }
  const count = input.variantCount;
  const poisonedCount = mode === "insufficient_valid" ? Math.max(2, count - 8) : mode === "mixed_valid" ? 2 : 0;
  const variants = [];
  for (let index = 0; index < count; index += 1) {
    variants.push(buildVariant({ ...input, index, poisoned: index < poisonedCount }));
  }
  return { ok: true, problemCode: null, retryable: false, variants };
}

function buildVariant(input) {
  const { tournamentId, workspaceId, index, poisoned, brandProfile, formula, objective, objectiveType } = input;
  const publicName = brandProfile?.profile?.name?.public?.value ?? "Aster Heights";
  const ctaLabel = brandProfile?.profile?.calls_to_action?.[0]?.label ?? "Book a site visit";
  const hookType = HOOK_TYPES[index % HOOK_TYPES.length];
  const hook = hookLine(hookType, publicName, index);
  const proof = `Project evidence: handover-ready homes at ${publicName} with RERA-compliant documentation on file.`;
  const body = `${hook} ${proof} ${objective}`;
  const cta = `${ctaLabel} — visit ${publicName} this weekend.`;
  const captions = `On-screen: ${publicName} | ${objectiveType.replace(/_/g, " ")} | variant ${index + 1}`;
  const safeClaims = [
    `${publicName} homes are designed for urban professionals and families.`,
    `Site visits are open this weekend at ${publicName}.`
  ];
  const claims = poisoned
    ? [...safeClaims, `Guaranteed appreciation within 12 months at ${publicName}.`]
    : safeClaims;
  const cadence = {
    hookMs: 900 + (index % 3) * 100,
    bodyMs: 4000 + (index % 4) * 250,
    ctaMs: 1200,
    totalMs: 6100 + (index % 4) * 250
  };
  const formulaSlots = [...formula.slots];
  const sourceHash = variantSourceHash({ tournamentId, workspaceId, index, hook, body, cta, claims });
  return {
    index,
    status: "generated",
    hookType,
    hook,
    body,
    cta,
    captions,
    claims,
    cadence,
    formulaSlots,
    provenance: {
      promptVersion: SCRIPT_PROMPT_VERSION,
      modelVersion: SCRIPT_MODEL_VERSION,
      sourceHash,
      tournamentId
    }
  };
}

function hookLine(hookType, publicName, index) {
  const lines = {
    question: `What if your next home already had the paperwork sorted?`,
    stat: `9 of 10 site visitors at ${publicName} shortlist within one visit.`,
    scene: `Morning light over ${publicName}'s ready-to-move towers.`,
    contrast: `Crowded commutes versus a calmer address at ${publicName}.`,
    promise: `A calmer move starts with one walked-through unit at ${publicName}.`
  };
  return `${lines[hookType]} (take ${index + 1})`;
}

// evaluateScriptVariant returns { variantStatus, evaluation }.
// variantStatus: generated | policy_refused | schema_invalid.
// evaluation: the persisted evaluation record minus id/workspaceId/tournamentId/
// variantId/createdAt which the store assigns.
export function evaluateScriptVariant(variant, brandRules, formula) {
  const schemaValid =
    ["hook", "body", "cta", "captions"].every((field) => typeof variant[field] === "string" && variant[field].length > 0) &&
    Array.isArray(variant.claims);
  if (!schemaValid) {
    return {
      variantStatus: "schema_invalid",
      evaluation: baseEvaluation(variant, formula, {
        status: "schema_invalid",
        policyChecks: [],
        brandRuleChecks: [],
        explanation: "The generated script did not match the required structure."
      })
    };
  }

  const policyChecks = [];
  const brandRuleChecks = [];
  let refused = false;
  for (const claim of variant.claims) {
    const lower = String(claim).toLowerCase();
    for (const universal of UNIVERSAL_PROHIBITED_CLAIMS) {
      if (lower.includes(universal)) {
        policyChecks.push({ claim, source: "universal", value: universal, decision: "refused" });
        refused = true;
      }
    }
    for (const rule of brandRules) {
      if (rule.type === "prohibited_claim" && lower.includes(String(rule.value).toLowerCase())) {
        brandRuleChecks.push({
          claim,
          ruleId: rule.id,
          value: rule.value,
          severity: rule.severity,
          decision: "refused"
        });
        refused = true;
      }
    }
  }

  const formulaChecks = formula.slots.map((slot) => ({ slot, present: variant.formulaSlots.includes(slot) }));
  const formulaOk = formulaChecks.every((check) => check.present);
  const modelScore = scoreFromHash(variant.provenance.sourceHash);

  if (refused) {
    return {
      variantStatus: "policy_refused",
      evaluation: baseEvaluation(variant, formula, {
        status: "policy_violation",
        policyChecks,
        brandRuleChecks,
        modelScore,
        explanation: `Script refused for ${policyChecks.length + brandRuleChecks.length} prohibited claim(s).`
      })
    };
  }
  if (!formulaOk) {
    return {
      variantStatus: "schema_invalid",
      evaluation: baseEvaluation(variant, formula, {
        status: "schema_invalid",
        policyChecks,
        brandRuleChecks,
        modelScore,
        explanation: "The generated script was missing a required formula slot."
      })
    };
  }
  return {
    variantStatus: "generated",
    evaluation: baseEvaluation(variant, formula, {
      status: "evaluated",
      policyChecks,
      brandRuleChecks,
      modelScore,
      explanation: "Script passed formula, policy and brand-rule checks."
    })
  };
}

function baseEvaluation(variant, formula, overrides) {
  return {
    status: overrides.status,
    hookStrength: { type: variant.hookType, score: scoreFromHash(variant.provenance.sourceHash) },
    timing: { ...variant.cadence },
    patternInterrupts: {
      count: (variant.formulaSlots.includes("pattern_interrupt") ? 1 : 0) + (variant.index % 2),
      slots: variant.formulaSlots
    },
    cta: { label: variant.cta, clarity: "clear" },
    claims: {
      count: variant.claims.length,
      refusedCount: overrides.policyChecks.length + overrides.brandRuleChecks.length,
      approvedCount: Math.max(0, variant.claims.length - (overrides.policyChecks.length + overrides.brandRuleChecks.length))
    },
    captions: { present: true, language: "en-IN" },
    tone: { attributes: ["calm", "premium", "direct", "informative"], avoidPresent: false },
    formulaChecks: formula.slots.map((slot) => ({ slot, present: variant.formulaSlots.includes(slot) })),
    policyChecks: overrides.policyChecks,
    brandRuleChecks: overrides.brandRuleChecks,
    modelScore: overrides.modelScore,
    humanScore: null,
    explanation: overrides.explanation
  };
}

function scoreFromHash(hash) {
  const slice = hash.slice(0, 8);
  const value = parseInt(slice, 16) % 40;
  return Number((0.6 + value / 100).toFixed(2));
}

function variantSourceHash(input) {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// Analytics bucket helpers. These return coarse buckets only; raw prompts, script
// text, claims, captions and full IDs never enter analytics.
export function requestedVariantBucket(count) {
  if (count <= 12) return "10-12";
  if (count <= 16) return "13-16";
  return "17-20";
}

export function validVariantCountBucket(count) {
  if (count === 0) return "0";
  if (count <= 4) return "1-4";
  if (count <= 9) return "5-9";
  if (count <= 12) return "10-12";
  if (count <= 16) return "13-16";
  return "17-20";
}

export function durationBucket(count) {
  const durationMs = 6000 + count * 250;
  if (durationMs < 5000) return "0-5s";
  if (durationMs < 15000) return "5-15s";
  if (durationMs < 30000) return "15-30s";
  return "30-60s";
}

export function tokenBucket(count) {
  if (count <= 12) return "1k-5k";
  if (count <= 16) return "5k-10k";
  return "10k-20k";
}

export function costBucket(count) {
  if (count <= 12) return "0.10-0.50";
  if (count <= 16) return "0.50-1.00";
  return "1.00-2.00";
}

export function objectiveCategory(objectiveType) {
  return objectiveType;
}

// Bucket for the script_selected analytics event: the selected variant's
// 1-based rank among valid variants when sorted by model score descending.
// Coarse buckets only; the variant id, score and script text never enter
// analytics.
export function variantRankBucket(rank) {
  if (rank === 1) return "1";
  if (rank <= 3) return "2-3";
  if (rank <= 10) return "4-10";
  return "11+";
}
