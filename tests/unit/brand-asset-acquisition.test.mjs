import test from "node:test";
import assert from "node:assert/strict";
import { retainCrawlAssets } from "../../workers/queue/src/brand-asset-acquisition.mjs";

test("crawl asset acquisition blocks private redirect targets", async () => {
  let calls = 0;
  const result = await retainCrawlAssets(
    [{ locator: "https://cdn.example.com/hero.jpg", type: "hero" }],
    {
      workspaceId: "workspace-1",
      crawlRunId: "crawl-1",
      storageRoot: "D:/tmp/sakhaa-asset-private-redirect",
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
      }
    }
  );

  assert.equal(calls, 1);
  assert.equal(result.retainedAssets.length, 0);
  assert.equal(result.skippedAssets[0].code, "ASSET_DOWNLOAD_FAILED");
});

test("crawl asset acquisition retains SVG only for an identified logo", async () => {
  const result = await retainCrawlAssets(
    [
      { locator: "https://cdn.example.com/illustration.svg", type: "lifestyle" },
      { locator: "https://cdn.example.com/logo.svg", type: "logo" }
    ],
    {
      workspaceId: "workspace-1",
      crawlRunId: "crawl-2",
      storageRoot: "D:/tmp/sakhaa-asset-svg",
      fetchImpl: async () => new Response("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" }
      })
    }
  );

  assert.equal(result.retainedAssets.length, 1);
  assert.equal(result.retainedAssets[0].category, "logo");
  assert.equal(result.skippedAssets.some((asset) => asset.code === "ASSET_TYPE_UNSUPPORTED"), true);
});
