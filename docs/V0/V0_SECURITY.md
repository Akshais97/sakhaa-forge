# Product V0 Security

## Primary Threats

- cross-workspace media, billing or publishing access;
- malicious crawled/uploaded media and SSRF;
- stolen provider, publishing or payment credentials;
- duplicate charges, generation or publication;
- forged callbacks and replay;
- unauthorized likeness, voice, brand asset or source-video use;
- prompt injection through websites, documents or captions;
- publishing to the wrong account;
- artifact substitution and lineage corruption.

## Controls

- NestJS validates Supabase JWTs and authorizes every resource server-side.
- PostgreSQL RLS uses transaction-local workspace context; runtime roles do not own
  tables or have `BYPASSRLS`.
- Crawlers enforce allowlists, DNS/IP revalidation, redirect limits, robots/policy,
  size limits and private/link-local/metadata blocking.
- All untrusted files enter quarantine and isolated processing.
- Provider/payment secrets stay in a secret manager and never enter browser code.
- Callbacks verify signatures on raw bytes, enforce timestamp windows and deduplicate.
- Paid actions require idempotency, estimate, authorization, reservation and immutable
  ledger evidence.
- Avatar/voice use requires recorded scope and consent.
- Source media is used for structural analysis only unless rights explicitly permit more.
- Publishing verifies target account, media identity and audience visibility.
- Logs omit tokens, signed URLs, scripts, raw media and unnecessary personal data.
- Operational trace, restore, simulator and recovery endpoints are Owner/Admin-only and
  workspace-scoped. Service credential records store only secret-manager references, never
  plaintext API keys or provider tokens.

## Zero-Tolerance Failures

- cross-tenant access;
- duplicate capture or paid provider submission;
- publication without approved exact media;
- success notification before audience verification;
- unsigned callback mutation;
- use after consent revocation;
- secret disclosure or artifact substitution.

Any occurrence blocks release and requires root-cause analysis and a regression test.
