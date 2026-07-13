// V0-C1 deterministic AE capability registry and plan validator. This is the deterministic
// core of the composition slice: the registry is the only source of supported fonts,
// plugins, templates, effects, codecs, safe zones, duration bounds, resolutions and the AE
// worker capability version. The LLM cannot invent assets, fonts, plugins or effects — a
// plan that references an unsupported item is `validation_failed` with every unsupported
// item explained. The validator is pure and takes a `resolveAsset` callback so the store can
// bind plan tracks to retained CLEAN generated assets without the validator importing Prisma
// or provider adapters. Money, signed URLs and provider payloads are out of scope here.
//
// Sources: docs/V0/V0_VERTICAL_OUTCOME_SLICES.md (V0-C1),
// docs/V0/Sprints/V0-C1_VALIDATED_COMPOSITION_INTENT_AND_AE_PLAN_SPRINT.md,
// docs/V0/V0_STATUS_ENUMS.md, docs/V0/V0_ERROR_CATALOG.md, docs/V0/V0_JOBS.md,
// docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md (AE_CAPABILITY_VERSION).

export const AE_PLAN_SCHEMA_VERSION = "ae.plan.v1";
export const DEFAULT_AE_CAPABILITY_VERSION = "ae.local.1";

// The versioned AE capability registry. `capabilityVersion` is the immutable AE worker
// capability id (config catalog: AE_CAPABILITY_VERSION, Internal, Fail). The simulator
// default `ae.local.1` mirrors the deterministic `v0.local.1` price-version pattern.
export function aeCapabilityRegistry(env = process.env) {
  const capabilityVersion = String(env.AE_CAPABILITY_VERSION || DEFAULT_AE_CAPABILITY_VERSION);
  return {
    capabilityVersion,
    schemaVersion: AE_PLAN_SCHEMA_VERSION,
    resolutions: ["1080x1920"],
    durationSeconds: { min: 5, max: 90 },
    safeZones: ["center", "lower_third", "upper_third", "full"],
    trackKinds: ["video", "image", "audio"],
    overlayKinds: ["caption", "logo", "lower_third"],
    fonts: ["Satoshi", "Clash Display", "JetBrains Mono"],
    plugins: ["ae_builtin"],
    templates: ["realestate_listing", "property_walkthrough", "testimonial_quote"],
    effects: ["zoom_in", "fade", "slide", "ken_burns"],
    codecs: ["h264"]
  };
}

const SCHEMA_CODE = "AE_PLAN_SCHEMA_INVALID";
const CAP_CODE = "AE_CAPABILITY_UNAVAILABLE";
const ASSET_CODE = "AE_ASSET_MISSING";
const TIMELINE_CODE = "AE_TIMELINE_INVALID";

const STATUS_BY_CODE = {
  [SCHEMA_CODE]: 422,
  [CAP_CODE]: 409,
  [ASSET_CODE]: 422,
  [TIMELINE_CODE]: 422
};

// Priority order for the single primary error code returned in the RFC 9457 problem.
// Schema errors short-circuit: a structurally broken plan cannot be trusted for capability,
// asset or timing checks. Otherwise capability mismatches rank above missing assets and
// invalid timing because an unsupported capability is the root cause the user must fix first.
const PRIORITY = [SCHEMA_CODE, CAP_CODE, ASSET_CODE, TIMELINE_CODE];

