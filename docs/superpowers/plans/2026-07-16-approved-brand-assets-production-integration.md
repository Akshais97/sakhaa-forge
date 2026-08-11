# Approved brand assets production integration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair authenticated brand approval, candidate decisions, and private artifact thumbnails, then integrate the approved Liquid Ether step deck and acquired-assets cupboard into the V0 brand constructor without weakening tenant isolation or evidence retention.

**Architecture:** Keep the generated V0 client as the only browser transport boundary. Browser media receives opaque `artifact:<uuid>` references, mints short-lived downloads through the authenticated artifact endpoint, and re-signs once after expiry or media failure. The cupboard is a controlled review step: “remove” excludes an asset from the approval draft but never deletes the retained B2 object or evidence because V0 has no canonical deletion contract.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.8, generated OpenAPI ESM client, NestJS/Fastify domain API, Prisma/PostgreSQL, Backblaze B2 adapter, Three.js, Motion, Node test runner.

---

## Scope and evidence boundary

- Owning slices: `V0-F3`, `V0-B2`, `V0-B2A`, and `V0-B3`.
- Owning contracts: `docs/V0/V0_API.md`, `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`, `docs/V0/V0_PERMISSIONS.md`, `docs/V0/V0_ERROR_CATALOG.md`, `docs/V0/V0_DATA_MODELS.md`, `docs/V0/V0_INFORMATION_ARCHITECTURE.md`, and `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`.
- RCA evidence: `docs/V0/RCA_findings/BRAND_ASSET_APPROVAL_AND_CANDIDATE_STATUS_RCA_2026-07-16.md`.
- Approved component design: `docs/superpowers/specs/2026-07-16-brand-assets-component-preview-design.md`.
- No artifact deletion endpoint is added. A row removal changes the pending approval selection only. The clean object, provenance, and rights evidence remain retained.
- No signed URL is rendered as text, a tooltip, a data attribute, analytics, or an error message.
- Preserve the pre-existing user changes in `apps/api/src/workspace-store.mjs` and `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`; inspect and merge around them before every edit.

## File structure

- Modify `packages/contracts/src/openapi.v0.json`: declare the existing candidate-decision mutation as a public generated operation.
- Regenerate `packages/contracts/generated/openapi.v0.json` and `packages/contracts/generated/v0-client.mjs`; never edit these manually.
- Modify `apps/api/src/firecrawl-provider.mjs`: apply one public HTTP(S) locator normalizer to all branding and inventory fields.
- Create `apps/web/app/brand-extract/_components/brand-assets/secure-artifact-media.ts`: parse opaque references and mint authorized downloads without exposing URLs outside the media boundary.
- Modify `apps/web/app/brand-extract/_components/brand-assets/SecureArtifactThumbnail.tsx`: implement loading, ready, expired/retrying, unavailable, rejected, and removed states.
- Modify `apps/web/app/brand-extract/_components/brand-assets/AcquiredBrandAssetsCupboard.tsx`: make selection removal semantics explicit and preserve evidence labels.
- Modify `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`: replace raw fetches and raw artifact URLs, add server-confirmed states, and compose the approved asset-library step.
- Modify focused unit, contract, integration, and E2E tests named below.
- Modify canonical docs and `docs/V0/CHANGELOG.md` in the same change.

### Task 1: Put candidate decisions into the generated V0 contract

**Files:**
- Modify: `tests/contract/openapi-generation.test.mjs`
- Modify: `packages/contracts/src/openapi.v0.json`
- Modify: `scripts/generate-contracts.mjs`
- Generate: `packages/contracts/generated/openapi.v0.json`
- Generate: `packages/contracts/generated/v0-client.mjs`
- Modify: `docs/V0/V0_API.md`

- [ ] **Step 1: Write the failing generated-client contract assertion**

Add this assertion beside the other brand-intake operation checks:

```js
assert.equal(
  source.paths["/brands/crawl-runs/{crawl_run_id}/candidates/{candidate_id}/status"].post.operationId,
  "updateBrandCandidateDecision"
);
assert.match(generatedClient, /async updateBrandCandidateDecision\(crawlRunId, candidateId, input\)/);
```

