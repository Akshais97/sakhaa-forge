# Observability

## Correlation

Propagate `request_id`, `workspace_id`, `job_id`, `revision_id`, `scoring_run_id`,
and provider IDs across logs, traces, and events. Hash or omit sensitive identifiers in
shared telemetry.

## Metrics

- API rate, latency, errors, and saturation.
- Queue depth, age, retries, lease expiry, and dead letters.
- Stage duration, GPU utilization, VRAM, cache hit rate, artifact bytes.
- Missing clusters, formula coverage, proxy share, and score-generation failures.
- V1 production-bridge latency, rejection/unknown rate, revision-import lag, and production-reported
  generation cost; provider concurrency remains a V0 metric.
- KPI import quality, drift, model metrics, and recommendation acceptance.

## Logs and Traces

Use structured JSON logs and OpenTelemetry traces. Never log scripts, customer media,
API keys, signed URLs, or raw provider payloads without redaction. Store audit records
separately from diagnostic logs.

V0-F5 local evidence uses generated API trace records to prove `request_id` propagation
through job creation, outbox relay, worker attempts, job events and retained artifacts
before broader OpenTelemetry exporter wiring is introduced.

## Alerts

Page on tenant-isolation failures, data corruption, persistent scoring invalidity, restore
failure, or security events. Notify during business hours for queue backlog, provider
degradation, drift, cost anomalies, and repeated job failures.

## Service Objectives

Initial control-plane objectives are 99.5% monthly availability and p95 synchronous API
latency under 500 ms. Heavy-job latency is benchmarked rather than invented; alert on
oldest queue age, failures, and regression. See `PROJECT_OPERATIONS_SERVICE_LEVEL_OBJECTIVES.md`.
