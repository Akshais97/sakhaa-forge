# API integration keys and expected parameters

**Status:** Reference inventory for V0 integration setup  
**Scope:** Sakhaa Forge V0 only  
**Source of truth:** `docs/V0/`, `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`, current provider adapter code and generated V0 contracts

This document lists the integration credentials and provider-supplied parameters the application needs. It does not contain secret values and must not be used as a place to paste keys.

## Rules

- Browser-exposed values are limited to `NEXT_PUBLIC_*` values already listed in the configuration catalog.
- Server secrets must be injected by the deployment secret manager or referenced by `secret-manager://...`.
- Workspace account credentials are stored through `ServiceCredential` metadata. The API accepts a secret reference, not the plaintext secret.
- Raw provider payloads, signed URLs, API keys, OAuth tokens and webhook secrets must not be logged, copied into docs, returned to browser code or stored in analytics.
- V0 uses deterministic simulators by default for paid, publishing, provider and worker boundaries. When a live provider mode is listed below but current code refuses live submission, this document marks that explicitly.

## Current code wiring audit

This inventory was checked against the current backend and frontend code paths, not only the
configuration catalog.

| Area | Actual current code path | Wiring implication |
|---|---|---|
| Web landing | `apps/web/app/sakhaa-forge-landing.tsx` is local presentation state derived from `sakhaa-forge/src`. | No provider keys are used by the public landing. It must receive only `NEXT_PUBLIC_*` values when API wiring is added. |
| Web workspace app | `apps/web/app/w/[workspaceSlug]/[[...segments]]/page.tsx` renders a backend-shaped command centre from `workspace-screen-model.ts`. | Final app wiring must replace local route model reads with the generated `/api/v0` client per screen, keeping workspace context explicit. |
| API routes | `apps/api/src/server.mjs` exposes `/api/v0` workspaces, brand crawl, brand approval, blueprints, script tournaments, generation estimates/jobs, composition, review, calendar publish/verify, callbacks, lineage, performance, credentials and operations routes. | The frontend should call generated contracts, pass auth, workspace id and idempotency keys where required. |
| Auth verification | `apps/api/src/auth.mjs` currently verifies HS256 JWTs using `SUPABASE_JWT_SECRET`. | Production hardening must reconcile this with canonical `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE` and `SUPABASE_JWKS_URL`. Keys alone are not sufficient until the auth verifier is updated. |
| Brand extraction | `apps/api/src/brand-extraction.mjs` deterministically extracts candidates from supplied scrape/page data; `apps/api/src/firecrawl-provider.mjs` owns the Firecrawl request/status normalisation boundary. | Firecrawl is approved for the V0 brand crawl provider path when `BRAND_CRAWL_MODE=firecrawl`; simulator remains the local/test default. Browser code never calls Firecrawl or receives Firecrawl credentials/raw payloads. |
| Viral discovery | `apps/api/src/viral-discovery.mjs` uses deterministic Xpoz simulator fixtures or manual fallback. | `XPOZ_API_BASE_URL` and `XPOZ_API_KEY` are not enough for live operation until the provider request/response contract and adapter are implemented. |
| HeyGen | `apps/api/src/heygen-provider.mjs` refuses non-simulator `HEYGEN_MODE`. | Live HeyGen needs adapter implementation plus callback verification tests before `HEYGEN_MODE=api` can be enabled. |
| Meta publishing | `apps/api/src/meta-provider.mjs` refuses non-simulator `META_MODE`. | Meta app keys and workspace OAuth token references are necessary but not sufficient; live provider calls must be implemented and tested. |
| YouTube publishing | `apps/api/src/youtube-provider.mjs` refuses non-simulator `YOUTUBE_MODE`; the catalog marks live API route out of V0 scope. | Keep YouTube simulator/manual fallback unless V0 scope is explicitly changed and the live adapter is implemented. |
| Payments | `workspace-store.mjs` contains payment callback verification and simulator-backed credit flows. | Razorpay/Stripe keys require provider-mode purchase creation and callback verification before real money is enabled. |
| Credential storage | `workspace-store.mjs` accepts only `secret-manager://...` references for `ServiceCredential`. | Social account tokens must be stored through the credential service, not `.env` or browser code. |
| Storage | `packages/config/src/storage.mjs` currently provides a local filesystem simulator; B2 variables are cataloged for production. | B2 buckets and application keys must be wired through storage adapter work before production artifacts leave local storage mode. |

