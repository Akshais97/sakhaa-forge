import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedFinalVideo } from "../helpers/review-fixtures.mjs";
import { prepareCompleteApprovedFinalVideo } from "../helpers/lineage-fixtures.mjs";

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

// V0-A1 complete creative lineage and performance snapshot. An authorised production role inspects
// and exports the full ancestry from approved brand and blueprint through script, avatar, provider
// operation, generated media, render, review, publication, cost and the initial performance
// observation, as a bounded, redacted, hash-manifested export. Missing ancestry makes the export
// incomplete, a hash mismatch makes it blocked, and a cross-workspace reference is denied — none is
// silently trusted. The performance_collect job creates a fresh immutable PerformanceSnapshot of
// observed (simulated, never predictive) platform metrics and never mutates the initial snapshot.
// No secret, signed URL, object key, raw provider payload or cross-workspace reference leaks.

async function schedulePost(client, approved, { idempotencyKey, platform = "meta", account = "sunrise-estates" } = {}) {
  const created = await client.createCalendarPost(
    {
      workspaceId: approved.workspaceId,
      finalVideoId: approved.finalVideoId,
      approvalToken: approved.approvalToken,
      platform,
      account,
      caption: "New launch at Sunrise Estates.",
      scheduledAt: "2999-01-01T09:00:00+05:30",
      timezone: "Asia/Kolkata",
      manualExport: false
    },
    { idempotencyKey }
  );
  if (created.status !== 202) {
    throw new Error(`schedulePost failed: ${JSON.stringify(created.body)}`);
  }
  return created.body.calendarPost;
}

async function driveToPublishedVerified(client, post, workspaceId) {
  const published = await client.publishCalendarPost(
    post.id,
    { workspaceId, account: post.account },
    { idempotencyKey: `a1-publish-${post.id}` }
  );
  assert.equal(published.status, 202, JSON.stringify(published.body));
  const acknowledged = await client.postPublishingCallback("meta", published.body.callback.envelope, published.body.callback.signature);
  assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
  assert.equal(acknowledged.body.calendarPost.status, "published_unverified");
  const verified = await client.verifyCalendarPost(post.id, { workspaceId });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.calendarPost.status, "published_verified");
  return verified.body;
}

test("A1 exports the complete creative ancestry with cost, timestamps and a stable hash manifest", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a1-lineage") });
    const approved = await prepareCompleteApprovedFinalVideo(client, "A1 lineage");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "a1-schedule-lineage" });
    await driveToPublishedVerified(client, post, workspaceId);

    const lineage = await client.getLineage(approved.finalVideoId, { workspaceId });
    assert.equal(lineage.status, 200, JSON.stringify(lineage.body));
    assert.equal(lineage.body.status, "complete");
    assert.equal(lineage.body.finalVideoId, approved.finalVideoId);

    // Full ancestry: every immutable production record is present and identified.
    const kinds = new Set(lineage.body.entries.map((entry) => entry.kind));
    for (const kind of [
      "brand_profile", "selected_script", "avatar_profile", "estimate", "provider_operation",
      "generated_asset", "composition_instruction", "ae_plan", "render_attempt", "final_video",
      "calendar_post", "post_verification", "performance_snapshot_initial"
    ]) {
      assert.ok(kinds.has(kind), `lineage missing ${kind}`);
    }

    // Cost attribution, source timestamps and provider timestamps are surfaced as observations.
    assert.ok(lineage.body.cost, "cost attribution is present");
    assert.equal(typeof lineage.body.cost.providerTotalMinor, "number");
    assert.equal(typeof lineage.body.cost.estimatedMaximumMinor, "number");
    assert.equal(typeof lineage.body.cost.currency, "string");
    assert.equal(typeof lineage.body.cost.priceVersion, "string");
    assert.ok(lineage.body.providerTimestamps, "provider timestamps are present");
    assert.ok(lineage.body.providerTimestamps.submittedAt, "provider submittedAt is recorded");

    // The manifest sha256 binds the canonical ancestry and is stable across reads.
    assert.ok(typeof lineage.body.manifestSha256 === "string" && lineage.body.manifestSha256.length === 64);
    const reread = await client.getLineage(approved.finalVideoId, { workspaceId });
    assert.equal(reread.body.manifestSha256, lineage.body.manifestSha256);

    // Each artifact entry carries its public content sha256; the object key never surfaces.
    for (const entry of lineage.body.entries) {
      if (entry.artifact) {
        assert.ok(typeof entry.artifact.sha256 === "string" && entry.artifact.sha256.length === 64);
        assert.equal("objectKey" in entry.artifact, false, "object key must not surface");
      }
    }
    // No secret, signed URL, object key, raw provider payload or workspace id of another tenant leaks.
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(lineage.body)), false);
  });
});

