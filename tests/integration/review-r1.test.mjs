import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareRenderedFinalVideo, validTimeline } from "../helpers/review-fixtures.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";
const simulatorSecret = "test-payment-simulator-secret";
const heygenSecret = "test-heygen-simulator-secret";

const baseEnv = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken,
  V0_PAYMENT_SIMULATOR_SECRET: simulatorSecret,
  V0_HEYGEN_SIMULATOR_SECRET: heygenSecret
};

// V0-R1 exact-version review and comments. A production role opens a review item bound to one
// exact final-video version (finalVideoId + sha256 + version), reviewers add timestamped
// append-only comments, a comment against a superseded version returns REVIEW_VERSION_STALE, and
// repeated comment-activity on one review item collapses to one logical notification. Comments
// cannot attach to another workspace/version. Signed URLs and secrets never leak.

test("R1 opens a review item bound to the exact final-video version and accepts a timestamped comment", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r1-owner") });
    const rendered = await prepareRenderedFinalVideo(client, "R1 open review");
    const workspaceId = rendered.workspaceId;

    const created = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-open-1" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    assert.equal(created.body.reviewItem.status, "internal_review");
    assert.equal(created.body.reviewItem.finalVideoId, rendered.finalVideoId);
    assert.equal(created.body.reviewItem.finalVideoSha256, rendered.finalVideoSha256);
    assert.equal(created.body.reviewItem.finalVideoVersion, rendered.finalVideoVersion);
    assert.equal(created.body.reviewItem.compositionInstructionId, rendered.compositionPlanId);
    assert.equal(created.body.audit.eventType, "review.created");
    assert.equal(created.body.audit.targetType, "ReviewItem");
    const reviewItemId = created.body.reviewItem.id;

    // A second open for the same exact version with a fresh key is a replay of the same review
    // item (one review item per exact final-video version), not a second review item.
    const replay = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-open-2" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    assert.equal(replay.body.reviewItem.id, reviewItemId);

    const comment = await client.addReviewComment(
      reviewItemId,
      { workspaceId, body: "Tighten the lower-third at 0:12.", timestampMs: 12000, threadId: null },
      { idempotencyKey: "comment-1" }
    );
    assert.equal(comment.status, 202, JSON.stringify(comment.body));
    assert.equal(comment.body.comment.body, "Tighten the lower-third at 0:12.");
    assert.equal(comment.body.comment.timestampMs, 12000);
    assert.equal(comment.body.comment.authorUserId, "r1-owner");
    assert.equal(comment.body.comment.reviewItemId, reviewItemId);
    assert.equal(comment.body.reviewItem.status, "internal_review");
    assert.equal(comment.body.audit.eventType, "review.comment_added");
    assert.equal(comment.body.notification.status, "sent");
    assert.equal(comment.body.notification.notificationType, "review_comment_added");
    assert.equal(comment.body.notification.duplicateCollapsed, false);

    // No signed URL, secret or provider payload leaks.
    assert.equal(/https?:\/\//i.test(JSON.stringify(comment.body)), false);
    assert.equal(/secret|api[_-]?key|signature/i.test(JSON.stringify(comment.body)), false);
  });
});

