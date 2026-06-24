# Product V0 Risks and External Gates

| Risk or dependency | Severity | Required control or gate |
|---|---|---|
| Xpoz availability, terms or payload changes | High | Adapter contract, recorded fixtures, manual candidate fallback |
| Source-video retrieval rights | Critical | Approved acquisition policy; blocked state when unavailable |
| HeyGen pricing/API/concurrency changes | High | Versioned prices, cost ceiling, rate-limit tests, reconciliation |
| Meta app review | High | Start review early; manual export remains functional |
| TikTok Direct Post audit | High | Deferred to V1 until approval |
| YouTube quota | High | Enforce configured per-client limits and quota monitoring |
| Razorpay/Stripe webhook or reconciliation failure | Critical | Signed callbacks, inbox dedupe, provider reconciliation |
| Duplicate generation charge | Critical | Durable provider operation plus atomic reservation ledger |
| Wrong account/media publication | Critical | Exact account/media audience verification |
| Avatar likeness/voice misuse | Critical | Consent evidence, scope, expiry and revocation |
| Crawl SSRF or malicious media | Critical | Network controls, quarantine and isolated processing |
| AE environment/plugins unavailable | High | Supported-capability registry and readiness checks |
| Backblaze cross-region latency/cost | Medium | Representative transfer benchmark and lifecycle policy |
| Product promise interpreted as guaranteed virality | High | Claim boundary in product copy, review and sales material |
| Workflow works technically but is uneconomic or service-heavy | High | Measured pilot scorecard for cost, manual intervention time, repeat usage and willingness to pay |
| V1/V2 unavailable | None for V0 | V0 contains no runtime call or required schema dependency |

External provider approval may limit a route, but it must not block the entire V0
application: manual upload/export and approved primary-route fallbacks remain available.

## Release Gates

- One real-estate workspace completes the full production journey.
- Exactly-once credit and provider reconciliation evidence passes.
- Security zero-tolerance tests pass.
- Backup/restore and queue recovery pass.
- Provider prices, terms and API contracts are refreshed before production.
- Owner/Admin recovery ownership and escalation paths are assigned.
- Founder approves the measured pilot/business scorecard before unrestricted launch.