- [ ] **Step 2: Run the contract test and record the expected red result**

Run: `node --test tests/contract/openapi-generation.test.mjs`

Expected: FAIL because the candidate status path and generated method are absent.

- [ ] **Step 3: Add the authenticated route contract to the source OpenAPI document**

Add this path using the transport vocabulary already enforced by `server.mjs`:

```json
"/brands/crawl-runs/{crawl_run_id}/candidates/{candidate_id}/status": {
  "post": {
    "operationId": "updateBrandCandidateDecision",
    "security": [{ "bearerAuth": [] }],
    "parameters": [
      { "name": "crawl_run_id", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } },
      { "name": "candidate_id", "in": "path", "required": true, "schema": { "type": "string", "format": "uuid" } }
    ],
    "requestBody": { "required": true },
    "responses": {
      "200": { "description": "Candidate decision was retained for the authorized crawl run." },
      "401": { "description": "Authentication is required." },
      "404": { "description": "Candidate or crawl run is missing or hidden by tenant isolation." },
      "422": { "description": "Status must be approved or rejected." }
    }
  }
}
```

- [ ] **Step 4: Regenerate contracts and verify the generated diff**

Run: `pnpm generate`

Expected: `v0-client.mjs` gains exactly this method and the generated OpenAPI gains exactly this path:

```js
async updateBrandCandidateDecision(crawlRunId, candidateId, input) {
  return this.#post(
    `/brands/crawl-runs/${encodeURIComponent(crawlRunId)}/candidates/${encodeURIComponent(candidateId)}/status`,
    input
  );
}
```

- [ ] **Step 5: Document the public behavior**

Add this route to the V0 API inventory and state that a tenant-hiding 404 covers both missing and inaccessible tuples:

```text
POST /brands/crawl-runs/{crawl_run_id}/candidates/{candidate_id}/status
```

- [ ] **Step 6: Run the contract and existing candidate integration tests**

Run: `node --test tests/contract/openapi-generation.test.mjs tests/integration/brand-intake-usp-assets.test.mjs`

Expected: PASS with the existing cross-run/tenant-hiding behavior unchanged.

- [ ] **Step 7: Commit the contract behavior**

```bash
git add packages/contracts/src/openapi.v0.json packages/contracts/generated/openapi.v0.json packages/contracts/generated/v0-client.mjs scripts/generate-contracts.mjs tests/contract/openapi-generation.test.mjs docs/V0/V0_API.md
git commit -m "fix(v0-b2): generate candidate decision client"
```

### Task 2: Normalize every Firecrawl branding locator at the provider boundary

**Files:**
- Modify: `tests/unit/firecrawl-provider.test.mjs`
- Modify: `tests/unit/brand-asset-acquisition.test.mjs`
- Modify: `tests/integration/brand-extract-crawl-provider.test.mjs`
- Modify: `apps/api/src/firecrawl-provider.mjs`

- [ ] **Step 1: Write failing tests for malformed branding fields**

Add fixtures proving that the malformed host concatenation is excluded while an absolute public URL is retained:

```js
const response = [
  "148.72.245.255images/common/logo-blue.png",
  "https://example.com/favicon.ico",
  "javascript:alert(1)",
  "/relative.png",
  "https://example.com/hero.jpg"
].map(normalizePublicAssetLocator).filter(Boolean);

assert.deepEqual(response, [
  "https://example.com/favicon.ico",
  "https://example.com/hero.jpg"
]);
```

- [ ] **Step 2: Run the narrow tests and record the red result**

Run: `node --test tests/unit/firecrawl-provider.test.mjs tests/unit/brand-asset-acquisition.test.mjs tests/integration/brand-extract-crawl-provider.test.mjs`

Expected: FAIL because the branding shortcut currently bypasses common locator validation.

- [ ] **Step 3: Add one normalizer and use it for inventory, logo, favicon, Open Graph, and screenshots**

Implement this provider-private helper and filter every locator through it before constructing evidence candidates:

```js
export function normalizePublicAssetLocator(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.pathname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const brandingLocators = [logoUrl, faviconUrl, ogImageUrl, ...screenshots]
  .map(normalizePublicAssetLocator)
  .filter(Boolean);
```

Do not repair an ambiguous malformed string by guessing where a slash belongs.

- [ ] **Step 4: Run unit and crawl-provider integration tests**

Run: `node --test tests/unit/brand-asset-acquisition.test.mjs tests/integration/brand-extract-crawl-provider.test.mjs`

Expected: PASS; unsafe or ambiguous locators remain rejected and valid public HTTP(S) locators remain available for acquisition.

- [ ] **Step 5: Commit the provider-boundary correction**

```bash
git add apps/api/src/firecrawl-provider.mjs tests/unit/firecrawl-provider.test.mjs tests/unit/brand-asset-acquisition.test.mjs tests/integration/brand-extract-crawl-provider.test.mjs
git commit -m "fix(v0-b2a): normalize branding asset locators"
```

### Task 3: Build the secure private-artifact media boundary

**Files:**
- Create: `apps/web/app/brand-extract/_components/brand-assets/secure-artifact-media.ts`
- Modify: `apps/web/app/brand-extract/_components/brand-assets/SecureArtifactThumbnail.tsx`
- Modify: `tests/unit/brand-assets-component-preview.test.mjs`
- Create: `tests/unit/secure-artifact-media.test.mjs`

- [ ] **Step 1: Write failing parser and authorized-download tests**

```js
assert.equal(parseArtifactReference("artifact:f33971d6-61aa-4d42-8ce1-58d00cdd15cd"), "f33971d6-61aa-4d42-8ce1-58d00cdd15cd");
assert.equal(parseArtifactReference("https://example.com/logo.png"), null);
assert.equal(parseArtifactReference("artifact:not-a-uuid"), null);

const result = await requestArtifactDownload(fakeClient, "artifact:f33971d6-61aa-4d42-8ce1-58d00cdd15cd", "workspace-a");
assert.equal(result.url, "https://signed.invalid/object");
assert.equal(fakeClient.calls[0].input.workspaceId, "workspace-a");
```

- [ ] **Step 2: Run the new unit test and record the red result**

Run: `node --test tests/unit/secure-artifact-media.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement opaque-reference parsing and download minting**

```ts
const ARTIFACT_REFERENCE = /^artifact:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function parseArtifactReference(reference: string): string | null {
  return ARTIFACT_REFERENCE.exec(reference.trim())?.[1] ?? null;
}