function fail(primary, unsupported) {
  return { ok: false, primary, unsupported };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

// Validate a versioned AE timeline plan against the capability registry. `resolveAsset` is
// an async function returning the retained CLEAN generated asset for an id, or null when the
// asset is missing, cross-workspace or not clean. Returns `{ ok, ... }` per the contract.
export async function validateAePlan(timeline, registry, resolveAsset) {
  if (!isPlainObject(timeline)) {
    return fail({ code: SCHEMA_CODE, status: 422, detail: "The composition plan must be a JSON object." }, [
      { code: SCHEMA_CODE, field: "timeline", detail: "The composition plan must be a JSON object." }
    ]);
  }

  const schemaErrors = collectSchemaErrors(timeline, registry);
  if (schemaErrors.length > 0) {
    return fail({ code: SCHEMA_CODE, status: 422, detail: schemaErrors[0].detail }, schemaErrors);
  }

  const unsupported = [];

  // Capability version and resolution: the plan must target the active AE worker capability.
  if (timeline.capabilityVersion !== registry.capabilityVersion) {
    unsupported.push({
      code: CAP_CODE,
      field: "capabilityVersion",
      detail: `Capability version ${timeline.capabilityVersion} does not match the AE worker capability ${registry.capabilityVersion}.`
    });
  }
  if (!registry.resolutions.includes(timeline.resolution)) {
    unsupported.push({
      code: CAP_CODE,
      field: "resolution",
      detail: `Resolution ${timeline.resolution} is not supported by the AE capability registry.`
    });
  }
  for (const font of timeline.fonts) {
    if (!registry.fonts.includes(font.name)) {
      unsupported.push({ code: CAP_CODE, field: "fonts", detail: `Font ${font.name} is not in the capability registry.` });
    }
  }
  for (const plugin of timeline.plugins) {
    if (!registry.plugins.includes(plugin.name)) {
      unsupported.push({ code: CAP_CODE, field: "plugins", detail: `Plugin ${plugin.name} is not in the capability registry.` });
    }
  }
  for (const template of timeline.templates) {
    if (!registry.templates.includes(template.name)) {
      unsupported.push({ code: CAP_CODE, field: "templates", detail: `Template ${template.name} is not in the capability registry.` });
    }
  }
  for (const effect of timeline.effects) {
    if (!registry.effects.includes(effect.name)) {
      unsupported.push({ code: CAP_CODE, field: "effects", detail: `Effect ${effect.name} is not in the capability registry.` });
    }
    if (effect.plugin && !registry.plugins.includes(effect.plugin)) {
      unsupported.push({ code: CAP_CODE, field: "effects", detail: `Effect plugin ${effect.plugin} is not in the capability registry.` });
    }
  }

  // Assets: every track must reference a retained CLEAN generated asset in the workspace.
  for (const track of timeline.tracks) {
    const asset = await resolveAsset(track.assetId);
    if (!asset || String(asset.status || "").toUpperCase() !== "CLEAN") {
      unsupported.push({
        code: ASSET_CODE,
        field: `tracks[${track.id}].assetId`,
        detail: "A referenced media asset is missing or unavailable."
      });
    }
  }

  // Duration bounds.
  const { min, max } = registry.durationSeconds;
  if (timeline.durationSeconds < min || timeline.durationSeconds > max) {
    unsupported.push({
      code: TIMELINE_CODE,
      field: "durationSeconds",
      detail: `Duration ${timeline.durationSeconds}s is outside the supported ${min}–${max}s range.`
    });
  }

  // Track and overlay timing, safe zones.
  for (const track of timeline.tracks) {
    if (track.startSeconds < 0 || track.endSeconds > timeline.durationSeconds || track.startSeconds >= track.endSeconds) {
      unsupported.push({
        code: TIMELINE_CODE,
        field: `tracks[${track.id}].timing`,
        detail: `Track ${track.id} has invalid timing within 0–${timeline.durationSeconds}s.`
      });
    }
    if (!registry.safeZones.includes(track.safeZone)) {
      unsupported.push({
        code: TIMELINE_CODE,
        field: `tracks[${track.id}].safeZone`,
        detail: `Safe zone ${track.safeZone} is not allowed.`
      });
    }
  }
  for (const overlay of timeline.overlays) {
    if (overlay.startSeconds < 0 || overlay.endSeconds > timeline.durationSeconds || overlay.startSeconds >= overlay.endSeconds) {
      unsupported.push({
        code: TIMELINE_CODE,
        field: `overlays[${overlay.id}].timing`,
        detail: `Overlay ${overlay.id} has invalid timing within 0–${timeline.durationSeconds}s.`
      });
    }
    if (overlay.safeZone && !registry.safeZones.includes(overlay.safeZone)) {
      unsupported.push({
        code: TIMELINE_CODE,
        field: `overlays[${overlay.id}].safeZone`,
        detail: `Safe zone ${overlay.safeZone} is not allowed.`
      });
    }
  }

  // Overlap check within the same track kind: two video tracks cannot occupy the same layer.
  const byKind = new Map();
  for (const track of timeline.tracks) {
    if (!byKind.has(track.kind)) byKind.set(track.kind, []);
    byKind.get(track.kind).push(track);
  }
  for (const [, group] of byKind) {
    const sorted = [...group].sort((a, b) => a.startSeconds - b.startSeconds);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i - 1].endSeconds > sorted[i].startSeconds) {
        unsupported.push({
          code: TIMELINE_CODE,
          field: "tracks.overlap",
          detail: `Overlapping ${sorted[i].kind} tracks are not allowed on the same layer.`
        });
      }
    }
  }

  if (unsupported.length === 0) {
    return { ok: true, capabilityVersion: registry.capabilityVersion, schemaVersion: registry.schemaVersion };
  }

  const primaryCode = PRIORITY.find((code) => unsupported.some((item) => item.code === code));
  const primaryDetail = unsupported.find((item) => item.code === primaryCode).detail;
  return fail({ code: primaryCode, status: STATUS_BY_CODE[primaryCode], detail: primaryDetail }, unsupported);
}