test("A1 performance_collect creates a fresh immutable observed snapshot and never mutates the initial snapshot", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a1-perf") });
    const approved = await prepareApprovedFinalVideo(client, "A1 perf");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "a1-schedule-perf" });
    const verified = await driveToPublishedVerified(client, post, workspaceId);

    // The initial snapshot (anchored at verification) carries empty metrics.
    assert.equal(verified.performanceSnapshot.source, "audience_verification_initial");
    assert.deepEqual(verified.performanceSnapshot.metrics, {});

    // Collecting performance creates a NEW immutable snapshot of observed (simulated) metrics.
    const collected = await client.collectPerformance(
      post.id,
      { workspaceId },
      { idempotencyKey: "a1-collect-1" }
    );
    assert.equal(collected.status, 200, JSON.stringify(collected.body));
    const snapshot = collected.body.performanceSnapshot;
    assert.equal(snapshot.source, "performance_collect_simulator");
    assert.equal(snapshot.observation, "simulated");
    assert.ok(snapshot.metrics && typeof snapshot.metrics === "object");
    assert.ok(Object.keys(snapshot.metrics).length > 0, "observed metrics are populated");
    // The observation window is widened beyond the zero-width initial window.
    assert.ok(new Date(snapshot.observationWindowEnd).getTime() >= new Date(snapshot.observationWindowStart).getTime());
    assert.notEqual(snapshot.id, verified.performanceSnapshot.id, "a fresh row, never a mutation of the initial");

    // The initial snapshot is immutable: reading performance shows both, the initial still empty.
    const read = await client.getPerformance(post.id, { workspaceId });
    assert.equal(read.status, 200, JSON.stringify(read.body));
    const snapshots = read.body.snapshots;
    assert.ok(snapshots.length >= 2, "the initial and collected snapshots are both retained");
    const initial = snapshots.find((s) => s.source === "audience_verification_initial");
    assert.deepEqual(initial.metrics, {}, "the initial snapshot metrics are never mutated");
    const collectedRow = snapshots.find((s) => s.source === "performance_collect_simulator");
    assert.ok(collectedRow && Object.keys(collectedRow.metrics).length > 0);

    // A second collect with a fresh key creates another immutable observation; a same-key call replays.
    const second = await client.collectPerformance(post.id, { workspaceId }, { idempotencyKey: "a1-collect-2" });
    assert.equal(second.status, 200);
    assert.notEqual(second.body.performanceSnapshot.id, snapshot.id, "later observations create new rows");
    const replay = await client.collectPerformance(post.id, { workspaceId }, { idempotencyKey: "a1-collect-1" });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replay, true);
    assert.equal(replay.body.performanceSnapshot.id, snapshot.id);
    // No secret, signed URL, object key or raw provider payload leaks; metrics are observations only.
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|virality|reach|conversion/i.test(JSON.stringify(collected.body)), false);
  });
});