export async function requestArtifactDownload(
  client: { createArtifactDownload(id: string, input: { workspaceId: string }): Promise<{ status: number; body: unknown }> },
  reference: string,
  workspaceId: string
): Promise<{ url: string; expiresAt: string }> {
  const artifactId = parseArtifactReference(reference);
  if (!artifactId) throw new Error("ARTIFACT_REFERENCE_INVALID");
  const response = await client.createArtifactDownload(artifactId, { workspaceId });
  const body = response.body as { download?: { url?: string; expiresAt?: string } };
  if (response.status !== 200 || !body.download?.url || !body.download.expiresAt) {
    throw new Error(response.status === 404 ? "ARTIFACT_UNAVAILABLE" : "ARTIFACT_DOWNLOAD_FAILED");
  }
  return { url: body.download.url, expiresAt: body.download.expiresAt };
}
```

- [ ] **Step 4: Make `SecureArtifactThumbnail` own the signed URL and one re-sign attempt**

The component contract must be:

```ts
type SecureArtifactThumbnailProps = {
  artifactReference?: string;
  workspaceId: string;
  client: WorkflowClient;
  alt: string;
  status: "loading" | "ready" | "unavailable" | "rejected" | "removed";
};
```

On mount, request a URL only for `ready` retained artifacts. On `<img onError>`, clear the URL, show `expired/retrying`, mint once more, then show `unavailable`. Never place the URL in a DOM `data-*` attribute or error string.

- [ ] **Step 5: Run media tests and strict web type-check**

Run: `node --test tests/unit/secure-artifact-media.test.mjs tests/unit/brand-assets-component-preview.test.mjs && pnpm --filter @sakhaa-forge/web lint`

Expected: PASS; `artifact:` is never assigned directly to `src` or `href`.

- [ ] **Step 6: Commit the secure media boundary**

```bash
git add apps/web/app/brand-extract/_components/brand-assets/secure-artifact-media.ts apps/web/app/brand-extract/_components/brand-assets/SecureArtifactThumbnail.tsx tests/unit/secure-artifact-media.test.mjs tests/unit/brand-assets-component-preview.test.mjs
git commit -m "fix(v0-f3): resolve private artifact thumbnails"
```

### Task 4: Make candidate decisions server-confirmed and session-bound

**Files:**
- Modify: `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`
- Modify: `tests/unit/brand-extract-frontend-contract.test.mjs`
- Modify: `tests/e2e/brand-extract-demo-flow.test.mjs`

- [ ] **Step 1: Write a failing frontend contract test**

Assert that the studio uses the generated method and does not mutate candidate status before success:

```js
assert.match(source, /client\.updateBrandCandidateDecision\(crawlRunId, candidateId, \{ status \}\)/);
assert.doesNotMatch(source, /Optimistically update/);
assert.match(source, /setCandidateMutation\(\{ candidateId, state: "saving" \}\)/);
assert.match(source, /state: "stale-session"/);
```

- [ ] **Step 2: Run the narrow frontend contract test and record the red result**

Run: `node --test tests/unit/brand-extract-frontend-contract.test.mjs`

Expected: FAIL because raw fetch and optimistic updates remain.

- [ ] **Step 3: Replace single and bulk raw fetches with the generated method**

Use one shared mutation function:

```ts
const persistCandidateDecision = async (candidateId: string, status: "approved" | "rejected") => {
  if (!crawlRunId) return;
  setCandidateMutation({ candidateId, state: "saving" });
  const client = await createGeneratedWorkflowClient({
    baseUrl: "/api/v0",
    authToken: apiContext.authToken.trim()
  });
  const response = await client.updateBrandCandidateDecision(crawlRunId, candidateId, { status });
  if (response.status === 200) {
    setCandidates(current => current.map(candidate => candidate.id === candidateId ? { ...candidate, status } : candidate));
    setCandidateMutation({ candidateId, state: "saved" });
    return;
  }
  setCandidateMutation({
    candidateId,
    state: response.status === 404 ? "stale-session" : "failed"
  });
};
```

Bulk approval must await each call and retain failures per candidate; it must not pre-mark the entire section approved.

- [ ] **Step 4: Add calm recovery copy and controls**

For a tenant-hiding 404 show: `This review session is no longer current. Reload the crawl before changing decisions.` Provide a `Reload crawl` button that calls the existing crawl reload path. Do not expose whether a candidate exists in another workspace.

- [ ] **Step 5: Run unit and E2E decision tests**

Run: `node --test tests/unit/brand-extract-frontend-contract.test.mjs tests/e2e/brand-extract-demo-flow.test.mjs`

Expected: PASS for success, 404 recovery, and partial bulk failure without false approved state.

- [ ] **Step 6: Commit the candidate UI repair**

```bash
git add apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx tests/unit/brand-extract-frontend-contract.test.mjs tests/e2e/brand-extract-demo-flow.test.mjs
git commit -m "fix(v0-b2): confirm candidate decisions on server"
```

### Task 5: Submit exact brand approval through the generated client

**Files:**
- Modify: `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`
- Modify: `apps/web/src/workflow/v0-actions.ts`
- Modify: `tests/unit/brand-extract-adapter.test.mjs`
- Modify: `tests/unit/v0-web-actions.test.mjs`
- Modify: `tests/integration/brand-memory-b3.test.mjs`
- Modify: `tests/e2e/brand-extract-demo-flow.test.mjs`

- [ ] **Step 1: Write failing approval payload and UI-state tests**

Assert the submitted body contains the canonical B3 fields and that success is set only for a 201 response:

```js
assert.deepEqual(payload, {
  workspaceId,
  crawlRunId,
  decision: "approve",
  optimisticVersion: 0,
  profile: expectedProfile,
  rules: expectedTypedRules
});
assert.equal(ui.approvalStatus.submitted, false);
```

- [ ] **Step 2: Run B3 tests and record the red result**

Run: `node --test tests/unit/brand-extract-adapter.test.mjs tests/integration/brand-memory-b3.test.mjs`

Expected: FAIL because the constructor sends its draft shape with no generated authenticated client call.

- [ ] **Step 3: Add one adapter from the editable draft to the canonical approval input**

```ts
export function buildCanonicalApprovalInput(draft: ApprovalDraft, context: { workspaceId: string; crawlRunId: string }) {
  return {
    workspaceId: context.workspaceId,
    crawlRunId: context.crawlRunId,
    decision: "approve" as const,
    optimisticVersion: Math.max(0, Number(draft.version) - 1),
    profile: {
      publicName: draft.name.public,
      industry: draft.industry,
      markets: draft.markets,
      positioningStatement: draft.positioning.statement,
      products: draft.products,
      audiences: draft.audiences,
      callsToAction: draft.calls_to_action,
      voice: {
        attributes: draft.voice.attributes,
        avoid: draft.voice.avoid_list,
        formality: draft.voice.formality,
        languages: draft.voice.languages
      },
      visualIdentity: draft.visual_identity,
      claims: draft.claims,
      rightsAttestation: draft.rightsAttestationChecked
    },
    rules: [
      ...draft.rules.required_phrases.map(value => ({ type: "required_phrase", value, severity: "warning", rationale: "Approved brand phrase." })),
      ...draft.rules.prohibited_phrases.map(value => ({ type: "prohibited_phrase", value, severity: "critical", rationale: "Prohibited by approved brand rules." })),
      ...draft.rules.required_disclosures.map(value => ({ type: "required_disclosure", value, severity: "critical", rationale: "Required approved disclosure." }))
    ]
  };
}
```

Update the existing `WORKFLOW_ACTIONS["brand-approval"]` mapping to the same contract so both V0 web entry points use one API shape:

```ts
client.approveBrandProfile(ids.brandId, {
  workspaceId,
  crawlRunId: ids.crawlRunId,
  decision: "approve",
  optimisticVersion: Number(values.optimisticProfileVersion || 0),
  profile: {
    publicName: values.publicName,
    industry: values.industry,
    markets: [values.market],
    positioningStatement: values.positioning,
    products: [{ name: values.productName, category: values.productCategory, status: "active" }],
    audiences: [{ name: values.targetAudience, geography: [values.market] }],
    callsToAction: [{ label: values.cta, actionType: values.ctaActionType }],
    voice: { attributes: [values.tone], avoid: [], formality: "balanced", languages: [values.language] },
    visualIdentity: {},
    claims: [],
    rightsAttestation: values.rightsAttestation === true
  },
  rules: [
    ...(values.requiredRule ? [{ type: "required_phrase", value: values.requiredRule, severity: "warning", rationale: "Approved brand phrase." }] : []),
    ...(values.prohibitedRule ? [{ type: "prohibited_phrase", value: values.prohibitedRule, severity: "critical", rationale: "Prohibited by approved brand rules." }] : [])
  ]
})
```

Update the generic workflow fixture to provide `industry`, `market`, `productName`, `productCategory`, `ctaActionType`, and `language`; missing values must produce the existing 422 instead of being silently defaulted.

- [ ] **Step 4: Replace raw fetch and legacy envelope parsing**

```ts
const client = await createGeneratedWorkflowClient({
  baseUrl: "/api/v0",
  authToken: apiContext.authToken.trim()
});
const response = await client.approveBrandProfile(
  activeBrand.id,
  buildCanonicalApprovalInput(approvalDraft, {
    workspaceId: apiContext.workspaceId.trim(),
    crawlRunId
  })
);

