# Project Configuration Catalog

**Status:** Canonical configuration inventory  
**Scope:** V0 services and local/staging/production environments

## 1. Rules

- Configuration is validated at process startup through typed schemas.
- Environment variables contain deployment-specific values, not business truth.
- Secrets are references or injected secret values and never committed.
- Unknown variables in service-specific namespaces produce a warning locally and fail CI
  schema checks.
- Missing required production variables fail startup before accepting traffic.
- Defaults are allowed only when they are safe and documented below.
- Browser-exposed variables use the `NEXT_PUBLIC_` prefix and contain no secrets.
- Provider price tables and operational policy are versioned records/configuration, not
  hardcoded environment variables.

## 2. Classification

| Class | Meaning |
|---|---|
| Public | Safe in browser/build output |
| Internal | Non-secret operational value; do not expose without need |
| Secret | Credential or signing material from secret manager |
| Sensitive reference | Identifier/path to a secret or protected resource |

Rotation owner abbreviations: `ENG` engineering, `OPS` operations, `SEC` security,
`FIN` finance/provider owner.

## 3. Shared Runtime

| Variable | Owner | Type / validation | Required | Environments | Class | Default / failure |
|---|---|---|---|---|---|---|
| `APP_ENV` | all | enum `local,staging,production,test` | Yes | all | Internal | No default; fail |
| `APP_VERSION` | all | non-empty build version | Yes | staging/prod | Internal | local `dev`; prod fail |
| `LOG_LEVEL` | all | enum `debug,info,warn,error` | No | all | Internal | local `debug`, others `info` |
| `PORT` | service | integer 1-65535 | No | all | Internal | service-specific |
| `PUBLIC_WEB_URL` | API/web | absolute HTTPS except local | Yes | all | Public | Fail |
| `API_BASE_URL` | web/workers | absolute URL | Yes | all | Internal/Public as appropriate | Fail |
| `DEFAULT_TIMEZONE` | all | IANA timezone | No | all | Internal | `Asia/Kolkata` |
| `DEFAULT_CURRENCY` | API | ISO 4217 | No | all | Internal | `INR` |
| `CAPABILITY_CONFIG_SOURCE` | API | enum `database,static` | No | all | Internal | local `static`, prod `database` |

## 4. Web

| Variable | Type | Required | Class | Safe default / failure |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | environment enum | Yes | Public | Fail |
| `NEXT_PUBLIC_API_BASE_URL` | absolute URL | Yes | Public | Fail |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS URL | Yes | Public | Fail |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key | Yes | Public credential | Fail; rotate `SEC` |
| `NEXT_PUBLIC_SUPPORT_URL` | absolute URL | No | Public | Hide support link |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | boolean | No | Public | `false` |

No other browser variable is permitted without updating this catalog.

## 5. PostgreSQL and Supabase

| Variable | Owner | Type | Required | Environments | Class | Default / failure |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | API/queue | restricted pooled PostgreSQL URL | Yes | all | Secret | Fail; `OPS/SEC` |
| `DIRECT_DATABASE_URL` | migration | direct migration-owner URL | Migration only | all | Secret | Migration fails |
| `V0_RUNTIME_DB` | API | enum `memory,prisma` | Yes | all | Internal | local/test `memory`; staging/production must be `prisma` and fail closed otherwise |
| `SUPABASE_URL` | API | absolute URL | Yes | all | Internal | Fail |
| `SUPABASE_JWT_ISSUER` | API | absolute issuer URL | Yes | all | Internal | Fail |
| `SUPABASE_JWT_AUDIENCE` | API | non-empty audience | Yes | all | Internal | Fail |
| `SUPABASE_JWKS_URL` | API | HTTPS URL | Yes | all | Internal | Derived only if validated |
| `DATABASE_POOL_MAX` | API/queue | integer 1-50 | No | all | Internal | API `10`, queue `5` |
| `DATABASE_STATEMENT_TIMEOUT_MS` | API/queue | integer 100-60000 | No | all | Internal | `10000` |

Production runtime roles must not own tables or have `BYPASSRLS`.

## 6. Redis and Jobs

| Variable | Type | Required | Class | Default / failure |
|---|---|---|---|---|
| `REDIS_URL` | TLS Redis URL except local | Yes | Secret | Fail |
| `QUEUE_PREFIX` | safe identifier including environment | Yes | Internal | Fail outside local |
| `QUEUE_DEFAULT_ATTEMPTS` | integer 1-10 | No | Internal | `5` |
| `QUEUE_BACKOFF_BASE_MS` | integer 100-60000 | No | Internal | `1000` |
| `JOB_LEASE_SECONDS` | integer 15-3600 | No | Internal | `120` |
| `JOB_HEARTBEAT_SECONDS` | integer less than lease/2 | No | Internal | `30` |
| `OUTBOX_POLL_INTERVAL_MS` | integer 100-60000 | No | Internal | `1000` |
| `QUEUE_CPU_CONCURRENCY` | integer >=1 | No | Internal | local `2`, prod must be explicit |
| `QUEUE_GPU_CONCURRENCY` | integer >=1 | No | Internal | `1` |
| `QUEUE_AE_CONCURRENCY` | integer exactly `1` initially | No | Internal | `1` |

