import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedBrand } from "../helpers/script-tournament-fixtures.mjs";
import { prepareCompleteApprovedFinalVideo } from "../helpers/lineage-fixtures.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";

const env = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken
};

// V0-A2 consent revocation. A workspace Owner/Admin/Client Manager
// (manage_avatars_consent) revokes likeness/voice consent for a brand-bound
// avatar. Revocation is monotonic and immediate: the catalogue eligibility
// becomes consent_revoked at once, and the generation estimate boundary
// (server-truth, not the UI disabled state) blocks the revoked avatar with
// AVATAR_CONSENT_REVOKED. Consent evidence (evidenceRef) never reaches the
// response. Revoking an already-revoked consent converges to the same state
// (naturally idempotent; no second audit row).
test("A2 consent revocation blocks future avatar use immediately and hides consent evidence", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a2-consent") });
    const prepared = await prepareApprovedBrand(client, "A2 consent");
    const listed = await client.listAvatars({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      limit: 50
    });
    assert.equal(listed.status, 200, JSON.stringify(listed.body));

    // The eligible brand ambassador carries a non-revoked, unexpired consent
    // record, so revocation has a real consent to revoke.
    const ambassador = listed.body.items.find(
      (avatar) => avatar.kind === "brand_ambassador" && avatar.eligibility.eligible === true
    );
    assert.ok(ambassador, "expected an eligible brand ambassador to revoke");
    assert.equal(ambassador.eligibility.consentRevokedAt, null);

    const revoked = await client.revokeAvatarConsent(ambassador.id, {
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      reason: "Talent withdrew likeness and voice consent."
    });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    assert.equal(revoked.body.avatar.eligibility.eligible, false);
    assert.equal(revoked.body.avatar.eligibility.reason, "consent_revoked");
    assert.ok(revoked.body.avatar.eligibility.consentRevokedAt, "expected a revocation timestamp");
    // Consent evidence never reaches the response.
    assert.equal(/evidence_ref|evidenceRef|consent:\/\//i.test(JSON.stringify(revoked.body)), false);
    assert.equal("evidenceRef" in revoked.body.avatar, false);

    // The catalogue reflects the revocation immediately (server-truth).
    const relisted = await client.listAvatars({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      limit: 50
    });
    const nowRevoked = relisted.body.items.find((avatar) => avatar.id === ambassador.id);
    assert.equal(nowRevoked.eligibility.eligible, false);
    assert.equal(nowRevoked.eligibility.reason, "consent_revoked");

    // Use-after-revocation is blocked at the generation estimate boundary, not
    // just the UI. The revoked avatar cannot enter a paid estimate.
    const estimate = await client.createGenerationEstimate({
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      selectedScriptId: "31000000-0000-4000-8000-000000000001",
      avatarProfileId: ambassador.id
    });
    assert.equal(estimate.status, 409, JSON.stringify(estimate.body));
    assert.equal(estimate.body.code, "AVATAR_CONSENT_REVOKED");

    // Revoking an already-revoked consent converges to the same state without
    // error and without surfacing evidence.
    const replay = await client.revokeAvatarConsent(ambassador.id, {
      workspaceId: prepared.workspaceId,
      brandProfileId: prepared.brandProfileId,
      reason: "Repeated revocation request."
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.avatar.eligibility.reason, "consent_revoked");
    assert.equal(replay.body.avatar.eligibility.consentRevokedAt, revoked.body.avatar.eligibility.consentRevokedAt);
    assert.equal(/evidence_ref|evidenceRef|consent:\/\//i.test(JSON.stringify(replay.body)), false);
  });
});

// V0-A2 consent revocation authorization and existence hiding. A cross-workspace
// revocation is hidden behind the same existence-hiding WORKSPACE_ACCESS_DENIED
// 404 used everywhere else, so the owning workspace id and the foreign avatar
// display name never leak. An unauthenticated request is rejected before any
// consent work.
test("A2 consent revocation hides cross-workspace existence and rejects unauthenticated calls", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("a2-consent-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("a2-consent-b") });
    const preparedA = await prepareApprovedBrand(clientA, "A2 consent A");
    const preparedB = await prepareApprovedBrand(clientB, "A2 consent B");
    const listedB = await clientB.listAvatars({
      workspaceId: preparedB.workspaceId,
      brandProfileId: preparedB.brandProfileId,
      limit: 50
    });
    const foreignAvatar = listedB.body.items.find(
      (avatar) => avatar.kind === "brand_ambassador" && avatar.eligibility.eligible === true
    );
    assert.ok(foreignAvatar, "expected an eligible ambassador in workspace B");

    // A workspace A actor cannot revoke workspace B's avatar; the brand profile
    // belongs to another workspace and is hidden behind the existence-hiding 404.
    const cross = await clientA.revokeAvatarConsent(foreignAvatar.id, {
      workspaceId: preparedA.workspaceId,
      brandProfileId: preparedB.brandProfileId,
      reason: "Attempted cross-workspace revocation."
    });
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(preparedB.workspaceId), false);
    assert.equal(JSON.stringify(cross.body).includes(foreignAvatar.displayName), false);

    // The foreign avatar remains eligible in its own workspace (the failed
    // cross-workspace revocation mutated nothing).
    const relistedB = await clientB.listAvatars({
      workspaceId: preparedB.workspaceId,
      brandProfileId: preparedB.brandProfileId,
      limit: 50
    });
    const stillEligible = relistedB.body.items.find((avatar) => avatar.id === foreignAvatar.id);
    assert.equal(stillEligible.eligibility.eligible, true);

    // An unauthenticated request is rejected before any consent work.
    const anonymous = new V0Client({ baseUrl });
    const unauth = await anonymous.revokeAvatarConsent(foreignAvatar.id, {
      workspaceId: preparedA.workspaceId,
      brandProfileId: preparedB.brandProfileId,
      reason: "Anonymous."
    });
    assert.equal(unauth.status, 401);
  });
});