## Credential storage model

### Deployment-level environment secrets

These configure a running service or provider adapter. They are owned by deployment configuration and secret manager.

Examples: `DATABASE_URL`, `HEYGEN_API_KEY`, `RAZORPAY_KEY_SECRET`, `STRIPE_WEBHOOK_SECRET`, `OBJECT_STORAGE_APPLICATION_KEY`.

### Workspace-level service credentials

These represent customer/workspace account credentials such as publishing OAuth accounts. The V0 API exposes:

- `POST /workspaces/{workspace_id}/service-credentials`
- `POST /workspaces/{workspace_id}/service-credentials/{credentialId}/rotate`

Create input required by current code:

| Field | Expected value |
|---|---|
| `provider` | Non-empty provider identifier, for example a publishing or analytics provider name chosen by the application. |
| `purpose` | Non-empty purpose, for example account publishing or provider access. |
| `environment` | Non-empty environment label. |
| `secretRef` | `secret-manager://...` reference only. |
| `rotationStatus` | One of the supported credential rotation statuses: `active`, `rotation_due`, `revoked`. |

Rotation input required by current code:

| Field | Expected value |
|---|---|
| `secretRef` | New `secret-manager://...` reference only. |
| `reason` | Optional string, maximum 500 characters. |

Rejected fields include plaintext secret carriers such as `secretValue`, `apiKey` and `plaintext`; V0 docs also reject plaintext `password` during rotation. The public response includes metadata and the new reference for active credentials, but the previous revoked credential summary never echoes its prior `secretRef`.

## Required integration keys and parameters

### Application URL and public web configuration

**V0 status:** Required app-to-app configuration; not API keys.

| Variable or credential | Expected parameter |
|---|---|
| `PUBLIC_WEB_URL` | Public web application origin, HTTPS outside local. |
| `API_BASE_URL` | API base URL used by web/workers as appropriate. |
| `NEXT_PUBLIC_API_BASE_URL` | Browser-safe API base URL. |
| `NEXT_PUBLIC_APP_ENV` | Browser-safe environment label. |
| `NEXT_PUBLIC_SUPPORT_URL` | Optional browser-safe support URL. |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Browser-safe analytics toggle. |

No secret values belong in these variables.

### Supabase Auth, API and PostgreSQL

**V0 status:** Required platform integration.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for browser auth. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key intended for browser use under RLS. |
| `SUPABASE_URL` | Server-side Supabase project URL. |
| `SUPABASE_JWT_ISSUER` | Expected JWT issuer URL. |
| `SUPABASE_JWT_AUDIENCE` | Expected JWT audience. |
| `SUPABASE_JWKS_URL` | JWKS endpoint for token verification. Supabase serves project JWKS under the Auth well-known path. |
| `DATABASE_URL` | Restricted pooled PostgreSQL URL for API/queue runtime. |
| `DIRECT_DATABASE_URL` | Direct migration-owner PostgreSQL URL for Prisma migrations only. |

Provider notes:

- Supabase documents publishable keys for browser/client initialization and secret keys for backend-only use; secret or service-role keys must never be placed in browser code.
- The canonical project catalog expects JWT verification through issuer, audience and JWKS.
- Current local API code also contains a `SUPABASE_JWT_SECRET` path for HMAC-style local JWT verification. That is an implementation gap against the canonical JWKS configuration and must be reconciled before production hardening.

### Redis / BullMQ

**V0 status:** Required jobs integration.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `REDIS_URL` | Redis connection URL, TLS outside local environments. |
| `QUEUE_PREFIX` | Environment-safe queue prefix, not provider-issued but required to isolate queues. |

Provider notes:

- BullMQ uses Redis as its backing store and accepts Redis connection parameters such as URL or host/port/TLS/password depending on deployment.
- Redis loss must not become canonical truth; PostgreSQL owns job, provider, credit and publication state.

### Backblaze B2 object storage

