import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBrandLlmPromptInput,
  parseBrandLlmExtraction,
  runBrandLlmExtraction
} from "../../apps/api/src/brand-llm-extraction.mjs";

test("LLM extraction prompt input is bounded, evidence-only and excludes provider secrets", () => {
  const prompt = buildBrandLlmPromptInput({
    pages: [
      {
        url: "https://aster.example.com",
        title: "Aster",
        markdown: "Aster Heights offers homes. ".repeat(120)
      }
    ],
    brandContext: { industry: "real_estate", primaryMarket: "India", language: "en-IN" }
  });

  assert.equal(prompt.task, "v0_brand_evidence_extraction");
  assert.equal(prompt.rules.includes("no invented facts"), true);
  assert.equal(prompt.pages[0].markdown.length <= 3000, true);
  assert.equal(/api[_-]?key|secret|signed[_-]?url/i.test(JSON.stringify(prompt)), false);
});

test("LLM extraction accepts schema-valid evidence and rejects refusal or invented output", () => {
  const valid = parseBrandLlmExtraction({
    refused: false,
    units: [
      {
        fieldType: "positioning",
        value: "Practical Bengaluru homes",
        confidence: 0.82,
        sourceUrl: "https://aster.example.com",
        evidenceSnippet: "Aster Heights offers practical Bengaluru homes.",
        inference: false
      }
    ],
    readiness: { score: 60, missingAssets: ["floor plan"] }
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.output.units[0].fieldType, "positioning");

  assert.equal(parseBrandLlmExtraction({ refused: true, units: [] }).ok, false);
  assert.equal(parseBrandLlmExtraction({ refused: false, units: [{ fieldType: "metric", value: "No source" }] }).ok, false);
});

test("LLM extraction runner uses simulator default and provider mode requires a key", async () => {
  const simulator = await runBrandLlmExtraction({ pages: [], brandContext: {} }, { env: { LLM_PROVIDER: "simulator" } });
  assert.equal(simulator.ok, true);
  assert.equal(simulator.output.units.length, 0);

  const missingKey = await runBrandLlmExtraction({ pages: [], brandContext: {} }, { env: { LLM_PROVIDER: "openai", LLM_API_KEY: "" } });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.problem.code, "DEPENDENCY_UNAVAILABLE");
});
