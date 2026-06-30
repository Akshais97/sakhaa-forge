import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prepareReadyTournament } from "./script-tournament-fixtures.mjs";
import { validTimeline } from "./review-fixtures.mjs";

// V0-A3 Standalone Real-Estate Reference Journey fixture. Drives the full production-shaped journey
// from brand intake through audience-verified publication through the generated V0Client only — no
// manual database edits, no hidden retries, no V1/V2 calls. Captures every retained production record
// so the A3 acceptance assertions and the Prisma runtime proof read from the system of record. Shared
// between the in-memory acceptance suite and the prisma-runtime RLS proof so the journey is prepared
// identically in both stores.

export async function runReferenceJourney(client, label) {
  const ready = await prepareReadyTournament(client, label);
  const workspaceId = ready.workspaceId;
  const walletId = await fundWallet(client, workspaceId, 50000);

  const variant = ready.variants[0];
  const selected = await client.selectScriptVariant(
    ready.tournamentId,
    {
      workspaceId,
      tournamentId: ready.tournamentId,
      variantId: variant.id,
      optimisticTournamentVersion: ready.optimisticTournamentVersion
    },
    { idempotencyKey: `select-a3-${label}-${randomUUID()}` }
  );
  assert.equal(selected.status, 200, JSON.stringify(selected.body));
  const selectedScriptId = selected.body.selectedScript.id;

  const listed = await client.listAvatars({ workspaceId, brandProfileId: ready.brandProfileId, limit: 50 });
  const eligible = listed.body.items.find((avatar) => avatar.eligibility.eligible === true);
  if (!eligible) throw new Error("A3 journey: no eligible avatar");
  const avatarProfileId = eligible.id;

  const estimate = await client.createGenerationEstimate({
    workspaceId,
    brandProfileId: ready.brandProfileId,
    selectedScriptId,
    avatarProfileId,
    durationSeconds: 30
  });
  const estimateId = estimate.body.estimate.id;
  const maximumAuthorizedMinor = estimate.body.estimate.maximumAuthorizedMinor;
  const priceVersion = estimate.body.estimate.priceVersion;

  const confirmed = await client.confirmGenerationEstimate(
    estimateId,
    {
      workspaceId,
      version: estimate.body.estimate.version,
      selectedScriptId,
      avatarProfileId,
      durationSeconds: 30
    },
    { idempotencyKey: `confirm-a3-${label}-${randomUUID()}` }
  );
  assert.equal(confirmed.status, 202, JSON.stringify(confirmed.body));
  const jobId = confirmed.body.job.id;

  const submitted = await client.submitGenerationJob(jobId, { workspaceId }, { idempotencyKey: `submit-a3-${label}-${randomUUID()}` });
  assert.equal(submitted.status, 202, JSON.stringify(submitted.body));
  const acknowledged = await client.postHeygenCallback(submitted.body.callback.envelope, submitted.body.callback.signature);
  assert.equal(acknowledged.status, 200, JSON.stringify(acknowledged.body));
  assert.equal(acknowledged.body.operation.status, "completed", JSON.stringify(acknowledged.body));

  const settled = await client.settleGenerationJob(jobId, { workspaceId }, { idempotencyKey: `settle-a3-${label}-${randomUUID()}` });
  assert.equal(settled.status, 202, JSON.stringify(settled.body));
  assert.equal(settled.body.outcome, "captured", JSON.stringify(settled.body));
  const assetId = settled.body.asset.id;
  const balanceAfterSettle = settled.body.wallet.balanceMinor;

  const created = await client.createCompositionPlan({
    workspaceId,
    generationAssetId: assetId,
    inputMode: "structured",
    rawDirection: "9:16 reel with a lower-third caption and a zoom-in intro",
    timeline: validTimeline(assetId)
  });
  assert.equal(created.status, 202, JSON.stringify(created.body));
  const compositionPlanId = created.body.composition.id;

  const rendered = await client.renderCompositionPlan(compositionPlanId, { workspaceId }, { idempotencyKey: `render-a3-${label}-${randomUUID()}` });
  assert.equal(rendered.status, 202, JSON.stringify(rendered.body));
  const finalVideoId = rendered.body.finalVideo.id;
  const finalVideoVersion = rendered.body.finalVideo.version;
  const finalVideoSha256 = rendered.body.finalVideo.sha256;

  const reviewItem = await client.createReviewItem(
    { workspaceId, finalVideoId, reviewStage: "client_review" },
    { idempotencyKey: `open-a3-${label}-${randomUUID()}` }
  );
  assert.equal(reviewItem.status, 202, JSON.stringify(reviewItem.body));
  const reviewItemId = reviewItem.body.reviewItem.id;
  const approved = await client.recordReviewDecision(
    reviewItemId,
    {
      workspaceId,
      decision: "approve",
      reason: `Approved for the reference journey (${label}).`,
      expectedFinalVideoVersion: finalVideoVersion
    },
    { idempotencyKey: `approve-a3-${label}-${randomUUID()}` }
  );
  assert.equal(approved.status, 202, JSON.stringify(approved.body));
  const approvalToken = approved.body.approvalReference.token;

  const calendarPost = await client.createCalendarPost(
    {
      workspaceId,
      finalVideoId,
      approvalToken,
      platform: "meta",
      account: "sunrise-estates",
      caption: "New launch at Sunrise Estates — book your site visit.",
      scheduledAt: "2999-01-01T09:00:00+05:30",
      timezone: "Asia/Kolkata",
      manualExport: false
    },
    { idempotencyKey: `schedule-a3-${label}-${randomUUID()}` }
  );
  assert.equal(calendarPost.status, 202, JSON.stringify(calendarPost.body));
  const postId = calendarPost.body.calendarPost.id;

  const published = await client.publishCalendarPost(postId, { workspaceId, account: "sunrise-estates" }, { idempotencyKey: `publish-a3-${label}-${randomUUID()}` });
  assert.equal(published.status, 202, JSON.stringify(published.body));
  const publishedCallback = await client.postPublishingCallback("meta", published.body.callback.envelope, published.body.callback.signature);
  assert.equal(publishedCallback.status, 200, JSON.stringify(publishedCallback.body));
  assert.equal(publishedCallback.body.calendarPost.status, "published_unverified", JSON.stringify(publishedCallback.body));
  const externalId = publishedCallback.body.operation.externalId;
  const publicUrl = publishedCallback.body.operation.publicUrl;

  const verified = await client.verifyCalendarPost(postId, { workspaceId });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.calendarPost.status, "published_verified", JSON.stringify(verified.body));
  const verifiedAt = verified.body.verification.verifiedAt;
  const evidenceArtifactId = verified.body.verification.evidenceArtifactId;

  return {
    workspaceId,
    walletId,
    brandProfileId: ready.brandProfileId,
    brandProfileVersion: ready.brandProfileVersion,
    blueprintRequestId: ready.blueprintRequestId,
    selectedScriptId,
    avatarProfileId,
    estimateId,
    maximumAuthorizedMinor,
    priceVersion,
    jobId,
    assetId,
    balanceAfterSettle,
    compositionPlanId,
    finalVideoId,
    finalVideoVersion,
    finalVideoSha256,
    reviewItemId,
    approvalToken,
    postId,
    externalId,
    publicUrl,
    verifiedAt,
    evidenceArtifactId
  };
}

