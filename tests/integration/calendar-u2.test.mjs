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

const baseEnv = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken,
  V0_PAYMENT_SIMULATOR_SECRET: simulatorSecret,
  V0_HEYGEN_SIMULATOR_SECRET: heygenSecret,
  V0_META_SIMULATOR_SECRET: metaSecret
};

// V0-U2 idempotent Meta publication. An authorised production role
// (schedule_publish_approved_media: Owner/Admin/Client Manager) publishes an approved scheduled
// calendar post to the intended Meta account exactly once. A durable PublishOperation is
// persisted BEFORE the Meta network I/O so a crash between persistence and the network response
// leaves a resumable operation, never a blind duplicate. The operation binds the workspace, the
// calendar post, the Meta provider route, the idempotency key and a server-side request hash, and
// stores the external post id and the public post URL only once the provider identity is known. A
// timeout after possible acceptance marks the operation unknown and the caller must reconcile
// before any retry; blind resubmission is prohibited. The Meta callback is signature-verified in
// constant time, windowed and deduplicated by (workspace, source, eventId); a replay never
// transitions a second time. The wrong-account check rejects a publish whose body account does
// not match the calendar post's bound account. A manual-export post cannot be submitted to a
// provider. Cross-workspace publishes hide behind WORKSPACE_ACCESS_DENIED. Signed URLs, object
// keys, secrets, the request hash and raw provider payloads never leak; the public post URL is
// the only URL surfaced and only once the post is live.

async function schedulePost(client, approved, { account = "sunrise-estates", idempotencyKey, scheduledAt = "2999-01-01T09:00:00+05:30" } = {}) {
  const created = await client.createCalendarPost(
    {
      workspaceId: approved.workspaceId,
      finalVideoId: approved.finalVideoId,
      approvalToken: approved.approvalToken,
      platform: "meta",
      account,
      caption: "New launch at Sunrise Estates. #realestate #mumbai",
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

test("U2 publishes an approved scheduled calendar post to Meta exactly once and a verified callback drives it to published_unverified", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u2-success") });
    const approved = await prepareApprovedFinalVideo(client, "U2 success");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u2-schedule-success" });

    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-publish-1" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.calendarPost.status, "accepted");
    assert.equal(published.body.calendarPost.id, post.id);
    assert.equal(published.body.operation.status, "accepted");
    assert.equal(published.body.operation.provider, "meta-simulator");
    assert.equal(published.body.operation.calendarPostId, post.id);
    assert.ok(published.body.operation.externalId, "meta external post id is bound");
    assert.equal(published.body.operation.publicUrl, null, "public URL is not known until the post is live");
    // The request hash is a server-side binding secret and must not leak.
    assert.equal("requestHash" in published.body.operation, false);
    // No secret, signed URL, object key or credential leaks. The public post URL is null here.
    assert.equal(/secret|api[_-]?key|signed[_-]?url|object[_-]?key|payload[_-]?hash|credential/i.test(JSON.stringify(published.body)), false);

    // The simulator surfaces a signed callback envelope carrying the public post URL for the
    // deterministic test to post back, exactly as the HeyGen/Razorpay simulators do.
    const callback = published.body.callback;
    assert.ok(callback?.envelope, "simulator surfaces a callback envelope");
    assert.ok(callback?.signature, "simulator surfaces a callback signature");
    assert.ok(callback.envelope.publicUrl, "the callback carries the public post URL");

    const acknowledged = await client.postPublishingCallback("meta", callback.envelope, callback.signature);
    assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
    assert.equal(acknowledged.body.operation.status, "completed");
    assert.equal(acknowledged.body.calendarPost.status, "published_unverified");
    assert.ok(acknowledged.body.operation.publicUrl, "public post URL is bound once the post is live");
    assert.ok(acknowledged.body.operation.completedAt, "completedAt is recorded");
    assert.equal(acknowledged.body.duplicate, false);

    // A replay of the same callback is deduplicated and never transitions a second time.
    const replay = await client.postPublishingCallback("meta", callback.envelope, callback.signature);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate, true);

    // A replay of the same publish idempotency key returns the existing operation and never
    // calls the provider again.
    const resubmit = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-publish-1" }
    );
    assert.equal(resubmit.status, 202);
    assert.equal(resubmit.body.replay, true);
    assert.equal(resubmit.body.operation.id, published.body.operation.id);
  });
});

