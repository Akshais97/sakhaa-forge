# HeyGen Cost Model

**Ownership:** This is a V0/V1 production-engine provider-cost reference consumed by V2
for showback and economics analysis. V2 does not purchase HeyGen usage or mutate
production-engine creator credits.

**Price check:** 2026-06-11  
**Official source:** https://developers.heygen.com/docs/pricing

## Billing Choice

Use HeyGen API-key authentication with its prepaid USD wallet for automation. Do not
assume web-plan credits pay for API-key usage; HeyGen documents API-key and OAuth billing
as separate paths.

## Current API Rates

| Operation | Published rate | 15 seconds | 30 seconds | 60 seconds |
|---|---:|---:|---:|---:|
| Avatar IV/V photo avatar, 720p/1080p | $0.05/sec | $0.75 | $1.50 | $3.00 |
| Avatar IV/V digital twin/studio avatar, 720p/1080p | $0.0667/sec | $1.00 | $2.00 | $4.00 |
| Video Agent prompt-to-video | $0.0333/sec | $0.50 | $1.00 | $2.00 |
| Cinematic Avatar | $7/video | $7.00 | Not duration-based | Not duration-based |

Prices exclude Sakhaa GPU, storage, LLM, and labor costs. Refresh the rate table before
procurement and store the price version used by every estimate and ledger entry.

## Pilot Controls

- Default generation cap: 30 seconds.
- Default maximum: three paid candidates per decision cycle.
- Require explicit confirmation showing estimated cost.
- Reserve quota before submission.
- Reconcile unknown provider state before retry.
- Download completed output once and serve from owned storage.
- Use photo-avatar or Video Agent paths where quality is acceptable; digital twins are
  selected for brand/identity requirements, not by default.

## Example Decision-Cycle Envelope

A cycle with three 30-second photo-avatar candidates has a current HeyGen API estimate of
$4.50. Three 30-second digital-twin candidates estimate to about $6.00. A decision cycle
must show the estimate and compare it with the cost of the team's current generation
workflow.