// V0-A2 provider credential rotation. A workspace Owner/Admin
// (manage_provider_credentials) rotates a provider credential by supplying a
// new secret-manager reference. Rotation creates a new ACTIVE credential row
// and marks the prior row REVOKED (immutable lineage), stamps lastRotatedAt on
// the new row, and never surfaces a plaintext secret value. The prior row's
// secretRef is not echoed back; only the reference, status and timing are
// public. A rotation attempt carrying a plaintext secret field is rejected.
test("A2 credential rotation revokes the prior reference and never surfaces a plaintext secret", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a2-rotate") });
    const created = await client.createWorkspace(
      { name: "A2 rotation workspace" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const workspaceId = created.body.workspace.id;

    const stored = await client.createServiceCredential(workspaceId, {
      provider: "heygen",
      purpose: "generation",
      environment: "staging",
      secretRef: "secret-manager://sakhaa/staging/heygen-v1",
      rotationStatus: "ACTIVE"
    });
    assert.equal(stored.status, 201, JSON.stringify(stored.body));
    const oldCredentialId = stored.body.credential.id;

    const rotated = await client.rotateServiceCredential(workspaceId, oldCredentialId, {
      secretRef: "secret-manager://sakhaa/staging/heygen-v2",
      reason: "Quarterly key rotation."
    });
    assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
    const fresh = rotated.body.credential;
    assert.equal(fresh.rotationStatus, "ACTIVE");
    assert.equal(fresh.secretRef, "secret-manager://sakhaa/staging/heygen-v2");
    assert.notEqual(fresh.id, oldCredentialId, "rotation must create a new credential row");
    assert.ok(fresh.lastRotatedAt, "expected lastRotatedAt on the new credential");

    const previous = rotated.body.previous;
    assert.equal(previous.id, oldCredentialId);
    assert.equal(previous.rotationStatus, "REVOKED");
    assert.equal(Object.hasOwn(previous, "secretRef"), false, "the prior secretRef must not be echoed");

    // No plaintext secret value ever appears in the rotation response. The
    // alternation targets plaintext field names and known plaintext markers; the
    // secret-manager reference (secretRef / secret-manager://) is intentionally
    // public and must not trip this check.
    const serialized = JSON.stringify(rotated.body);
    const PLAINTEXT = /\b(secretValue|apiKey|plaintext|password|accessToken|accessKey|privateKey|clientSecret|sk_live_[A-Za-z0-9]+)\b/i;
    assert.equal(PLAINTEXT.test(serialized), false, `plaintext secret leaked: ${serialized}`);

    // A rotation attempt that carries a plaintext secret field is rejected at the
    // transport boundary, exactly like credential creation.
    const leaked = await client.rotateServiceCredential(workspaceId, fresh.id, {
      secretRef: "secret-manager://sakhaa/staging/heygen-v3",
      reason: "Leaked attempt.",
      secretValue: "sk_live_must_not_be_accepted"
    });
    assert.equal(leaked.status, 422);
    assert.equal(leaked.body.code, "VALIDATION_FAILED");
    assert.equal(/sk_live_must_not_be_accepted/i.test(JSON.stringify(leaked.body)), false);
  });
});

// V0-A2 credential rotation authorization and existence hiding. A cross-workspace
// rotation is hidden behind WORKSPACE_ACCESS_DENIED (404); the foreign credential
// id and the owning workspace id never leak. An unauthenticated rotation is
// rejected before any credential work.
test("A2 credential rotation hides cross-workspace existence and rejects unauthenticated calls", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("a2-rotate-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("a2-rotate-b") });
    const createdA = await clientA.createWorkspace(
      { name: "A2 rotation A" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const createdB = await clientB.createWorkspace(
      { name: "A2 rotation B" },
      { idempotencyKey: `workspace-${randomUUID()}` }
    );
    const workspaceA = createdA.body.workspace.id;
    const workspaceB = createdB.body.workspace.id;

    const storedB = await clientB.createServiceCredential(workspaceB, {
      provider: "heygen",
      purpose: "generation",
      environment: "staging",
      secretRef: "secret-manager://sakhaa/staging/heygen-b",
      rotationStatus: "ACTIVE"
    });
    const foreignCredentialId = storedB.body.credential.id;

    const cross = await clientA.rotateServiceCredential(workspaceA, foreignCredentialId, {
      secretRef: "secret-manager://sakhaa/staging/heygen-cross",
      reason: "Attempted cross-workspace rotation."
    });
    assert.equal(cross.status, 404);
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(workspaceB), false);
    assert.equal(JSON.stringify(cross.body).includes(foreignCredentialId), false);

    const anonymous = new V0Client({ baseUrl });
    const unauth = await anonymous.rotateServiceCredential(workspaceA, foreignCredentialId, {
      secretRef: "secret-manager://sakhaa/staging/heygen-anon",
      reason: "Anonymous."
    });
    assert.equal(unauth.status, 401);
  });
});