test("A1 rejects performance_collect on a not-yet-verified post and requires an idempotency key", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a1-notobs") });
    const approved = await prepareApprovedFinalVideo(client, "A1 notobs");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "a1-schedule-notobs" });
    // Publish to accepted (not yet live/verified). Retain the callback to continue without a
    // second publish (a second publish key would be an idempotency conflict).
    const published = await client.publishCalendarPost(post.id, { workspaceId, account: post.account }, { idempotencyKey: "a1-publish-notobs" });
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.calendarPost.status, "accepted");

    // A not-yet-verified post is not observable.
    const collected = await client.collectPerformance(post.id, { workspaceId }, { idempotencyKey: "a1-collect-notobs" });
    assert.equal(collected.status, 409, JSON.stringify(collected.body));
    assert.equal(collected.body.code, "PERFORMANCE_NOT_OBSERVABLE");

    // Continue the same publish operation to published_verified (ack the callback, then verify).
    const acknowledged = await client.postPublishingCallback("meta", published.body.callback.envelope, published.body.callback.signature);
    assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
    assert.equal(acknowledged.body.calendarPost.status, "published_unverified");
    const verified = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.calendarPost.status, "published_verified");

    // Missing idempotency key on a verified post is rejected.
    const noKey = await client.collectPerformance(post.id, { workspaceId }, {});
    assert.equal(noKey.status, 400);
    assert.equal(noKey.body.code, "IDEMPOTENCY_KEY_REQUIRED");
  });
});

test("A1 denies a cross-workspace lineage export behind WORKSPACE_ACCESS_DENIED without leaking existence", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("a1-owner-ws-a") });
    const approved = await prepareApprovedFinalVideo(ownerClient, "A1 ws A");
    const finalVideoId = approved.finalVideoId;

    // A second workspace owner has no membership in workspace A.
    const otherClient = new V0Client({ baseUrl, authToken: signJwt("a1-owner-ws-b") });
    const otherApproved = await prepareApprovedFinalVideo(otherClient, "A1 ws B");
    const otherWorkspaceId = otherApproved.workspaceId;

    const lineage = await otherClient.getLineage(finalVideoId, { workspaceId: otherWorkspaceId });
    assert.equal(lineage.status, 404, JSON.stringify(lineage.body));
    assert.equal(lineage.body.code, "WORKSPACE_ACCESS_DENIED");
    // The owning workspace id of A never leaks into the response.
    assert.equal(JSON.stringify(lineage.body).includes(approved.workspaceId), false);
  });
});

test("A1 hides a cross-workspace performance read behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("a1-perf-ws-a") });
    const approved = await prepareApprovedFinalVideo(ownerClient, "A1 perf ws A");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(ownerClient, approved, { idempotencyKey: "a1-schedule-perfws" });
    await driveToPublishedVerified(ownerClient, post, workspaceId);

    const otherClient = new V0Client({ baseUrl, authToken: signJwt("a1-perf-ws-b") });
    const otherApproved = await prepareApprovedFinalVideo(otherClient, "A1 perf ws B");
    const read = await otherClient.getPerformance(post.id, { workspaceId: otherApproved.workspaceId });
    assert.equal(read.status, 404, JSON.stringify(read.body));
    assert.equal(read.body.code, "WORKSPACE_ACCESS_DENIED");
  });
});

// A retained final-video whose stored sha256 no longer matches the approved render is an
// evidence-integrity threat no public happy-path behaviour can produce (the AE render validator
// rejects a non-golden output before any final video is retained). The proof mutates the retained
// row directly via a test-only hook (gated to APP_ENV=test) and re-reads through the public lineage
// endpoint, so the mismatch is proven at the API boundary against real retained state — not a
// synthetic UI response.

