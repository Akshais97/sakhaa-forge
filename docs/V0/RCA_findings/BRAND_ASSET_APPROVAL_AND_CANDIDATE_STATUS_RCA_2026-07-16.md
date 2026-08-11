# Approved brand profile constructor RCA

**Date:** 2026-07-16  
**Affected V0 slices:** V0-F3, V0-B2, V0-B2A, V0-B3  
**Status:** Root causes confirmed, with one historical-request ambiguity recorded below  
**Scope:** Diagnosis and corrective plan only; no production behaviour was changed by this RCA

## Executive conclusion

The console messages are not one Backblaze B2 failure. They come from four separate boundary defects:

1. Retained brand assets are returned by the API as opaque `artifact:{artifact_id}` references, but the web application passes those references directly to `<img src>` and `<a href>`. Browsers do not implement an `artifact:` protocol, so they correctly emit `ERR_UNKNOWN_URL_SCHEME`. The UI must exchange the artifact ID for a short-lived authorized download URL before rendering it.
2. Some crawl-derived image candidates bypass URL normalization before they enter the review UI. A malformed provider value such as `148.72.245.255images…/logo-blue.png` is consequently rendered as though it were a usable URL and produces `ERR_NAME_NOT_RESOLVED`. The acquisition worker rejects unsafe URLs, so this symptom can mean that the source candidate was never retained in B2, not that a retained B2 object is missing.
3. Final approval is sent through a hand-written `fetch` without an `Authorization` header. That directly causes the observed `401 Unauthorized`. The request body and response handling also disagree with the canonical approval contract, so adding only the token would expose a subsequent validation/response error.
4. Candidate-status updates work for a fresh, coherent `(token, workspace, crawl run, candidate)` tuple. The observed tenant-hiding `“We could not find that item.”` response therefore indicates a stale or mismatched tuple in the historical browser state, not a thumbnail failure. The demo session is recreated on component initialization while candidate IDs can remain in UI state, and the status mutation is an undocumented, hand-written endpoint outside the generated client. Those conditions make this mismatch possible and hard to diagnose safely.

The thumbnail errors do not cause either the approval 401 or the candidate-status 404. They share the same screen, but they fail at different system boundaries.

## Contract and first-principles model

A private artifact cannot safely be treated as a permanent public URL. The required flow is:

```text
crawl/provider locator
        |
        v
validate and acquire bytes --> quarantine/scan --> clean B2 object
                                                |
                                                v
                                  BrandAsset + Artifact records
                                                |
                                     API returns artifact:<id>
                                                |
                              authorized download request creates
                                 a short-lived signed media URL
                                                |
                                                v
                                      browser media element only
```

The canonical API deliberately returns `locator: artifact:{artifact_id}` for review-safe metadata. `POST /artifacts/{artifact_id}/downloads` is the contract that authorizes access and mints a short-lived URL. The design contract additionally requires media components to refresh signed URLs after expiry or a 403 and never expose those URLs as copy, analytics data, tooltips, or durable state.

The present web implementation skips the download step. It also merges retained assets and unretained source candidates into a single UI model, so the screen cannot truthfully distinguish “stored private artifact” from “remote candidate that may be malformed or unavailable.”

## Findings

### RC-1 — `artifact:` references are rendered as network URLs

**Observed symptom**

```text
artifact:<uuid>:1 Failed to load resource: net::ERR_UNKNOWN_URL_SCHEME
```

**Code evidence**

- `apps/api/src/workspace-store.mjs:16457-16464` intentionally serializes a retained asset locator as ``artifact:${asset.artifactId}``.
- `apps/web/app/brand-extract/_components/candidate-adapter.ts:361` preserves that reference in the UI asset model.
- `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx:1721` passes `asset.locator` directly to `<img src>`.
- The same component passes it directly to an anchor at line 1742.
- `docs/V0/V0_API.md` defines the opaque locator and the authorized artifact-download operation.

**Why it fails**

`artifact:` is an application-level identifier, not an HTTP scheme registered in Chromium. No browser request can reach B2 from that string. A missing thumbnail is therefore expected even when the object exists and is clean in B2.

**Root cause**

The frontend violates the private-artifact access contract by confusing an identifier with a renderable URL.

**B2 conclusion**

This error alone is not evidence of a failed B2 upload. B2 is never contacted by the failing browser request.

### RC-2 — malformed crawl locators reach the review UI

**Observed symptom**

```text
148.72.245.255images…/logo-blue.png:1 net::ERR_NAME_NOT_RESOLVED
```

