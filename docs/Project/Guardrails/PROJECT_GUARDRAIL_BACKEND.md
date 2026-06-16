# Project Backend Guardrails

- NestJS with Fastify is the sole browser-facing domain API and PostgreSQL writer.
- Modules own one bounded domain; controllers do transport work, services enforce
  invariants, and repositories expose explicit query shapes.
- Supabase is Auth and PostgreSQL infrastructure, not a second domain API.
- Provider SDKs are confined to adapters with timeout, redaction, idempotency and
  reconciliation policies.
- External calls never run inside database transactions.
- Domain mutation and transactional outbox rows commit together.
- Python workers complete through authenticated NestJS endpoints and cannot mutate
  domain tables directly.
- Every tenant action resolves workspace membership and permission server-side.
- Errors use stable codes and do not leak tenant existence, secrets or provider payloads.
- Module extraction into a new service requires measured need and an ADR.