Redis loss degrades delivery but cannot change canonical job or financial state.

## 7. Object Storage

| Variable | Type | Required | Class | Default / failure |
|---|---|---|---|---|
| `OBJECT_STORAGE_PROVIDER` | enum `local-filesystem,b2` | Yes | Internal | local `local-filesystem`; others fail |
| `LOCAL_STORAGE_ROOT` | relative or absolute path | Local filesystem mode | Internal | local `.local/storage`; fail if empty in local mode |
| `OBJECT_STORAGE_ENDPOINT` | absolute URL | B2 mode | Internal | Fail |
| `OBJECT_STORAGE_REGION` | provider region string | B2 mode | Internal | Fail |
| `OBJECT_STORAGE_KEY_ID` | credential ID | B2 mode | Secret | Fail; `OPS/SEC` |
| `OBJECT_STORAGE_APPLICATION_KEY` | credential secret | B2 mode | Secret | Fail; `OPS/SEC` |
| `B2_BUCKET_QUARANTINE` | bucket name | Yes | Sensitive reference | Fail |
| `B2_BUCKET_CLEAN_MEDIA` | bucket name | Yes | Sensitive reference | Fail |
| `B2_BUCKET_PRIVATE_ARTIFACTS` | bucket name | Yes | Sensitive reference | Fail |
| `SIGNED_UPLOAD_TTL_SECONDS` | integer 60-3600 | No | Internal | `900` |
| `SIGNED_DOWNLOAD_TTL_SECONDS` | integer 30-3600 | No | Internal | `300` |
| `MAX_UPLOAD_BYTES` | positive integer | Yes | Internal | Fail |

Bucket names and credentials are server-only.

## 8. Internal Worker Authentication

| Variable | Type | Required | Class | Default / failure |
|---|---|---|---|---|
| `WORKER_SERVICE_ID` | stable service identifier | Yes | Internal | Fail |
| `WORKER_AUTH_AUDIENCE` | expected API audience | Yes | Internal | Fail |
| `WORKER_AUTH_TOKEN` | short-lived/injected token for local compatibility | Local/test only | Secret | Production use prohibited |
| `WORKER_SIGNING_KEY_REF` | secret-manager key reference | Staging/prod | Sensitive reference | Fail |
| `WORKER_CALLBACK_BASE_URL` | private API URL | Yes | Internal | Fail |
| `WORKER_MAX_ARTIFACT_BYTES` | positive integer | Yes | Internal | Fail |

Workers receive no PostgreSQL or Redis configuration.

## 9. AI, Crawl and Discovery Providers

| Variable | Owner | Type | Required | Class | Default / failure |
|---|---|---|---|---|---|
| `LLM_PROVIDER` | API/queue | adapter enum | Yes for B2+ | Internal | Simulator until enabled |
| `LLM_API_KEY` | queue | provider secret | Provider mode | Secret | Capability disabled |
| `LLM_MODEL_ID` | queue | approved model identifier | Provider mode | Internal | Fail |
| `LLM_REQUEST_TIMEOUT_MS` | queue | integer | No | Internal | `60000` |
| `BRAND_CRAWL_MODE` | queue | enum `simulator,firecrawl` | Yes for B1/B2 | Internal | local/test `simulator`; prod explicit |
| `FIRECRAWL_API_BASE_URL` | queue | HTTPS URL | Firecrawl mode | Internal | `https://api.firecrawl.dev/v2` |
| `FIRECRAWL_API_KEY` | queue | provider secret | Firecrawl mode | Secret | Brand crawl provider disabled |
| `FIRECRAWL_TIMEOUT_MS` | queue | integer 1000-120000 | No | Internal | `60000` |
| `BRAND_CRAWL_DEFAULT_MAX_PAGES` | queue | integer 1-50 | No | Internal | `5` |
| `BRAND_CRAWL_MAX_PAGES` | queue | integer 1-50 | No | Internal | `50` |
| `CRAWL_USER_AGENT` | queue | non-empty contact-bearing identifier | Yes | Public | Fail |
| `CRAWL_MAX_PAGES` | queue | integer 1-100 | No | Internal | `25` |
| `CRAWL_MAX_REDIRECTS` | queue | integer 0-10 | No | Internal | `5` |
| `CRAWL_TIMEOUT_MS` | queue | integer | No | Internal | `30000` |
| `XPOZ_API_BASE_URL` | queue | HTTPS URL | Provider mode | Internal | Simulator |
| `XPOZ_API_KEY` | queue | provider secret | Provider mode | Secret | Discovery fallback only |
| `XPOZ_TIMEOUT_MS` | queue | integer | No | Internal | `30000` |

