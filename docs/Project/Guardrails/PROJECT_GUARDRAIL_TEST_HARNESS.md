# Proper Harness

## Purpose

The harness runs the whole product deterministically without paid providers or a large
GPU. It is required because unit tests cannot prove orchestration, lineage, and recovery.

## Components

- Fake object storage with signed URL semantics.
- Redis and PostgreSQL containers.
- Fake GPU worker that emits valid staged artifacts.
- Optional small real-pipeline smoke mode.
- V1 production-bridge simulator with success, rejection, delay, duplicate, bad-signature, and hash-mismatch events.
- LLM simulator that can preserve or intentionally mutate scores.
- Clock control for leases, retries, and attribution windows.
- Seeded tenant and campaign factories.

## Scenarios

1. Happy path from upload to approved generated child revision.
2. Worker crash after artifact upload but before job acknowledgement.
3. Duplicate score request with the same idempotency key.
4. V0 event replay and stale timestamp.
5. Missing P/Q clusters.
6. Cross-tenant object URL attempt.
7. Calibration import with ambiguous revision attribution.
8. RLS and cross-tenant cache-key attack.
9. Duplicate paid action after timeout with unknown provider state.
10. Consent revocation before dataset freeze and deletion after freeze.
11. Backup restore with RPO/RTO and hash verification.
12. Underpowered evaluation that remains inconclusive and shadow-only.

The harness produces a machine-readable report, logs, traces, artifact manifest, and
screenshots for browser journeys.
