import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("Next landing page presents claim-safe Sakhaa Forge sections", async () => {
  const page = await readFile("apps/web/app/page.tsx", "utf8");
  const app = await readFile("apps/web/src/App.tsx", "utf8");
  const data = await readFile("apps/web/src/data.ts", "utf8");
  const layout = await readFile("apps/web/app/layout.tsx", "utf8");
  const css = await readFile("apps/web/app/globals.css", "utf8");
  const imageBrief = await readFile("docs/Project/Design/SAKHAA_LANDING_IMAGE_BRIEF.md", "utf8");
  const source = `${page}\n${app}\n${data}`;

  for (const required of [
    "Sakhaa Forge",
    "Trend-to-calendar engine",
    "Extraction",
    "UGC Avatars",
    "Calendar Builder",
    "Publishing",
    "Verification",
    "Provider acknowledgement is not final success",
    "Published Verified",
    "Evidence retained",
    "Verify publication before calling it successful"
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const styleMarker of [
    "--font-sans",
    "--font-display",
    "--font-mono",
    ".glow-spot",
    ".spotlight-card",
    ".primary-action",
    "#sakhaa-forge-app",
    "Space Grotesk",
    "JetBrains Mono"
  ]) {
    assert.match(css, new RegExp(styleMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const hrefs = [...source.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    assert.ok(
      href.startsWith("#") || href.startsWith("/") || href.startsWith("mailto:"),
      `landing page href must stay internal or contact-only: ${href}`,
    );
  }
  for (const forbidden of [
    "guaranteed virality",
    "guaranteed reach",
    "predicts the winning video",
    "scientifically proven",
    "magic"
  ]) {
    assert.doesNotMatch(source.toLowerCase(), new RegExp(forbidden));
  }

  assert.match(layout, /metadata/);
  assert.match(layout, /Sakhaa Forge/);

  for (const requiredImage of [
    "Image 01 - Hero product scene",
    "Image 02 - Brand truth evidence",
    "Image 03 - Viral candidate card",
    "Image 04 - Blueprint timeline",
    "Image 05 - Script tournament",
    "Image 06 - Cost and provider state",
    "Image 07 - Review and verification",
    "Image 08 - Lineage archive"
  ]) {
    assert.match(imageBrief, new RegExp(requiredImage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
