import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedFinalVideo } from "../helpers/review-fixtures.mjs";

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

// V0-U4 audience-facing verification. Provider acknowledgement alone never becomes success: a
// post that is only accepted (acknowledged but not yet live) is not verifiable and never sends a
// completion notification. Only once the post is live (published_unverified for a provider post,
// or a manual-export post with a supplied live URL) does the deterministic audience verifier
// independently check the target account, media identity (the approved final-video sha256),
// caption, visibility and publish time, and only a verified PostVerification advances the post to
// published_verified and sends exactly one completion notification. Wrong media, wrong account or
// restricted visibility is an explicit non-success (VERIFY_IDENTITY_MISMATCH /
// VERIFY_VISIBILITY_RESTRICTED) and sends no notification. A still-processing platform is
// VERIFY_PROCESSING_WAIT (202) and the caller checks again. A manual-export post with no live URL
// is VERIFY_MANUAL_URL_REQUIRED (409) until the user supplies one. One PostVerification exists per
// calendar post: a second successful verify is a replay (duplicateCollapsed notification) and
// never sends a second notification. The audience evidence artifact is retained with a public
// sha256 (object key omitted); an initial immutable PerformanceSnapshot anchors the observation
// window. No secret, signed URL, object key, recipient user id, payload hash or raw provider
// payload leaks.

async function schedulePost(client, approved, { platform = "meta", account = "sunrise-estates", idempotencyKey, scheduledAt = "2999-01-01T09:00:00+05:30", manualExport = false } = {}) {
  const created = await client.createCalendarPost(
    {
      workspaceId: approved.workspaceId,
      finalVideoId: approved.finalVideoId,
      approvalToken: approved.approvalToken,
      platform,
      account,
      caption: "New launch at Sunrise Estates.",
      scheduledAt: manualExport ? undefined : scheduledAt,
      timezone: "Asia/Kolkata",
      manualExport
    },
    { idempotencyKey }
  );
  if (created.status !== 202) {
    throw new Error(`schedulePost failed: ${JSON.stringify(created.body)}`);
  }
  return created.body.calendarPost;
}

// Drive a provider post to published_unverified (live) by publishing and posting the verified
// completion callback.
async function driveToPublishedUnverified(client, post, workspaceId) {
  const published = await client.publishCalendarPost(
    post.id,
    { workspaceId, account: post.account },
    { idempotencyKey: `u4-publish-${post.id}` }
  );
  assert.equal(published.status, 202, JSON.stringify(published.body));
  const callback = published.body.callback;
  const acknowledged = await client.postPublishingCallback("meta", callback.envelope, callback.signature);
  assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
  assert.equal(acknowledged.body.calendarPost.status, "published_unverified");
  return acknowledged.body;
}

test("U4 never marks a provider-acknowledged-only post verified and sends no completion notification", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u4-ack") });
    const approved = await prepareApprovedFinalVideo(client, "U4 ack");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u4-schedule-ack" });

    // Publish is accepted but the completion callback is NOT posted: the provider acknowledged the
    // post but it is not yet live. Provider acknowledgement alone must never become success.
    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u4-publish-ack" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.calendarPost.status, "accepted");

    const verified = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(verified.status, 202, JSON.stringify(verified.body));
    assert.equal(verified.body.code, "VERIFY_PROCESSING_WAIT");
    assert.ok(verified.body.retryAfterMs && verified.body.retryAfterMs > 0, "a retry-after is surfaced");
    // The post is still accepted, never promoted to published_verified.
    assert.equal(verified.body.calendarPost.status, "accepted");
    // No verification success, no evidence artifact, no completion notification is surfaced.
    assert.equal(verified.body.verification, undefined);
    assert.equal(verified.body.evidenceArtifact, undefined);
    assert.equal(verified.body.notification, undefined);
    assert.equal(verified.body.performanceSnapshot, undefined);
    // No secret, signed URL, object key, recipient user id, payload hash or provider payload leaks.
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(verified.body)), false);
  });
});