test("A1 blocks lineage when a retained final-video sha256 no longer matches the render attempt output hash", async () => {
  await withApiServer(baseEnv, async ({ baseUrl, store }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a1-mismatch-fv") });
    const approved = await prepareCompleteApprovedFinalVideo(client, "A1 mismatch fv");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "a1-schedule-mismatch-fv" });
    await driveToPublishedVerified(client, post, workspaceId);

    // Baseline: the retained hashes match, so the export is complete and carries no mismatches.
    const clean = await client.getLineage(approved.finalVideoId, { workspaceId });
    assert.equal(clean.status, 200, JSON.stringify(clean.body));
    assert.equal(clean.body.status, "complete");
    assert.deepEqual(clean.body.mismatches, []);

    // Corrupt the retained final-video sha256 (the audience-facing media integrity threat) and
    // re-read through the public lineage endpoint.
    const corrupted = store.corruptRetainedHashForTest({
      workspaceId,
      finalVideoId: approved.finalVideoId,
      target: "final_video"
    });
    assert.equal(corrupted.ok, true, "test fault injection must target a retained row in this workspace");

    const lineage = await client.getLineage(approved.finalVideoId, { workspaceId });
    assert.equal(lineage.status, 200, JSON.stringify(lineage.body));
    assert.equal(lineage.body.status, "blocked", "a retained hash mismatch makes the export blocked");
    assert.deepEqual(lineage.body.mismatches, ["final_video"]);
    assert.equal(lineage.body.missing.length, 0, "blocked lineage does not claim missing ancestry");
    assert.notEqual(lineage.body.status, "complete", "the manifest never claims complete ancestry under a mismatch");
    // No secret, signed URL, object key, raw provider payload or cross-workspace detail leaks.
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(lineage.body)), false);
    // The blocked export is stable across reads.
    const reread = await client.getLineage(approved.finalVideoId, { workspaceId });
    assert.equal(reread.body.status, "blocked");
    assert.deepEqual(reread.body.mismatches, ["final_video"]);
  });
});

test("A1 blocks lineage when the retained render attempt output hash no longer matches the final video", async () => {
  await withApiServer(baseEnv, async ({ baseUrl, store }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("a1-mismatch-ra") });
    const approved = await prepareCompleteApprovedFinalVideo(client, "A1 mismatch ra");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "a1-schedule-mismatch-ra" });
    await driveToPublishedVerified(client, post, workspaceId);

    // Corrupt the retained render attempt output hash (the other side of the integrity binding).
    const corrupted = store.corruptRetainedHashForTest({
      workspaceId,
      finalVideoId: approved.finalVideoId,
      target: "render_attempt"
    });
    assert.equal(corrupted.ok, true);

    const lineage = await client.getLineage(approved.finalVideoId, { workspaceId });
    assert.equal(lineage.status, 200, JSON.stringify(lineage.body));
    assert.equal(lineage.body.status, "blocked");
    assert.deepEqual(lineage.body.mismatches, ["final_video"]);
    assert.notEqual(lineage.body.status, "complete");
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(lineage.body)), false);
  });
});

test("A1 denies lineage and performance reads to a Reviewer behind PERMISSION_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl, store }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("a1-rev-owner") });
    const approved = await prepareCompleteApprovedFinalVideo(ownerClient, "A1 reviewer");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(ownerClient, approved, { idempotencyKey: "a1-schedule-reviewer" });
    await driveToPublishedVerified(ownerClient, post, workspaceId);

    // Seed a real active REVIEWER membership in the owner's workspace, then exercise the
    // server-side role check at the API boundary.
    const reviewerUserId = "a1-reviewer-user";
    const seeded = store.addMembershipRoleForTest({ workspaceId, userId: reviewerUserId, role: "REVIEWER" });
    assert.equal(seeded.ok, true);
    const reviewerClient = new V0Client({ baseUrl, authToken: signJwt(reviewerUserId) });

    const lineage = await reviewerClient.getLineage(approved.finalVideoId, { workspaceId });
    assert.equal(lineage.status, 403, JSON.stringify(lineage.body));
    assert.equal(lineage.body.code, "PERMISSION_DENIED");

    const performance = await reviewerClient.getPerformance(post.id, { workspaceId });
    assert.equal(performance.status, 403, JSON.stringify(performance.body));
    assert.equal(performance.body.code, "PERMISSION_DENIED");
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
