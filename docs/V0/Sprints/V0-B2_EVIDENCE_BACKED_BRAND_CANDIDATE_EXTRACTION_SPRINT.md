# V0-B2 Sprint: Evidence-Backed Brand Candidate Extraction

## Sprint Objective

Extract brand candidates with confidence and source evidence while making low-confidence,
partial and invalid extraction states explicit.

## Source Contracts

- `../V0_BRAND_PROFILE_CONTRACT.md`
- `../V0_DATA_MODELS.md`
- `../V0_JOBS.md`
- `../V0_ERROR_CATALOG.md`
- `../../Project/Guardrails/PROJECT_GUARDRAIL_AI_ASSISTED_DEVELOPMENT.md`
- `../../Project/DESIGN.md`

## Sprint Backlog

- Parse crawl outputs, CSS, fonts, colors, copy and uploaded assets.
- Extract logo, colors, fonts, tone, offers, USPs, CTAs, audiences and prohibited claims.
- Preserve source evidence and confidence for every candidate.
- Isolate prompt input from instructions in crawled content.
- Classify partial, low-confidence, empty, refused and malformed extraction outputs.
- Expose candidate provenance in the review UI.
- Record stage events and extraction artifacts.

## TDD And Verification Plan

First failing test: malformed, empty, refused or prompt-injected output becomes a brand
candidate without evidence.

Required tests:

- Deterministic website and document fixtures.
- Prompt-injection isolation test.
- Schema-invalid AI/parser output rejection.
- Partial-result and low-confidence UI states.

## Security And Guardrails

- Extracted values are candidates only; they cannot become production brand truth.
- Source evidence must not expose secrets or signed URLs.
- Protected tenant existence remains hidden in errors.

## Completion Evidence

- Candidate-source trace.
- Extraction fixtures and red/green tests.
- UI screenshots for candidate list and partial states.
- Job event history for extraction stages.