if (response.status !== 201) {
  setApprovalMutation(response.status === 409 ? "stale-version" : "failed");
  return;
}

type ApprovedBrandProfileResponse = {
  profile: { id: string; version: number; approvedAt: string };
  approval: { id: string; decision: "approve" };
  rules: Array<{ id: string; type: string; value: string }>;
  audit: { id: string; eventType: "brand.profile.approved" };
};

const body = response.body as ApprovedBrandProfileResponse;
setApprovalStatus({
  submitted: true,
  timestamp: body.profile.approvedAt,
  version: body.profile.version,
  approvalId: body.approval.id
});
```

Remove the current `approvalHash` UI field and the “cryptographically bound” claim. The V0 response returns a profile, approval, rules, and audit record; it does not return a cryptographic approval hash.

- [ ] **Step 5: Add recovery for 401, 404, 409, and 422 without leaking protected detail**

Map these statuses to existing V0 language: sign in again, reload current brand session, refresh stale profile version, and correct highlighted approval fields. Keep the approval button disabled only while the request is in flight.

- [ ] **Step 6: Run B3 unit, integration, and E2E tests**

Run: `node --test tests/unit/brand-extract-adapter.test.mjs tests/unit/v0-web-actions.test.mjs tests/integration/brand-memory-b3.test.mjs tests/e2e/brand-extract-demo-flow.test.mjs`

Expected: PASS; the request carries bearer auth through the generated client and no optimistic approval appears.

- [ ] **Step 7: Commit the approval repair**

```bash
git add apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx apps/web/app/brand-extract/_components/candidate-adapter.ts apps/web/src/workflow/v0-actions.ts tests/unit/brand-extract-adapter.test.mjs tests/unit/v0-web-actions.test.mjs tests/integration/brand-memory-b3.test.mjs tests/e2e/brand-extract-demo-flow.test.mjs
git commit -m "fix(v0-b3): submit canonical brand approval"
```

### Task 6: Integrate the acquired brand assets cupboard as the next review card

**Files:**
- Modify: `apps/web/app/brand-extract/_components/brand-assets/AcquiredBrandAssetsCupboard.tsx`
- Modify: `apps/web/app/brand-extract/_components/brand-assets/BrandIntakeStepDeck.tsx`
- Modify: `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`
- Modify: `tests/unit/brand-assets-component-preview.test.mjs`
- Modify: `tests/e2e/brand-extract-browser-automation.test.mjs`

- [ ] **Step 1: Write failing composition and semantics assertions**

```js
assert.match(studio, /AcquiredBrandAssetsCupboard/);
assert.match(studio, /SecureArtifactThumbnail/);
assert.match(studio, /Remove from profile/);
assert.match(studio, /Retained evidence is not deleted/);
assert.doesNotMatch(studio, /src=\{asset\.locator\}/);
assert.doesNotMatch(studio, /href=\{asset\.locator\}/);
```

- [ ] **Step 2: Run component and frontend contract tests and record the red result**

Run: `node --test tests/unit/brand-assets-component-preview.test.mjs tests/unit/brand-extract-frontend-contract.test.mjs`

Expected: FAIL because the live constructor still renders opaque locators directly.

- [ ] **Step 3: Add a controlled selected-asset set to the approval draft**

```ts
const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());