test("U4 verifies a live provider post, advances to published_verified and sends one completion notification", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u4-success") });
    const approved = await prepareApprovedFinalVideo(client, "U4 success");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u4-schedule-success" });
    await driveToPublishedUnverified(client, post, workspaceId);

    const verified = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.calendarPost.status, "published_verified");
    assert.equal(verified.body.calendarPost.id, post.id);
    assert.equal(verified.body.replay, false);

    // The PostVerification is the durable audience-facing check: verified status, the bound
    // provider, account/media/caption matches and an evidence artifact reference.
    const verification = verified.body.verification;
    assert.equal(verification.status, "verified");
    assert.equal(verification.provider, "verify-simulator");
    assert.equal(verification.calendarPostId, post.id);
    assert.equal(verification.accountMatched, true);
    assert.equal(verification.mediaSha256Matched, true);
    assert.equal(verification.captionMatched, true);
    assert.equal(verification.visibility, "public");
    assert.ok(verification.verifiedAt, "verifiedAt is recorded");
    assert.ok(verification.evidenceArtifactId, "evidence artifact is bound");

    // The audience evidence artifact surfaces its public sha256 (a content fingerprint) but never
    // its object key.
    const evidence = verified.body.evidenceArtifact;
    assert.ok(evidence.sha256, "evidence artifact sha256 is surfaced");
    assert.equal(evidence.sha256.length, 64, "evidence sha256 is a 64-char hex digest");
    assert.equal(evidence.objectKey, undefined, "the evidence object key never reaches the browser");

    // Exactly one completion notification fires after published_verified, bound to the calendar
    // post. The notification id is a stable dedupe proof; the recipient user id and payload hash
    // never leak.
    const notification = verified.body.notification;
    assert.ok(notification.id, "a completion notification id is surfaced");
    assert.equal(notification.notificationType, "publish_completed");
    assert.equal(notification.channel, "in_app");
    assert.equal(notification.status, "sent");
    assert.equal(notification.duplicateCollapsed, false, "the first verify is not a duplicate");
    assert.equal("recipientUserId" in notification, false, "recipient user id never leaks");
    assert.equal("payloadHash" in notification, false, "payload hash never leaks");

    // An initial immutable PerformanceSnapshot anchors the observation window at verification time.
    const snapshot = verified.body.performanceSnapshot;
    assert.ok(snapshot.id, "an initial performance snapshot is retained");
    assert.equal(snapshot.calendarPostId, post.id);
    assert.ok(snapshot.observationWindowStart, "observation window start is recorded");
    assert.ok(snapshot.observationWindowEnd, "observation window end is recorded");

    // No secret, signed URL, object key, recipient user id, payload hash or raw provider payload.
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|recipient[_-]?user/i.test(JSON.stringify(verified.body)), false);
  });
});

test("U4 rejects a wrong-media identity mismatch with VERIFY_IDENTITY_MISMATCH and sends no completion notification", async () => {
  const env = { ...baseEnv, V0_VERIFY_SIMULATOR_MODE: "identity_mismatch" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u4-mismatch") });
    const approved = await prepareApprovedFinalVideo(client, "U4 mismatch");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u4-schedule-mismatch" });
    await driveToPublishedUnverified(client, post, workspaceId);

    const verified = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(verified.status, 409, JSON.stringify(verified.body));
    assert.equal(verified.body.code, "VERIFY_IDENTITY_MISMATCH");
    // Wrong media/account never promotes the post and never sends a completion notification.
    assert.equal(verified.body.calendarPost, undefined);
    assert.equal(verified.body.notification, undefined);
    assert.equal(verified.body.evidenceArtifact, undefined);

    // The post stays published_unverified (never collapsed to a silent success or a different
    // state). Re-publishing with the original idempotency key is a clean replay; a different key on
    // an already-published post is an IDEMPOTENCY_INPUT_CONFLICT, never a silent second publish.
    const reread = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: `u4-publish-${post.id}` }
    );
    assert.equal(reread.status, 202);
    assert.equal(reread.body.replay, true);
    assert.equal(reread.body.calendarPost.status, "published_unverified");
  });
});

test("U4 rejects a restricted-visibility post with VERIFY_VISIBILITY_RESTRICTED and keeps it unverified", async () => {
  const env = { ...baseEnv, V0_VERIFY_SIMULATOR_MODE: "visibility_restricted" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u4-vis") });
    const approved = await prepareApprovedFinalVideo(client, "U4 vis");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u4-schedule-vis" });
    await driveToPublishedUnverified(client, post, workspaceId);

    const verified = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(verified.status, 409, JSON.stringify(verified.body));
    assert.equal(verified.body.code, "VERIFY_VISIBILITY_RESTRICTED");
    assert.equal(verified.body.notification, undefined);
  });
});

test("U4 models delayed processing: a still-processing platform is VERIFY_PROCESSING_WAIT then verifies on a later check", async () => {
  // First attempt: the platform has not propagated the live post yet.
  let mode = "processing";
  const env = { ...baseEnv, get V0_VERIFY_SIMULATOR_MODE() { return mode; } };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u4-delayed") });
    const approved = await prepareApprovedFinalVideo(client, "U4 delayed");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u4-schedule-delayed" });
    await driveToPublishedUnverified(client, post, workspaceId);

    const first = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(first.status, 202, JSON.stringify(first.body));
    assert.equal(first.body.code, "VERIFY_PROCESSING_WAIT");
    assert.equal(first.body.calendarPost.status, "published_unverified", "the post stays unverified while processing");
    assert.equal(first.body.notification, undefined, "no completion notification while processing");
    assert.ok(first.body.verification, "a verification attempt record is retained");
    assert.equal(first.body.verification.status, "processing_wait");
    assert.ok(first.body.verification.attempts >= 1, "the attempt is counted");

    // Propagation completes: a later check verifies the live post and sends the one notification.
    mode = "success";
    const second = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.calendarPost.status, "published_verified");
    assert.equal(second.body.verification.status, "verified");
    assert.equal(second.body.verification.attempts, 2, "attempts accumulate across the bounded retries");
    assert.equal(second.body.notification.duplicateCollapsed, false);
  });
});

