import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { runReferenceJourney, buildPilotScorecard } from "../helpers/reference-journey-fixtures.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";
const simulatorSecret = "test-payment-simulator-secret";
const heygenSecret = "test-heygen-simulator-secret";
const metaSecret = "test-meta-simulator-secret";
const youtubeSecret = "test-youtube-simulator-secret";

const baseEnv = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken,
  V0_PAYMENT_SIMULATOR_SECRET: simulatorSecret,
  V0_HEYGEN_SIMULATOR_SECRET: heygenSecret,
  V0_META_SIMULATOR_SECRET: metaSecret,
  V0_YOUTUBE_SIMULATOR_SECRET: youtubeSecret
};

// V0-A3 Standalone Real-Estate Reference Journey. One India-first real-estate workspace goes from
// brand intake through audience-verified publication with V1 and V2 absent, driven entirely through
// the generated V0Client — no manual database edits, no hidden provider retries, no unrecorded file
// movement, no V1/V2 runtime calls and no evidence gaps. The journey retains every production record
// (brand approval, blueprint, selected script, estimate, reservation, provider operation, settled
// ledger, AE plan, final-video hash, review decision, calendar post, external id, public URL,
// audience verification, complete lineage manifest) and assembles a deterministic, founder-reviewed
// pilot scorecard that is honest: it carries only retained IDs, hashes, cost and observations, never
// a virality, reach, conversion or causal performance claim. The journey fixture is shared with the
// prisma-runtime RLS proof in tests/helpers/reference-journey-fixtures.mjs.

test("A3 reference journey completes brand-intake-to-audience-verified-publication without manual DB edits, hidden retries, V1/V2 calls or evidence gaps", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a3-journey") });

    // The entire journey is driven through the generated V0Client against /api/v0 only — no manual
    // database edits, no direct store calls, no hidden retries and no V1/V2 calls.
    const journey = await runReferenceJourney(client, "A3 reference");

    // Every retained production record is present and identified — no evidence gaps.
    assert.ok(journey.workspaceId, "workspace retained");
    assert.ok(journey.brandProfileId, "approved brand profile retained");
    assert.ok(journey.selectedScriptId, "selected script retained");
    assert.ok(journey.avatarProfileId, "consent-safe avatar retained");
    assert.ok(journey.estimateId, "versioned estimate retained");
    assert.ok(journey.jobId, "generation job retained");
    assert.ok(journey.finalVideoId, "final video retained");
    assert.match(journey.finalVideoSha256, /^[0-9a-f]{64}$/, "final-video content hash retained");
    assert.ok(journey.reviewItemId, "review item retained");
    assert.ok(journey.approvalToken, "approval bound to exact final-video version retained");
    assert.ok(journey.postId, "calendar post retained");
    assert.ok(journey.externalId, "external platform id retained");
    assert.ok(journey.publicUrl, "public post URL retained (only once live)");
    assert.ok(journey.verifiedAt, "audience-facing verification retained");
    assert.ok(journey.evidenceArtifactId, "audience evidence artifact retained");

    // The complete creative lineage export is the system-of-record view of the journey.
    const lineage = await client.getLineage(journey.finalVideoId, { workspaceId: journey.workspaceId });
    assert.equal(lineage.status, 200, JSON.stringify(lineage.body));
    assert.equal(lineage.body.status, "complete", "the reference journey leaves no missing ancestry");
    assert.equal(lineage.body.missing.length, 0, "no missing lineage kinds");
    assert.equal(lineage.body.mismatches.length, 0, "no hash mismatches");
    assert.match(lineage.body.manifestSha256, /^[0-9a-f]{64}$/, "a stable lineage manifest hash is retained");

    // The wallet ledger is the financial truth of the journey.
    const ledger = await client.getWalletLedger(journey.walletId, { workspaceId: journey.workspaceId, limit: 100 });
    assert.equal(ledger.status, 200, JSON.stringify(ledger.body));

    // The deterministic pilot scorecard is assembled from the retained records.
    const scorecard = buildPilotScorecard(journey, lineage.body, ledger.body);
    assert.equal(scorecard.slice, "V0-A3");
    assert.equal(scorecard.observationsOnly, true, "the scorecard is observations-only");
    assert.equal(scorecard.v1V2Absent, true, "the scorecard attests V1/V2 are absent");
    assert.deepEqual(scorecard.noClaimOf, ["virality", "reach", "conversion", "causal performance"]);
    assert.equal(scorecard.ledgerReconciliation.reconciled, true, "the ledger reconciles to the wallet balance and the provider total");
    assert.equal(scorecard.lineageStatus, "complete", "the scorecard carries a complete lineage manifest");

    // No secret, signed URL, object key, raw provider payload or cross-workspace reference leaks from
    // the journey, the lineage export, the ledger or the scorecard.
    const leakScan = JSON.stringify({ journey, lineage: lineage.body, ledger: ledger.body, scorecard });
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(leakScan), false);
    // No predictive claim ever surfaces in the retained records. (The scorecard's `noClaimOf` field is
    // the honest declaration of what is NOT claimed, so it is excluded from this scan.)
    const recordScan = JSON.stringify({ journey, lineage: lineage.body, ledger: ledger.body });
    assert.equal(/virality|guaranteed.*reach|conversion|causal/i.test(recordScan), false);
  });
});

