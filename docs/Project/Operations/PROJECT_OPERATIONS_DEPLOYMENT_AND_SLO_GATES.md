# Deployment and SLO Gates

Production deployment and measured SLO evidence belong near the end of delivery, but the
measurement method and acceptance gates must exist before implementation.

## Development Gate

- Local stack and deterministic provider simulators work.
- Unit and contract tests run without paid services.
- No availability claim is made.

## Staging Gate

- Production-shaped identity, database, queue, storage, and secrets are configured.
- Restore, rollback, cross-tenant, duplicate-action, and provider-failure tests pass.
- Collect at least seven days of API, queue, job, cost, and error telemetry.
- Establish baseline p50/p95 latency and job completion distributions.

## Internal Production Gate

- 99.5% monthly control-plane objective is configured.
- Synchronous API p95 target is 500 ms excluding asynchronous work.
- RPO is one hour and RTO is one business day.
- GPU completion objectives are set only after representative benchmarks.
- Error-budget and zero-tolerance alerts route to named owners.

## External SaaS Gate

- At least one complete pilot period demonstrates measured availability and recovery.
- Capacity, support, provider concentration, and cost limits are approved.
- Public status, incident communication, backup retention, and contractual SLA policy are
  defined.

Missing end-state SLO evidence is not a current documentation defect. It remains a
release gate that cannot pass until the system exists and produces telemetry.
