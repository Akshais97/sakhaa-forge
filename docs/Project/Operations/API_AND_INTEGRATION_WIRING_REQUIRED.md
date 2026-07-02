# API and integration wiring required

Status: concise final-wiring checklist derived from `.env.example`,
`docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`, provider modules and V0 contracts.

Detailed inventory: `docs/Project/Operations/API_INTEGRATION_KEYS.md`.

Do not commit real values. Secrets belong in the deployment secret manager or local untracked
environment files.

## Required platform configuration

| Area           | Required details                                                                                                                                 | Used by                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Public URLs    | `PUBLIC_WEB_URL`, `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`                                                                                     | Web app, API callbacks, generated client           |
| Supabase Auth  | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWKS_URL` | Browser sign-in, API auth validation               |
| PostgreSQL     | `DATABASE_URL`, `DIRECT_DATABASE_URL`                                                                                                            | API runtime, Prisma migrations                     |
| Redis          | `REDIS_URL`, `QUEUE_PREFIX`, queue concurrency/lease/backoff values                                                                              | Queue worker, outbox wakeups                       |
| Object storage | `OBJECT_STORAGE_PROVIDER`, `LOCAL_STORAGE_ROOT` for local, or B2 endpoint/region/key/buckets for production                                      | Artifact quarantine, clean media, private evidence |
| Worker auth    | `WORKER_SERVICE_ID`, `WORKER_AUTH_AUDIENCE`, local `WORKER_AUTH_TOKEN` or production `WORKER_SIGNING_KEY_REF`, `WORKER_CALLBACK_BASE_URL`        | Private workers calling API                        |

## Actual code blockers before live end-to-end operation

| Area             | Current code fact                                                                     | Required before live use                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Frontend landing | `/` is a local presentation surface derived from `sakhaa-forge/src`.                  | No secret or provider key belongs here; API wiring belongs in authenticated app screens.              |
| Frontend app     | Workspace app currently renders backend-shaped local screen models.                   | Wire each screen to the generated `/api/v0` client with auth, workspace context and idempotency keys. |
| Auth             | API currently verifies `SUPABASE_JWT_SECRET` HS256 tokens in `apps/api/src/auth.mjs`. | Reconcile with canonical Supabase issuer/audience/JWKS verification before production.                |
| Brand extraction | Current extraction is deterministic over supplied scrape data.                        | Add an approved crawl/LLM adapter only if live external extraction is in scope.                       |
| Xpoz             | Current discovery uses simulator fixtures/manual fallback.                            | Implement provider request/response adapter and error mapping before relying on `XPOZ_API_KEY`.       |
| HeyGen           | `HEYGEN_MODE=api` is refused by the adapter.                                          | Implement live adapter and signed callback verification tests before enabling.                        |
| Meta             | `META_MODE` non-simulator is refused by the adapter.                                  | Implement live Graph API publish route, account-token credential use and callback verification.       |
| YouTube          | `YOUTUBE_MODE=api` is refused and cataloged as out of V0 scope.                       | Keep simulator/manual export unless V0 scope changes and live adapter work is accepted.               |
| Payments         | Credit flows are simulator-backed unless provider mode is implemented.                | Implement Razorpay/Stripe purchase creation and signed callback reconciliation before real money.     |
| B2               | Local storage simulator is implemented.                                               | Implement and verify B2 adapter, signed URL lifecycle and bucket-scoped least-privilege keys.         |

## Provider integrations

| Integration                 | Current V0 mode                                                                                                           | Live wiring details required                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand crawl / extraction    | Simulator fixtures and deterministic parsing                                                                              | Approved `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL_ID`, crawl limits, `CRAWL_USER_AGENT`, timeout policy                                                         |
| Viral discovery / Xpoz      | Simulator or local base URL                                                                                               | `XPOZ_API_BASE_URL`, `XPOZ_API_KEY`, timeout, provider error mapping                                                                                             |
| HeyGen generation           | `HEYGEN_MODE=simulator`; `HEYGEN_MODE=api` currently refuses in provider module unless live integration is implemented    | `HEYGEN_API_BASE_URL`, `HEYGEN_API_KEY`, `HEYGEN_WEBHOOK_SECRET`, `HEYGEN_CALLBACK_URL`, timeout values, concurrency limit, price versions in DB                 |
| After Effects render worker | Deterministic simulator via `AE_WORKER_MODE=simulator` and `V0_C2_SIMULATOR_MODE`                                         | `AE_CAPABILITY_VERSION`, `AE_EXECUTABLE_PATH`, `AE_TEMPLATE_ROOT`, plugin/font manifests, `FFMPEG_PATH`, render timeout, readiness render                        |
| Payments                    | `PAYMENT_MODE=simulator`                                                                                                  | Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; `PAYMENT_CALLBACK_BASE_URL` |
| Meta publication            | Simulator provider in `apps/api/src/meta-provider.mjs`; non-simulator mode refuses until live route is implemented        | `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, OAuth account credentials through credential service, callback URL                                |
| YouTube Shorts publication  | Simulator provider in `apps/api/src/youtube-provider.mjs`; `YOUTUBE_MODE=api` is reserved/out of V0 scope in current code | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_WEBHOOK_SECRET`, OAuth account credentials through credential service, quota policy                       |
| Audience verification       | Deterministic verifier simulator                                                                                          | Platform read credentials or verified public URL access, retry schedule, account/media/caption/visibility checks                                                 |
| Notifications               | `NOTIFICATION_MODE=log`                                                                                                   | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `SUPPORT_EMAIL`                                                                      |
| Observability               | Local/no-op defaults                                                                                                      | `OTEL_SERVICE_NAME`, optional OTLP endpoint/headers, trace sample ratio, analytics sink/write key if enabled                                                     |

## Browser-exposed values

Only these values should be available to browser code:

- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPPORT_URL`
- `NEXT_PUBLIC_ANALYTICS_ENABLED`

No provider secret, database URL, Redis URL, signing secret, object-storage key, webhook secret,
request hash or raw provider payload belongs in the browser.

## Credential service boundary

Workspace/account credentials for social publishing are not `.env` values. The schema has
`ServiceCredential` metadata for provider, environment, status, created/rotated/expires timestamps
and actor. Secret material must live behind the credential/secret-manager reference and never in
browser responses, logs, prompts or retained artifacts.

## Final wiring checklist

1. Provision Supabase Auth and PostgreSQL with runtime and migration roles.
2. Apply Prisma migrations through `packages/db/scripts/db-migrate-dev.mjs` or the production
   migration equivalent.
3. Configure Redis with persistence/no-eviction policy for queue wakeups.
4. Configure Backblaze B2 private buckets for quarantine, clean media and private artifacts.
5. Keep provider modes as `simulator` until the live adapter is implemented and verified.
6. Add live provider credentials through secret management, not committed files.
7. Register webhook/callback URLs for HeyGen, payments, Meta and YouTube only after signature
   verification is configured.
8. Store workspace social account credentials through the credential service.
9. Run generated contract refresh, database validation, relevant integration tests and full
   verification before enabling any live paid or publishing route.

## Current known limitation

Several live-provider modes are intentionally simulator-first in V0. The code refuses unsupported
non-simulator provider modes instead of making unbound network calls. That is correct for the
current backend. Final live integration requires adapter implementation, contract updates,
provider-specific tests, callback verification tests and updated operations runbooks.
