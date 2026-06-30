import { randomUUID } from "node:crypto";
import { prepareApprovedBrand } from "./script-tournament-fixtures.mjs";
import {
  AE_PLAN_SCHEMA_VERSION,
  DEFAULT_AE_CAPABILITY_VERSION
} from "../../apps/api/src/ae-capability-registry.mjs";

// V0-R1 review fixtures. Drives the predecessor B1 -> ... -> G5 -> C1 -> C2 flow and renders one
// current final video, then returns the ids an R1 test needs to open a review item against the
// exact final-video version. Self-contained so review tests do not duplicate the long fixture
// chain, and so V0-R2 (decisions) can reuse the same helper. The workspace id is stashed on the
// client (`client.__workspaceId`) so tests can read it without re-threading it.

const SCRIPT_ID = "31000000-0000-4000-8000-000000000002";

export async function prepareRenderedFinalVideo(client, label, { renderKey } = {}) {
  const prepared = await prepareApprovedBrand(client, label);
  client.__workspaceId = prepared.workspaceId;
  await fundWallet(client, prepared.workspaceId, 50000);
  const jobId = await confirmJob(client, prepared);
  await driveToCompleted(client, prepared, jobId, `submit-${label}-${randomUUID()}`);
  const settled = await client.settleGenerationJob(
    jobId,
    { workspaceId: prepared.workspaceId },
    { idempotencyKey: `settle-${label}-${randomUUID()}` }
  );
  const assetId = settled.body.asset.id;

  const created = await client.createCompositionPlan({
    workspaceId: prepared.workspaceId,
    generationAssetId: assetId,
    inputMode: "structured",
    rawDirection: "9:16 reel with a lower-third caption and a zoom-in intro",
    timeline: validTimeline(assetId)
  });
  if (created.status !== 202) {
    throw new Error(`prepareRenderedFinalVideo: composition plan failed: ${JSON.stringify(created.body)}`);
  }
  const compositionPlanId = created.body.composition.id;

  const rendered = await client.renderCompositionPlan(
    compositionPlanId,
    { workspaceId: prepared.workspaceId },
    { idempotencyKey: renderKey ?? `render-${label}-${randomUUID()}` }
  );
  if (rendered.status !== 202) {
    throw new Error(`prepareRenderedFinalVideo: render failed: ${JSON.stringify(rendered.body)}`);
  }
  return {
    workspaceId: prepared.workspaceId,
    compositionPlanId,
    assetId,
    finalVideoId: rendered.body.finalVideo.id,
    finalVideoSha256: rendered.body.finalVideo.sha256,
    finalVideoVersion: rendered.body.finalVideo.version,
    brandProfileId: prepared.brandProfileId
  };
}

export function validTimeline(assetId) {
  return {
    schemaVersion: AE_PLAN_SCHEMA_VERSION,
    capabilityVersion: DEFAULT_AE_CAPABILITY_VERSION,
    durationSeconds: 30,
    resolution: "1080x1920",
    tracks: [
      { id: "t1", kind: "video", assetId, startSeconds: 0, endSeconds: 30, safeZone: "center" }
    ],
    overlays: [
      { id: "o1", kind: "caption", text: "Sunrise Estates", startSeconds: 0, endSeconds: 5, safeZone: "lower_third" }
    ],
    effects: [{ name: "zoom_in", plugin: "ae_builtin" }],
    fonts: [{ name: "Satoshi" }],
    plugins: [{ name: "ae_builtin" }],
    templates: [{ name: "realestate_listing" }]
  };
}

