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

// V0-U3 idempotent YouTube Shorts publication. An authorised production role
// (schedule_publish_approved_media: Owner/Admin/Client Manager) publishes the same approved
// internal publication contract to YouTube Shorts as V0-U2 publishes to Meta, with quota-aware
// behaviour and one external post identity. The provider is derived server-side from the calendar
// post's platform ("youtube-shorts"); the request carries no provider field. A durable
// PublishOperation is persisted BEFORE the YouTube network I/O so a crash between persistence and
// the network response leaves a resumable operation, never a blind duplicate. Upload-quota
// exhaustion (3 uploads/day per client) is a pre-flight: the adapter refuses submission with
// PUBLISH_QUOTA_EXHAUSTED (429) and a retry-after BEFORE any network I/O and writes no operation
// row, so quota failure never creates a duplicate or corrupts the Meta/manual paths. A YouTube
// upload is accepted then processed: the operation moves ACCEPTED -> PROCESSING while the post
// stays accepted, and a verified callback or reconciliation drives it to COMPLETED with the public
// short URL bound. A timeout after possible acceptance is unknown and the caller reconciles
// before any retry. The YouTube callback is signature-verified in constant time
// (x-youtube-signature), windowed and deduplicated by (workspace, source, eventId); a replay
// never transitions a second time. The wrong-account check rejects a publish whose body account
// does not match the calendar post's bound account. A platform without a V0 publish adapter is
// rejected with PUBLISH_PLATFORM_UNSUPPORTED. Cross-workspace publishes hide behind
// WORKSPACE_ACCESS_DENIED. Signed URLs, object keys, secrets, the request hash and raw provider
// payloads never leak; the public short URL is the only URL surfaced and only once the post is
// live.

async function scheduleYouTubePost(client, approved, { account = "sunrise-estates-yt", idempotencyKey, scheduledAt = "2999-01-01T09:00:00+05:30" } = {}) {
  const created = await client.createCalendarPost(
    {
      workspaceId: approved.workspaceId,
      finalVideoId: approved.finalVideoId,
      approvalToken: approved.approvalToken,
      platform: "youtube-shorts",
      account,
      caption: "New launch at Sunrise Estates. #realestate #mumbai #shorts",
      scheduledAt,
      timezone: "Asia/Kolkata",
      manualExport: false
    },
    { idempotencyKey }
  );
  if (created.status !== 202) {
    throw new Error(`scheduleYouTubePost failed: ${JSON.stringify(created.body)}`);
  }
  return created.body.calendarPost;
}

async function schedulePost(client, approved, { platform = "meta", account = "sunrise-estates", idempotencyKey, scheduledAt = "2999-01-01T09:00:00+05:30" } = {}) {
  const created = await client.createCalendarPost(
    {
      workspaceId: approved.workspaceId,
      finalVideoId: approved.finalVideoId,
      approvalToken: approved.approvalToken,
      platform,
      account,
      caption: "New launch at Sunrise Estates.",
      scheduledAt,
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

test("U3 publishes an approved scheduled calendar post to YouTube Shorts exactly once and a verified callback drives it to published_unverified", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-success") });
    const approved = await prepareApprovedFinalVideo(client, "U3 success");
    const workspaceId = approved.workspaceId;
    const post = await scheduleYouTubePost(client, approved, { idempotencyKey: "u3-schedule-success" });

    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-1" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.calendarPost.status, "accepted");
    assert.equal(published.body.calendarPost.id, post.id);
    assert.equal(published.body.operation.status, "accepted");
    assert.equal(published.body.operation.provider, "youtube-simulator");
    assert.equal(published.body.operation.calendarPostId, post.id);
    assert.ok(published.body.operation.externalId, "youtube external post id is bound");
    assert.equal(published.body.operation.publicUrl, null, "public short URL is not known until the post is live");
    // The request hash is a server-side binding secret and must not leak.
    assert.equal("requestHash" in published.body.operation, false);
    // No secret, signed URL, object key or credential leaks.
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|credential/i.test(JSON.stringify(published.body)), false);

    // The simulator surfaces a signed callback envelope (x-youtube-signature) carrying the public
    // short URL for the deterministic test to post back.
    const callback = published.body.callback;
    assert.ok(callback?.envelope, "simulator surfaces a callback envelope");
    assert.ok(callback?.signature, "simulator surfaces a callback signature");
    assert.ok(callback.envelope.publicUrl, "the callback carries the public short URL");

    const acknowledged = await client.postPublishingCallback("youtube", callback.envelope, callback.signature);
    assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
    assert.equal(acknowledged.body.operation.status, "completed");
    assert.equal(acknowledged.body.calendarPost.status, "published_unverified");
    assert.ok(acknowledged.body.operation.publicUrl, "public short URL is bound once the post is live");
    assert.ok(acknowledged.body.operation.publicUrl.startsWith("https://youtube.example.test/shorts/"), "youtube public URL format");
    assert.ok(acknowledged.body.operation.completedAt, "completedAt is recorded");
    assert.equal(acknowledged.body.duplicate, false);

    // A replay of the same callback is deduplicated and never transitions a second time.
    const replay = await client.postPublishingCallback("youtube", callback.envelope, callback.signature);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate, true);

    // A replay of the same publish idempotency key returns the existing operation and never calls
    // the provider again.
    const resubmit = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-1" }
    );
    assert.equal(resubmit.status, 202);
    assert.equal(resubmit.body.replay, true);
    assert.equal(resubmit.body.operation.id, published.body.operation.id);
  });
});