**Code evidence**

- `apps/api/src/firecrawl-provider.mjs` validates the general image inventory as absolute HTTP(S) URLs, but `buildUniversalProfile` separately accepts branding fields such as logo, favicon, and Open Graph image without applying the same canonicalization.
- `collectRightsAssets` subsequently forwards those locators.
- `apps/web/app/brand-extract/_components/candidate-adapter.ts:321` merges candidate assets with retained assets for display.
- `workers/queue/src/brand-asset-acquisition.mjs` independently applies `isSafeAssetUrl`; an invalid source is skipped and recorded as `ASSET_DOWNLOAD_FAILED` rather than retained.

**Why it fails**

The provider value is not a valid absolute URL. The browser interprets its malformed host/path boundary incorrectly and DNS resolution fails.

**Root cause**

URL validation is inconsistent across provider extraction paths, and the UI asset model erases the distinction between an unverified source locator and a retained private artifact.

**B2 conclusion**

For an invalid source locator, the acquisition boundary correctly refuses to store bytes. Such an item should be shown as unavailable/rejected source evidence, not as a B2 thumbnail.

### RC-3 — approval request bypasses authentication and the generated contract

**Observed symptom**

```text
POST /api/v0/brands/<brand-id>/approvals 401 (Unauthorized)
```

**Code evidence**

- `BrandExtractionStudio.tsx:789-806` implements approval with a raw `fetch`.
- Its headers contain `Content-Type` but no `Authorization: Bearer <token>`.
- The API authenticates the route before approval validation, so the first observable failure is 401.
- `validateBrandApprovalInput` at `apps/api/src/workspace-store.mjs:18993` requires the canonical B3 structure: workspace and crawl identifiers, numeric optimistic version, explicit `decision: "approve"`, a complete profile including rights attestation, and typed rules.
- The UI instead spreads its presentation draft, sends a string version plus display-only approver/time fields, and expects a legacy `{ success, data }` response.
- A generated `approveBrandProfile` client already exists but is not used by this screen.

**Root cause**

The screen uses a private, hand-written transport shape instead of the authenticated generated B3 contract.

**Expected failure sequence if fixed incompletely**

1. Current request: 401 because the bearer token is absent.
2. Token-only patch: 422 because the payload is not the B3 approval input.
3. Request-only patch: the API may return a valid success response that the legacy response parser does not recognize.

### RC-4 — candidate mutation is operating on a stale or mismatched tenant tuple

**Observed symptom**

```text
Failed to update candidate status on server: "We could not find that item."
```

**What was reproduced**

A fresh demo session was created against the running local Next.js/API stack. After its crawl completed, a status update using the returned token, crawl-run ID, and candidate ID returned HTTP 200. The candidate mutation and current server lookup therefore work when all identifiers come from the same authorized session.

**Code and contract evidence**

- `BrandExtractionStudio.tsx:331` creates a demo session during initialization.
- The demo session supplies a new workspace/token context. UI candidate state and asynchronous crawl callbacks have a separate lifetime.
- The status handler at lines 720-726 performs an immediate optimistic local update, then calls a raw endpoint.
- On failure it logs an error but does not roll the local state back or present a recoverable user state.
- The status route is registered in `apps/api/src/server.mjs:2027`, but it is absent from `docs/V0/V0_API.md`, the OpenAPI paths, and the generated client.
- `“We could not find that item.”` is the deliberate tenant-hiding response from the V0 error contract. It can represent either a nonexistent resource or a resource outside the actor's accessible workspace; the client must not receive cross-tenant existence detail.

**Root cause category**

The failed historical request did not carry a candidate that was visible under the request's active authorized workspace/crawl context. The most probable local mechanism is session/state lifetime mismatch: a regenerated demo session or restarted/reloaded crawl context was combined with candidate IDs retained by the screen.

**Evidence limit**

The console excerpt truncates the crawl-run ID, candidate ID, token identity, and trace ID. It is therefore not possible to prove whether the historical tuple contained a deleted/nonexistent candidate or a candidate from a different demo workspace. Reporting either subcase as certain would exceed the available evidence. Both are the same protected-existence failure at the API boundary, and the controlled fresh-tuple result rules out thumbnails as its cause.

**Contributors**

- The mutation is outside the canonical API/generated client, so contract drift is not caught during generation or type checking.
- Optimistic local mutation hides server truth after failure and violates the frontend rule against optimistic approval-sensitive state.
- Bulk status updates ignore unsuccessful responses entirely.
- The adapter normalizes `approved/rejected`, while the server-side decision vocabulary uses `approve/reject`; a later refresh can therefore collapse a saved decision back to the default candidate state.

