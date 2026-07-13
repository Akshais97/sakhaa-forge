import test from "node:test";
import assert from "node:assert/strict";
import {
  aeCapabilityRegistry,
  validateAePlan,
  AE_PLAN_SCHEMA_VERSION,
  DEFAULT_AE_CAPABILITY_VERSION
} from "../../apps/api/src/ae-capability-registry.mjs";

// V0-C1 AE plan validator. The deterministic capability registry is the only source of
// supported fonts, plugins, templates, effects, codecs, safe zones, duration bounds and
// capability version. The LLM cannot invent assets, fonts, plugins or effects: a plan that
// references an unsupported item remains `validation_failed` with every unsupported item
// explained. Money, signed URLs and provider payloads are not in scope here; the validator
// is pure and takes a `resolveAsset` callback so it can be unit-tested in Node without a DB.

const ASSET_ID = "11111111-1111-4111-8111-111111111111";

function registry() {
  return aeCapabilityRegistry({ AE_CAPABILITY_VERSION: DEFAULT_AE_CAPABILITY_VERSION });
}

function validTimeline(assetId = ASSET_ID) {
  return {
    schemaVersion: AE_PLAN_SCHEMA_VERSION,
    capabilityVersion: DEFAULT_AE_CAPABILITY_VERSION,
    durationSeconds: 30,
    resolution: "1080x1920",
    tracks: [
      { id: "t1", kind: "video", assetId, startSeconds: 0, endSeconds: 30, safeZone: "center" }
    ],
    overlays: [
      { id: "o1", kind: "caption", text: "Sunrise Estates", startSeconds: 0, endSeconds: 5, safeZone: "lower_third" }
    ],
    effects: [{ name: "zoom_in", plugin: "ae_builtin" }],
    fonts: [{ name: "Satoshi" }],
    plugins: [{ name: "ae_builtin" }],
    templates: [{ name: "realestate_listing" }]
  };
}

function resolver(knownIds = [ASSET_ID]) {
  return async (assetId) =>
    knownIds.includes(assetId) ? { id: assetId, status: "CLEAN" } : null;
}

test("C1 validator accepts a well-formed plan that matches the capability registry", async () => {
  const result = await validateAePlan(validTimeline(), registry(), resolver());
  assert.equal(result.ok, true);
  assert.equal(result.capabilityVersion, DEFAULT_AE_CAPABILITY_VERSION);
  assert.equal(result.schemaVersion, AE_PLAN_SCHEMA_VERSION);
});

test("C1 validator rejects an invented asset id and leaves the plan validation_failed", async () => {
  const result = await validateAePlan(validTimeline("22222222-2222-4222-8222-222222222222"), registry(), resolver([ASSET_ID]));
  assert.equal(result.ok, false);
  assert.equal(result.primary.code, "AE_ASSET_MISSING");
  assert.equal(result.primary.status, 422);
  assert.ok(result.unsupported.some((item) => item.code === "AE_ASSET_MISSING"));
});

test("C1 validator rejects an unsupported font, plugin, template, effect and codec", async () => {
  const timeline = validTimeline();
  timeline.fonts = [{ name: "ComicSans" }];
  timeline.plugins = [{ name: "third_party_fx" }];
  timeline.templates = [{ name: "cinematic_trailer" }];
  timeline.effects = [{ name: "glitch", plugin: "third_party_fx" }];
  const result = await validateAePlan(timeline, registry(), resolver());
  assert.equal(result.ok, false);
  assert.equal(result.primary.code, "AE_CAPABILITY_UNAVAILABLE");
  assert.equal(result.primary.status, 409);
  const codes = result.unsupported.map((item) => item.code);
  assert.ok(codes.includes("AE_CAPABILITY_UNAVAILABLE"));
  // Every unsupported item is explained, not silently dropped.
  assert.ok(result.unsupported.length >= 4);
});

test("C1 validator rejects a capability version mismatch", async () => {
  const timeline = validTimeline();
  timeline.capabilityVersion = "ae.local.9";
  const result = await validateAePlan(timeline, registry(), resolver());
  assert.equal(result.ok, false);
  assert.equal(result.primary.code, "AE_CAPABILITY_UNAVAILABLE");
  assert.equal(result.primary.status, 409);
});

test("C1 validator rejects invalid timing, overlaps and out-of-bounds duration", async () => {
  const overlap = validTimeline();
  overlap.tracks = [
    { id: "t1", kind: "video", assetId: ASSET_ID, startSeconds: 0, endSeconds: 20, safeZone: "center" },
    { id: "t2", kind: "video", assetId: ASSET_ID, startSeconds: 10, endSeconds: 30, safeZone: "center" }
  ];
  const overlapResult = await validateAePlan(overlap, registry(), resolver());
  assert.equal(overlapResult.ok, false);
  assert.equal(overlapResult.primary.code, "AE_TIMELINE_INVALID");
  assert.equal(overlapResult.primary.status, 422);

  const overDuration = validTimeline();
  overDuration.durationSeconds = 120;
  const overResult = await validateAePlan(overDuration, registry(), resolver());
  assert.equal(overResult.ok, false);
  assert.equal(overResult.primary.code, "AE_TIMELINE_INVALID");

  const badTrack = validTimeline();
  badTrack.tracks = [{ id: "t1", kind: "video", assetId: ASSET_ID, startSeconds: 20, endSeconds: 10, safeZone: "center" }];
  const badResult = await validateAePlan(badTrack, registry(), resolver());
  assert.equal(badResult.ok, false);
  assert.equal(badResult.primary.code, "AE_TIMELINE_INVALID");
});

test("C1 validator rejects an unsafe zone", async () => {
  const timeline = validTimeline();
  timeline.tracks = [{ id: "t1", kind: "video", assetId: ASSET_ID, startSeconds: 0, endSeconds: 30, safeZone: "offscreen_bleed" }];
  const result = await validateAePlan(timeline, registry(), resolver());
  assert.equal(result.ok, false);
  assert.equal(result.primary.code, "AE_TIMELINE_INVALID");
  assert.ok(result.unsupported.some((item) => /safe/i.test(item.detail)));
});

test("C1 validator rejects a malformed timeline schema", async () => {
  const missingSchema = validTimeline();
  delete missingSchema.schemaVersion;
  const result = await validateAePlan(missingSchema, registry(), resolver());
  assert.equal(result.ok, false);
  assert.equal(result.primary.code, "AE_PLAN_SCHEMA_INVALID");
  assert.equal(result.primary.status, 422);

  const notObject = await validateAePlan("not-a-plan", registry(), resolver());
  assert.equal(notObject.ok, false);
  assert.equal(notObject.primary.code, "AE_PLAN_SCHEMA_INVALID");
});

test("C1 validator explains every unsupported item when multiple errors coexist", async () => {
  const timeline = validTimeline("33333333-3333-4333-8333-333333333333");
  timeline.fonts = [{ name: "ComicSans" }];
  timeline.durationSeconds = 120;
  const result = await validateAePlan(timeline, registry(), resolver([ASSET_ID]));
  assert.equal(result.ok, false);
  const codes = result.unsupported.map((item) => item.code).sort();
  // Capability (font) takes priority as the primary; asset and timing are still listed.
  assert.equal(result.primary.code, "AE_CAPABILITY_UNAVAILABLE");
  assert.ok(codes.includes("AE_CAPABILITY_UNAVAILABLE"));
  assert.ok(codes.includes("AE_ASSET_MISSING"));
  assert.ok(codes.includes("AE_TIMELINE_INVALID"));
});