**V0 status:** Required for non-local private artifact storage.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `OBJECT_STORAGE_PROVIDER` | `b2` for Backblaze B2 mode. |
| `OBJECT_STORAGE_ENDPOINT` | B2/S3-compatible endpoint URL. |
| `OBJECT_STORAGE_REGION` | B2 region. |
| `OBJECT_STORAGE_KEY_ID` | B2 application key ID. |
| `OBJECT_STORAGE_APPLICATION_KEY` | B2 application key secret. |
| `B2_BUCKET_QUARANTINE` | Private quarantine bucket name. |
| `B2_BUCKET_CLEAN_MEDIA` | Private clean media bucket name. |
| `B2_BUCKET_PRIVATE_ARTIFACTS` | Private artifact bucket name. |

Expected operational parameters:

- Bucket names for quarantine, clean media and private artifacts.
- Upload/download TTLs from V0 config: `SIGNED_UPLOAD_TTL_SECONDS`, `SIGNED_DOWNLOAD_TTL_SECONDS`.
- Maximum upload size from `MAX_UPLOAD_BYTES`.

Provider notes:

- Backblaze B2 application keys provide a `keyID` and an `applicationKey`.
- Application keys can be scoped; production keys should be least-privilege and bucket-scoped where possible.

### Internal worker authentication

**V0 status:** Required internal integration boundary.

| Variable or credential | Expected parameter |
|---|---|
| `WORKER_SERVICE_ID` | Stable internal service identity. |
| `WORKER_AUTH_AUDIENCE` | Expected API audience for worker auth. |
| `WORKER_AUTH_TOKEN` | Local/test compatibility token only; production use is prohibited by config catalog. |
| `WORKER_SIGNING_KEY_REF` | Secret-manager signing key reference for staging/production. |
| `WORKER_CALLBACK_BASE_URL` | Private API callback base URL. |
| `WORKER_MAX_ARTIFACT_BYTES` | Maximum accepted worker artifact size. |

Workers must not receive PostgreSQL or Redis credentials.

### HeyGen video generation

**V0 status:** Canonical generation provider contract exists; current adapter is simulator-only and refuses live API mode.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `HEYGEN_MODE` | `simulator` or `api`; current V0 code only completes simulator mode. |
| `HEYGEN_API_BASE_URL` | HeyGen API base URL for live mode. |
| `HEYGEN_API_KEY` | HeyGen API key. |
| `HEYGEN_WEBHOOK_SECRET` | Webhook signing secret. |
| `HEYGEN_CALLBACK_URL` | Public callback URL registered with HeyGen. |
| `HEYGEN_CONCURRENCY_LIMIT` | Initial limit, configured as 1-10. |
| `HEYGEN_MAX_SCRIPT_CHARACTERS` | Script character limit, defaulted from V0 docs at 5000 and refreshed operationally. |

Expected request/response parameters from the integration contract:

| Direction | Parameters |
|---|---|
| V0 to provider | `POST /v3/videos`, script or audio input, callback URL, selected avatar, aspect ratio, resolution, operation idempotency identity. |
| Provider to V0 | Provider video/job ID, processing/completion/failure state, signed webhook callback, transient media URL or completion reference handled adapter-side. |
| V0 callback verification | `POST /callbacks/heygen` with `x-heygen-signature`, timestamp window, dedupe by event id, HMAC-SHA256 over the canonical envelope. |

Provider limits captured by V0 docs:

- Script limit currently documented as 5,000 characters.
- Avatar audio currently documented as 10 minutes.
- Input videos currently documented as 100 MB.
- Image/audio inputs currently documented as 50 MB.
- Pay-as-you-go asynchronous generation currently documented as 10 concurrent jobs.

Prices are configuration/database records, not environment variables.

### Razorpay payments

**V0 status:** Required India payment provider path; current V0 payment flow is simulator-backed unless `PAYMENT_MODE=providers` is implemented.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `PAYMENT_MODE` | `simulator` or `providers`. |
| `RAZORPAY_KEY_ID` | Razorpay API key ID. |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret. |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook secret. |
| `PAYMENT_CALLBACK_BASE_URL` | Public callback base URL for payment webhooks. |

Expected integration parameters:

| Direction | Parameters |
|---|---|
| V0 purchase creation | Integer minor-unit amount, currency, workspace, idempotency key, provider policy. |
| Provider callback | Provider reference, amount, currency, workspace binding, event id/type, timestamp and signature. |
| V0 callback verification | `POST /callbacks/razorpay`, HMAC-SHA256 verification, five-minute replay window, dedupe by `(workspaceId, provider, providerReference)`. |

