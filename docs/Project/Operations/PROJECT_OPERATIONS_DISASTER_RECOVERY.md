# Disaster Recovery

## Recovery Objectives

Initial internal target: restore the control plane within one business day and lose no
more than one hour of committed database data. Tighten only after business requirements
justify the cost.

## Backups

- Automated PostgreSQL backups and point-in-time recovery.
- Object versioning or protected backup for critical media and model artifacts.
- Versioned infrastructure and configuration.
- Exported model registry and dataset manifests.
- Secret recovery procedure that does not copy plaintext into documentation.

## Exercises

Quarterly restore a database snapshot, recover a deleted artifact, rebuild a worker from
images, and roll back a model. Record actual recovery time and missing dependencies.
Acceptance verifies RPO/RTO, hashes, RLS policies, tenant boundaries, outbox repair,
registry references, and retained decision reports.

## Integration or Provider Loss

A V0 outage degrades brief submission and revision import but must not block access to
existing deterministic reports. V0 continues its independent production workflow when
V2 is unavailable. LLM outages degrade explanation only. Queued bridge or LLM jobs
remain retryable or cancellable.
