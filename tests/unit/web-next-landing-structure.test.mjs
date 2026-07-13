import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("apps/web uses Next App Router while preserving the copied landing source", async () => {
  const [packageJson, layout, page, appComponent, globalCss] = await Promise.all([
    readFile("apps/web/package.json", "utf8"),
    readFile("apps/web/app/layout.tsx", "utf8"),
    readFile("apps/web/app/page.tsx", "utf8"),
    readFile("apps/web/src/App.tsx", "utf8"),
    readFile("apps/web/app/globals.css", "utf8"),
  ]);

  const pkg = JSON.parse(packageJson);

  assert.equal(pkg.scripts.dev, "next dev");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.start, "next start");
  assert.equal(pkg.scripts.lint, "tsc --noEmit");
  assert.ok(pkg.dependencies.next, "Next dependency must be present");
  assert.equal(pkg.dependencies.vite, undefined, "Vite must not remain a runtime dependency");
  assert.equal(pkg.dependencies["@vitejs/plugin-react"], undefined, "Vite React plugin must not remain");
  assert.equal(pkg.dependencies["@tailwindcss/vite"], undefined, "Vite Tailwind plugin must not remain");

  assert.match(layout, /import ['"]\.\/globals\.css['"]/);
  assert.match(page, /import App from ['"]\.\.\/src\/App['"]/);
  assert.match(appComponent, /id="sakhaa-forge-app"/);
  assert.match(globalCss, /@import ['"]tailwindcss['"]/);
});
