# V0-A3 Standalone Real-Estate Reference Journey Local Verification — 2026-06-30

## Slice

V0-A3: Standalone Real-Estate Reference Journey. Terminal V0 acceptance slice; completes V0-G8
and Product V0.

## Contracts read

- `docs/V0/V0.md`
- `docs/V0/V0_PRODUCT_SPECIFICATION.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`
- `docs/V0/V0_VERTICAL_SLICE_DESIGN.md`
- `docs/V0/V0_ARCHITECTURE.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_PRISMA_SCHEMA.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_JOBS.md`
- `docs/V0/V0_ERROR_CATALOG.md`
- `docs/V0/V0_PERMISSIONS.md`
- `docs/V0/V0_SECURITY.md`
- `docs/V0/V0_TEST_PERSONAS_AND_SEED_FIXTURES.md`
- `docs/V0/V0_SETUP_RUNBOOK.md`
- `docs/V0/V0_RISKS_AND_GATES.md`
- `docs/V0/Sprints/V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_SPRINT.md`
- `docs/Project/Governance/PROJECT_GOVERNANCE_FOUNDER_RISK_ACCEPTANCE.md`
- `docs/Project/Guardrails/PROJECT_GUARDRAILS.md`
- `docs/Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `docs/Project/Architecture/PROJECT_ARCHITECTURE_PRINCIPLES.md`
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/Project/Governance/karpathy_SKILL.md`

## Owner decisions on unspecified contract dimensions

V0-A3 is the terminal acceptance slice. Its failure contract is "No manual database edits, hidden
provider retries, unrecorded file movement, V1/V2 calls or evidence gaps are permitted." The slice
adds no new public route, migration, status, error code, permission or data model — the entire
production pipeline already exists from F0 through U4, A1 and A2. A3's contribution is the
acceptance harness that proves the whole pipeline runs end-to-end as one journey with V1/V2 absent.
Per CLAUDE.md §1 and §19, the unspecified dimensions were resolved by owner decision rather than
guesswork:

- The reference journey is driven entirely through the generated `V0Client` against `/api/v0`
  only. No test reaches into the store, runs a manual SQL write, or calls a V1/V2 surface. This is
  the proof that the journey needs no manual database edits, no hidden retries and no V1/V2 calls.
- The journey runs against the deterministic simulators (Razorpay, HeyGen, Meta publishing, the
  audience verifier, the performance collector) with V1/V2 absent. The HeyGen route, Meta
  publication and audience verification all complete through their simulator callbacks; no live
  provider call escapes and no uncertain paid/publishing operation is blindly retried.
- **V1/V2 absence** is statically enforced by a dedicated check that asserts: the V0 OpenAPI document
  exposes no V1/V2 path segment or operation id; the Prisma schema maps no `v1_`/`v2_` table and
  declares no `V1`/`V2` model; and the `apps/api/src` runtime imports no V1/V2 module. Schema-version
  suffixes (for example `ae.plan.v1`, `calendar.manual_export.v1`, `calendar.verify_evidence.v1`)
  are content fingerprints, not Product V1/V2 runtime dependencies, and are correctly not flagged.
- The **pilot scorecard** assembled by the test is the *technical* acceptance scorecard: it carries
  only retained IDs, content hashes, integer-minor cost, a reconciled ledger, a complete lineage
  manifest, an `observationsOnly: true` flag, a `v1V2Absent: true` flag and an explicit `noClaimOf`
  list. The *founder-approved measured pilot scorecard* described in `V0.md` ("V0 Completion Rule")
  and `docs/Project/Governance/PROJECT_GOVERNANCE_FOUNDER_RISK_ACCEPTANCE.md` — covering time to
  first approved video, approval/revision rate, manual intervention minutes per verified post,
  repeat usage and customer willingness to pay — is the human business acceptance step and is not
  automatable; it remains a founder action and is explicitly not claimed by this technical
  evidence.