// V0-U1 calendar fixture. Drives the predecessor B1 -> ... -> C2 -> R1 -> R2 flow and renders one
// current final video, opens a review item against the exact final-video version, and records an
// approve decision so the final video carries a deterministic approval token that the calendar
// create binds to. Returns the ids and the approval token a U1 test needs to schedule or manually
// export the approved exact media. Self-contained so calendar tests do not duplicate the long
// fixture chain.
export async function prepareApprovedFinalVideo(client, label, { renderKey, openKey, decisionKey } = {}) {
  const rendered = await prepareRenderedFinalVideo(client, label, { renderKey });
  const workspaceId = rendered.workspaceId;

  const created = await client.createReviewItem(
    { workspaceId, finalVideoId: rendered.finalVideoId, reviewStage: "client_review" },
    { idempotencyKey: openKey ?? `u1-open-${label}-${randomUUID()}` }
  );
  if (created.status !== 202) {
    throw new Error(`prepareApprovedFinalVideo: review item open failed: ${JSON.stringify(created.body)}`);
  }
  const reviewItemId = created.body.reviewItem.id;

  const approved = await client.recordReviewDecision(
    reviewItemId,
    {
      workspaceId,
      decision: "approve",
      reason: `Approved for scheduling (${label}).`,
      expectedFinalVideoVersion: rendered.finalVideoVersion
    },
    { idempotencyKey: decisionKey ?? `u1-approve-${label}-${randomUUID()}` }
  );
  if (approved.status !== 202) {
    throw new Error(`prepareApprovedFinalVideo: approve failed: ${JSON.stringify(approved.body)}`);
  }
  return {
    ...rendered,
    reviewItemId,
    approvalToken: approved.body.approvalReference.token
  };
}

async function fundWallet(client, workspaceId, amountMinor) {
  const purchase = await client.createCreditPurchase(
    { workspaceId, provider: "razorpay", currency: "INR", amountMinor },
    { idempotencyKey: `purchase-${randomUUID()}` }
  );
  if (purchase.status !== 202) {
    throw new Error(`fundWallet: purchase failed: ${JSON.stringify(purchase.body)}`);
  }
  const paid = await client.postRazorpayCallback(
    purchase.body.checkout.envelope,
    purchase.body.checkout.signature
  );
  if (paid.status !== 200) {
    throw new Error(`fundWallet: callback failed: ${JSON.stringify(paid.body)}`);
  }
  return purchase.body.wallet.id;
}

async function confirmJob(client, prepared) {
  const listed = await client.listAvatars({
    workspaceId: prepared.workspaceId,
    brandProfileId: prepared.brandProfileId,
    limit: 50
  });
  const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
  if (!eligible) throw new Error("confirmJob: no eligible avatar");
  const estimate = await client.createGenerationEstimate({
    workspaceId: prepared.workspaceId,
    brandProfileId: prepared.brandProfileId,
    selectedScriptId: SCRIPT_ID,
    avatarProfileId: eligible.id,
    durationSeconds: 30
  });
  const confirmed = await client.confirmGenerationEstimate(
    estimate.body.estimate.id,
    {
      workspaceId: prepared.workspaceId,
      version: estimate.body.estimate.version,
      selectedScriptId: SCRIPT_ID,
      avatarProfileId: eligible.id,
      durationSeconds: 30
    },
    { idempotencyKey: `confirm-r1-${randomUUID()}` }
  );
  if (confirmed.status !== 202) {
    throw new Error(`confirmJob: confirm failed: ${JSON.stringify(confirmed.body)}`);
  }
  return confirmed.body.job.id;
}

async function driveToCompleted(client, prepared, jobId, submitKey) {
  const submitted = await client.submitGenerationJob(
    jobId,
    { workspaceId: prepared.workspaceId },
    { idempotencyKey: submitKey }
  );
  if (submitted.status !== 202) {
    throw new Error(`driveToCompleted: submit failed: ${JSON.stringify(submitted.body)}`);
  }
  const acknowledged = await client.postHeygenCallback(
    submitted.body.callback.envelope,
    submitted.body.callback.signature
  );
  if (acknowledged.status !== 200 || acknowledged.body.operation.status !== "completed") {
    throw new Error(`driveToCompleted: callback failed: ${JSON.stringify(acknowledged.body)}`);
  }
}