const removeFromProfile = (assetId: string) => {
  setSelectedAssetIds(current => {
    const next = new Set(current);
    next.delete(assetId);
    return next;
  });
};
```

The action label is `Remove from profile`, not `Delete`. The confirmation states: `This removes the asset from the pending profile. Retained evidence is not deleted.`

- [ ] **Step 4: Compose the cupboard inside the controlled asset step**

First extend the cupboard contract so the application owns selection and thumbnail authorization:

```ts
export type AcquiredBrandAssetsCupboardProps = {
  assets: Array<AcquiredBrandAsset & { selected: boolean }>;
  renderThumbnail: (asset: AcquiredBrandAsset) => ReactNode;
  onAdd: () => void;
  onRemove: (assetId: string) => void;
};
```

Then pass stable domain state into the reusable component:

```tsx
<AcquiredBrandAssetsCupboard
  assets={assetPack.map(asset => ({
    id: asset.id,
    artifactReference: asset.locator as `artifact:${string}`,
    name: asset.name,
    category: asset.category,
    provenance: `Crawl run ${crawlRunId}`,
    rights: `${asset.rightsBasis} · ${asset.permittedUse}`,
    status: asset.status === "CLEAN" ? "ready" : "unavailable",
    selected: selectedAssetIds.has(asset.id)
  }))}
  renderThumbnail={asset => (
    <SecureArtifactThumbnail
      artifactReference={asset.locator}
      workspaceId={apiContext.workspaceId.trim()}
      client={client}
      alt={asset.name}
      status={asset.status}
    />
  )}
  onAdd={() => setCurrentStep(2)}
  onRemove={removeFromProfile}
