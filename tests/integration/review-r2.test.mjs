import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareRenderedFinalVideo } from "../helpers/review-fixtures.mjs";

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

// V0-R2 auditable approval bound to final media. An authorised production role
// (approve_reject_final_video: Owner/Admin/Client Manager; NOT Reviewer) records one terminal
// decision (approve/reject/request_changes) against a review item bound to one exact final-video
// version. The decision records the actor, reason, timestamp and the bound final-media
// fingerprint (finalVideoSha256 + finalVideoVersion). An approve creates a downstream approval
// reference bound to the exact version that scheduling may later consume; reject/request_changes
// create none. A decision against a superseded bound version is rejected (REVIEW_VERSION_STALE)
// and archives the review item. A second decision for the same review item/version is rejected
// (REVIEW_DECISION_ALREADY_RECORDED); a same-key replay returns the original decision, and a
// same-key different-input replay returns IDEMPOTENCY_INPUT_CONFLICT. Cross-workspace decisions
// hide behind WORKSPACE_ACCESS_DENIED. Signed URLs, secrets and provider payloads never leak.

test("R2 records an approve decision with audit and a downstream approval reference bound to the exact version", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r2-owner") });
    const rendered = await prepareRenderedFinalVideo(client, "R2 approve");
    const workspaceId = rendered.workspaceId;

    const created = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "client_review" },
      { idempotencyKey: "r2-open-approve" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const reviewItemId = created.body.reviewItem.id;

    const decision = await client.recordReviewDecision(
      reviewItemId,
      { workspaceId, decision: "approve", reason: "Approved for scheduling.", expectedFinalVideoVersion: 1 },
      { idempotencyKey: "r2-decision-approve" }
    );
    assert.equal(decision.status, 202, JSON.stringify(decision.body));
    assert.equal(decision.body.decision.decision, "approve");
    assert.equal(decision.body.decision.reviewItemId, reviewItemId);
    assert.equal(decision.body.decision.finalVideoId, rendered.finalVideoId);
    assert.equal(decision.body.decision.finalVideoSha256, rendered.finalVideoSha256);
    assert.equal(decision.body.decision.finalVideoVersion, 1);
    assert.equal(decision.body.decision.reason, "Approved for scheduling.");
    assert.equal(decision.body.decision.decidedByUserId, "r2-owner");
    assert.equal(decision.body.reviewItem.status, "approved");
    assert.equal(decision.body.audit.eventType, "review.decision_recorded");
    assert.equal(decision.body.audit.targetType, "ReviewItem");

    // An approve creates a downstream approval reference bound to the exact version that
    // scheduling may later consume. The token is a stable public reference (not a secret).
    assert.ok(decision.body.approvalReference, "approve must produce an approval reference");
    assert.equal(decision.body.approvalReference.reviewItemId, reviewItemId);
    assert.equal(decision.body.approvalReference.finalVideoId, rendered.finalVideoId);
    assert.equal(decision.body.approvalReference.finalVideoSha256, rendered.finalVideoSha256);
    assert.equal(decision.body.approvalReference.finalVideoVersion, 1);
    assert.ok(typeof decision.body.approvalReference.token === "string" && decision.body.approvalReference.token.length > 0);

    // No signed URL, secret or provider payload leaks.
    assert.equal(/https?:\/\//i.test(JSON.stringify(decision.body)), false);
    assert.equal(/secret|api[_-]?key|signature/i.test(JSON.stringify(decision.body)), false);
  });
});

test("R2 rejects and request_changes move the review item status and create no approval reference", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r2-reject") });
    const rendered = await prepareRenderedFinalVideo(client, "R2 reject");
    const workspaceId = rendered.workspaceId;

    const rejectItem = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "r2-open-reject" }
    );
    const rejectItemId = rejectItem.body.reviewItem.id;

    const rejected = await client.recordReviewDecision(
      rejectItemId,
      { workspaceId, decision: "reject", reason: "Brand colour is off.", expectedFinalVideoVersion: 1 },
      { idempotencyKey: "r2-decision-reject" }
    );
    assert.equal(rejected.status, 202, JSON.stringify(rejected.body));
    assert.equal(rejected.body.decision.decision, "reject");
    assert.equal(rejected.body.reviewItem.status, "rejected");
    assert.equal(rejected.body.approvalReference, null);

    // A separate review item (client_review) gets request_changes.
    const changesItem = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "client_review" },
      { idempotencyKey: "r2-open-changes-1" }
    );
    // One review item per exact final-video version: the same final video replays the first item,
    // so the second open returns the existing item. Open a fresh review against a fresh revision.
    const revised = await client.renderCompositionPlan(
      rendered.compositionPlanId,
      { workspaceId },
      { idempotencyKey: "r2-render-v2" }
    );
    assert.equal(revised.status, 202, JSON.stringify(revised.body));
    const changesItemV2 = await client.createReviewItem(
      { workspaceId, finalVideoId: revised.body.finalVideo.id, reviewStage: "client_review" },
      { idempotencyKey: "r2-open-changes-2" }
    );
    const changesItemId = changesItemV2.body.reviewItem.id;

    const changes = await client.recordReviewDecision(
      changesItemId,
      { workspaceId, decision: "request_changes", reason: "Tighten the lower-third.", expectedFinalVideoVersion: 2 },
      { idempotencyKey: "r2-decision-changes" }
    );
    assert.equal(changes.status, 202, JSON.stringify(changes.body));
    assert.equal(changes.body.decision.decision, "request_changes");
    assert.equal(changes.body.reviewItem.status, "change_requested");
    assert.equal(changes.body.approvalReference, null);
  });
});