test("U3 rejects an upload-quota-exhausted publish with PUBLISH_QUOTA_EXHAUSTED and a retry-after and writes no operation", async () => {
  const env = { ...baseEnv, V0_YOUTUBE_SIMULATOR_QUOTA: "exhausted" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-quota") });
    const approved = await prepareApprovedFinalVideo(client, "U3 quota");
    const workspaceId = approved.workspaceId;
    const post = await scheduleYouTubePost(client, approved, { idempotencyKey: "u3-schedule-quota" });

    const exhausted = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-quota" }
    );
    assert.equal(exhausted.status, 429, JSON.stringify(exhausted.body));
    assert.equal(exhausted.body.code, "PUBLISH_QUOTA_EXHAUSTED");
    assert.ok(exhausted.body.retryAfterMs && exhausted.body.retryAfterMs > 0, "a retry-after is surfaced");
    // No operation or calendar post is returned for a pre-flight quota refusal.
    assert.equal(exhausted.body.operation, undefined);
    assert.equal(exhausted.body.calendarPost, undefined);
    assert.equal(exhausted.body.callback, undefined, "no callback is surfaced for a quota refusal");
  });
});

test("U3 models delayed upload processing: accepted -> processing -> completed via callback and reconcile", async () => {
  const env = { ...baseEnv, V0_YOUTUBE_SIMULATOR_MODE: "processing" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-processing") });
    const approved = await prepareApprovedFinalVideo(client, "U3 processing");
    const workspaceId = approved.workspaceId;
    const post = await scheduleYouTubePost(client, approved, { idempotencyKey: "u3-schedule-processing" });

    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-processing" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    // The upload was accepted; the provider is still processing. The operation sits in processing
    // while the post stays accepted (the post-level enum has no processing).
    assert.equal(published.body.operation.status, "processing");
    assert.equal(published.body.calendarPost.status, "accepted");
    assert.ok(published.body.operation.externalId, "external id is bound on acceptance");
    assert.ok(published.body.operation.acceptedAt, "acceptedAt is recorded on acceptance");
    assert.equal(published.body.operation.publicUrl, null, "no public URL while processing");

    // The simulator surfaces a publish.processing callback (no public URL yet).
    const callback = published.body.callback;
    assert.ok(callback?.envelope, "simulator surfaces a callback envelope");
    assert.equal(callback.envelope.eventType, "publish.processing");

    const acknowledged = await client.postPublishingCallback("youtube", callback.envelope, callback.signature);
    assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
    assert.equal(acknowledged.body.operation.status, "processing");
    assert.equal(acknowledged.body.calendarPost.status, "accepted");
    assert.equal(acknowledged.body.operation.publicUrl, null, "still no public URL while processing");

    // Reconciliation resolves the processing operation to completed without resubmitting; the
    // public short URL is bound and the post advances to published_unverified.
    const reconciled = await client.reconcilePublishOperation(
      post.id,
      { workspaceId, reconcileOutcome: "completed" },
      { idempotencyKey: "u3-reconcile-processing" }
    );
    assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
    assert.equal(reconciled.body.operation.status, "completed");
    assert.equal(reconciled.body.calendarPost.status, "published_unverified");
    assert.ok(reconciled.body.operation.reconciledAt, "reconciledAt is recorded");
    assert.ok(reconciled.body.operation.publicUrl, "public short URL is bound on reconciliation");
  });
});

