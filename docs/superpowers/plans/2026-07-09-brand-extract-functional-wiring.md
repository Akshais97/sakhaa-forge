# Brand Extract Functional Wiring Plan

## RCA

- `/brand-extract` currently calls same-origin `/api/v0/...`, but the web app has no Next rewrite or route handler for that path. The backend V0 API runs separately at `/api/v0` and requires a bearer token.
- `POST /brands/crawl-runs` requires `workspaceId`, `rightsAcknowledged`, valid public `websiteUrl`, `crawlScope`, and an `Idempotency-Key`. The current page omits `workspaceId`, auth, and idempotency.
- The asset section creates fake artifact IDs and marks them clean with a timer. The backend only accepts clean artifacts created by `POST /brands/assets/uploads` and completed through the artifact completion route.
- Step 1 seeds the brand name from demo brand data (`Aura Luxury Estates`), so an empty field can show stale demo state.
- The page catches API failures and advances into a local simulated crawl. That masks real backend failures and violates the current backend contract.

## Implementation

1. Add a web rewrite from `/api/v0/:path*` to the configured V0 API server.
2. Use the generated V0 client from the frontend workflow helper for brand crawl and upload calls.
3. Add explicit API context inputs for workspace ID and bearer token; keep the token in component state only.
4. Replace fake asset incorporation with real file upload initiation and completion, then attach clean artifact IDs to the crawl request.
5. Replace free-text industry with a dropdown using the Firecrawl vertical set.
6. Add validation for brand name, industry, URL, auth context, rights, and path prefixes, including `/all` normalization.
7. Remove simulated crawl fallback and dummy brand seeding from `/brand-extract`.
8. Add focused tests that fail if dummy fallback or missing wiring returns.

## Verification

- Run focused brand-extract frontend contract tests.
- Run web lint/type checks where possible.
- Run brand intake/extraction integration tests against the backend public V0 API.