V0 policy: Razorpay accepts INR only.

### Stripe payments

**V0 status:** Required international payment provider path; current V0 payment flow is simulator-backed unless `PAYMENT_MODE=providers` is implemented.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe server secret key. |
| `STRIPE_WEBHOOK_SECRET` | Stripe endpoint signing secret. |
| `PAYMENT_CALLBACK_BASE_URL` | Public callback base URL for payment webhooks. |

Expected integration parameters:

| Direction | Parameters |
|---|---|
| V0 purchase creation | Integer minor-unit amount, non-INR currency, workspace, idempotency key, provider policy. |
| Provider callback | Event id/type, payment object/provider reference, amount, currency, timestamp and signature. |
| V0 callback verification | `POST /callbacks/stripe`, HMAC-SHA256 verification, five-minute replay window, dedupe by `(workspaceId, provider, providerReference)`. |

V0 policy: Stripe accepts non-INR currencies only.

### Meta publishing

**V0 status:** Publishing provider slot exists; current adapter is simulator-only and refuses live API mode.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `PUBLISHING_MODE` | `simulator` or `providers`. |
| `META_APP_ID` | Meta app ID. |
| `META_APP_SECRET` | Meta app secret. |
| `META_WEBHOOK_VERIFY_TOKEN` | Developer-chosen verify token registered for Meta webhook validation. |
| Workspace `ServiceCredential` | Account/page/Instagram publishing OAuth token reference, stored as `secret-manager://...`, not in env files. |
| `PUBLISH_CALLBACK_BASE_URL` | Public callback base URL for publishing webhooks. |

Expected integration parameters:

| Direction | Parameters |
|---|---|
| V0 publish request | Calendar post platform/account, approved media identity, caption, idempotency key. The API derives the provider server-side; request body carries no provider field. |
| Provider/account setup | App ID, app secret, callback URL, verify token, account/page identity and access token. |
| Provider callback | Event id, workspace/source binding, publish state and public post URL only when completed/live. |
| V0 callback verification | `POST /callbacks/publishing/meta` with `x-meta-signature`, timestamp window and dedupe by `(workspaceId, source, eventId)`. |

Meta provider documentation states API calls generally require access tokens. Those workspace/account tokens belong in the credential service, not deployment environment variables.

### YouTube publishing

**V0 status:** Publishing provider slot exists; current adapter is simulator-only and refuses live API mode.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `YOUTUBE_MODE` | `simulator` or `api`; live API route is documented as out of V0 scope in the configuration catalog. |
| `YOUTUBE_CLIENT_ID` | Google OAuth client ID for YouTube Data API. |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth client secret. |
| `YOUTUBE_WEBHOOK_SECRET` | V0 signing secret for YouTube publishing callbacks in API mode. |
| Workspace `ServiceCredential` | Channel/account OAuth token reference, stored as `secret-manager://...`, not in env files. |
| `PUBLISH_CALLBACK_BASE_URL` | Public callback base URL for publishing webhooks. |

Expected integration parameters:

| Direction | Parameters |
|---|---|
| Provider/account setup | OAuth client ID, client secret, redirect URI, approved scopes, channel/account token material. |
| V0 publish request | Calendar post platform/account, approved media identity, caption, idempotency key. |
| Provider callback | Event id, workspace/source binding, publish state and public post URL only when completed/live. |
| V0 callback verification | `POST /callbacks/publishing/youtube` with `x-youtube-signature`, timestamp window and dedupe by `(workspaceId, source, eventId)`. |

V0 docs model a YouTube simulator quota mode for the documented upload quota constraint; live quota handling must be verified against the active Google project before enabling production mode.

### Viral discovery / Xpoz adapter

**V0 status:** Provider configuration slot exists; current code uses deterministic simulator/normalization.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `XPOZ_API_BASE_URL` | Xpoz provider base URL in provider mode. |
| `XPOZ_API_KEY` | Xpoz provider API key. |
| `XPOZ_TIMEOUT_MS` | Request timeout. |

Expected normalized candidate parameters retained by V0:

