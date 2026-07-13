# V0-A3 Sprint: Standalone Real-Estate Reference Journey

## Sprint Objective

Complete one India-first real-estate workspace journey from brand intake through
audience-verified publication without manual intervention inside the pipeline and with
V1/V2 absent.

## Source Contracts

- `../V0.md`
- `../V0_PRODUCT_SPECIFICATION.md`
- `../V0_VERTICAL_OUTCOME_SLICES.md`
- `../V0_TEST_PERSONAS_AND_SEED_FIXTURES.md`
- `../V0_SETUP_RUNBOOK.md`
- `../../Project/Governance/PROJECT_GOVERNANCE_FOUNDER_RISK_ACCEPTANCE.md`

## Sprint Backlog

- Prepare real-estate workspace, approved fixtures and staging/provider simulator plan.
- Complete brand intake, candidate review and brand profile approval.
- Complete blueprint choice, discovery/default path and immutable blueprint readiness.
- Complete script tournament and selected-script approval.
- Complete avatar selection, estimate, reservation, HeyGen route and generated media.
- Complete AE plan, final render and exact-version review approval.
- Complete calendar, Meta/YouTube/manual publication path and audience verification.
- Export lineage, ledger, trace, stable IDs, content hashes and the deterministic technical
  scorecard.

## Closure Scope (owner decision, reconciled to `docs/V0/V0.md`)

V0-A3 closes **technical completion** only. Per `docs/V0/V0.md` ("V0 Completion Rule"),
technical completion authorizes a controlled pilot, not unrestricted commercial launch.
The closure evidence below is the automatable technical acceptance evidence retained by the
generated-client journey. Two artifact types named by the broader V0 acceptance contracts are
**not** A3 closure evidence and are governed elsewhere:

- **Founder-reviewed measured pilot scorecard** — covering time to first approved video,
  approval/revision rate, provider and infrastructure cost, manual intervention minutes per
  verified post, repeat usage and customer willingness to pay — is the human business
  acceptance step before external launch defined by `docs/V0/V0.md` and
  `docs/Project/Governance/PROJECT_GOVERNANCE_FOUNDER_RISK_ACCEPTANCE.md`. It is not
  automatable and is explicitly not claimed by A3 technical closure. The deterministic
  *technical* scorecard assembled by the journey is the A3 artifact (honest retained IDs,
  hashes, integer-minor cost, reconciled ledger, `observationsOnly`, `v1V2Absent`,
  `noClaimOf`); it is not the founder-approved measured pilot scorecard.
- **Screenshots** of brand approval, blueprint choice, script selection, generation
  estimate, review approval, calendar and verified post remain required V0 acceptance
  evidence (`docs/V0/V0.md` "Required Acceptance Evidence" and Build Gate V0-G8). They are a
  presentation artifact of a real browser/pilot run and are not reproducible in a headless
  generated-client local verification; they are retained at the final V0 acceptance run, not
  in this A3 local verification. The generated-client deterministic proof (stable IDs,
  content hashes, public URLs and the complete lineage manifest) stands in for screenshot
  evidence **for this local verification scope only**; the V0/G8 screenshot requirement is
  unchanged.

## TDD And Verification Plan

First failing test: the reference journey needs manual database edits, hidden provider
retries, unrecorded file movement, V1/V2 calls or has evidence gaps.

Required tests:

- End-to-end reference journey.
- V1/V2 absence check.
- Recovery/security reports from A2.
- Ledger reconciliation.
- Full lineage manifest validation.

## Security And Guardrails

- No manual database edits.
- No hidden retries of uncertain paid or publishing operations.
- No scientific, guaranteed virality, conversion or reach claims.
- Technical completion authorizes controlled pilot readiness only.

## Completion Evidence (A3 technical closure)

- Brand approval ID and approval audit.
- Blueprint choice and immutable artifact hashes.
- Script tournament and selected script ID.
- Estimate, reservation, provider operation and settled ledger.
- AE plan, final-video hash and review decision.
- Calendar post, external ID, public URL and audience verification.
- Complete lineage manifest.
- Recovery/security reports surfaced inside the reference journey workspace.
- Deterministic technical scorecard (retained IDs, content hashes, integer-minor cost,
  reconciled ledger, `observationsOnly: true`, `v1V2Absent: true`, `noClaimOf` list).

## Post-A3 human / V0 acceptance gates (not A3 closure evidence)

- Founder-reviewed measured pilot scorecard — human business acceptance step before
  external launch (`docs/V0/V0.md`, `docs/Project/Governance/PROJECT_GOVERNANCE_FOUNDER_RISK_ACCEPTANCE.md`).
- Screenshots of the user journey screens — required V0 acceptance evidence retained at the
  final V0 acceptance run / Build Gate V0-G8.
