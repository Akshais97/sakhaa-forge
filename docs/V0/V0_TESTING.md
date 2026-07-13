# Product V0 Testing

## Test Diagram

```text
URL/upload -> quarantine -> brand candidates -> human approval
Xpoz/source -> acquisition -> thumbnail/video blueprint -> formula
formula + approved brand -> scripts -> selected script
estimate -> credit reservation -> HeyGen/provider -> retained segments
instructions -> validated AE plan -> final video
final video -> review approval -> calendar -> publish -> audience verification
all transitions -> ledger + audit + lineage
```

Each arrow requires success, malformed, unauthorized, duplicate, timeout and
crash-window coverage where applicable.

## Release-Blocking Tests

- Missing brand approval prevents generation.
- Cross-workspace reads, signed URLs, ledger entries and callbacks fail.
- Crawl SSRF and oversized/malicious media are blocked.
- A Firecrawl-mode brand crawl proves the queue worker sends the server-side bearer key,
  discovers at least five eligible same-origin pages by default, executes the selected
  vertical section, retains downloaded image hashes and never surfaces the key or object key.
- Universal crawl contract tests cover USP evidence, P1-P2D prompt/schema fields, two
  same-origin P3 blog deep reads, partial-page warnings and metadata-based image categories.
- Blueprint stages expose partial/low-confidence status without silently succeeding.
- Script selection points to the evaluated immutable variant.
- Empty, malformed, schema-invalid and refused AI outputs become explicit retryable or
  blocked states; no downstream artifact is fabricated.
- Duplicate generation requests create one provider operation and reservation.
- Timeout after provider submission reconciles without a second charge.
- Failure releases credits exactly once; success captures exactly once.
- AE plans reject missing assets, unsupported effects, overlap and unsafe captions.
- AE readiness and golden-render tests fail on license, version, plugin, font, template
  or codec drift before production jobs are accepted.
- Review approval is tied to one final-video version.
- Publishing retries do not duplicate posts.
- API acceptance without audience visibility cannot become `published_verified`.
- Success notifications are idempotent.
- Backup restore preserves RLS, ledger totals, provider operations and media lineage.
- OpenAPI contract generation and client generation are reproducible; breaking contract
  diffs fail CI.
- A two-hour queue backlog, worker lease expiry and provider `429` recover without
  duplicate paid work or silent job loss.

## End-to-End Acceptance

Run the exact real-estate journey from `V0_PRODUCT_SPECIFICATION.md` with real or approved staging
provider accounts. Evidence includes screenshots, IDs, hashes, ledger reconciliation and
the verified public post URL. V1 and V2 must be disabled or absent during this test.
