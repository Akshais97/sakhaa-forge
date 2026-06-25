import test from "node:test";
import assert from "node:assert/strict";
import { shouldIncludeTextFile } from "../../scripts/lib/files.mjs";

test("format and lint file discovery ignores local agent and graphify outputs", () => {
  assert.equal(shouldIncludeTextFile(".claude/CLAUDE.md"), false);
  assert.equal(shouldIncludeTextFile(".claude/settings.json"), false);
  assert.equal(shouldIncludeTextFile("CLAUDE.md"), false);
  assert.equal(shouldIncludeTextFile("graphify-out/.graphify_ast.json"), false);
  assert.equal(shouldIncludeTextFile("firecrawl-main/firecrawl-main/apps/api/src/lib/branding/schema.ts"), false);
  assert.equal(shouldIncludeTextFile("docs/V0/V0.md"), true);
  assert.equal(shouldIncludeTextFile("apps/api/src/server.mjs"), true);
});
