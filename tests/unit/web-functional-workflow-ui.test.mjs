import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedScreens = [
  "BrandIntakeScreen",
  "BrandCandidatesScreen",
  "BrandApprovalScreen",
  "BlueprintPathScreen",
  "BlueprintLibraryScreen",
  "ViralDiscoveryScreen",
  "MediaAcquisitionScreen",
  "SceneBlueprintScreen",
  "ReadyBlueprintScreen",
  "ScriptTournamentScreen",
  "ScriptSelectionScreen",
  "AvatarCatalogueScreen",
  "GenerationEstimateScreen",
  "GenerationJobScreen",
  "CompositionPlanScreen",
  "CompositionRenderScreen",
  "ReviewScreen",
  "CalendarScreen",
  "PublishScreen",
  "VerifyScreen",
  "LineageScreen"
];

test("authenticated V0 workflow renders functional screens instead of feature bullets", async () => {
  const [appSource, screensSource] = await Promise.all([
    readFile("apps/web/src/components/ForgeWorkspaceApp.tsx", "utf8"),
    readFile("apps/web/src/workflow/v0-screens.tsx", "utf8")
  ]);

  for (const screenName of expectedScreens) {
    assert.match(screensSource, new RegExp(`function ${screenName}\\b`));
  }

  assert.doesNotMatch(appSource, /<ul className="mt-4 space-y-3">/);
  assert.doesNotMatch(appSource, /Step focus/);
  assert.match(appSource, /WorkflowScreenRenderer/);
  assert.match(screensSource, /<form/);
  assert.match(screensSource, /aria-label="Evidence"/);
  assert.match(screensSource, /data-workflow-screen/);
});

test("workflow actions are wired to generated V0Client methods and idempotency requirements", async () => {
  const source = await readFile("apps/web/src/workflow/v0-actions.ts", "utf8");
  const requiredMethods = [
    "createBrandCrawlRun",
    "listBrandCandidates",
    "approveBrandProfile",
    "listBlueprints",
    "createBlueprintRequest",
    "searchViralCandidates",
    "extractViralCandidateBlueprint",
    "createSceneBlueprint",
    "createReadyBlueprint",
    "createScriptTournament",
    "selectScriptVariant",
    "listAvatars",
    "createGenerationEstimate",
    "confirmGenerationEstimate",
    "getGenerationJob",
    "submitGenerationJob",
    "reconcileGenerationJob",
    "createCompositionPlan",
    "renderCompositionPlan",
    "createReviewItem",
    "recordReviewDecision",
    "createCalendarPost",
    "publishCalendarPost",
    "reconcilePublishOperation",
    "verifyCalendarPost",
    "getLineage"
  ];

  for (const method of requiredMethods) {
    assert.match(source, new RegExp(`\\.${method}\\(`), method);
  }

  assert.match(source, /makeIdempotencyKey/);
  assert.match(source, /idempotencyKey:/);
  assert.match(source, /workspaceId/);
});

test("workflow UI contract protects canonical states and sensitive data", async () => {
  const [actionsSource, screensSource] = await Promise.all([
    readFile("apps/web/src/workflow/v0-actions.ts", "utf8"),
    readFile("apps/web/src/workflow/v0-screens.tsx", "utf8")
  ]);

  assert.match(screensSource, /Unknown — checking/);
  assert.match(screensSource, /Provider acknowledgement is not final success/);
  assert.match(screensSource, /Published and verified/);
  assert.match(actionsSource, /redactWorkflowResponse/);

  for (const forbidden of ["signedUrl", "objectKey", "requestHash", "rawProviderPayload", "secretRef", "consentEvidenceRef"]) {
    assert.match(actionsSource, new RegExp(forbidden));
  }
});