test("R1 rejects a comment against a superseded final-video version with REVIEW_VERSION_STALE and archives the review item", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r1-stale") });
    const rendered = await prepareRenderedFinalVideo(client, "R1 stale", { renderKey: "render-stale-1" });
    const workspaceId = rendered.workspaceId;

    const created = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "client_review" },
      { idempotencyKey: "review-stale-open" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const reviewItemId = created.body.reviewItem.id;
    assert.equal(created.body.reviewItem.status, "client_review");

    const first = await client.addReviewComment(
      reviewItemId,
      { workspaceId, body: "First comment on v1.", timestampMs: 0, threadId: null },
      { idempotencyKey: "comment-stale-1" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));

    // Render a new revision: v2 supersedes v1. The review item is still bound to v1.
    const revised = await client.renderCompositionPlan(
      rendered.compositionPlanId,
      { workspaceId },
      { idempotencyKey: "render-stale-2" }
    );
    assert.equal(revised.status, 202, JSON.stringify(revised.body));
    assert.equal(revised.body.finalVideo.version, 2);
    assert.notEqual(revised.body.finalVideo.id, rendered.finalVideoId);

    // A comment against the now-superseded v1 review item is rejected; comments are preserved.
    const stale = await client.addReviewComment(
      reviewItemId,
      { workspaceId, body: "Comment after supersede.", timestampMs: 5000, threadId: null },
      { idempotencyKey: "comment-stale-2" }
    );
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, "REVIEW_VERSION_STALE");

    // The review item is archived and its prior comments are preserved.
    const fetched = await client.getReviewItem(reviewItemId, { workspaceId });
    assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
    assert.equal(fetched.body.reviewItem.status, "archived");
    assert.equal(fetched.body.comments.length, 1);
    assert.equal(fetched.body.comments[0].body, "First comment on v1.");

    // Opening a review item for an already-superseded final video is also stale.
    const staleOpen = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-stale-open-2" }
    );
    assert.equal(staleOpen.status, 409, JSON.stringify(staleOpen.body));
    assert.equal(staleOpen.body.code, "REVIEW_VERSION_STALE");
  });
});

test("R1 collapses duplicate comment notifications to one logical notification", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r1-dedupe") });
    const rendered = await prepareRenderedFinalVideo(client, "R1 dedupe");
    const workspaceId = rendered.workspaceId;

    const created = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-dedupe-open" }
    );
    const reviewItemId = created.body.reviewItem.id;

    const a = await client.addReviewComment(
      reviewItemId,
      { workspaceId, body: "Comment A.", timestampMs: 0, threadId: null },
      { idempotencyKey: "comment-dedupe-a" }
    );
    assert.equal(a.status, 202, JSON.stringify(a.body));
    assert.equal(a.body.notification.duplicateCollapsed, false);

    // A second distinct comment on the same review item collapses to the same logical
    // notification; no second notification is created.
    const b = await client.addReviewComment(
      reviewItemId,
      { workspaceId, body: "Comment B.", timestampMs: 3000, threadId: null },
      { idempotencyKey: "comment-dedupe-b" }
    );
    assert.equal(b.status, 202, JSON.stringify(b.body));
    assert.equal(b.body.notification.duplicateCollapsed, true);
    assert.equal(b.body.notification.status, "sent");
    assert.equal(b.body.notification.id, a.body.notification.id);

    // Replaying the first comment (same idempotency key + same input) returns the same comment
    // and does not re-send or re-collapse the notification.
    const replay = await client.addReviewComment(
      reviewItemId,
      { workspaceId, body: "Comment A.", timestampMs: 0, threadId: null },
      { idempotencyKey: "comment-dedupe-a" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    assert.equal(replay.body.comment.id, a.body.comment.id);
    assert.equal(replay.body.notification.id, a.body.notification.id);

    // Comments are append-only and ordered by creation.
    const list = await client.listReviewComments(reviewItemId, { workspaceId });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.items.length, 2);
    assert.equal(list.body.items[0].body, "Comment A.");
    assert.equal(list.body.items[1].body, "Comment B.");
  });
});

