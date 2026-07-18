## RCA result: fixed with concerns

The /brand-extract crawl no longer depends on Redis in local real-provider mode.

Root causes:

- Direct API startup had no V0_INTERNAL_WORKER_TOKEN. The fallback sent a default token that the same API rejected, then ignored the failed processor result. The job therefore remained QUEUED.
- The running API process was stale.
- Firecrawl v2 returns format screenshots as data.screenshot, while action screenshots use data.actions.screenshots. The adapter only handled the latter. Firecrawl permits one screenshot format per request. Firecrawl Scrape API (https://docs.firecrawl.dev/api-reference/endpoint/scrape)
- The JSON request shape—{type: "json", prompt, schema}—is correct for Firecrawl v2. Firecrawl JSON mode (https://docs.firecrawl.dev/features/llm-extract)

Fixes:

- /D:/Chlear Projects/Tribe V2 Based Ad Scorer and Generator/apps/api/src/server.mjs:347 now:
    - configures a matching local worker token outside production;
    - runs the in-process worker only when Redis is absent and Firecrawl mode is active;
    - respects API_BASE_URL/V0_API_BASE_URL;
    - reports processor failures instead of silently leaving jobs queued.
- /D:/Chlear Projects/Tribe V2 Based Ad Scorer and Generator/apps/api/src/firecrawl-provider.mjs:956 now correctly maps full-page and above-fold screenshots and retains them for acquisition.
- /D:/Chlear Projects/Tribe V2 Based Ad Scorer and Generator/docs/V0/Features/Firecrawl/brand-crawl-universal.md:51 now reflects the current Firecrawl API.
- Regression coverage was added in /D:/Chlear Projects/Tribe V2 Based Ad Scorer and Generator/tests/integration/brand-crawl-queue-processor.test.mjs:12 and /D:/Chlear Projects/Tribe V2 Based Ad Scorer and Generator/tests/unit/firecrawl-provider.test.mjs:353.

Verification:

- Focused tests: 13/13 passed.
- Real Firecrawl request: HTTP 200, with markdown, branding, all 20 structured fields, 76 images, 72 links, and both screenshots.
- Format: 471 files passed.
- Lint and secret scan: passed.
- Typecheck: passed.
- Fresh local API: 200 ready on port 3001.

Your manually entered workspace/token sets the UI to manual mode, so the demo-completion route is skipped. A real Firecrawl crawl will now be claimed and processed in-process when Redis is unavailable.

Concerns: repository-wide pnpm verify exceeded 124 seconds, and the nearby batch still has two separate existing failures: the demo-only raw-Node next/server import and a rights_asset versus dynamically routed product-candidate expectation. Neither blocks the repaired queue dispatch or the verified Firecrawl request.

Status: DONE_WITH_CONCERNS