test("U4 supports the manual URL verification journey", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u4-manual") });
    const approved = await prepareApprovedFinalVideo(client, "U4 manual");
    const workspaceId = approved.workspaceId;
    // A manual-export post is created APPROVED with no scheduledAt and no live URL yet.
    const post = await schedulePost(client, approved, { manualExport: true, idempotencyKey: "u4-schedule-manual" });
    assert.equal(post.status, "approved");
    assert.equal(post.manualLiveUrl, null);

    // Verifying without a live URL is an explicit non-success requiring input.
    const withoutUrl = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(withoutUrl.status, 409, JSON.stringify(withoutUrl.body));
    assert.equal(withoutUrl.body.code, "VERIFY_MANUAL_URL_REQUIRED");
    assert.equal(withoutUrl.body.notification, undefined);

    // Supplying the live URL verifies the manually published post and binds manualLiveUrl.
    const withUrl = await client.verifyCalendarPost(post.id, { workspaceId, manualLiveUrl: "https://meta.example.test/p/manual-sunrise-estates" });
    assert.equal(withUrl.status, 200, JSON.stringify(withUrl.body));
    assert.equal(withUrl.body.calendarPost.status, "published_verified");
    assert.equal(withUrl.body.calendarPost.manualLiveUrl, "https://meta.example.test/p/manual-sunrise-estates");
    assert.ok(withUrl.body.calendarPost.manualUrlProvidedAt, "manualUrlProvidedAt is recorded");
    assert.equal(withUrl.body.verification.status, "verified");
    assert.equal(withUrl.body.notification.notificationType, "publish_completed");
  });
});

test("U4 deduplicates completion notifications across repeated successful verifies", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u4-dedupe") });
    const approved = await prepareApprovedFinalVideo(client, "U4 dedupe");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u4-schedule-dedupe" });
    await driveToPublishedUnverified(client, post, workspaceId);

    const first = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.replay, false);
    const verificationId = first.body.verification.id;
    const notificationId = first.body.notification.id;
    assert.equal(first.body.notification.duplicateCollapsed, false);

    // A second successful verify is a replay: the same PostVerification, the same logical
    // notification (duplicateCollapsed), and never a second send.
    const second = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.replay, true);
    assert.equal(second.body.verification.id, verificationId, "one PostVerification per calendar post");
    assert.equal(second.body.notification.id, notificationId, "one logical notification per payload");
    assert.equal(second.body.notification.duplicateCollapsed, true, "the repeated verify collapses to the existing notification");
    assert.equal(second.body.calendarPost.status, "published_verified");
  });
});

test("U4 retains the audience evidence reference and never leaks the object key or recipient", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u4-evidence") });
    const approved = await prepareApprovedFinalVideo(client, "U4 evidence");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u4-schedule-evidence" });
    await driveToPublishedUnverified(client, post, workspaceId);

    const verified = await client.verifyCalendarPost(post.id, { workspaceId });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    // The evidence artifact is the audience-facing evidence reference: a public sha256 content
    // fingerprint, the schema version and retention class, with the object key omitted.
    const evidence = verified.body.evidenceArtifact;
    assert.ok(evidence.sha256);
    assert.equal(evidence.schemaVersion, "calendar.verify_evidence.v1");
    assert.equal(evidence.retentionClass, "audience-evidence");
    assert.equal(evidence.status, "CLEAN");
    assert.equal(evidence.objectKey, undefined);
    // The verification record references the same evidence artifact.
    assert.equal(verified.body.verification.evidenceArtifactId, evidence.id);
  });
});

test("U4 hides a cross-workspace verify behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("u4-wsA") });
    const approved = await prepareApprovedFinalVideo(ownerClient, "U4 wsA");
    const workspaceA = approved.workspaceId;
    const post = await schedulePost(ownerClient, approved, { idempotencyKey: "u4-schedule-wsA" });
    await driveToPublishedUnverified(ownerClient, post, workspaceA);

    const otherClient = new V0Client({ baseUrl, authToken: signJwt("u4-wsB") });
    const otherWorkspace = await otherClient.createWorkspace(
      { name: "U4 wsB" },
      { idempotencyKey: "u4-wsB-create" }
    );
    const workspaceB = otherWorkspace.body.workspace.id;

    const cross = await otherClient.verifyCalendarPost(post.id, { workspaceId: workspaceB });
    assert.equal(cross.status, 404, JSON.stringify(cross.body));
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    // The owning workspace id never leaks.
    assert.equal(JSON.stringify(cross.body).includes(workspaceA), false);
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
