# Project Database Guardrails

- Supabase PostgreSQL is canonical for domain, job, ledger and integration state.
- Every tenant-owned table includes `workspace_id`.
- PostgreSQL RLS is enabled as defense in depth; runtime roles neither own tenant tables
  nor have `BYPASSRLS`.
- Set workspace context transaction-locally on every pooled transaction.
- Use separate restricted runtime and migration-owner connections.
- Financial, audit and accepted immutable-lineage records are append-only; corrections
  use compensating records.
- Use timezone-aware timestamps, integer minor money units and explicit foreign keys.
- Index measured access patterns with tenant-leading keys.
- Schema rollout uses expand, backfill, verify and contract.
- Backups and restores must preserve RLS, constraints, ledger totals, operation state and
  artifact references.
- Redis, object storage and provider state never replace PostgreSQL domain truth.