test("R2 rejects a decision against a superseded final-video version with REVIEW_VERSION_STALE and archives the review item", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r2-stale") });
    const rendered = await prepareRenderedFinalVideo(client, "R2 stale", { renderKey: "r2-render-stale-1" });
    const workspaceId = rendered.workspaceId;

    const created = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "client_review" },
      { idempotencyKey: "r2-stale-open" }
    );
    const reviewItemId = created.body.reviewItem.id;

    // Render a new revision: v2 supersedes v1. The review item is still bound to v1.
    const revised = await client.renderCompositionPlan(
      rendered.compositionPlanId,
      { workspaceId },
      { idempotencyKey: "r2-render-stale-2" }
    );
    assert.equal(revised.status, 202, JSON.stringify(revised.body));
    assert.equal(revised.body.finalVideo.version, 2);

    // A decision against the now-superseded v1 review item is rejected and the item is archived.
    const stale = await client.recordReviewDecision(
      reviewItemId,
      { workspaceId, decision: "approve", reason: "Stale approval.", expectedFinalVideoVersion: 1 },
      { idempotencyKey: "r2-stale-decision" }
    );
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, "REVIEW_VERSION_STALE");

    const fetched = await client.getReviewItem(reviewItemId, { workspaceId });
    assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
    assert.equal(fetched.body.reviewItem.status, "archived");

    // An optimistic-version mismatch (the reviewer's tab shows a different version than the review
    // item is bound to) is also stale, even when the bound version is still current.
    const fresh = await prepareRenderedFinalVideo(client, "R2 optimistic", { renderKey: "r2-optimistic" });
    const freshItem = await client.createReviewItem(
      { workspaceId: fresh.workspaceId, finalVideoId: fresh.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "r2-optimistic-open" }
    );
    const mismatched = await client.recordReviewDecision(
      freshItem.body.reviewItem.id,
      { workspaceId: fresh.workspaceId, decision: "approve", reason: "Wrong tab.", expectedFinalVideoVersion: 99 },
      { idempotencyKey: "r2-optimistic-decision" }
    );
    assert.equal(mismatched.status, 409, JSON.stringify(mismatched.body));
    assert.equal(mismatched.body.code, "REVIEW_VERSION_STALE");
  });
});

test("R2 replays a decision by idempotency key and rejects a second decision with REVIEW_DECISION_ALREADY_RECORDED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("r2-replay") });
    const rendered = await prepareRenderedFinalVideo(client, "R2 replay");
    const workspaceId = rendered.workspaceId;

    const created = await client.createReviewItem(
      { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "client_review" },
      { idempotencyKey: "r2-replay-open" }
    );
    const reviewItemId = created.body.reviewItem.id;

    const first = await client.recordReviewDecision(
      reviewItemId,
      { workspaceId, decision: "approve", reason: "First approval.", expectedFinalVideoVersion: 1 },
      { idempotencyKey: "r2-replay-decision-1" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));
    const firstToken = first.body.approvalReference.token;
    const firstDecisionId = first.body.decision.id;

    // Same key + same input replays the original decision (no second decision, same approval token).
    const replay = await client.recordReviewDecision(
      reviewItemId,
      { workspaceId, decision: "approve", reason: "First approval.", expectedFinalVideoVersion: 1 },
      { idempotencyKey: "r2-replay-decision-1" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    assert.equal(replay.body.decision.id, firstDecisionId);
    assert.equal(replay.body.approvalReference.token, firstToken);

    // Same key + different input is an idempotency-input conflict, not a second decision.
    const conflict = await client.recordReviewDecision(
      reviewItemId,
      { workspaceId, decision: "reject", reason: "Changed my mind.", expectedFinalVideoVersion: 1 },
      { idempotencyKey: "r2-replay-decision-1" }
    );
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");

    // A fresh key for the same review item/version is rejected: one terminal decision per version.
    const second = await client.recordReviewDecision(
      reviewItemId,
      { workspaceId, decision: "reject", reason: "Second attempt.", expectedFinalVideoVersion: 1 },
      { idempotencyKey: "r2-replay-decision-2" }
    );
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.equal(second.body.code, "REVIEW_DECISION_ALREADY_RECORDED");
  });
});

test("R2 hides a cross-workspace decision behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("r2-wsA") });
    const rendered = await prepareRenderedFinalVideo(ownerClient, "R2 wsA");
    const workspaceA = rendered.workspaceId;

    const created = await ownerClient.createReviewItem(
      { workspaceId: workspaceA, finalVideoId: rendered.finalVideoId, reviewStage: "internal_review" },
      { idempotencyKey: "r2-wsA-open" }
    );
    const reviewItemId = created.body.reviewItem.id;

    // Workspace B cannot record a decision against workspace A's review item.
    const otherClient = new V0Client({ baseUrl, authToken: signJwt("r2-wsB") });
    const otherRendered = await prepareRenderedFinalVideo(otherClient, "R2 wsB");
    const workspaceB = otherRendered.workspaceId;

    const crossDecision = await otherClient.recordReviewDecision(
      reviewItemId,
      { workspaceId: workspaceB, decision: "approve", reason: "Cross approve.", expectedFinalVideoVersion: 1 },
      { idempotencyKey: "r2-wsB-cross-decision" }
    );
    assert.equal(crossDecision.status, 404, JSON.stringify(crossDecision.body));
    assert.equal(crossDecision.body.code, "WORKSPACE_ACCESS_DENIED");

    // The other workspace id never leaks.
    assert.equal(JSON.stringify(crossDecision.body).includes(workspaceA), false);
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
