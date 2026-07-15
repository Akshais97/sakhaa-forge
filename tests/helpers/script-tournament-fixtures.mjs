import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Shared S1/S2 flow helpers used by the integration and prisma-runtime tests so
// the script tournament -> selected script journey is prepared the same way in
// every suite. The helpers drive the public generated V0Client only.

export async function prepareReadyTournament(client, label, { variantCount = 10, simulatorMode = "fixture_success" } = {}) {
  const approved = await prepareApprovedBrand(client, label);
  const request = await client.createBlueprintRequest({
    workspaceId: approved.workspaceId,
    brandProfileId: approved.brandProfileId,
    brandProfileVersion: approved.brandProfileVersion,
    path: "default_formula",
    objectiveType: "site_visit",
    objective: "Create a site-visit short for Aster Heights."
  });
  assert.equal(request.status, 202, JSON.stringify(request.body));
  const readyBlueprint = await client.createReadyBlueprint(request.body.request.id, {
    workspaceId: approved.workspaceId,
    sourceType: "default_formula"
  });
  assert.equal(readyBlueprint.status, 202, JSON.stringify(readyBlueprint.body));
  const tournament = await client.createScriptTournament(
    {
      workspaceId: approved.workspaceId,
      blueprintRequestId: request.body.request.id,
      variantCount,
      simulatorMode
    },
    { idempotencyKey: `tournament-${randomUUID()}` }
  );
  assert.equal(tournament.status, 202, JSON.stringify(tournament.body));
  assert.equal(tournament.body.tournament.status, "ready_for_selection");
  return {
    workspaceId: approved.workspaceId,
    brandProfileId: approved.brandProfileId,
    brandProfileVersion: approved.brandProfileVersion,
    blueprintRequestId: request.body.request.id,
    tournamentId: tournament.body.tournament.id,
    optimisticTournamentVersion: tournament.body.tournament.updatedAt,
    variants: tournament.body.variants,
    evaluations: tournament.body.evaluations,
    tournament
  };
}

export async function prepareApprovedBrand(client, label) {
  const created = await client.createWorkspace(
    { name: `${label} ${randomUUID().slice(0, 8)}` },
    { idempotencyKey: `workspace-${randomUUID()}` }
  );
  const workspaceId = created.body.workspace.id;
  const crawl = await client.createBrandCrawlRun(
    {
      workspaceId,
      websiteUrl: "https://aster.example.com/projects/",
      rightsAcknowledged: true,
      crawlScope: { maxPages: 3, permittedPathPrefixes: ["/projects"] }
    },
    { idempotencyKey: `crawl-${randomUUID()}` }
  );
  const approved = await client.approveBrandProfile(crawl.body.brand.id, approvalPayload(workspaceId, crawl.body.crawlRun.id, 0));
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  return {
    workspaceId,
    brandProfileId: approved.body.profile.id,
    brandProfileVersion: approved.body.profile.version
  };
}

export function approvalPayload(workspaceId, crawlRunId, optimisticVersion) {
  return {
    workspaceId,
    crawlRunId,
    decision: "approve",
    optimisticVersion,
    profile: {
      publicName: "Aster Heights",
      industry: "real_estate",
      markets: ["Bengaluru"],
      positioningStatement: "Premium, practical homes for urban professionals and families.",
      products: [{ name: "Aster Heights", category: "residential_project", status: "active" }],
      audiences: [{ name: "Urban professionals and families", geography: ["Bengaluru"] }],
      callsToAction: [{ label: "Book a site visit", actionType: "lead_form" }],
      voice: {
        attributes: ["calm", "premium", "direct", "informative"],
        avoid: ["hype", "guaranteed return", "pressure selling"],
        formality: "balanced",
        languages: ["en-IN"]
      },
      rightsAttestation: true
    },
    rules: [
      { type: "prohibited_claim", value: "Guaranteed appreciation", severity: "critical", rationale: "Unsupported real-estate performance claim." }
    ]
  };
}
