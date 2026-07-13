import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedBrand } from "../helpers/script-tournament-fixtures.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

const env = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken
};

// V0-G1 consent-safe avatar selection. The deterministic consent simulator
// materializes one brand-bound catalog per approved brand profile: an eligible
// generic avatar, an eligible brand ambassador, and real-person avatars that are
// expired, revoked, missing consent evidence or pending service fulfillment.
// Eligibility is derived from consent fields (evidence/expiry/revocation) and
// service-fulfillment state, never stored as a separate enum, and consent
// evidence never reaches the public response or analytics.
test("G1 lists eligible and ineligible avatars with derived consent eligibility and hides consent evidence", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g1-manager") });
    const prepared = await prepareApprovedBrand(client, "G1 eligible");

    const listed = await client.listAvatars({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      limit: 50
    });
    assert.equal(listed.status, 200, JSON.stringify(listed.body));

    const avatars = listed.body.items;
    assert.ok(Array.isArray(avatars));
    assert.ok(avatars.length >= 5, "catalog must materialize the full consent matrix");

    // Response envelope matches the bounded collection contract.
    assert.deepEqual(Object.keys(listed.body.page).sort(), ["limit", "nextCursor"]);
    assert.equal(listed.body.page.limit, 50);

    // Consent evidence is sensitive: it must not appear anywhere in the response.
    const serialized = JSON.stringify(listed.body);
    assert.equal(/evidence_ref|evidenceRef|evidenceReference/i.test(serialized), false);

    for (const avatar of avatars) {
      assert.equal("evidenceRef" in avatar, false);
      assert.equal(avatar.consentEvidence, undefined);
      assert.ok(["generic", "brand_ambassador", "real_person"].includes(avatar.kind));
      assert.ok(
        ["eligible", "consent_required", "consent_expired", "consent_revoked", "service_pending"].includes(
          avatar.eligibility.reason
        )
      );
    }

    const byReason = new Map(avatars.map((avatar) => [avatar.eligibility.reason, avatar]));
    assert.ok(byReason.has("eligible"), "expected at least one eligible avatar");
    assert.ok(byReason.has("consent_expired"), "expected an expired-consent avatar");
    assert.equal(byReason.get("consent_expired").eligibility.eligible, false);
    assert.ok(byReason.has("consent_revoked"), "expected a revoked-consent avatar");
    assert.equal(byReason.get("consent_revoked").eligibility.eligible, false);
    assert.ok(byReason.has("consent_required"), "expected a missing-evidence avatar");
    assert.equal(byReason.get("consent_required").eligibility.eligible, false);
    assert.ok(byReason.has("service_pending"), "expected a service-fulfillment-pending avatar");
    assert.equal(byReason.get("service_pending").eligibility.eligible, false);

    // Generic avatars are labelled honestly and are eligible without real-person consent.
    const generic = avatars.find((avatar) => avatar.kind === "generic");
    assert.ok(generic, "expected a generic avatar");
    assert.equal(generic.eligibility.eligible, true);
    assert.equal(generic.eligibility.reason, "eligible");

    // An eligible brand ambassador carries a non-revoked, unexpired consent record.
    const ambassador = avatars.find(
      (avatar) => avatar.kind === "brand_ambassador" && avatar.eligibility.eligible
    );
    assert.ok(ambassador, "expected an eligible brand ambassador");
    assert.notEqual(ambassador.eligibility.consentExpiresAt, null);
    assert.equal(ambassador.eligibility.consentRevokedAt, null);
  });
});

test("G1 materializes the catalog idempotently and paginates with a cursor", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g1-page") });
    const prepared = await prepareApprovedBrand(client, "G1 page");

    const first = await client.listAvatars({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      limit: 2
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.items.length, 2);
    assert.notEqual(first.body.page.nextCursor, null, "expected a next cursor when more avatars remain");

    const second = await client.listAvatars({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      limit: 50,
      cursor: first.body.page.nextCursor
    });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const firstIds = new Set(first.body.items.map((avatar) => avatar.id));
    const overlapping = second.body.items.filter((avatar) => firstIds.has(avatar.id));
    assert.deepEqual(overlapping, [], "cursor must not repeat the last seen avatar");

    // Re-listing the full catalog returns the same materialized avatar identities
    // (idempotent materialization on first read, not regenerated per call).
    const reread = await client.listAvatars({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      limit: 50
    });
    assert.deepEqual(
      reread.body.items.map((avatar) => avatar.id),
      [...first.body.items, ...second.body.items].map((avatar) => avatar.id)
    );
  });
});

test("G1 hides cross-workspace avatar existence behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("g1-ws-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("g1-ws-b") });
    const preparedA = await prepareApprovedBrand(clientA, "G1 ws A");
    const preparedB = await prepareApprovedBrand(clientB, "G1 ws B");

    // Client A is a member of workspace A but not workspace B. Asking workspace A
    // for the avatars bound to workspace B's brand profile must fail with the same
    // existence-hiding 404 used everywhere else, never a 409 that leaks existence.
    const cross = await clientA.listAvatars({
      workspaceId: preparedA.workspaceId,
      brandProfileId: preparedB.brandProfileId
    });
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");

    // The other workspace's avatar display names must not leak into the error body.
    const own = await clientA.listAvatars({
      workspaceId: preparedA.workspaceId,
      brandProfileId: preparedA.brandProfileId
    });
    assert.equal(own.status, 200);
    for (const avatar of own.body.items) {
      assert.equal(cross.body.detail?.includes(avatar.displayName), false);
    }
    assert.equal(JSON.stringify(cross.body).includes(preparedB.brandProfileId), false);

    // An unauthenticated request is rejected before any catalog work.
    const anonymous = new V0Client({ baseUrl });
    const unauth = await anonymous.listAvatars({
      workspaceId: preparedA.workspaceId,
      brandProfileId: preparedA.brandProfileId
    });
    assert.equal(unauth.status, 401);
  });
});