## Corrective actions

These are ordered by truth and security boundaries, not visual impact.

1. **Use the canonical approval client.** Build the exact B3 request from the approved profile model, include the session bearer token through the generated transport, use the canonical response, and surface RFC 9457 failures without leaking protected details.
2. **Make candidate decisions a documented contract or remove the private mutation.** If per-candidate decisions are durable V0 behaviour, add them to the owning V0 API/error/status contracts, OpenAPI, generated client, permissions, and public-behaviour tests. Otherwise keep them local until the canonical approval payload persists them. Do not maintain an undocumented route.
3. **Introduce a secure artifact media component.** Parse only `artifact:<uuid>` references, call the authorized download endpoint, attach the returned URL only to the media element, refresh once on expiry/403, cancel stale requests, and render explicit loading/unavailable/rejected states. Never place a signed URL in copy or durable application state.
4. **Separate asset classes in the UI contract.** Represent retained artifacts, remote candidates, and rejected/unavailable sources as discriminated states with provenance and acquisition status. Do not flatten them into a single `locator` string.
5. **Normalize provider image values once at ingestion.** Resolve allowed relative URLs against the verified page origin where contractually valid, accept only safe HTTP(S), reject credentials/private-network targets and malformed hosts, and retain the rejection reason as evidence. Apply the same function to inventory, branding, structured-data, and rights-asset paths.
6. **Bind asynchronous screen state to session identity.** On a new demo session or workspace, cancel prior requests and clear crawl/candidate/profile state atomically. Prefer durable authenticated workspace state over silently creating a new demo identity on every initialization.
7. **Replace optimistic decision state with confirmed/recoverable state.** Show saving, confirmed, failed, and retry states. Bulk operations must inspect every response and reconcile before presenting success.

## Required verification for a fix

The implementation is not complete until fresh tests prove all of the following:

- A clean retained B2 asset is listed as `artifact:<id>`, authorized, signed, and rendered without exposing the signed URL outside the media element.
- Expiry/403 triggers one authorized re-sign and a stable fallback if renewal fails.
- A malformed provider locator is rejected before display/acquisition and retains a stable evidence reason.
- Approval without authentication returns the canonical 401; an authorized valid B3 request succeeds; malformed and stale-version requests return their canonical problem details.
- Candidate decision updates cannot cross workspace/crawl boundaries and do not reveal whether a protected candidate exists.
- A session/workspace change cancels or clears stale candidate mutations.
- Server failure leaves the UI in an honest failed/retry state rather than a locally approved state.
- Generated contracts contain every public mutation used by the screen, with no unexplained generated diff.

## Investigation record

Fresh commands and outcomes used for this RCA:

```text
node --test tests/integration/brand-intake-usp-assets.test.mjs \
  tests/unit/brand-extract-adapter.test.mjs \
  tests/e2e/brand-extract-demo-flow.test.mjs
```

- 10 tests passed.
- 1 test failed before exercising behaviour because the standalone Node ESM runner could not resolve `next/server`; this is a test-harness/import problem and was not counted as evidence for or against the reported defect.
- The candidate-status integration coverage passed.

Controlled live HTTP verification against the running local application:

- Created a new demo session and crawl using the application's own routes.
- Waited for the deterministic local acquisition/crawl flow to complete.
- Posted a decision for a candidate returned by that same crawl and session.
- Result: HTTP 200.

One duplicate manual completion request raced the automatic queue completion and returned `RESOURCE_VERSION_STALE`. That is expected optimistic-concurrency protection and is unrelated to the reported asset/approval failures.

## Impact assessment

- **Security and tenancy:** The API's 401 and tenant-hiding 404 behaviour are protective and should not be weakened. The repair belongs in authenticated client state and canonical contracts.
- **Storage:** No evidence in these console messages proves loss of a clean B2 object. The `artifact:` failures occur before B2 is contacted; malformed source URLs may be intentionally rejected before retention.
- **Data truth:** Optimistic candidate state can disagree with the server and must not feed approved brand truth.
- **UI:** The screen lacks truthful loading, unavailable, rejected, expired-link, and retry states for private media.
- **Billing/provider:** No paid-provider or billing mutation is implicated by the evidence reviewed.
- **Contracts:** Approval transport and candidate-status mutation have drifted from the generated public contract and must be reconciled before implementation is accepted.

## Canonical sources consulted

- `docs/V0/V0.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

