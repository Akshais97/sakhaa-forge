import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("Next app scaffolds canonical V0 public and workspace routes", async () => {
  const publicRoutes = [
    "apps/web/app/sign-in/page.tsx",
    "apps/web/app/auth/callback/page.tsx",
    "apps/web/app/access-denied/page.tsx",
  ];

  for (const routeFile of publicRoutes) {
    const content = await readFile(routeFile, "utf8");
    assert.match(content, /Sakhaa Forge/);
  }

  const workspace = await readFile("apps/web/app/w/[workspaceSlug]/[...segments]/page.tsx", "utf8");
  const appModel = await readFile("apps/web/src/workflow/v0-workflow.ts", "utf8");
  const workspaceApp = await readFile("apps/web/src/components/ForgeWorkspaceApp.tsx", "utf8");

  for (const required of [
    "Submit brand sources",
    "Review extracted candidates",
    "Approve brand profile",
    "Discover viral candidate",
    "Run script tournament",
    "Track HeyGen generation",
    "Approve exact version",
    "Verify live post",
    "Lineage",
    "Unknown — checking",
    "Maximum authorisation",
    "Audience verification",
    "Provider acknowledgement is not final success",
    "WORKSPACE_SURFACES",
  ]) {
    assert.match(`${workspace}\n${appModel}\n${workspaceApp}`, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    "guaranteed virality",
    "guaranteed reach",
    "predicts the winning video",
    "scientifically proven",
    "magic",
  ]) {
    assert.doesNotMatch(`${workspace}\n${appModel}\n${workspaceApp}`.toLowerCase(), new RegExp(forbidden));
  }
});