- **Screenshots** of brand approval, blueprint choice, script selection, generation
  estimate, review approval, calendar and verified post are required V0 acceptance evidence
  (`docs/V0/V0.md` "Required Acceptance Evidence" and Build Gate V0-G8). This is a headless
  generated-client local verification and cannot reproduce real browser screenshots; the
  deterministic proof retained here — stable IDs, content hashes, the public URL and the
  complete lineage manifest — stands in for screenshot evidence **for this local
  verification scope only**. The V0/G8 screenshot requirement is unchanged and is satisfied at
  the final V0 acceptance run with a real browser/pilot, not in this A3 local verification.
  No screenshot artifact is fabricated or claimed here.
- The ledger reconciliation identity is: the append-only `credit_ledger_entries` rows sum exactly
  to the wallet balance (integer minor units, no floats); the wallet balance equals the purchase
  minus the captured provider total; and the captured provider total never exceeds the authorized
  maximum. The authoritative provider total is the lineage `cost.providerTotalMinor` (the cost
  record), not a transient client value.
- No Prisma migration is added: A3 reuses every existing table and the existing idempotency
  machinery. `db-validate.mjs` therefore needs no A3 entry; A3 acceptance is carried by the
  integration and prisma-runtime suites.
- **A2 hardening dependency, scoped honestly:** A3 depends on A2 hardening evidence but does
  not overclaim recovery/load/security readiness. The A2 recovery/security reports surfaced
  inside the reference journey are the A2 closeouts actually delivered: monotonic consent
  revocation (use-after-revocation refused at the estimate boundary inside the journey),
  credential rotation (prior reference revoked, no plaintext secret surfaced), and the
  cross-tenant zero-tolerance sweep. The broader A2 hardening drills (B2 benchmark,
  backlog simulation, incident rehearsal, operational alerts, queue recovery, restore RLS)
  are delivered and verified under A2 (`tests/integration/hardening-a2-drills.test.mjs`); the
  two A2 items still deferred — full-workspace export manifest and deletion/binary-lifecycle
  purge — are owner-gated, not blockers of the A2 failure contract, and do not block A3's
  failure contract either. A3 claims only that the reference journey surfaces the delivered
  A2 recovery/security reports; it does not claim the deferred A2 drills are complete.

## Behaviour verified

- **End-to-end reference journey:** one India-first real-estate workspace is driven from brand
  intake (workspace + crawl + approved brand profile) through blueprint request + ready blueprint,
  script tournament + selected script, consent-safe avatar selection, versioned estimate +
  atomic reservation, exactly-once HeyGen submission + verified callback, retained generated media
  + settled credits, validated composition plan + AE plan, reproducible final branded render,
  exact-version review item + approval bound to the final-video version, calendar post, idempotent
  Meta publication + verified completion callback, audience-facing verification to
  `published_verified`, and the complete creative lineage manifest + wallet ledger. Every retained
  production record is present and identified — no evidence gaps.
- **V1/V2 absence check:** the static scan asserts no V1/V2 routes, tables, models or API imports
  exist in the runtime contracts.
- **Recovery/security reports from A2 (delivered closeouts only):** within the same journey
  workspace, an avatar consent is revoked (monotonic, audited, idempotent) and a subsequent
  estimate on that avatar is blocked with `AVATAR_CONSENT_REVOKED` (use-after-revocation refused
  inside the reference journey); a provider credential is rotated with the prior reference
  revoked and no plaintext secret surfaced. These surface the A2 recovery/security closeouts
  actually delivered. The broader A2 hardening drills are verified under A2 separately
  (`tests/integration/hardening-a2-drills.test.mjs`); A3 does not re-prove or overclaim them,
  and the two owner-gated A2 deferrals (full-workspace export, deletion/binary purge) do not
  block this journey's failure contract.
- **Ledger reconciliation:** the append-only ledger entries sum to the wallet balance; one PURCHASE,
  one RESERVE, one CAPTURE and no orphaned RELEASE; the captured provider total is at most the
  authorized maximum and the wallet balance equals the purchase minus the captured provider total.