test("U2 rejects a wrong-account publish with PUBLISH_ACCOUNT_MISMATCH and never calls the provider", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u2-account") });
    const approved = await prepareApprovedFinalVideo(client, "U2 account");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u2-schedule-account" });

    // The body account does not match the calendar post's bound account.
    const wrong = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: "sunrise-estates-wrong" },
      { idempotencyKey: "u2-wrong-account" }
    );
    assert.equal(wrong.status, 409, JSON.stringify(wrong.body));
    assert.equal(wrong.body.code, "PUBLISH_ACCOUNT_MISMATCH");

    // No operation was created: a fresh-key publish with the correct account still succeeds from
    // scratch (no stale operation row, no duplicate).
    const correct = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-correct-account" }
    );
    assert.equal(correct.status, 202, JSON.stringify(correct.body));
    assert.equal(correct.body.operation.status, "accepted");
  });
});

test("U2 treats a timeout after possible acceptance as unknown and reconciles before any retry", async () => {
  const env = { ...baseEnv, V0_META_SIMULATOR_MODE: "timeout" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u2-timeout") });
    const approved = await prepareApprovedFinalVideo(client, "U2 timeout");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u2-schedule-timeout" });

    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-publish-timeout" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.unknown, true);
    assert.equal(published.body.operation.status, "unknown");
    // The calendar post stays submitting while the operation is unknown (the post-level enum has
    // no unknown; the operation carries the precise uncertain truth).
    assert.equal(published.body.calendarPost.status, "submitting");
    assert.equal(published.body.operation.publicUrl, null);
    assert.equal(published.body.callback, undefined, "no callback is surfaced for an unknown operation");

    // A same-key replay returns the unknown operation and never resubmits.
    const resubmit = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-publish-timeout" }
    );
    assert.equal(resubmit.status, 202);
    assert.equal(resubmit.body.replay, true);
    assert.equal(resubmit.body.operation.status, "unknown");

    // A fresh key for the same post is a conflict: one publish operation per calendar post.
    const conflict = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-publish-timeout-2" }
    );
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

    // Reconciliation resolves the unknown operation to completed without resubmitting; the post
    // advances to published_unverified and the public URL is bound.
    const reconciled = await client.reconcilePublishOperation(
      post.id,
      { workspaceId, reconcileOutcome: "completed" },
      { idempotencyKey: "u2-reconcile-timeout" }
    );
    assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
    assert.equal(reconciled.body.operation.status, "completed");
    assert.equal(reconciled.body.calendarPost.status, "published_unverified");
    assert.ok(reconciled.body.operation.reconciledAt, "reconciledAt is recorded");
    assert.ok(reconciled.body.operation.publicUrl, "public URL is bound on reconciliation");

    // Re-reconciliation is a replay (terminal operation).
    const rereconcile = await client.reconcilePublishOperation(
      post.id,
      { workspaceId },
      { idempotencyKey: "u2-reconcile-timeout-2" }
    );
    assert.equal(rereconcile.status, 200);
    assert.equal(rereconcile.body.replay, true);
  });
});

test("U2 rejects a manual-export post publish with PUBLISH_NOT_SUBMITTABLE", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u2-manual") });
    const approved = await prepareApprovedFinalVideo(client, "U2 manual");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "manual",
        account: "sunrise-estates-manual",
        caption: "Manual export for Sunrise Estates.",
        scheduledAt: null,
        timezone: "Asia/Kolkata",
        manualExport: true
      },
      { idempotencyKey: "u2-manual-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const post = created.body.calendarPost;

    const publish = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-manual-publish" }
    );
    assert.equal(publish.status, 409, JSON.stringify(publish.body));
    assert.equal(publish.body.code, "PUBLISH_NOT_SUBMITTABLE");
  });
});

