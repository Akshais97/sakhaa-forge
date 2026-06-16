# V0-S1 Sprint: Auditable Script Tournament

## Sprint Objective

Generate and evaluate 10-20 brand- and formula-constrained script variants while
preserving every variant, evaluation, prompt/model version and policy decision.

## Source Contracts

- `../V0_PRODUCT_SPECIFICATION.md`
- `../V0_DATA_MODELS.md`
- `../V0_API.md`
- `../V0_BRAND_PROFILE_CONTRACT.md`
- `../V0_ANALYTICS_EVENT_TAXONOMY.md`
- `../../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`

## Sprint Backlog

- Create `ScriptTournament`, `ScriptVariant`, `ScriptEvaluation` and supporting
  artifacts.
- Generate 10-20 variants through deterministic simulator by default.
- Bind generation to approved brand profile, formula and director prompt.
- Evaluate hook strength, timing, pattern interrupts, CTA, claims, captions and tone.
- Preserve prompt version, model version, policy checks and brand-rule checks.
- Expose progress, invalid/refused variants and token/cost telemetry.
- Block advancement when valid variant count or required evaluations are missing.

## TDD And Verification Plan

First failing test: the tournament advances with fewer than 10 valid scripts, prohibited
claims, schema-invalid output or missing evaluations.

Required tests:

- Variant-count lower and upper boundary tests.
- Prohibited-claim and brand-rule tests.
- Malformed/refusal simulator tests.
- Tournament browser journey.

## Security And Guardrails

- No unapproved brand profile or draft blueprint can enter script generation.
- Scripts must not make guaranteed virality, reach, sales or scientific claims.
- Raw prompts and script text must not enter analytics.

## Completion Evidence

- Tournament ID with all variant IDs.
- Evaluation records and prompt/model versions.
- Policy and brand-rule test output.
- Browser screenshots for progress and comparison-ready state.