// V0-G1 backend guard: an avatar that is revoked, expired, missing consent
// evidence or pending service fulfillment must not enter a generation estimate.
// The catalogue eligibility surface is server-truth; the UI disabled state is
// not trusted. Failures return the stable consent codes from the V0 error
// catalog; a missing or cross-workspace avatar is hidden behind the same
// existence-hiding 404 as every other cross-workspace read.
test("G1 rejects ineligible avatars entering generation estimates with stable consent codes", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g1-guard") });
    const prepared = await prepareApprovedBrand(client, "G1 guard");
    const listed = await client.listAvatars({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      limit: 50
    });
    assert.equal(listed.status, 200, JSON.stringify(listed.body));

    const expectations = [
      { reason: "consent_revoked", code: "AVATAR_CONSENT_REVOKED" },
      { reason: "consent_expired", code: "AVATAR_CONSENT_EXPIRED" },
      { reason: "consent_required", code: "AVATAR_CONSENT_REQUIRED" },
      { reason: "service_pending", code: "AVATAR_CONSENT_REQUIRED" }
    ];

    for (const expectation of expectations) {
      const avatar = listed.body.items.find((item) => item.eligibility.reason === expectation.reason);
      assert.ok(avatar, `expected a ${expectation.reason} avatar in the catalogue`);

      const estimate = await client.createGenerationEstimate({
        workspaceId: prepared.workspaceId,
        brandProfileId: prepared.brandProfileId,
        selectedScriptId: "31000000-0000-4000-8000-000000000001",
        avatarProfileId: avatar.id
      });
      assert.equal(estimate.status, 409, `${expectation.reason}: ${JSON.stringify(estimate.body)}`);
      assert.equal(estimate.body.code, expectation.code, expectation.reason);
      // No estimate or audit is returned for a rejected avatar.
      assert.equal(estimate.body.estimate, undefined);
      assert.equal(estimate.body.audit, undefined);
    }
  });
});

test("G1 hides missing and cross-workspace avatar ids behind WORKSPACE_ACCESS_DENIED in generation estimates", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("g1-guard-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("g1-guard-b") });
    const preparedA = await prepareApprovedBrand(clientA, "G1 guard A");
    const preparedB = await prepareApprovedBrand(clientB, "G1 guard B");
    const listedB = await clientB.listAvatars({
      workspaceId: preparedB.workspaceId,
      brandProfileId: preparedB.brandProfileId,
      limit: 50
    });
    assert.equal(listedB.status, 200);
    const foreignAvatar = listedB.body.items[0];
    assert.ok(foreignAvatar, "expected workspace B to materialize avatars");

    // A nonexistent avatar id is hidden behind the same 404 as a cross-workspace
    // avatar; neither leaks that the avatar does not exist.
    const nonexistent = await clientA.createGenerationEstimate({
      workspaceId: preparedA.workspaceId,
      brandProfileId: preparedA.brandProfileId,
      selectedScriptId: "31000000-0000-4000-8000-000000000001",
      avatarProfileId: "41000000-0000-4000-8000-000000000099"
    });
    assert.equal(nonexistent.status, 404);
    assert.equal(nonexistent.body.code, "WORKSPACE_ACCESS_DENIED");

    // A workspace B avatar cannot enter a workspace A estimate.
    const cross = await clientA.createGenerationEstimate({
      workspaceId: preparedA.workspaceId,
      brandProfileId: preparedA.brandProfileId,
      selectedScriptId: "31000000-0000-4000-8000-000000000001",
      avatarProfileId: foreignAvatar.id
    });
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    // The foreign avatar's display name must not leak into the error body.
    assert.equal(JSON.stringify(cross.body).includes(foreignAvatar.displayName), false);
  });
});

test("G1 accepts an eligible avatar into a generation estimate and retains a selection audit", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("g1-audit") });
    const prepared = await prepareApprovedBrand(client, "G1 audit");
    const listed = await client.listAvatars({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      limit: 50
    });
    assert.equal(listed.status, 200);

    const eligible = listed.body.items.find((item) => item.eligibility.eligible === true);
    assert.ok(eligible, "expected at least one eligible avatar");

    const estimate = await client.createGenerationEstimate({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      selectedScriptId: "31000000-0000-4000-8000-000000000001",
      avatarProfileId: eligible.id
    });
    assert.equal(estimate.status, 202, JSON.stringify(estimate.body));
    assert.equal(estimate.body.estimate.avatarProfileId, eligible.id);
    assert.equal(estimate.body.estimate.status, "awaiting_confirmation");

    // Selection is durable: an avatar.selected audit lineage row is retained for
    // the eligible avatar that entered the estimate.
    assert.ok(estimate.body.audit, "expected a selection audit record");
    assert.equal(estimate.body.audit.eventType, "avatar.selected");
    assert.equal(estimate.body.audit.targetType, "AvatarProfile");
    assert.equal(estimate.body.audit.targetId, eligible.id);
    assert.equal(estimate.body.audit.workspaceId, prepared.workspaceId);
    // Consent evidence never reaches the audit record.
    assert.equal(/evidence_ref|evidenceRef|consent:\/\//i.test(JSON.stringify(estimate.body.audit)), false);
  });
});

function signJwt(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: `${userId}@example.test`,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