| Field | Expected value |
|---|---|
| `sourceUrl` | Source video URL. |
| `sourceIdentity` | Preserved provider/source identity. |
| `title` | Candidate title. |
| `creatorHandle` | Creator/account handle. |
| `metrics.views` | Integer view count. |
| `metrics.likes` | Integer like count. |
| `metrics.comments` | Integer comment count. |
| `metrics.shares` | Integer share count. |
| `observedAt` / snapshot date | Immutable metric snapshot timestamp. |
| `thumbnailUrl` / media URLs | Adapter-owned media references; must preserve rights warnings. |
| `rightsWarnings` / `rightsBasis` | Rights warning and basis for use/review. |

No public Xpoz provider contract was found in the canonical repo docs beyond `XPOZ_API_BASE_URL`, `XPOZ_API_KEY` and the normalized V0 candidate fields. Do not invent provider-specific request parameters until the provider contract is added.

### LLM / AI provider slot

**V0 status:** Generic adapter configuration slot; current script/brand extraction paths are deterministic local/simulator flows unless a provider is explicitly enabled.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `LLM_PROVIDER` | Approved adapter identifier. |
| `LLM_API_KEY` | Provider API key for provider mode. |
| `LLM_MODEL_ID` | Approved model identifier. |
| `LLM_REQUEST_TIMEOUT_MS` | Request timeout. |

Expected V0 output constraints:

- Schema-valid outputs only.
- Malformed, empty, refused, low-confidence or schema-invalid output must be blocked or failed according to the V0 contract.
- No provider-specific model vendor is selected in canonical docs; therefore no OpenAI, Anthropic, Google or other vendor key is listed as required here.

### Firecrawl brand crawl integration

**V0 status:** Approved V0 brand crawl provider behind the server/worker boundary. Simulator remains the local/test default.

| Variable or credential | Expected parameter |
|---|---|
| `BRAND_CRAWL_MODE` | `simulator` or `firecrawl`; production must opt in explicitly. |
| `FIRECRAWL_API_BASE_URL` | Firecrawl v2 API base URL, default `https://api.firecrawl.dev/v2`. |
| `FIRECRAWL_API_KEY` | Firecrawl API key, injected as a server/queue secret. |
| `FIRECRAWL_TIMEOUT_MS` | Provider request timeout. |
| `BRAND_CRAWL_DEFAULT_MAX_PAGES` | Default page cap for a brand crawl, local default 5. |
| `BRAND_CRAWL_MAX_PAGES` | Absolute page cap for a brand crawl, V0 cap 50. |
| `CRAWL_USER_AGENT` | Contact-bearing crawler user agent. |
| `CRAWL_MAX_PAGES` | Maximum pages per crawl. |
| `CRAWL_MAX_REDIRECTS` | Maximum redirects. |
| `CRAWL_TIMEOUT_MS` | Crawl timeout. |

Expected request/response parameters:

| Direction | Parameters |
|---|---|
| V0 to provider | Firecrawl v2 scrape/crawl calls through the adapter only: fixed universal pass from `docs/V0/Features/Firecrawl/brand-crawl-universal.md` first, then one selected or detected vertical pass from `docs/V0/Features/Firecrawl/brand-crawl-verticals.md`, with normalised public URL, bounded scope, `allowExternalLinks:false`, `allowSubdomains:false` and `ignoreRobotsTxt:false`. |
| Provider to V0 | Provider crawl status, page markdown, metadata, links, images, screenshots, branding facts, selected/detected brand type, vertical assets and credit telemetry normalised into `brand.extraction.output.v3` before candidate extraction. |
| V0 status check | `GET /v2/crawl/{id}` through the adapter only; raw provider payloads stay private and are not public API contracts. |

Firecrawl keys are deployment-level secrets, not workspace service credentials. Do not use
`OPEN_API_KEY` or `OPENAI_API_KEY` as aliases for this path; LLM extraction uses the generic
`LLM_PROVIDER`, `LLM_API_KEY` and `LLM_MODEL_ID` variables.

### Observability and analytics

**V0 status:** Generic observability/product analytics slots.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint. |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers if the collector requires them. |
| `PRODUCT_ANALYTICS_SINK` | Approved analytics adapter identifier. |
| `PRODUCT_ANALYTICS_WRITE_KEY` | Analytics sink write key. |

Guardrail: product analytics never receives scripts, media, signed URLs, secrets or raw provider payloads.

