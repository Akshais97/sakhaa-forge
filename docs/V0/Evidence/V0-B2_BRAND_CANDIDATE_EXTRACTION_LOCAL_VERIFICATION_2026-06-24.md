# V0-B2 Brand Candidate Extraction Local Verification

Date: 2026-06-24  
Slice: V0-B2 evidence-backed brand candidate extraction  
Behaviour: deterministic scrape output becomes candidates with source evidence

## Scope

This evidence covers the first V0-B2 behaviour. It does not approve brand truth or close
B3.

## Sources

- `docs/V0/Sprints/V0-B2_EVIDENCE_BACKED_BRAND_CANDIDATE_EXTRACTION_SPRINT.md`
- `docs/V0/V0_BRAND_PROFILE_CONTRACT.md`
- `docs/V0/V0_API.md`
- `docs/V0/V0_DATA_MODELS.md`
- `docs/V0/V0_JOBS.md`
- Firecrawl references:
  - `firecrawl-main/firecrawl-main/apps/api/src/types/branding.ts`
  - `firecrawl-main/firecrawl-main/apps/api/src/lib/branding/schema.ts`
  - `firecrawl-main/firecrawl-main/apps/api/src/lib/branding/types.ts`
  - `firecrawl-main/firecrawl-main/apps/api/src/lib/branding/prompt.ts`
  - `firecrawl-main/firecrawl-main/apps/api/src/lib/branding/merge.ts`

## Verification

- Red: `node --test tests\unit\brand-extraction-script.test.mjs`
  - Failed because extraction script was absent.
- Red: `node --test tests\unit\db-schema.test.mjs`
  - Failed because `BrandCandidate` and migration `0009` were absent.
- Red: `node --test tests\contract\openapi-generation.test.mjs`
  - Failed because candidate retrieval route/client were absent.
- Red: `node --test tests\integration\brand-extraction-b2.test.mjs`
  - Failed because `listBrandCandidates` was absent.
- Green: focused commands above after implementation.
- UI: `node --test tests\e2e\web-workspace.test.mjs`
  - Covers candidate review surface, source provenance, `partial` and `low-confidence`
    states.
- Screenshot: `docs/V0/Evidence/V0-B2_CANDIDATE_REVIEW_UI_2026-06-24.png`
  - Captured from `docs/V0/Evidence/V0-B2_CANDIDATE_REVIEW_UI_SNAPSHOT_2026-06-24.html`.

## Evidence retained

- Scraped page fixture yields candidate fields for `summary`, `usp`, `cta`, `audience`,
  `color`, `font`, `logo` and `prohibited_claim`.
- Every candidate has source evidence and `decision: candidate`.
- Prompt-injection text is excluded from generated candidate values and records
  `brand.extraction.prompt_input_isolated`.
- Refused or evidence-free scrape output returns `PROVIDER_OUTPUT_INVALID` and creates no
  candidates.
- Candidate review UI renders extracted values as candidates only, shows source evidence,
  and exposes partial and low-confidence states.
