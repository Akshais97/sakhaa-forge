import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function exists(path) {
  await access(path);
  return true;
}

test("web app defines the V0 gated workflow and preserves critical publication truth", async () => {
  const workflowSource = await readFile("apps/web/src/workflow/v0-workflow.ts", "utf8");

  const stepMatches = [...workflowSource.matchAll(/key: "([^"]+)"/g)].map((match) => match[1]);
  const expectedSteps = [
    "brand-intake",
    "brand-candidates",
    "brand-approval",
    "blueprint-path",
    "blueprint-library",
    "blueprint-discovery",
    "blueprint-acquisition",
    "blueprint-scene",
    "blueprint-ready",
    "scripts-tournament",
    "scripts-selection",
    "avatars",
    "generation-estimate",
    "generation-job",
    "composition-plan",
    "composition-render",
    "review",
    "calendar",
    "publish",
    "verify",
    "lineage",
  ];

  assert.deepEqual(stepMatches.slice(0, expectedSteps.length), expectedSteps);
  assert.match(workflowSource, /published_verified/);
  assert.match(workflowSource, /Unknown — checking/);
  assert.match(workflowSource, /Provider acknowledgement is not final success/);
  assert.match(workflowSource, /WORKSPACE_SURFACES/);
  assert.match(workflowSource, /"evidence"/);
  assert.match(workflowSource, /"settings\/credentials"/);
  assert.match(workflowSource, /role: "REVIEWER"/);
  assert.match(workflowSource, /allowed: \["review"\]/);
});

test("web app exposes planned public and workspace routes without replacing the landing page", async () => {
  await Promise.all([
    exists("apps/web/app/page.tsx"),
    exists("apps/web/app/sign-in/page.tsx"),
    exists("apps/web/app/auth/callback/page.tsx"),
    exists("apps/web/app/access-denied/page.tsx"),
    exists("apps/web/app/w/[workspaceSlug]/page.tsx"),
    exists("apps/web/app/w/[workspaceSlug]/create/page.tsx"),
    exists("apps/web/app/w/[workspaceSlug]/[...segments]/page.tsx"),
  ]);

  const [landingPage, workspacePage, catchAllPage] = await Promise.all([
    readFile("apps/web/app/page.tsx", "utf8"),
    readFile("apps/web/app/w/[workspaceSlug]/page.tsx", "utf8"),
    readFile("apps/web/app/w/[workspaceSlug]/[...segments]/page.tsx", "utf8"),
  ]);

  assert.match(landingPage, /import App from "\.\.\/src\/App"/);
  assert.match(workspacePage, /ForgeWorkspaceApp/);
  assert.match(catchAllPage, /resolveWorkspaceRoute/);
});