### Notifications / email

**V0 status:** Generic notification slot.

| Variable or credential | Expected provider-supplied parameter |
|---|---|
| `NOTIFICATION_MODE` | `log` or `email`. |
| `EMAIL_PROVIDER` | Approved email adapter identifier. |
| `EMAIL_API_KEY` | Email provider API key. |
| `EMAIL_FROM_ADDRESS` | Sender address. |
| `EMAIL_FROM_NAME` | Sender display name. |
| `SUPPORT_EMAIL` | Support contact address. |

No concrete email vendor is selected in canonical docs; therefore no SendGrid, SES, Resend or other vendor-specific credential is listed as required.

## Non-API operational integrations

These are integration parameters but not API keys.

| Area | Variables |
|---|---|
| After Effects worker | `AE_CAPABILITY_VERSION`, `AE_EXECUTABLE_PATH`, `AE_TEMPLATE_ROOT`, `AE_PLUGIN_MANIFEST_PATH`, `AE_FONT_MANIFEST_PATH`, `AE_RENDER_TIMEOUT_SECONDS`, `AE_OUTPUT_CODEC`, `AE_WORKER_MODE`, `V0_C2_SIMULATOR_MODE` |
| Media tooling | `FFMPEG_PATH` |
| Verification timing | `VERIFY_RETRY_SCHEDULE_SECONDS` |
| Local storage simulator | `LOCAL_STORAGE_ROOT` |

V0 currently runs the AE render worker as a deterministic simulator; production AE worker mode is out of V0 scope.

## Simulator-only and test controls

These values are useful for local/staging verification but are not external provider keys.

| Boundary | Variables |
|---|---|
| HeyGen simulator | `V0_HEYGEN_SIMULATOR_MODE`, `V0_HEYGEN_SIMULATOR_RECONCILE`, `V0_HEYGEN_CONCURRENCY_LIMIT`, `V0_G5_SIMULATOR_MODE` |
| YouTube simulator | `V0_YOUTUBE_SIMULATOR_SECRET`, `V0_YOUTUBE_SIMULATOR_MODE`, `V0_YOUTUBE_SIMULATOR_QUOTA`, `V0_YOUTUBE_SIMULATOR_RECONCILE` |
| Meta simulator | `V0_META_SIMULATOR_MODE`, `V0_META_SIMULATOR_RECONCILE` |
| AE simulator | `V0_C2_SIMULATOR_MODE` |

## Open questions and conflicts

| Item | Status |
|---|---|
| Supabase JWT verification | Canonical config requires issuer/audience/JWKS. Current local code also uses `SUPABASE_JWT_SECRET`; reconcile before production. |
| Xpoz provider contract | Repo defines base URL, API key and normalized candidate fields, but not the provider's full public API contract. |
| LLM provider | Generic adapter slot exists; no vendor is canonically selected. |
| Email provider | Generic adapter slot exists; no vendor is canonically selected. |
| Product analytics sink | Generic adapter slot exists; no vendor is canonically selected. |
| Live HeyGen, Meta and YouTube adapters | Config/docs describe live credential requirements, but current adapter code is simulator-first and refuses live routes where noted. |
| Firecrawl provider rollout | Canonical for V0 brand crawl when `BRAND_CRAWL_MODE=firecrawl`; production enablement still requires environment secret provisioning, provider-mode verification evidence and simulator fallback. |

## External references used

- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase JWKS and secret key handling: https://supabase.com/docs/guides/functions/secrets
- BullMQ connections: https://docs.bullmq.io/guide/connections
- Backblaze B2 application keys: https://www.backblaze.com/docs/cloud-storage-application-keys
- Razorpay API keys: https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/?preferred-country=US
- Razorpay webhooks: https://razorpay.com/docs/webhooks/setup-edit-payments/?preferred-country=US
- Stripe webhooks and signing secrets: https://docs.stripe.com/webhooks
- HeyGen API key and webhook docs: https://developers.heygen.com/docs/quick-start, https://developers.heygen.com/docs/webhooks
- Google YouTube Data API application registration: https://developers.google.com/youtube/registering_an_application
- Meta access tokens and webhooks: https://developers.facebook.com/documentation/facebook-login/guides/access-tokens, https://developers.facebook.com/docs/graph-api/webhooks/getting-started/