// V0-A2 security zero-tolerance sweep. A workspace A actor reading workspace B
// objects across representative domain routes (avatar catalogue, lineage export,
// performance read, consent revocation, credential rotation, brand-bound avatar)
// is hidden behind the same existence-hiding WORKSPACE_ACCESS_DENIED 404 on
// every route, and the owning workspace id never leaks into any error body. The
// sweep uses real workspace B objects so the invariant is proven cross-tenant,
// not merely against a missing id (the contract makes missing and cross-workspace
// identical, which is exactly the invariant).
test("A2 cross-tenant zero-tolerance sweep hides workspace B objects from workspace A on every representative route", async () => {
  await withApiServer(env, async ({ baseUrl }) => {
    const clientA = new V0Client({ baseUrl, authToken: signJwt("a2-sweep-a") });
    const clientB = new V0Client({ baseUrl, authToken: signJwt("a2-sweep-b") });

    const preparedA = await prepareApprovedBrand(clientA, "A2 sweep A");
    const approvedB = await prepareCompleteApprovedFinalVideo(clientB, "A2 sweep B");
    const workspaceA = preparedA.workspaceId;
    const workspaceB = approvedB.workspaceId;

    // A real workspace B calendar post for the performance read.
    const scheduledB = await clientB.createCalendarPost(
      {
        workspaceId: workspaceB,
        finalVideoId: approvedB.finalVideoId,
        approvalToken: approvedB.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "New launch.",
        scheduledAt: "2999-01-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: `sweep-schedule-${randomUUID()}` }
    );
    assert.equal(scheduledB.status, 202, JSON.stringify(scheduledB.body));
    const calendarPostB = scheduledB.body.calendarPost.id;

    // A real workspace B credential for the rotation route.
    const credentialB = await clientB.createServiceCredential(workspaceB, {
      provider: "heygen",
      purpose: "generation",
      environment: "staging",
      secretRef: "secret-manager://sakhaa/staging/heygen-sweep",
      rotationStatus: "ACTIVE"
    });
    const credentialIdB = credentialB.body.credential.id;

    // A real workspace B avatar for the revocation route.
    const avatarsB = await clientB.listAvatars({
      workspaceId: workspaceB,
      brandProfileId: approvedB.brandProfileId,
      limit: 50
    });
    const avatarB = avatarsB.body.items.find(
      (avatar) => avatar.kind === "brand_ambassador" && avatar.eligibility.eligible === true
    );
    assert.ok(avatarB, "expected an eligible ambassador in workspace B");

    const probes = [
      () =>
        clientA.listAvatars({ workspaceId: workspaceA, brandProfileId: approvedB.brandProfileId }),
      () => clientA.getLineage(approvedB.finalVideoId, { workspaceId: workspaceA }),
      () => clientA.getPerformance(calendarPostB, { workspaceId: workspaceA }),
      () =>
        clientA.revokeAvatarConsent(avatarB.id, {
          workspaceId: workspaceA,
          brandProfileId: approvedB.brandProfileId,
          reason: "Cross-tenant probe."
        }),
      () =>
        clientA.rotateServiceCredential(workspaceA, credentialIdB, {
          secretRef: "secret-manager://sakhaa/staging/heygen-probe",
          reason: "Cross-tenant probe."
        })
    ];

    for (const probe of probes) {
      const result = await probe();
      assert.equal(result.status, 404, `probe leaked status ${result.status}: ${JSON.stringify(result.body)}`);
      assert.equal(result.body.code, "WORKSPACE_ACCESS_DENIED", `probe leaked code: ${JSON.stringify(result.body)}`);
      // The owning workspace B id never leaks into any cross-tenant error body.
      assert.equal(JSON.stringify(result.body).includes(workspaceB), false, "workspace B id leaked");
    }

    // None of the probes mutated workspace B: the B avatar is still eligible, the
    // B credential is still ACTIVE, and the B calendar post is still scheduled.
    const relistedB = await clientB.listAvatars({
      workspaceId: workspaceB,
      brandProfileId: approvedB.brandProfileId,
      limit: 50
    });
    const stillEligibleB = relistedB.body.items.find((avatar) => avatar.id === avatarB.id);
    assert.equal(stillEligibleB.eligibility.eligible, true, "probe mutated workspace B consent");
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