test("U2 fails a malformed Meta response with PROVIDER_OUTPUT_INVALID and no callback", async () => {
  const env = { ...baseEnv, V0_META_SIMULATOR_MODE: "malformed" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u2-malformed") });
    const approved = await prepareApprovedFinalVideo(client, "U2 malformed");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u2-schedule-malformed" });

    const publish = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-publish-malformed" }
    );
    assert.equal(publish.status, 422, JSON.stringify(publish.body));
    assert.equal(publish.body.code, "PROVIDER_OUTPUT_INVALID");
  });
});

test("U2 rejects a malformed, bad-signature and out-of-window Meta callback without leaking existence", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u2-callback") });
    const approved = await prepareApprovedFinalVideo(client, "U2 callback");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u2-schedule-callback" });

    const published = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-publish-callback" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));
    assert.equal(published.body.operation.status, "accepted");
    const callback = published.body.callback;

    // A bad signature is rejected as an unverified update.
    const badSignature = await client.postPublishingCallback("meta", callback.envelope, "not-a-valid-signature");
    assert.equal(badSignature.status, 401);
    assert.equal(badSignature.body.code, "PROVIDER_CALLBACK_INVALID");

    // A correctly signed but malformed callback (missing required fields) is rejected.
    const malformedEnvelope = { workspaceId, calendarPostId: post.id, operationId: published.body.operation.id };
    const malformed = await client.postPublishingCallback("meta", malformedEnvelope, signMeta(malformedEnvelope));
    assert.equal(malformed.status, 422);
    assert.equal(malformed.body.code, "PROVIDER_OUTPUT_INVALID");

    // An out-of-window callback is rejected as unverified.
    const staleEnvelope = { ...callback.envelope, timestamp: Date.now() - 10 * 60 * 1000, eventId: "evt_stale" };
    const stale = await client.postPublishingCallback("meta", staleEnvelope, signMeta(staleEnvelope));
    assert.equal(stale.status, 401);
    assert.equal(stale.body.code, "PROVIDER_CALLBACK_INVALID");

    // The operation is still accepted, untouched by the rejected callbacks.
    const reread = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-publish-callback" }
    );
    assert.equal(reread.status, 202);
    assert.equal(reread.body.replay, true);
    assert.equal(reread.body.operation.status, "accepted");
  });
});

test("U2 replays the publish by idempotency key and rejects a same-key different-input conflict", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u2-replay") });
    const approved = await prepareApprovedFinalVideo(client, "U2 replay");
    const workspaceId = approved.workspaceId;
    const post = await schedulePost(client, approved, { idempotencyKey: "u2-schedule-replay" });

    const first = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-replay-1" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));
    const operationId = first.body.operation.id;

    const replay = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: post.account },
      { idempotencyKey: "u2-replay-1" }
    );
    assert.equal(replay.status, 202);
    assert.equal(replay.body.replay, true);
    assert.equal(replay.body.operation.id, operationId);

    // A same key with a different account input is a conflict.
    const conflict = await client.publishCalendarPost(
      post.id,
      { workspaceId, account: "sunrise-estates-wrong" },
      { idempotencyKey: "u2-replay-1" }
    );
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
  });
});

test("U2 hides a cross-workspace publish behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("u2-wsA") });
    const approved = await prepareApprovedFinalVideo(ownerClient, "U2 wsA");
    const workspaceA = approved.workspaceId;
    const post = await schedulePost(ownerClient, approved, { idempotencyKey: "u2-schedule-wsA" });

    // Workspace B cannot publish workspace A's calendar post.
    const otherClient = new V0Client({ baseUrl, authToken: signJwt("u2-wsB") });
    const otherWorkspace = await otherClient.createWorkspace(
      { name: "U2 wsB" },
      { idempotencyKey: "u2-wsB-create" }
    );
    const workspaceB = otherWorkspace.body.workspace.id;

    const cross = await otherClient.publishCalendarPost(
      post.id,
      { workspaceId: workspaceB, account: post.account },
      { idempotencyKey: "u2-wsB-publish" }
    );
    assert.equal(cross.status, 404, JSON.stringify(cross.body));
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");

    // The owning workspace id never leaks.
    assert.equal(JSON.stringify(cross.body).includes(workspaceA), false);
  });
});

function signMeta(envelope) {
  return createHmac("sha256", metaSecret).update(stableJson(envelope)).digest("hex");
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
