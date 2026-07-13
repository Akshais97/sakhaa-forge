import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarCardState,
  avatarCardLabel,
  classifyAvatarError,
  deriveAvatarCatalogState,
  avatarCatalogMarkup
} from "../../apps/web/src/avatar-workflow.mjs";

test("avatarCardState maps server eligibility reasons to stable UI states", () => {
  assert.equal(avatarCardState({ eligibility: { reason: "eligible" } }), "ready");
  assert.equal(avatarCardState({ eligibility: { reason: "consent_expired" } }), "expired");
  assert.equal(avatarCardState({ eligibility: { reason: "consent_revoked" } }), "revoked");
  assert.equal(avatarCardState({ eligibility: { reason: "consent_required" } }), "consent-missing");
  assert.equal(avatarCardState({ eligibility: { reason: "service_pending" } }), "service-pending");
  assert.equal(avatarCardState(null), "empty");
  assert.equal(avatarCardState({ eligibility: { reason: "unknown_future_reason" } }), "empty");
});

test("avatarCardLabel stays calm and honest without performance claims", () => {
  assert.equal(avatarCardLabel({ eligibility: { reason: "eligible" } }), "Eligible");
  assert.equal(avatarCardLabel({ eligibility: { reason: "consent_expired" } }), "Consent expired");
  assert.equal(avatarCardLabel({ eligibility: { reason: "consent_revoked" } }), "Consent revoked");
  assert.equal(avatarCardLabel({ eligibility: { reason: "consent_required" } }), "Consent missing");
  assert.equal(avatarCardLabel({ eligibility: { reason: "service_pending" } }), "Service pending");
});

test("classifyAvatarError maps catalogue problem codes to workflow states", () => {
  assert.equal(classifyAvatarError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyAvatarError({ code: "BRAND_PROFILE_NOT_APPROVED" }), "blocked-brand");
  assert.equal(classifyAvatarError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyAvatarError({ code: "VALIDATION_FAILED" }), "error");
  assert.equal(classifyAvatarError(null), "error");
  assert.equal(classifyAvatarError({}), "error");
});

test("deriveAvatarCatalogState renders empty, loading, ready and selected states", () => {
  assert.equal(deriveAvatarCatalogState({ phase: "empty" }).banner.state, "empty");
  assert.equal(deriveAvatarCatalogState({ phase: "loading" }).banner.state, "loading");

  const ready = deriveAvatarCatalogState({
    phase: "ready",
    items: [
      avatar("a1", "generic", "eligible"),
      avatar("a2", "real_person", "consent_expired"),
      avatar("a3", "real_person", "consent_revoked")
    ]
  });
  assert.equal(ready.banner.state, "ready");
  assert.match(ready.banner.text, /1 of 3 avatars are eligible/);
  assert.equal(ready.avatars.length, 3);
  assert.equal(ready.avatars[0].state, "ready");
  assert.equal(ready.avatars[0].eligible, true);
  assert.equal(ready.avatars[1].state, "expired");
  assert.equal(ready.avatars[1].eligible, false);
  assert.equal(ready.avatars[2].state, "revoked");

  const selected = deriveAvatarCatalogState({
    phase: "selected",
    items: [avatar("a1", "brand_ambassador", "eligible")],
    selectedAvatarId: "a1"
  });
  assert.equal(selected.banner.state, "success");
  assert.equal(selected.avatars[0].selected, true);
});

test("deriveAvatarCatalogState maps catalogue errors to calm banner states", () => {
  const hidden = deriveAvatarCatalogState({
    phase: "error",
    error: { code: "WORKSPACE_ACCESS_DENIED", detail: "We could not find that item." }
  });
  assert.equal(hidden.banner.state, "blocked-hidden");
  assert.equal(hidden.banner.text, "We could not find that brand profile in this workspace.");

  const forbidden = deriveAvatarCatalogState({
    phase: "error",
    error: { code: "PERMISSION_DENIED" }
  });
  assert.equal(forbidden.banner.state, "forbidden");
});

test("avatarCatalogMarkup renders cards with data-state and disabled select for ineligible avatars", () => {
  const markup = avatarCatalogMarkup(
    deriveAvatarCatalogState({
      phase: "ready",
      items: [
        avatar("a1", "generic", "eligible"),
        avatar("a2", "real_person", "consent_expired")
      ]
    })
  );
  assert.match(markup.banner, /data-state="ready"/);
  assert.match(markup.grid, /data-testid="avatar-card" data-avatar-id="a1" data-state="ready"/);
  assert.match(markup.grid, /data-state="expired"/);
  assert.match(markup.grid, /<button[^>]*disabled[^>]*>Select avatar<\/button>/);
  // Consent evidence never appears in the rendered markup.
  assert.equal(/evidence_ref|evidenceRef|consent:\/\//i.test(markup.grid), false);
});

function avatar(id, kind, reason) {
  return {
    id,
    kind,
    displayName: `Avatar ${id}`,
    likenessScope: "campaign",
    voiceScope: "campaign",
    serviceFulfillmentState: reason === "service_pending" ? "pending" : "fulfilled",
    eligibility: { eligible: reason === "eligible", reason }
  };
}