/>
```

Use the generated `listBrandAssets(activeBrand.id)` response as the retained library truth. Candidate-only or rejected assets remain visibly separate and never receive a clean-retained badge.

- [ ] **Step 5: Preserve sideways scrolling and non-gesture navigation**

The shelf remains a named `overflow-x-auto` region with native row buttons. Swipe may advance only when `canAdvance` is true; Back and Next remain visible and keyboard operable.

- [ ] **Step 6: Run unit and browser E2E tests**

Run: `node --test tests/unit/brand-assets-component-preview.test.mjs tests/e2e/brand-extract-browser-automation.test.mjs`

Expected: PASS for loading, retained, rejected, removed-from-profile, empty, and failed-download states at desktop and narrow widths.

- [ ] **Step 7: Commit the acquired-assets step**

```bash
git add apps/web/app/brand-extract/_components/brand-assets apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx tests/unit/brand-assets-component-preview.test.mjs tests/e2e/brand-extract-browser-automation.test.mjs
git commit -m "feat(v0-b2a): add acquired brand asset review step"
```

### Task 7: Integrate the approved Liquid Ether and motion behavior safely

**Files:**
- Modify: `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`
- Verify: `apps/web/app/brand-extract/_components/brand-assets/LiquidEther.tsx`
- Verify: `apps/web/app/brand-extract/_components/brand-assets/LiquidEtherBackground.tsx`
- Verify: `apps/web/app/brand-extract/_components/brand-assets/MagneticNextCue.tsx`
- Modify: `tests/e2e/brand-extract-browser-automation.test.mjs`

- [ ] **Step 1: Add failing E2E assertions for motion and fallback behavior**

Test that the background canvas is decorative, the Next button remains native, and reduced motion selects the static layer:

```js
assert.equal(await page.locator('[data-static-fallback="true"]').count(), 1);
assert.equal(await page.getByRole("button", { name: "Next step" }).count(), 1);
assert.equal(await page.locator("canvas").getAttribute("aria-label"), null);
```

- [ ] **Step 2: Run the browser E2E test and record the red result**

Run: `node --test tests/e2e/brand-extract-browser-automation.test.mjs`

Expected: FAIL because the approved motion layer is not composed into the live constructor.

- [ ] **Step 3: Mount the source-faithful wrapper behind the constructor content**

```tsx
<main className="relative min-h-dvh overflow-hidden bg-[#050507]">
  <LiquidEtherBackground />
  <div className="relative z-10">
    <BrandIntakeStepDeck {...stepDeckProps} />
  </div>
</main>
```

Keep the approved settings in `LiquidEtherBackground`: palette `#5227FF`, `#FF9FFC`, `#B497CF`; force `20`; cursor `100`; viscosity `30`; both iteration counts `32`; resolution `0.5`; auto speed `0.5`; intensity `2.2`; takeover `0.25`; resume delay `3000`; ramp `0.6`.

- [ ] **Step 4: Verify performance suspension and accessibility fallbacks**

Confirm ReactBits' `IntersectionObserver` and `visibilitychange` pause paths remain present. Confirm reduced motion and WebGL initialization failure never block content or navigation.

- [ ] **Step 5: Run E2E, type-check, and production build**