test("U3 rejects a wrong-account YouTube publish with PUBLISH_ACCOUNT_MISMATCH and never calls the provider", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-account") });
    const approved = await prepareApprovedFinalVideo(client, "U3 account");
    const workspaceId = approved.workspaceId;
    const post = await scheduleYouTubePost(client, approved, { idempotencyKey: "u3-schedule-account" });

    const wrong = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: "sunrise-estates-yt-wrong" },
      { idempotencyKey: "u3-wrong-account" }
    );
    assert.equal(wrong.status, 409, JSON.stringify(wrong.body));
    assert.equal(wrong.body.code, "PUBLISH_ACCOUNT_MISMATCH");

    // No operation was created: a fresh-key publish with the correct account still succeeds.
    const correct = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-correct-account" }
    );
    assert.equal(correct.status, 202, JSON.stringify(correct.body));
    assert.equal(correct.body.operation.status, "accepted");
    assert.equal(correct.body.operation.provider, "youtube-simulator");
  });
});

test("U3 treats a YouTube timeout after possible acceptance as unknown and reconciles before any retry", async () => {
  const env = { ...baseEnv, V0_YOUTUBE_SIMULATOR_MODE: "timeout" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-timeout") });
    const approved = await prepareApprovedFinalVideo(client, "U3 timeout");
    const workspaceId = approved.workspaceId;
    const post = await scheduleYouTubePost(client, approved, { idempotencyKey: "u3-schedule-timeout" });

    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-timeout" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.unknown, true);
    assert.equal(published.body.operation.status, "unknown");
    assert.equal(published.body.calendarPost.status, "submitting");
    assert.equal(published.body.operation.provider, "youtube-simulator");
    assert.equal(published.body.callback, undefined, "no callback is surfaced for an unknown operation");

    // A same-key replay returns the unknown operation and never resubmits.
    const resubmit = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-timeout" }
    );
    assert.equal(resubmit.status, 202);
    assert.equal(resubmit.body.replay, true);
    assert.equal(resubmit.body.operation.status, "unknown");

    // A fresh key for the same post is a conflict: one publish operation per calendar post.
    const conflict = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-timeout-2" }
    );
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

    // Reconciliation resolves the unknown operation to completed without resubmitting.
    const reconciled = await client.reconcilePublishOperation(
      post.id,
      { workspaceId, reconcileOutcome: "completed" },
      { idempotencyKey: "u3-reconcile-timeout" }
    );
    assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
    assert.equal(reconciled.body.operation.status, "completed");
    assert.equal(reconciled.body.calendarPost.status, "published_unverified");
    assert.ok(reconciled.body.operation.publicUrl, "public short URL is bound on reconciliation");
  });
});

test("U3 replays the YouTube publish by idempotency key and rejects a same-key different-input conflict", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-replay") });
    const approved = await prepareApprovedFinalVideo(client, "U3 replay");
    const workspaceId = approved.workspaceId;
    const post = await scheduleYouTubePost(client, approved, { idempotencyKey: "u3-schedule-replay" });

    const first = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-replay-1" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));
    const operationId = first.body.operation.id;

    const replay = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-replay-1" }
    );
    assert.equal(replay.status, 202);
    assert.equal(replay.body.replay, true);
    assert.equal(replay.body.operation.id, operationId);

    // A same key with a different account input is a conflict.
    const conflict = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: "sunrise-estates-yt-wrong" },
      { idempotencyKey: "u3-replay-1" }
    );
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
  });
});

test("U3 rejects an unsupported platform publish with PUBLISH_PLATFORM_UNSUPPORTED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-platform") });
    const approved = await prepareApprovedFinalVideo(client, "U3 platform");
    const workspaceId = approved.workspaceId;
    // V0 has no publish adapter for TikTok (Direct Post is explicitly out of scope); the platform
    // is a free VarChar(40) at create time, so the post is creatable but not publishable.
    const post = await schedulePost(client, approved, { platform: "tiktok", account: "sunrise-estates-tiktok", idempotencyKey: "u3-schedule-platform" });

    const publish = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-platform" }
    );
    assert.equal(publish.status, 409, JSON.stringify(publish.body));
    assert.equal(publish.body.code, "PUBLISH_PLATFORM_UNSUPPORTED");
  });
});

