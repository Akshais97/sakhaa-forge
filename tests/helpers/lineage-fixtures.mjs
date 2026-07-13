import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { prepareReadyTournament } from "./script-tournament-fixtures.mjs";
import { validTimeline } from "./review-fixtures.mjs";

// V0-A1 complete-ancestry fixture. Drives the full B1 -> S1/S2 -> G1 -> G3 -> G5 -> C1 -> C2 ->
// R1 -> R2 flow with a REAL selected script (the script tournament is run and a variant is
// selected) so the CreativeLineage selectedScriptId resolves to a retained SelectedScript record
// and the lineage export is genuinely complete. The shared review fixture shortcuts the selected
// script with a placeholder id that has no retained record, which the lineage export honestly
// reports as missing ancestry; this fixture avoids that shortcut so the full-ancestry assertion
// holds. Self-contained so the A1 lineage and performance tests do not duplicate the long chain.

export async function prepareCompleteApprovedFinalVideo(client, label) {
  const ready = await prepareReadyTournament(client, label);
  const workspaceId = ready.workspaceId;
  await fundWallet(client, workspaceId, 50000);

  // Run the script tournament to ready-for-selection, then select a real variant so the retained
  // SelectedScript record exists and the lineage selectedScriptId resolves.
  const variant = ready.variants[0];
  const selected = await client.selectScriptVariant(
    ready.tournamentId,
    {
      workspaceId,
      tournamentId: ready.tournamentId,
      variantId: variant.id,
      optimisticTournamentVersion: ready.optimisticTournamentVersion
    },
    { idempotencyKey: `select-a1-${label}-${randomUUID()}` }
  );
  assert.equal(selected.status, 200, JSON.stringify(selected.body));
  const selectedScriptId = selected.body.selectedScript.id;

  const listed = await client.listAvatars({ workspaceId, brandProfileId: ready.brandProfileId, limit: 50 });
  const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
  if (!eligible) throw new Error("prepareCompleteApprovedFinalVideo: no eligible avatar");
  const avatarProfileId = eligible.id;

  const estimate = await client.createGenerationEstimate({
    workspaceId,
    brandProfileId: ready.brandProfileId,
    selectedScriptId,
    avatarProfileId,
    durationSeconds: 30
  });
  const confirmed = await client.confirmGenerationEstimate(
    estimate.body.estimate.id,
    {
      workspaceId,
      version: estimate.body.estimate.version,
      selectedScriptId,
      avatarProfileId,
      durationSeconds: 30
    },
    { idempotencyKey: `confirm-a1-${label}-${randomUUID()}` }
  );
  assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
  const jobId = confirmed.body.job.id;

  const submitted = await client.submitGenerationJob(jobId, { workspaceId }, { idempotencyKey: `submit-a1-${label}-${randomUUID()}` });
  assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
  const acknowledged = await client.postHeygenCallback(submitted.body.callback.envelope, submitted.body.callback.signature);
  assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
  assert.equal(acknowledged.body.operation.status, "completed", JSON.stringify(acknowledged.body));

  const settled = await client.settleGenerationJob(jobId, { workspaceId }, { idempotencyKey: `settle-a1-${label}-${randomUUID()}` });
  const assetId = settled.body.asset.id;

  const created = await client.createCompositionPlan({
    workspaceId,
    generationAssetId: assetId,
    inputMode: "structured",
    rawDirection: "9:16 reel with a lower-third caption and a zoom-in intro",
    timeline: validTimeline(assetId)
  });
  assert.equal(created.status, 202, JSON.stringify(created.body));
  const compositionPlanId = created.body.composition.id;

  const rendered = await client.renderCompositionPlan(compositionPlanId, { workspaceId }, { idempotencyKey: `render-a1-${label}-${randomUUID()}` });
  assert.equal(rendered.status, 202, JSON.stringify(rendered.body));
  const finalVideoId = rendered.body.finalVideo.id;
  const finalVideoVersion = rendered.body.finalVideo.version;

  const reviewItem = await client.createReviewItem(
    { workspaceId, finalVideoId, reviewStage: "client_review" },
    { idempotencyKey: `open-a1-${label}-${randomUUID()}` }
  );
  assert.equal(reviewItem.status, 202, JSON.stringify(reviewItem.body));
  const approved = await client.recordReviewDecision(
    reviewItem.body.reviewItem.id,
    {
      workspaceId,
      decision: "approve",
      reason: `Approved for scheduling (${label}).`,
      expectedFinalVideoVersion: finalVideoVersion
    },
    { idempotencyKey: `approve-a1-${label}-${randomUUID()}` }
  );
  assert.equal(approved.status, 202, JSON.stringify(approved.body));

  return {
    workspaceId,
    brandProfileId: ready.brandProfileId,
    selectedScriptId,
    avatarProfileId,
    assetId,
    finalVideoId,
    finalVideoVersion,
    approvalToken: approved.body.approvalReference.token
  };
}

async function fundWallet(client, workspaceId, amountMinor) {
  const purchase = await client.createCreditPurchase(
    { workspaceId, provider: "razorpay", currency: "INR", amountMinor },
    { idempotencyKey: `purchase-a1-${randomUUID()}` }
  );
  assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
  const paid = await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
}