Run: `node --test tests/e2e/brand-extract-browser-automation.test.mjs && pnpm --filter @sakhaa-forge/web lint && pnpm --filter @sakhaa-forge/web build`

Expected: PASS; `/brand-extract` and `/brand-extract/components` build, and the static fallback remains usable.

- [ ] **Step 6: Commit the live visual integration**

```bash
git add apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx apps/web/app/brand-extract/_components/brand-assets tests/e2e/brand-extract-browser-automation.test.mjs
git commit -m "feat(v0-b2): integrate approved brand intake motion"
```

### Task 8: Retain slice evidence and run the V0 verification gate

**Files:**
- Modify: `docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md`
- Modify: `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- Modify: `docs/V0/V0_API.md`
- Modify: `docs/V0/V0_ERROR_CATALOG.md`
- Modify: `docs/V0/CHANGELOG.md`
- Modify: `docs/Project/Updates/2026-07-16_0413_brand-assets-handover.md`

- [ ] **Step 1: Update screen and state contracts**

Record these explicit UI states: asset library loading, empty, ready, download expired/retrying, unavailable, rejected source, removed from pending profile, candidate saving, stale review session, approval saving, stale profile version, and approval failed.

- [ ] **Step 2: Update the V0 changelog without claiming slice acceptance**

Add an Unreleased entry:

```markdown
- `V0-F3`, `V0-B2`, `V0-B2A`, `V0-B3`: repaired generated-client brand decisions and approval, resolved private artifact thumbnails through authorized short-lived downloads, normalized branding locators, and added the acquired-assets review card. This entry records verified behavior only and does not mark the slices accepted.
```

- [ ] **Step 3: Run focused security and tenancy verification**

Run: `node --test tests/integration/artifacts.test.mjs tests/integration/brand-intake-usp-assets.test.mjs tests/integration/brand-memory-b3.test.mjs`

Expected: PASS; cross-tenant artifact and candidate access stays tenant-hidden, and approval permissions remain server-enforced.

- [ ] **Step 4: Run contract, unit, and E2E suites**

Run: `pnpm test:contract && pnpm test:unit && pnpm test:e2e`

Expected: PASS with no skipped new tests.

- [ ] **Step 5: Run the repository verification command**

Run: `pnpm verify`

Expected: exit code 0. If an unrelated pre-existing failure remains, retain the exact command, failure, and ownership evidence in the handover and leave slice acceptance incomplete.

- [ ] **Step 6: Inspect generated and worktree diffs**

Run: `git diff --check && git status --short && git diff -- packages/contracts/generated/openapi.v0.json packages/contracts/generated/v0-client.mjs`

Expected: no whitespace errors; generated diffs match the source OpenAPI operation only; user-owned changes remain preserved.

- [ ] **Step 7: Commit documentation and evidence**

```bash
git add docs/V0/V0_SCREEN_AND_STATE_INVENTORY.md docs/V0/V0_INFORMATION_ARCHITECTURE.md docs/V0/V0_API.md docs/V0/V0_ERROR_CATALOG.md docs/V0/CHANGELOG.md docs/Project/Updates/2026-07-16_0413_brand-assets-handover.md
git commit -m "docs(v0): retain brand asset repair evidence"
```

## Completion criteria

- No browser request uses the `artifact:` scheme.
- No malformed Firecrawl locator is promoted as a retained asset candidate.
- Candidate decisions and brand approval use generated authenticated client methods.
- Candidate and approval states become successful only after server confirmation.
- A stale tenant tuple produces calm recovery without exposing protected existence.
- Every clean private thumbnail re-signs through `/artifacts/{id}/downloads`; a second failure ends in `unavailable`.
- The acquired-assets cupboard supports add and remove-from-profile controls while retained evidence remains intact.
- Liquid Ether is the source-faithful ReactBits fluid solver with the approved settings, not a custom cloud/noise shader.
- Keyboard, screen-reader, narrow viewport, reduced-motion, WebGL failure, empty, retry, and failure paths are verified.
- Generated contracts, canonical docs, changelog, tests, and retained evidence agree.
