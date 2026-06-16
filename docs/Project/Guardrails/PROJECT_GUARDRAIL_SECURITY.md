# Security Guardrails

## Purpose

These rules govern all future Sakhaa implementation. A feature is not complete merely
because it works; it must preserve tenant isolation, authorization, auditability,
integrity, and recoverability.

## Non-Negotiable Controls

### Identity and Authorization

- Validate Supabase Auth issuer, audience, signature, expiry and subject in NestJS.
- Resolve workspace membership server-side on every tenant request.
- Deny by default. A missing permission is a rejection, never an implicit allowance.
- Conceal cross-tenant resources with `404` where existence disclosure is unnecessary.
- Require step-up authentication for credentials, exports, deletion, billing, and model
  promotion.
- Service accounts use separate identities, minimum scopes, rotation, and expiry.

### Tenant Isolation

- Every tenant-owned row includes `workspace_id`.
- PostgreSQL RLS is mandatory defense in depth for tenant tables.
- Repository methods require explicit tenant context.
- Set tenant context transaction-locally on every pooled database transaction; request
  and worker roles must not have `BYPASSRLS` or own tenant tables.
- Object-storage keys, Redis keys, queues, logs, traces and exports carry tenant scope.
- Browser clients do not directly mutate Supabase domain tables.
- Cross-tenant negative tests are release-blocking.
- No administrative bypass exists without an audited break-glass procedure.

### Input and Media Safety

- Validate file type from content, not extension.
- Upload into a quarantine prefix and promote only after checksum, media validation, and
  malware scan succeed.
- Enforce size, duration, resolution, codec, archive-depth, and decompression limits.
- Malware-scan uploads and process untrusted media in an isolated worker.
- Reject active content, path traversal, malformed containers, and unsupported codecs.
- Remote fetches use allowlists, DNS/IP revalidation, redirect limits, and private,
  loopback, metadata, and link-local address blocking.

### Secrets and Providers

- Secrets live in a managed secret store and never in source, prompts, logs or artifacts.
- Python workers receive no PostgreSQL or Redis credentials.
- Use separate bucket-scoped B2 application keys and short-lived presigned URLs.
- V0 generation-provider and payment secrets never enter V2.
- Provider adapters enforce timeouts, bounded retries, circuit breaking, and redaction.
- V2 paid inference actions require confirmation where applicable, idempotency, a cost
  estimate, and an immutable cost-ledger entry. V0 separately enforces generation costs.
- A provider timeout after possible submission becomes an `unknown` operation requiring
  reconciliation; it never triggers blind resubmission.
- V0 events require workload identity or signature verification, timestamp tolerance,
  replay protection, workspace mapping, and event de-duplication.

### Data and Model Integrity

- Hash immutable inputs, artifacts, manifests, model files, and formula versions.
- Accept only exactly A-Q in the production scoring path.
- Sign production images and model artifacts; record provenance and dependency locks.
- LLM output cannot create or modify deterministic indices, permissions, billing,
  consent, or model-approval state.
- Raw SQL is parameterized, named and reviewed; `$queryRawUnsafe` and string-built SQL
  are release-blocking.
- Dataset and model promotion require independent approval and rollback evidence.

### Logging and Audit

- Security-sensitive actions produce append-only audit events.
- Logs never contain access tokens, API keys, signed URLs, raw media, full provider
  payloads, or unnecessary personal data.
- Diagnostic logs include request, workspace, actor, job, and trace identifiers.
- Audit retention is separate from application-data retention.

## Zero-Tolerance Release Failures

- Cross-tenant read, write, enumeration, cache collision, or signed-URL access.
- Authentication or authorization bypass.
- Duplicate V0 generation request or duplicate V2 paid inference action.
- Secret disclosure.
- Unverified V0 integration-event mutation.
- Model or artifact substitution.
- Training or publication outside the recorded rights policy.
- Deletion that leaves active binaries or derived personal data without a documented
  retention basis.

Any zero-tolerance failure blocks release until root cause, regression test, remediation,
and incident record are complete.