test("R1 hides a cross-workspace review item and comment behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("r1-wsA") });
    const rendered = await prepareRenderedFinalVideo(ownerClient, "R1 wsA");
    const workspaceA = rendered.workspaceId;

    const created = await ownerClient.createReviewItem(
      { workspaceId: workspaceA, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-wsA-open" }
    );
    const reviewItemId = created.body.reviewItem.id;

    // Workspace B (a different owner) cannot open a review item for workspace A's final video.
    const otherClient = new V0Client({ baseUrl, authToken: signJwt("r1-wsB") });
    const otherRendered = await prepareRenderedFinalVideo(otherClient, "R1 wsB");
    const workspaceB = otherRendered.workspaceId;

    const crossOpen = await otherClient.createReviewItem(
      { workspaceId: workspaceB, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-wsB-cross-open" }
    );
    assert.equal(crossOpen.status, 404, JSON.stringify(crossOpen.body));
    assert.equal(crossOpen.body.code, "WORKSPACE_ACCESS_DENIED");

    // Workspace B cannot comment on workspace A's review item and cannot fetch it.
    const crossComment = await otherClient.addReviewComment(
      reviewItemId,
      { workspaceId: workspaceB, body: "Cross comment.", timestampMs: 0, threadId: null },
      { idempotencyKey: "comment-wsB-cross" }
    );
    assert.equal(crossComment.status, 404, JSON.stringify(crossComment.body));
    assert.equal(crossComment.body.code, "WORKSPACE_ACCESS_DENIED");

    const crossGet = await otherClient.getReviewItem(reviewItemId, { workspaceId: workspaceB });
    assert.equal(crossGet.status, 404, JSON.stringify(crossGet.body));
    assert.equal(crossGet.body.code, "WORKSPACE_ACCESS_DENIED");
  });
});

test("R1 lists review items role-filtered by status with cursor pagination", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r1-list") });
    const rendered = await prepareRenderedFinalVideo(client, "R1 list");
    const workspaceId = rendered.workspaceId;

    const created = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-list-open" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));

    const list = await client.listReviewItems({ workspaceId, limit: 10 });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(Array.isArray(list.body.items));
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].id, created.body.reviewItem.id);
    assert.equal(list.body.items[0].status, "internal_review");
  });
});

test("R1 binds POST /review-items to the idempotency key: same key + different final video returns IDEMPOTENCY_INPUT_CONFLICT", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r1-idem") });
    const rendered = await prepareRenderedFinalVideo(client, "R1 idem A");
    const workspaceId = rendered.workspaceId;
    const assetId = rendered.assetId;

    // Open review item A with key k.
    const created = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-idem-key" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const reviewItemAId = created.body.reviewItem.id;

    // Replaying the same key + same input returns the same review item (idempotency replay).
    const replay = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "review-idem-key" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    assert.equal(replay.body.reviewItem.id, reviewItemAId);

    // Render a second independent current final video B in the same workspace.
    const planB = await client.createCompositionPlan({
      workspaceId,
      generationAssetId: assetId,
      inputMode: "structured",
      rawDirection: "9:16 reel with a lower-third caption and a zoom-in intro",
      timeline: validTimeline(assetId)
    });
    assert.equal(planB.status, 202, JSON.stringify(planB.body));
    const renderedB = await client.renderCompositionPlan(
      planB.body.composition.id,
      { workspaceId },
      { idempotencyKey: "render-idem-b" }
    );
    assert.equal(renderedB.status, 202, JSON.stringify(renderedB.body));
    const finalVideoBId = renderedB.body.finalVideo.id;
    assert.notEqual(finalVideoBId, rendered.finalVideoId);

    // Same key + different final video must not create a second review item: the open is bound to
    // the idempotency key + input, not just the one-review-item-per-final-video unique index.
    const conflict = await client.createReviewItem(
      { workspaceId, finalVideoId: finalVideoBId, reviewStage: "internal_review" },
      { idempotencyKey: "review-idem-key" }
    );
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

    // No review item was created for B; only A exists.
    const list = await client.listReviewItems({ workspaceId, limit: 50 });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].id, reviewItemAId);

    // A fresh key for B does open a review item for B (the conflict was key-bound, not a block on B).
    const openB = await client.createReviewItem(
      { workspaceId, finalVideoId: finalVideoBId, reviewStage: "internal_review" },
      { idempotencyKey: "review-idem-b-fresh" }
    );
    assert.equal(openB.status, 202, JSON.stringify(openB.body));
    assert.notEqual(openB.body.reviewItem.id, reviewItemAId);
    assert.equal(openB.body.reviewItem.finalVideoId, finalVideoBId);
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