## 10. HeyGen

| Variable | Type | Required | Class | Default / failure |
|---|---|---|---|---|
| `HEYGEN_MODE` | enum `simulator,api` | Yes | Internal | local `simulator`; prod explicit |
| `HEYGEN_API_BASE_URL` | HTTPS URL | API mode | Internal | Fail |
| `HEYGEN_API_KEY` | provider secret | API mode | Secret | Generation capability disabled |
| `HEYGEN_WEBHOOK_SECRET` | signing secret | API mode | Secret | Callback startup fails |
| `HEYGEN_CALLBACK_URL` | HTTPS URL | API mode | Internal | Fail |
| `HEYGEN_CONNECT_TIMEOUT_MS` | integer | No | Internal | `10000` |
| `HEYGEN_OVERALL_TIMEOUT_MS` | integer | No | Internal | `60000` submission timeout |
| `HEYGEN_CONCURRENCY_LIMIT` | integer 1-10 initially | Yes | Internal | Fail in API mode |
| `HEYGEN_MAX_SCRIPT_CHARACTERS` | integer | No | Internal | `5000`, refreshed operationally |

Prices are versioned database records, not environment variables.

## 11. After Effects Runtime

| Variable | Type | Required | Class | Default / failure |
|---|---|---|---|---|
| `AE_CAPABILITY_VERSION` | immutable capability ID | AE worker | Internal | Fail |
| `AE_EXECUTABLE_PATH` | absolute local path | AE worker | Sensitive reference | Fail |
| `AE_TEMPLATE_ROOT` | absolute path | AE worker | Sensitive reference | Fail |
| `AE_PLUGIN_MANIFEST_PATH` | absolute file path | AE worker | Sensitive reference | Fail |
| `AE_FONT_MANIFEST_PATH` | absolute file path | AE worker | Sensitive reference | Fail |
| `AE_RENDER_TIMEOUT_SECONDS` | integer | No | Internal | `1800` |
| `AE_OUTPUT_CODEC` | approved codec enum | No | Internal | `h264` |
| `AE_WORKER_MODE` | enum `simulator` | No | Internal | `simulator`; any other value refuses renders with `AE_RENDER_FAILED` |
| `V0_C2_SIMULATOR_MODE` | enum `success,crash,bad_output,capability_drift` | No | Internal (test) | `success`; drives the deterministic AE render simulator in V0-C2 |
| `FFMPEG_PATH` | absolute path | media workers | Sensitive reference | Fail |

A readiness render must pass before the worker accepts leases. V0 runs the AE render worker
as a deterministic simulator; `AE_WORKER_MODE` gates acceptance and `V0_C2_SIMULATOR_MODE`
selects the simulator path (`success` produces a valid golden render, `crash` leaves the
attempt `running` for crash-recovery proof, `bad_output` returns an incompatible output,
`capability_drift` reports an unexpected capability version). Production AE worker mode is
out of V0 scope.

## 12. Payments

| Variable | Owner | Type | Required | Class | Default / failure |
|---|---|---|---|---|---|
| `PAYMENT_MODE` | API | enum `simulator,providers` | Yes | Internal | local `simulator`; prod explicit |
| `RAZORPAY_KEY_ID` | API | provider ID | India provider mode | Secret | Razorpay disabled |
| `RAZORPAY_KEY_SECRET` | API | secret | India provider mode | Secret | Disabled |
| `RAZORPAY_WEBHOOK_SECRET` | API | secret | India provider mode | Secret | Callback startup fails |
| `STRIPE_SECRET_KEY` | API | secret | International provider mode | Secret | Stripe disabled |
| `STRIPE_WEBHOOK_SECRET` | API | secret | International provider mode | Secret | Callback startup fails |
| `PAYMENT_CALLBACK_BASE_URL` | API | HTTPS URL | Provider mode | Internal | Fail |

Finance/provider owner rotates payment secrets; ledger state is never configuration.

## 13. Publishing