test("U3 keeps the Meta publication path isolated from YouTube and publishes to Meta exactly once", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-isolation") });
    const approved = await prepareApprovedFinalVideo(client, "U3 isolation");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { platform: "meta", account: "sunrise-estates", idempotencyKey: "u3-schedule-meta" });

    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-meta" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.operation.provider, "meta-simulator");
    assert.equal(published.body.operation.status, "accepted");
    assert.ok(published.body.operation.externalId.startsWith("meta_"), "meta external id format is preserved");

    const callback = published.body.callback;
    const acknowledged = await client.postPublishingCallback("meta", callback.envelope, callback.signature);
    assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
    assert.equal(acknowledged.body.operation.status, "completed");
    assert.equal(acknowledged.body.calendarPost.status, "published_unverified");
    assert.ok(acknowledged.body.operation.publicUrl.startsWith("https://meta.example.test/p/"), "meta public URL format is preserved");
  });
});

test("U3 hides a cross-workspace YouTube publish behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("u3-wsA") });
    const approved = await prepareApprovedFinalVideo(ownerClient, "U3 wsA");
    const workspaceA = approved.workspaceId;
    const post = await scheduleYouTubePost(ownerClient, approved, { idempotencyKey: "u3-schedule-wsA" });

    const otherClient = new V0Client({ baseUrl, authToken: signJwt("u3-wsB") });
    const otherWorkspace = await otherClient.createWorkspace(
      { name: "U3 wsB" },
      { idempotencyKey: "u3-wsB-create" }
    );
    const workspaceB = otherWorkspace.body.workspace.id;

    const cross = await otherClient.publishCalendarPost(
      post.id,
      { workspaceId: workspaceB, account: post.account },
      { idempotencyKey: "u3-wsB-publish" }
    );
    assert.equal(cross.status, 404, JSON.stringify(cross.body));
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");

    // The owning workspace id never leaks.
    assert.equal(JSON.stringify(cross.body).includes(workspaceA), false);
  });
});

test("U3 rejects a malformed, bad-signature and out-of-window YouTube callback without leaking existence", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u3-callback") });
    const approved = await prepareApprovedFinalVideo(client, "U3 callback");
    const workspaceId = approved.workspaceId;
    const post = await scheduleYouTubePost(client, approved, { idempotencyKey: "u3-schedule-callback" });

    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-callback" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.operation.status, "accepted");
    const callback = published.body.callback;

    // A bad signature is rejected as an unverified update.
    const badSignature = await client.postPublishingCallback("youtube", callback.envelope, "not-a-valid-signature");
    assert.equal(badSignature.status, 401);
    assert.equal(badSignature.body.code, "PROVIDER_CALLBACK_INVALID");

    // A correctly signed but malformed callback (missing required fields) is rejected.
    const malformedEnvelope = { workspaceId, calendarPostId: post.id, operationId: published.body.operation.id };
    const malformed = await client.postPublishingCallback("youtube", malformedEnvelope, signYouTube(malformedEnvelope));
    assert.equal(malformed.status, 422);
    assert.equal(malformed.body.code, "PROVIDER_OUTPUT_INVALID");

    // An out-of-window callback is rejected as unverified.
    const staleEnvelope = { ...callback.envelope, timestamp: Date.now() - 10 * 60 * 1000, eventId: "evt_stale" };
    const stale = await client.postPublishingCallback("youtube", staleEnvelope, signYouTube(staleEnvelope));
    assert.equal(stale.status, 401);
    assert.equal(stale.body.code, "PROVIDER_CALLBACK_INVALID");

    // The operation is still accepted, untouched by the rejected callbacks.
    const reread = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u3-publish-callback" }
    );
    assert.equal(reread.status, 202);
    assert.equal(reread.body.replay, true);
    assert.equal(reread.body.operation.status, "accepted");
  });
});

function signYouTube(envelope) {
  return createHmac("sha256", youtubeSecret).update(stableJson(envelope)).digest("hex");
}

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

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