test("A3 lineage manifest validates complete ancestry and a stable hash across reads", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a3-manifest") });
    const journey = await runReferenceJourney(client, "A3 manifest");

    const first = await client.getLineage(journey.finalVideoId, { workspaceId: journey.workspaceId });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.status, "complete");
    const second = await client.getLineage(journey.finalVideoId, { workspaceId: journey.workspaceId });
    assert.equal(second.body.manifestSha256, first.body.manifestSha256, "the manifest hash is stable across reads");

    // Every immutable production kind is present in the manifest.
    const kinds = new Set(first.body.entries.map((entry) => entry.kind));
    for (const kind of [
      "brand_profile", "selected_script", "avatar_profile", "estimate", "provider_operation",
      "generated_asset", "composition_instruction", "ae_plan", "render_attempt", "final_video",
      "calendar_post", "post_verification", "performance_snapshot_initial"
    ]) {
      assert.ok(kinds.has(kind), `manifest missing ${kind}`);
    }

    // Each artifact entry carries its public content sha256; the object key never surfaces.
    for (const entry of first.body.entries) {
      if (entry.artifact) {
        assert.match(entry.artifact.sha256, /^[0-9a-f]{64}$/);
        assert.equal("objectKey" in entry.artifact, false, "object key must not surface in the manifest");
      }
    }
  });
});

test("A3 ledger reconciliation — purchase, reservation, capture and provider total reconcile to the wallet balance", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a3-ledger") });
    const journey = await runReferenceJourney(client, "A3 ledger");

    const ledger = await client.getWalletLedger(journey.walletId, { workspaceId: journey.workspaceId, limit: 100 });
    assert.equal(ledger.status, 200, JSON.stringify(ledger.body));
    const ledgerSum = ledger.body.entries.reduce((sum, entry) => sum + entry.amountMinor, 0);

    // The append-only ledger entries sum exactly to the wallet balance (integer minor units, no floats).
    assert.equal(ledgerSum, ledger.body.wallet.balanceMinor, "the ledger is the truth of the wallet balance");

    // One PURCHASE, one RESERVE, one CAPTURE — no duplicate capture, no orphaned release.
    const types = ledger.body.entries.map((entry) => entry.type);
    assert.equal(types.filter((type) => type === "PURCHASE").length, 1, "exactly one purchase");
    assert.equal(types.filter((type) => type === "RESERVE").length, 1, "exactly one reservation");
    assert.equal(types.filter((type) => type === "CAPTURE").length, 1, "exactly one capture");
    assert.equal(types.filter((type) => type === "RELEASE").length, 0, "no release for a captured journey");

    // The lineage cost record reconciles with the ledger: the captured provider total is at most the
    // authorized maximum, and the wallet balance equals the purchase minus the captured provider total.
    const lineage = await client.getLineage(journey.finalVideoId, { workspaceId: journey.workspaceId });
    const providerTotalMinor = lineage.body.cost.providerTotalMinor;
    const purchase = ledger.body.entries.find((entry) => entry.type === "PURCHASE");
    assert.ok(providerTotalMinor <= journey.maximumAuthorizedMinor, "the provider total never exceeds the authorized maximum");
    assert.equal(
      ledger.body.wallet.balanceMinor,
      purchase.amountMinor - providerTotalMinor,
      "the wallet balance equals the purchase minus the captured provider total"
    );
  });
});