| Variable | Type | Required | Class | Default / failure |
|---|---|---|---|---|
| `PUBLISHING_MODE` | enum `simulator,providers` | Yes | Internal | local `simulator`; prod explicit |
| `META_APP_ID` | provider ID | Meta mode | Internal | Meta disabled |
| `META_APP_SECRET` | secret | Meta mode | Secret | Disabled |
| `META_WEBHOOK_VERIFY_TOKEN` | secret | Meta mode | Secret | Callback fails |
| `YOUTUBE_CLIENT_ID` | provider ID | YouTube mode | Internal | YouTube disabled |
| `YOUTUBE_CLIENT_SECRET` | secret | YouTube mode | Secret | Disabled |
| `YOUTUBE_WEBHOOK_SECRET` | signing secret | YouTube API mode | Secret | Callback verification fails |
| `YOUTUBE_MODE` | enum `simulator,api` | Yes | Internal | local `simulator`; `api` is the live YouTube route (out of V0 scope); any other value refuses submission with `PROVIDER_UNAVAILABLE` |
| `V0_YOUTUBE_SIMULATOR_SECRET` | signing secret | No | Internal (test) | `v0-local-youtube-secret`; deterministic local callback signing secret (production uses `YOUTUBE_WEBHOOK_SECRET`) |
| `V0_YOUTUBE_SIMULATOR_MODE` | enum `success,timeout,malformed,duplicate,processing` | No | Internal (test) | `success`; drives the deterministic YouTube Shorts publish simulator |
| `V0_YOUTUBE_SIMULATOR_QUOTA` | enum `exhausted` | No | Internal (test) | unset; `exhausted` forces a pre-flight `PUBLISH_QUOTA_EXHAUSTED` refusal (models the 3 uploads/day quota) |
| `V0_YOUTUBE_SIMULATOR_RECONCILE` | enum `accepted,processing,completed,failed,pending` | No | Internal (test) | `completed`; drives the deterministic YouTube reconcile outcome |
| `PUBLISH_CALLBACK_BASE_URL` | HTTPS URL | Provider mode | Internal | Fail |
| `VERIFY_RETRY_SCHEDULE_SECONDS` | comma-separated bounded integers | No | Internal | `0,60,180,420,900` |

Account OAuth tokens are stored through the credential service, not environment files.

## 14. Observability and Analytics

| Variable | Type | Required | Class | Default / failure |
|---|---|---|---|---|
| `OTEL_SERVICE_NAME` | non-empty | Yes | Internal | Fail |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | HTTPS/gRPC URL | staging/prod | Internal | Local console/no-op |
| `OTEL_EXPORTER_OTLP_HEADERS` | auth headers | if exporter requires | Secret | Export disabled |
| `TRACE_SAMPLE_RATIO` | decimal 0-1 | No | Internal | local `1`, prod `0.1` |
| `PRODUCT_ANALYTICS_ENABLED` | boolean | No | Internal | `false` |
| `PRODUCT_ANALYTICS_SINK` | approved adapter enum | when enabled | Internal | No-op |
| `PRODUCT_ANALYTICS_WRITE_KEY` | sink secret | when enabled | Secret | Analytics disabled |
| `DIAGNOSTIC_LOG_RETENTION_DAYS` | integer | No | Internal | `14` |

Product analytics never receives scripts, media, signed URLs, secrets or raw provider
payloads.

## 15. Notifications

| Variable | Type | Required | Class | Default / failure |
|---|---|---|---|---|
| `NOTIFICATION_MODE` | enum `log,email` | Yes | Internal | local `log` |
| `EMAIL_PROVIDER` | adapter enum | email mode | Internal | Email disabled |
| `EMAIL_API_KEY` | secret | email mode | Secret | Email disabled |
| `EMAIL_FROM_ADDRESS` | valid address | email mode | Public | Fail |
| `EMAIL_FROM_NAME` | non-empty | No | Public | `Sakhaa Forge` |
| `SUPPORT_EMAIL` | valid address | staging/prod | Public | Fail |

## 16. Rotation and Audit

- Secret values rotate through the provider/secret manager, never by committing `.env`.
- `ServiceCredential` stores provider, workspace/environment ownership, reference,
  status, created/rotated/expires timestamps and actor, never the secret.
- Rotation tests confirm old credentials stop working after the overlap window.
- Production startup records a redacted configuration fingerprint and schema version.

`BRAND_CRAWL_MODE=simulator` is the deterministic local/test path. `firecrawl` may be enabled
only server-side for the V0 brand crawl worker boundary; browser code must never receive
`FIRECRAWL_API_KEY`, raw Firecrawl payloads, provider crawl IDs that grant access, object keys,
signed URLs or prompt material. Generic LLM configuration remains `LLM_PROVIDER`,
`LLM_API_KEY` and `LLM_MODEL_ID`; vendor-specific aliases such as `OPEN_API_KEY` or
`OPENAI_API_KEY` are not canonical V0 configuration names.

## 17. Catalog Change Rule

Adding, renaming or deleting configuration requires:

1. catalog update;
2. typed schema update;
3. `.env.example` update when safe;
4. local/staging/deployment update;
5. startup and failure test;
6. rotation/rollback note for secrets;
7. no default that silently enables paid or publishing work.
