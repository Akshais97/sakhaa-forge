import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("Next app scaffolds canonical V0 public and workspace routes", async () => {
  const publicRoutes = [
    "apps/web/app/sign-in/page.tsx",
    "apps/web/app/auth/callback/page.tsx",
    "apps/web/app/access-denied/page.tsx",
    "apps/web/app/service-status/page.tsx",
  ];

  for (const routeFile of publicRoutes) {
    const content = await readFile(routeFile, "utf8");
    assert.match(content, /Sakhaa Forge/);
  }

  const workspace = await readFile("apps/web/app/w/[workspaceSlug]/[[...segments]]/page.tsx", "utf8");
  const appModel = await readFile("apps/web/app/workspace-screen-model.ts", "utf8");

  for (const required of [
    "Workspace home",
    "Brand list",
    "Viral candidate search",
    "Script comparison",
    "Generation detail",
    "Review item",
    "Post detail",
    "Lineage",
    "Unknown - checking",
    "Maximum authorisation",
    "Audience verification",
    "Existence-hiding not-found",
  ]) {
    assert.match(`${workspace}\n${appModel}`, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    "guaranteed virality",
    "guaranteed reach",
    "predicts the winning video",
    "scientifically proven",
    "magic",
  ]) {
    assert.doesNotMatch(`${workspace}\n${appModel}`.toLowerCase(), new RegExp(forbidden));
  }
});
