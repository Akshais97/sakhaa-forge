# Bug Report: demo-complete-crawl 409 Conflict

* **Date/Time**: 2026-07-13T11:38:46+05:30
* **Topic**: Frontend-Backend Race Condition on Local Brand Scrape Completion
* **Status**: Open (RCA Complete, Fix Pending)

---

## 1. Observed Error

During local testing of the brand extraction workflow, loading `http://localhost:3005/brand-extract` and initiating a crawl returns the following error in the browser console:

```
api/brand-extract/demo-complete-crawl:1 Failed to load resource: the server responded with a status of 409 (Conflict)
```

---

## 2. Root Cause Analysis (RCA)

This issue occurs due to a **race condition** between the NestJS backend API process (port `3001`) and the Next.js frontend route handler (port `3005`) when running locally without a Redis queue.

1. **Crawl Run Creation**: The frontend triggers a crawl run by calling `client.createBrandCrawlRun` via the Next.js rewrite proxy to the NestJS backend API. The API creates the job in the database/in-memory store with `status: "QUEUED"`.
2. **Backend Automatic Dispatch**: The NestJS API process checks if it should run the crawl immediately:
   * Condition: `shouldDispatchLocalBrandCrawl(env)` evaluates to `true` because `APP_ENV` is not production, `REDIS_URL` is absent, and `FIRECRAWL_API_KEY` is present.
   * Result: The API process immediately spawns a background promise (`dispatchLocalBrandCrawl`) which claims the job via `client.claimJob`, transitioning the status to `"LEASED"` then `"RUNNING"`.
3. **Frontend Duplicate Claim**: Simultaneously, because the frontend is in `local-demo` source mode, it immediately sends a `POST` request to the Next.js `/api/brand-extract/demo-complete-crawl` endpoint. This endpoint makes its own request to claim the same job:
   ```typescript
   const claimed = await postWorker(apiBaseUrl, `/internal/jobs/${encodeURIComponent(input.jobId)}/claim`, {
     resourceClass: 'CPU'
   });
   ```
4. **Conflict Check**: In the backend store, `claimJob` checks the job status:
   ```javascript
   if (!["QUEUED", "EXPIRED", "RETRY_WAIT"].includes(job.status)) {
     return { ok: false, problem: problem("RESOURCE_VERSION_STALE", 409, "Resource version stale", ...) };
   }
   ```
   Since the backend background task has already claimed the job, its status is no longer `"QUEUED"`. The API returns a `409 Conflict` (with code `RESOURCE_VERSION_STALE`), which Next.js forwards to the browser.

---

## 3. Recommended Fix

Modify the `/api/brand-extract/demo-complete-crawl` route handler in `apps/web/app/api/brand-extract/demo-complete-crawl/route.ts` to handle the `409 Conflict` gracefully. Since the job being already claimed means it is already running or completed by the backend, we can safely treat this as a success and allow the frontend to proceed with its status polling.

### Diff:

```typescript
// apps/web/app/api/brand-extract/demo-complete-crawl/route.ts
const claimed = await postWorker(apiBaseUrl, `/internal/jobs/${encodeURIComponent(input.jobId)}/claim`, {
  resourceClass: 'CPU'
});
const claimedBody = await claimed.json().catch(() => ({}));
if (!claimed.ok || !claimedBody?.attempt?.leaseToken) {
  // If the job is already claimed (e.g. by the backend's automatic background worker),
  // claimJob returns 409 Conflict with RESOURCE_VERSION_STALE.
  // In local demo mode, we treat this as success since the crawl is already running or completed.
  if (claimed.status === 409 && claimedBody?.code === 'RESOURCE_VERSION_STALE') {
    return NextResponse.json({ status: 'already_claimed' });
  }

  return NextResponse.json(
    {
      code: claimedBody?.code || 'DEMO_JOB_CLAIM_FAILED',
      detail: claimedBody?.detail || 'Could not claim the backend crawl job.'
    },
    { status: claimed.status || 502 }
  );
}
```
