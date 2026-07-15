import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const componentRoot = "apps/web/app/brand-extract/_components/brand-assets";

test("brand asset preview is composed from production-reusable components", async () => {
  const page = await readFile("apps/web/app/brand-extract/components/page.tsx", "utf8");

  assert.match(page, /BrandAssetsComponentPreview/);
  assert.match(page, /Component review · Sakhaa Forge/);
  assert.doesNotMatch(page, /diagram|mood board|iframe/i);
});

test("step deck preserves controlled progression and accessible non-gesture navigation", async () => {
  const source = await readFile(`${componentRoot}/BrandIntakeStepDeck.tsx`, "utf8");

  assert.match(source, /activeStep/);
  assert.match(source, /canAdvance/);
  assert.match(source, /onAdvance/);
  assert.match(source, /drag="x"/);
  assert.match(source, /aria-current/);
  assert.match(source, /type="button"/);
});

test("asset cupboard exposes truthful states and horizontal keyboard-safe access", async () => {
  const cupboard = await readFile(`${componentRoot}/AcquiredBrandAssetsCupboard.tsx`, "utf8");
  const thumbnail = await readFile(`${componentRoot}/SecureArtifactThumbnail.tsx`, "utf8");

  assert.match(cupboard, /Acquired brand assets/);
  assert.match(cupboard, /overflow-x-auto/);
  assert.match(cupboard, /aria-label/);
  assert.match(cupboard, /onAdd/);
  assert.match(cupboard, /onRemove/);
  assert.match(thumbnail, /loading|unavailable|rejected/);
  assert.match(thumbnail, /requestArtifactDownload/);
  assert.match(thumbnail, /src=\{signedUrl\}/);
  assert.doesNotMatch(thumbnail, /src=\{artifactReference\}/);
  assert.doesNotMatch(thumbnail, /data-.*signedUrl|title=\{signedUrl\}/);
});

test("decorative motion has explicit reduced-motion and failure fallbacks", async () => {
  const background = await readFile(`${componentRoot}/LiquidEtherBackground.tsx`, "utf8");
  const liquidEther = await readFile(`${componentRoot}/LiquidEther.tsx`, "utf8");
  const cue = await readFile(`${componentRoot}/MagneticNextCue.tsx`, "utf8");

  assert.match(background, /useReducedMotion/);
  assert.match(background, /staticFallback/);
  assert.match(background, /aria-hidden/);
  assert.match(background, /colors=\{\["#5227FF", "#FF9FFC", "#B497CF"\]\}/);
  assert.match(background, /mouseForce=\{20\}/);
  assert.match(background, /cursorSize=\{100\}/);
  assert.match(background, /isViscous/);
  assert.match(background, /autoResumeDelay=\{3000\}/);
  assert.match(liquidEther, /class Simulation/);
  assert.match(liquidEther, /class Advection/);
  assert.match(liquidEther, /class Poisson/);
  assert.doesNotMatch(background, /float noise|float flow/);
  assert.match(cue, /useReducedMotion/);
  assert.match(cue, /disabled/);
  assert.match(cue, /Next step/);
});