function collectSchemaErrors(timeline, registry) {
  const errors = [];
  if (!isNonEmptyString(timeline.schemaVersion) || timeline.schemaVersion !== registry.schemaVersion) {
    errors.push({ code: SCHEMA_CODE, field: "schemaVersion", detail: "The plan schema version is missing or unsupported." });
  }
  if (!isNonEmptyString(timeline.capabilityVersion)) {
    errors.push({ code: SCHEMA_CODE, field: "capabilityVersion", detail: "The plan capability version is missing." });
  }
  if (!Number.isInteger(timeline.durationSeconds) || timeline.durationSeconds <= 0) {
    errors.push({ code: SCHEMA_CODE, field: "durationSeconds", detail: "Duration must be a positive integer number of seconds." });
  }
  if (!isNonEmptyString(timeline.resolution)) {
    errors.push({ code: SCHEMA_CODE, field: "resolution", detail: "Resolution must be a non-empty string." });
  }
  if (!Array.isArray(timeline.tracks) || timeline.tracks.length === 0) {
    errors.push({ code: SCHEMA_CODE, field: "tracks", detail: "The plan must define at least one track." });
    return errors;
  }
  for (const [index, track] of timeline.tracks.entries()) {
    if (!isPlainObject(track)) {
      errors.push({ code: SCHEMA_CODE, field: `tracks[${index}]`, detail: `Track ${index} must be a JSON object.` });
      continue;
    }
    if (!isNonEmptyString(track.id)) errors.push({ code: SCHEMA_CODE, field: `tracks[${index}].id`, detail: `Track ${index} is missing an id.` });
    if (!registry.trackKinds.includes(track.kind)) errors.push({ code: SCHEMA_CODE, field: `tracks[${index}].kind`, detail: `Track ${index} kind ${track.kind} is not supported.` });
    if (!isNonEmptyString(track.assetId)) errors.push({ code: SCHEMA_CODE, field: `tracks[${index}].assetId`, detail: `Track ${index} is missing an asset reference.` });
    if (!Number.isFinite(track.startSeconds) || !Number.isFinite(track.endSeconds)) errors.push({ code: SCHEMA_CODE, field: `tracks[${index}].timing`, detail: `Track ${index} timing must be numbers.` });
    if (!isNonEmptyString(track.safeZone)) errors.push({ code: SCHEMA_CODE, field: `tracks[${index}].safeZone`, detail: `Track ${index} is missing a safe zone.` });
  }
  if (!Array.isArray(timeline.overlays)) {
    errors.push({ code: SCHEMA_CODE, field: "overlays", detail: "Overlays must be an array." });
  } else {
    for (const [index, overlay] of timeline.overlays.entries()) {
      if (!isPlainObject(overlay) || !isNonEmptyString(overlay.id)) {
        errors.push({ code: SCHEMA_CODE, field: `overlays[${index}]`, detail: `Overlay ${index} must be a JSON object with an id.` });
        continue;
      }
      if (!registry.overlayKinds.includes(overlay.kind)) errors.push({ code: SCHEMA_CODE, field: `overlays[${index}].kind`, detail: `Overlay ${index} kind ${overlay.kind} is not supported.` });
      if (overlay.kind === "caption" && !isNonEmptyString(overlay.text)) errors.push({ code: SCHEMA_CODE, field: `overlays[${index}].text`, detail: `Caption overlay ${index} text must not be empty.` });
      if (!Number.isFinite(overlay.startSeconds) || !Number.isFinite(overlay.endSeconds)) errors.push({ code: SCHEMA_CODE, field: `overlays[${index}].timing`, detail: `Overlay ${index} timing must be numbers.` });
    }
  }
  for (const [field, list] of [["effects", timeline.effects], ["fonts", timeline.fonts], ["plugins", timeline.plugins], ["templates", timeline.templates]]) {
    if (!Array.isArray(list)) {
      errors.push({ code: SCHEMA_CODE, field, detail: `${field} must be an array of { name }.` });
    } else {
      for (const entry of list) {
        if (!isPlainObject(entry) || !isNonEmptyString(entry.name)) {
          errors.push({ code: SCHEMA_CODE, field, detail: `${field} entries must be objects with a non-empty name.` });
        }
      }
    }
  }
  return errors;
}
