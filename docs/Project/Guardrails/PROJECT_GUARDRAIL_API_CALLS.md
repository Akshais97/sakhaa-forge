# Project API and External-Call Guardrails

- Public APIs, internal-worker APIs, callbacks and events are separate versioned contracts.
- Validate authentication, audience, workspace, permission, schema and resource version.
- Require `Idempotency-Key` for costly, paid or externally visible mutations.
- Return `202` plus a durable job resource for long-running work.
- Use RFC 9457 problem details and stable machine-readable error codes.
- Use cursor pagination, deterministic order and bounded result sizes.
- Provider requests use explicit connect/read/overall timeouts and bounded retry policy.
- A timeout after possible side effect becomes `unknown` and enters reconciliation.
- Verify webhook signatures on raw bytes before parsing; enforce timestamp and replay
  protection.
- Never expose raw provider payloads as the product contract.
- Short-lived signed object URLs are scoped to workspace, object, method and expiry.
- Log request, workspace, actor, operation and trace IDs without secrets or signed URLs.

