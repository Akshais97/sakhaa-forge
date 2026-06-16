# Source of Truth

## Product Version Authority

- **Product V0:** Sakhaa Forge, the standalone production engine governed first by
  `../../V0/V0.md` and then its linked `../../V0/V0_*.md` contracts.
- **Product V1:** the additive quality, reliability, scale and deferred-capability
  evolution of Sakhaa Forge, defined in
  `../../V1/V1_EVOLUTION.md`.
- **Product V2:** Sakhaa, governed by `../../V2/V2.md` and `../../V2/V2_*.md`.
- Phase numbers are local to their product version. For example, V0 Phase 1 and V2
  Phase 1 are different delivery boundaries.

The strict product sequence is V0 to V1 to V2. V0 does not depend on V1 or V2. V1
preserves and improves V0. V2 consumes mature production artifacts for scoring,
comparison, recommendation, generation briefs and learning.

## Authority Order

- Project lineage and conflict order: this document.
- V0 targets and acceptance: `../../V0/V0.md`.
- V0 product scope and output contract: `../../V0/V0_PRODUCT_SPECIFICATION.md`.
- V0 data/schema/architecture: `../../V0/V0_DATA_MODELS.md`,
  `../../V0/V0_PRISMA_SCHEMA.md`, and `../../V0/V0_ARCHITECTURE.md`.
- V1 evolution: `../../V1/V1_EVOLUTION.md`.
- V2 direction and release gates: `../../V2/V2_PRD.md`.
- Cross-product ownership and handoff:
  `../Architecture/PROJECT_ARCHITECTURE_V1_V2_BOUNDARY.md`.
- Architecture decisions: accepted entries in `../Architecture/PROJECT_ARCHITECTURE_DECISIONS.md`.
- Mandatory implementation rules: `../Guardrails/PROJECT_GUARDRAILS.md` and its linked
  subject guardrails.
- Product design mechanics: `../DESIGN.md`.
- Product identity and language: `../Design/PROJECT_BRAND_GUIDELINES.md` and
  `../Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`.
- Development workflow and toolchain: `../Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`.
- Deployment-specific configuration inventory:
  `../Operations/PROJECT_CONFIGURATION_CATALOG.md`.
- Scientific claims: `../../V2/V2_SCIENTIFIC_CLAIMS_REGISTER.md`.
- Teacher pipeline: `kaggle_tribev2_pipeline_bundle/tribev2_stages/`.
- HCP mapping: `kaggle_tribev2_pipeline_bundle/map_hcp_atlas_kaggle.py`.
- Cluster contract: `marketing_scoring/tribev2_hcp_mmp1_17_cluster_reference_v4.csv`.
- Outcome formulas: `marketing_scoring/score_marketing_outcomes.py`.
- LLM boundary: `marketing_scoring/build_llm_analysis_prompt.py`.
- Model source: `tribev2-main/tribev2-main/`.

`handover.md` is historical input and does not override a current product target, PRD,
ADR, contract,
security, privacy, or release-gate decisions.

## Unsupported Historical Material

Historical atlas experiments, earlier cluster contracts, and their reports live only in
`v0_testing/`. They are excluded from current implementation, tests, packaging, and
product claims. Root research notes that claim direct emotion, desire, addiction, or
purchase intent are also non-authoritative. Any numeric runtime or accuracy claim must be
reproduced by a recorded benchmark.

The historical directory name `v0_testing/` predates the product-version decision and
does **not** define or implement Product V0. Product V0 is owned only by
`../../V0/V0.md`, its linked contracts and executable implementation evidence.

## Conflict Rule

Executable contracts beat prose. New code must update its owning document in the
same change. Architecture changes require an ADR. Schema changes require a migration,
contract version, compatibility decision, and fixture update.

Future-state documents do not prove implementation. Only passing tests, benchmarks,
migrations and deployed configuration establish existence. For V2, current executable
claims are additionally summarized in `../../V2/V2_IMPLEMENTED_FEATURES.md`.