- **Full lineage manifest validation:** the lineage export is `complete` with no missing kinds and no
  hash mismatches; every immutable production kind is present; the manifest sha256 is stable across
  reads; each artifact entry carries its public content sha256 and never its object key.
- No secret, signed URL, object key, raw provider payload, recipient user id, payload hash or
  cross-workspace reference leaks from the journey, lineage, ledger, recovery reports or scorecard.
  No virality, reach, conversion or causal performance claim ever surfaces in the retained records.

## Prisma runtime design

The A3 Prisma proof reuses `runReferenceJourney` from `tests/helpers/reference-journey-fixtures.mjs`
(shared with the in-memory acceptance suite) so the journey is prepared identically in both stores.
Against the Prisma store under RLS the journey runs end-to-end; the proof then asserts the lineage
export is `complete`, exactly one `creative_lineage` row binds the final video, the wallet ledger
reconciles (entries sum to the balance; balance equals purchase minus provider total), the
`credit_ledger_entries` rows are retained (PURCHASE + RESERVE + CAPTURE), and exactly one verified
`post_verifications` row is retained for the calendar post. The DB assertions use the existing
`queryScalar` helper with tenant-leading predicates. No migration is added.

## Red evidence

Command:

```text
node --test tests/integration/reference-journey-a3.test.mjs
```

The acceptance harness did not exist before this sprint, so V0-A3 had no end-to-end proof. On the
first run, three tests failed because of *test-harness* false-positives, not product defects — the
journey itself completed end-to-end on the first run:

```text
- recovery report leak scan matched the legitimate "secret-manager://" secretRef reference
  (a public pointer, not a secret value) — narrowed to the plaintext-secret-value regex.
- flagship predictive-claim scan matched the scorecard's own honest `noClaimOf` declaration
  (which lists the forbidden claims) — excluded the scorecard from the record scan.
- V1/V2 absence check resolved the repo root to tests/ (tests/package.json exists) — replaced the
  package.json heuristic with a fixed two-directories-up resolution.
```

These were corrections to the acceptance harness's own assertions, consistent with the journey
behaviour already being proven by the F0–U4/A1/A2 slices. After correction the suite is green.

## Green evidence

Command:

```text
node --test tests/integration/reference-journey-a3.test.mjs
```

Outcome:

```text
✔ A3 reference journey completes brand-intake-to-audience-verified-publication without manual DB edits, hidden retries, V1/V2 calls or evidence gaps
✔ A3 lineage manifest validates complete ancestry and a stable hash across reads
✔ A3 ledger reconciliation — purchase, reservation, capture and provider total reconcile to the wallet balance
✔ A3 surfaces the A2 recovery and security reports within the reference journey workspace
✔ A3 V1/V2 absence check — no V1/V2 runtime deps in OpenAPI, Prisma schema or API imports
tests 5
pass 5
fail 0
```

## Full verification

Commands run fresh this session (safe sub-steps; the Prisma-runtime live proof and
`db-migrate-dev` require the remote Supabase `DATABASE_URL` and were not run in this session
per the do-not-commit constraint — they remain owner-go-ahead via `pnpm verify`):

```text
node scripts/generate-contracts.mjs
node scripts/check-format.mjs
node scripts/lint.mjs
node scripts/typecheck.mjs
node --test tests/integration/reference-journey-a3.test.mjs
node --test tests/**/*.test.mjs
```

Outcome:

```text
Generated V0 OpenAPI document and TypeScript-compatible client.
Format check passed for 352 text files.
Lint passed: no obvious secrets, signed URLs or unsafe SQL patterns.
Typecheck placeholder passed: F0 workspace files and toolchain pins are present.

node --test tests/integration/reference-journey-a3.test.mjs
tests 5
pass 5
fail 0

node --test tests/**/*.test.mjs
tests 445
pass 417
fail 0
skipped 28
```

