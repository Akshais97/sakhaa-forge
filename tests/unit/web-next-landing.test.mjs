import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("Next landing page presents claim-safe Sakhaa Forge sections", async () => {
  const page = await readFile("apps/web/app/page.tsx", "utf8");
  const layout = await readFile("apps/web/app/layout.tsx", "utf8");
  const css = await readFile("apps/web/app/globals.css", "utf8");
  const imageBrief = await readFile("docs/Project/Design/SAKHAA_LANDING_IMAGE_BRIEF.md", "utf8");

  for (const required of [
    "Sakhaa Forge",
    "Approved brand truth",
    "Viral discovery",
    "Blueprint to video",
    "Human review",
    "Verified publication",
    "Lineage and ledger",
    "Workspace command centre",
    "Unknown - checking",
    "Credits reserved",
    "Audience verification",
    "Brand intake",
    "Script tournament",
    "Reserve credits and generate",
    "Published and verified",
    "Real-estate production workflow"
  ]) {
    assert.match(page, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const styleMarker of [
    "--paper",
    "--coral",
    "--mustard",
    ".side-rail",
    ".topbar",
    ".sec-rule",
    ".image-slot",
    "Inter Tight",
    "Playfair Display"
  ]) {
    assert.match(css, new RegExp(styleMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 0, "expected landing page links");
  for (const href of hrefs) {
    assert.ok(
      href.startsWith("#") || href.startsWith("/") || href.startsWith("mailto:"),
      `landing page href must stay internal or contact-only: ${href}`,
    );
  }
  assert.doesNotMatch(page, /https?:\/\//i);

  for (const forbidden of [
    "guaranteed virality",
    "guaranteed reach",
    "predicts the winning video",
    "scientifically proven",
    "magic"
  ]) {
    assert.doesNotMatch(page.toLowerCase(), new RegExp(forbidden));
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
