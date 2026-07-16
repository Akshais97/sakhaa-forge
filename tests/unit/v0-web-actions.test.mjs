import test from "node:test";
import assert from "node:assert/strict";
import { WORKFLOW_ACTIONS } from "../../apps/web/src/workflow/v0-actions.ts";

test("generic brand approval action uses the canonical B3 request shape without defaults", async () => {
  let captured;
  const response = { ok: true, status: 201, body: { profile: { id: "profile-a" } } };
  const result = await WORKFLOW_ACTIONS["brand-approval"]({
    client: {
      async approveBrandProfile(brandId, input) {
        captured = { brandId, input };
        return response;
      }
    },
    workspaceId: "workspace-a",
    ids: { brandId: "brand-a", crawlRunId: "crawl-a" },
    values: {
      optimisticProfileVersion: "0",
      publicName: "Aster Heights",
      industry: "real_estate",
      market: "Bengaluru",
      positioning: "Premium practical homes.",
      productName: "Aster Heights",
      productCategory: "residential_project",
      targetAudience: "Urban families",
      cta: "Book a site visit",
      ctaActionType: "lead_form",
      tone: "calm",
      language: "en-IN",
      rightsAttestation: true,
      requiredRule: "Terms apply",
      prohibitedRule: "Guaranteed appreciation"
    }
  });

  assert.equal(result.status, 201);
  assert.deepEqual(captured, {
    brandId: "brand-a",
    input: {
      workspaceId: "workspace-a",
      crawlRunId: "crawl-a",
      decision: "approve",
      optimisticVersion: 0,
      profile: {
        publicName: "Aster Heights",
        industry: "real_estate",
        markets: ["Bengaluru"],
        positioningStatement: "Premium practical homes.",
        products: [{ name: "Aster Heights", category: "residential_project", status: "active" }],
        audiences: [{ name: "Urban families", geography: ["Bengaluru"] }],
        callsToAction: [{ label: "Book a site visit", actionType: "lead_form" }],
        voice: { attributes: ["calm"], avoid: [], formality: "balanced", languages: ["en-IN"] },
        visualIdentity: {},
        claims: [],
        rightsAttestation: true
      },
      rules: [
        { type: "required_phrase", value: "Terms apply", severity: "warning", rationale: "Approved brand phrase." },
        { type: "prohibited_phrase", value: "Guaranteed appreciation", severity: "critical", rationale: "Prohibited by approved brand rules." }
      ]
    }
  });
});
