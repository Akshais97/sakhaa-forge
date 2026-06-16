# Service Level Objectives

- Monthly authenticated control-plane availability: 99.5%.
- Synchronous API p95: under 500 ms, excluding uploads and asynchronous work.
- RPO: at most one hour.
- RTO: one business day.
- Cross-tenant authorization success: zero tolerated.

Do not set a GPU completion SLO before representative benchmarks. Monitor oldest ready
job age, depth, failure rate, retries, and fixture-relative regression. The monthly
availability budget is 0.5%; exhaustion pauses feature rollout. Isolation, corruption,
index mutation, and duplicate paid actions have zero error budget.

These are target objectives until staging and pilot measurements promote them to
demonstrated SLOs. Evidence requirements are in `PROJECT_OPERATIONS_DEPLOYMENT_AND_SLO_GATES.md`.