// Assemble the deterministic founder-reviewed pilot scorecard from the retained records. Honest:
// only retained IDs, content hashes, integer-minor cost and an observations-only note — never a
// virality, reach, conversion or causal performance claim.
export function buildPilotScorecard(journey, lineage, ledger) {
  const purchaseEntry = ledger.entries.find((entry) => entry.type === "PURCHASE");
  const reserveEntry = ledger.entries.find((entry) => entry.type === "RESERVE");
  const captureEntry = ledger.entries.find((entry) => entry.type === "CAPTURE");
  const ledgerSum = ledger.entries.reduce((sum, entry) => sum + entry.amountMinor, 0);
  const providerTotalMinor = lineage.cost.providerTotalMinor;
  return {
    slice: "V0-A3",
    product: "Sakhaa Forge V0 (standalone, V1/V2 absent)",
    workspaceId: journey.workspaceId,
    brandProfileId: journey.brandProfileId,
    selectedScriptId: journey.selectedScriptId,
    avatarProfileId: journey.avatarProfileId,
    estimateId: journey.estimateId,
    generationJobId: journey.jobId,
    finalVideoId: journey.finalVideoId,
    finalVideoSha256: journey.finalVideoSha256,
    finalVideoVersion: journey.finalVideoVersion,
    reviewItemId: journey.reviewItemId,
    calendarPostId: journey.postId,
    externalId: journey.externalId,
    publicUrl: journey.publicUrl,
    verifiedAt: journey.verifiedAt,
    audienceEvidenceArtifactId: journey.evidenceArtifactId,
    lineageManifestSha256: lineage.manifestSha256,
    lineageStatus: lineage.status,
    cost: {
      providerTotalMinor,
      estimatedMaximumMinor: lineage.cost.estimatedMaximumMinor,
      currency: lineage.cost.currency,
      priceVersion: lineage.cost.priceVersion
    },
    ledgerReconciliation: {
      purchaseMinor: purchaseEntry ? purchaseEntry.amountMinor : null,
      reservedMinor: reserveEntry ? Math.abs(reserveEntry.amountMinor) : null,
      capturedMinor: captureEntry ? Math.abs(captureEntry.amountMinor) : null,
      walletBalanceMinor: ledger.wallet.balanceMinor,
      ledgerSumMinor: ledgerSum,
      reconciled:
        ledger.wallet.balanceMinor === ledgerSum &&
        ledger.wallet.balanceMinor === (purchaseEntry ? purchaseEntry.amountMinor : 0) - providerTotalMinor &&
        providerTotalMinor <= journey.maximumAuthorizedMinor
    },
    observationsOnly: true,
    v1V2Absent: true,
    noClaimOf: ["virality", "reach", "conversion", "causal performance"]
  };
}

async function fundWallet(client, workspaceId, amountMinor) {
  const purchase = await client.createCreditPurchase(
    { workspaceId, provider: "razorpay", currency: "INR", amountMinor },
    { idempotencyKey: `purchase-a3-${randomUUID()}` }
  );
  assert.equal(purchase.status, 202, JSON.stringify(purchase.body));
  const paid = await client.postRazorpayCallback(purchase.body.checkout.envelope, purchase.body.checkout.signature);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  return purchase.body.wallet.id;
}