test("A3 surfaces the A2 recovery and security reports within the reference journey workspace", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a3-recovery") });
    const journey = await runReferenceJourney(client, "A3 recovery");

    // A2 recovery/security drill 1: consent revocation blocks future avatar use immediately. The
    // journey's avatar is revoked after publication; a subsequent estimate on that avatar is blocked,
    // proving use-after-revocation is refused within the reference journey workspace.
    const revoked = await client.revokeAvatarConsent(journey.avatarProfileId, {
      workspaceId: journey.workspaceId,
      brandProfileId: journey.brandProfileId,
      reason: "Talent withdrew consent after the reference journey."
    });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    assert.equal(revoked.body.avatar.eligibility.reason, "consent_revoked");
    const blockedEstimate = await client.createGenerationEstimate({
      workspaceId: journey.workspaceId,
      brandProfileId: journey.brandProfileId,
      selectedScriptId: journey.selectedScriptId,
      avatarProfileId: journey.avatarProfileId,
      durationSeconds: 30
    });
    assert.equal(blockedEstimate.status, 409, JSON.stringify(blockedEstimate.body));
    assert.equal(blockedEstimate.body.code, "AVATAR_CONSENT_REVOKED");

    // A2 recovery/security drill 2: provider credential rotation never exposes a secret value. A
    // credential is created, rotated, and the prior reference is revoked without surfacing secretRef.
    const stored = await client.createServiceCredential(journey.workspaceId, {
      provider: "heygen",
      purpose: "generation",
      environment: "staging",
      secretRef: "secret-manager://sakhaa/staging/heygen-v1",
      rotationStatus: "ACTIVE"
    });
    assert.equal(stored.status, 201, JSON.stringify(stored.body));
    const rotated = await client.rotateServiceCredential(journey.workspaceId, stored.body.credential.id, {
      secretRef: "secret-manager://sakhaa/staging/heygen-v2",
      reason: "Quarterly rotation after the reference journey."
    });
    assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
    assert.equal(rotated.body.credential.rotationStatus, "ACTIVE");
    assert.equal(rotated.body.previous.rotationStatus, "REVOKED");
    assert.equal(Object.hasOwn(rotated.body.previous, "secretRef"), false, "the prior secret reference never surfaces");
    const PLAINTEXT = /\b(secretValue|apiKey|plaintext|password|accessToken|accessKey|privateKey|clientSecret|sk_live_[A-Za-z0-9]+)\b/i;
    assert.equal(PLAINTEXT.test(JSON.stringify(rotated.body)), false, "no plaintext secret leaks from the rotation report");

    // No plaintext secret value, signed URL, object key, consent evidence ref or cross-workspace
    // reference leaks from the recovery reports. The secret-manager reference (secretRef) is a public
    // pointer, not a secret value, so it is allowed; only plaintext secret-value field names leak.
    const reportScan = JSON.stringify({ revoked: revoked.body, rotated: rotated.body });
    assert.equal(PLAINTEXT.test(reportScan), false, "no plaintext secret value leaks from the rotation report");
    assert.equal(/evidence_ref|evidenceRef|consent:\/\//i.test(reportScan), false, "no consent evidence reference leaks");
    assert.equal(/signed[_-]?url|object[_-]?key/i.test(reportScan), false, "no signed URL or object key leaks");
  });
});

test("A3 V1/V2 absence check — no V1/V2 runtime deps in OpenAPI, Prisma schema or API imports", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  // The test lives at <repoRoot>/tests/integration, so the repo root is two directories up.
  const repoRoot = dirname(dirname(here));

  // 1. The V0 OpenAPI document exposes no V1/V2 routes and no V1/V2 operation ids.
  const openapi = JSON.parse(readFileSync(join(repoRoot, "packages/contracts/src/openapi.v0.json"), "utf8"));
  const paths = Object.keys(openapi.paths || {});
  for (const path of paths) {
    assert.match(path, /^(?!.*\/v[12](\/|$)).*/, `no V1/V2 path segment in openapi: ${path}`);
  }
  const operationIds = [];
  for (const path of paths) {
    for (const method of Object.keys(openapi.paths[path])) {
      const op = openapi.paths[path][method];
      if (op && op.operationId) operationIds.push(op.operationId);
    }
  }
  for (const operationId of operationIds) {
    assert.match(operationId, /^(?!v[12])/i, `no V1/V2 operation id in openapi: ${operationId}`);
  }

  // 2. The Prisma schema maps no V1/V2 tables and declares no V1/V2 models.
  const schema = readFileSync(join(repoRoot, "packages/db/prisma/schema.prisma"), "utf8");
  assert.equal(/\s@@map\("(v1|v2)_/i.test(schema), false, "no V1/V2 table mapping in the Prisma schema");
  assert.equal(/^model\s+(V1|V2)\w*/im.test(schema), false, "no V1/V2 model in the Prisma schema");

  // 3. The API runtime imports no V1/V2 modules.
  const apiSrcDir = join(repoRoot, "apps/api/src");
  const files = listMjsRecursive(apiSrcDir);
  const v1v2Import = /(?:from\s+|import\s*\(\s*)["'][^"']*\/(?:v1|v2)[\/-][^"']*["']/i;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(v1v2Import.test(source), false, `no V1/V2 module import in ${basename(file)}`);
  }
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

function listMjsRecursive(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMjsRecursive(full));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}

function basename(file) {
  const parts = file.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1];
}