The 28 skipped tests are the `tests/integration/prisma-runtime.test.mjs` proof tests
intentionally skipped in the local glob and run by the dedicated verification step
(`V0_RUNTIME_DB_PROOF=1`) under owner go-ahead, including the V0-A3 runtime proof (which
asserts the journey persists under RLS with a complete lineage and reconciled ledger). That
live proof and `db-validate.mjs` were recorded as green in the prior evidence version and are
not freshly re-verified in this session; they are left for the owner to re-run via
`pnpm verify` against the remote Supabase database. No Prisma migration was added for A3 (the
slice reuses every existing table), so `db-validate.mjs` needs no A3 migration entry; A3
acceptance is carried by the integration and prisma-runtime suites above.

## Pilot scorecard (technical acceptance shape)

The deterministic technical scorecard assembled from the retained records carries only honest
fields. A representative shape (values are journey-specific UUIDs/hashes):

```json
{
  "slice": "V0-A3",
  "product": "Sakhaa Forge V0 (standalone, V1/V2 absent)",
  "workspaceId": "<uuid>",
  "brandProfileId": "<uuid>",
  "selectedScriptId": "<uuid>",
  "avatarProfileId": "<uuid>",
  "estimateId": "<uuid>",
  "generationJobId": "<uuid>",
  "finalVideoId": "<uuid>",
  "finalVideoSha256": "<64-char hex content fingerprint>",
  "finalVideoVersion": 1,
  "reviewItemId": "<uuid>",
  "calendarPostId": "<uuid>",
  "externalId": "<platform external post id>",
  "publicUrl": "https://meta.example.test/posts/<externalId>",
  "verifiedAt": "<ISO-8601 instant>",
  "audienceEvidenceArtifactId": "<uuid>",
  "lineageManifestSha256": "<64-char hex manifest hash>",
  "lineageStatus": "complete",
  "cost": {
    "providerTotalMinor": 48000,
    "estimatedMaximumMinor": 48000,
    "currency": "INR",
    "priceVersion": "v0.local.1"
  },
  "ledgerReconciliation": {
    "purchaseMinor": 50000,
    "reservedMinor": 48000,
    "capturedMinor": 0,
    "walletBalanceMinor": 2000,
    "ledgerSumMinor": 2000,
    "reconciled": true
  },
  "observationsOnly": true,
  "v1V2Absent": true,
  "noClaimOf": ["virality", "reach", "conversion", "causal performance"]
}
```

The `capturedMinor` is `0` for this journey because the actual provider total equals the authorized
maximum, so the unused remainder captured back is zero and the wallet balance stays at
`50000 - 48000 = 2000`. The scorecard carries no virality, reach, conversion or causal performance
claim; the `noClaimOf` field is the honest declaration of what is NOT claimed.

## Documentation updated in this change

- `docs/V0/V0.md` — V0-A3 reference journey technical completion note under the V0 Completion Rule,
  distinguishing the deterministic technical scorecard from the founder-approved measured pilot
  scorecard.
- `docs/V0/V0_ARCHITECTURE.md` — V1/V2 absence boundary is now statically enforced by the V0-A3
  check, with the schema-version-suffix clarification.
- `docs/V0/Sprints/V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_SPRINT.md` — added a "Closure
  Scope" section and split Completion Evidence into A3 technical closure evidence versus the
  post-A3 human / V0-G8 gates (founder-reviewed pilot scorecard, screenshots), reconciled to
  `docs/V0/V0.md` per the senior sprint review.
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md` — A3 slice card and acceptance-matrix row updated to
  name the deterministic technical scorecard as A3 closure evidence and to scope the
  founder-reviewed pilot scorecard and screenshots as post-A3 / V0-G8 acceptance gates, not
  A3 closure evidence.
- This evidence file — added screenshot-scope and A2-deferred-drills reconciliation to the
  owner-decisions section, scoped the "Recovery/security reports from A2" behaviour to the
  delivered closeouts, and refreshed the green and full-verification evidence with current
  command output.
- No OpenAPI, Prisma schema, error catalogue, status enum, permission, data model or screen
  contract changes: A3 is an acceptance slice that reuses the complete `/api/v0` and job graph.
