# Backend API Wiring Audit — Sakhaa Forge V0

Status: Evidence-backed audit of the entire V0 backend, read file-by-file with line-level citations.
Date: 2026-07-02
Scope: `apps/api/src/`, `packages/config`, `packages/db`, `workers/`, `packages/contracts`.
Companion documents: `API_AND_INTEGRATION_WIRING_REQUIRED.md`, `API_INTEGRATION_KEYS.md`.

This audit verifies every row of the wiring checklist against the actual backend code, not only
the configuration catalog. It answers one question: where are code changes required for the
backend to show real functionality instead of deterministic simulator behaviour?

---

## 0. Executive summary

A repo-wide grep confirms **zero** `fetch` / `undici` / `axios` / `http` / provider-SDK imports
anywhere in `apps/api/src`. The backend has a real HTTP server, a real Prisma schema and store,
and real ledger/credential plumbing — but **every external provider boundary (crawl, LLM, Xpoz,
HeyGen, AE render, Meta, YouTube, audience verification, payments, B2 storage, BullMQ worker,
observability) is a deterministic simulator that makes no real network call.**

Example (the prompt's few-shot): `firecrawl-main/` is vendored in the repository but never
imported, and `apps/api/src` contains zero Firecrawl references. The crawl step that
`brand-extraction.mjs` depends on does not exist. This pattern is the rule, not the exception.

This is intentional per `CLAUDE.md §2` ("deterministic simulators by default for paid,
publishing, provider and worker boundaries"). The code is honest about it: most paid/publishing
adapters *refuse* non-simulator mode by returning an `unavailable` error envelope rather than
silently faking. The crawl/LLM/Xpoz simulators and payments are the exceptions — they have no
refusal guard and silently return fixtures or simulator output for any mode.

---

## 1. Methodology

The following files were read in full:

- `apps/api/src/server.mjs` (NestJS + Fastify controller surface)
- `apps/api/src/auth.mjs`
- `apps/api/src/permissions.mjs`
- `apps/api/src/readiness.mjs`
- `apps/api/src/build-info.mjs`
- `apps/api/src/workspace-store.mjs` (18,616 lines — persistence, payments, credentials, settlement, lineage, callbacks)
- `apps/api/src/brand-extraction.mjs`
- `apps/api/src/viral-discovery.mjs`
- `apps/api/src/script-generation.mjs`
- `apps/api/src/heygen-provider.mjs`
- `apps/api/src/ae-render-provider.mjs`
- `apps/api/src/ae-capability-registry.mjs`
- `apps/api/src/meta-provider.mjs`
- `apps/api/src/youtube-provider.mjs`
- `apps/api/src/verify-provider.mjs`
- `apps/api/src/performance-provider.mjs`
- `apps/api/src/b2-transfer-benchmark-provider.mjs`
- `apps/api/src/incident-rehearsal-provider.mjs`
- `apps/api/src/queue-backlog-provider.mjs`
- `packages/config/src/storage.mjs`, `packages/config/src/env.mjs`
- `packages/db/prisma/schema.prisma`, `packages/db/generated/client/`
- `workers/queue/src/processor.mjs`, `workers/python/fake_worker.py`
- `packages/contracts/generated/v0-client.mjs`
- `apps/api/package.json`, root `.env.example`

Cross-referenced against `docs/Project/Operations/API_AND_INTEGRATION_WIRING_REQUIRED.md` and
`API_INTEGRATION_KEYS.md`. All findings below cite `file:line`.

---

## 2. What IS properly wired (real, production-correct)

| Area                             | Reality                                                                                                                                                                                   | Evidence                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| HTTP API surface                 | Real NestJS+Fastify controllers; full `/api/v0` route set with auth, idempotency keys, RFC 9457 problem details                                                                           | `server.mjs` routes 1827–1935; `problem()` factory                                                               |
| Prisma schema + generated client | Real, 50+ models, PostgreSQL datasource, generated client present                                                                                                                         | `packages/db/prisma/schema.prisma`; `packages/db/generated/client/`                                              |
| Prisma runtime store             | Real `prisma.$transaction` writes across the full domain (workspace, membership, credit wallet/purchase/ledger, service credential, generation job, calendar post, lineage, performance…) | `workspace-store.mjs:7262` `createPrismaWorkspaceStore`; `tx.X.create/update` at 7279/7296/9021/9042/10648/12258 |
| Credit ledger math               | Real integer-minor `BigInt` (CAPTURE/RELEASE/RESERVE/ADJUSTMENT) — no floats                                                                                                              | `workspace-store.mjs:5440–5459`; Prisma `balanceMinor: { increment/decrement }` 10664/10690/10716                |
| ServiceCredential validation     | Real `secret-manager://` prefix enforcement, rejects `secretValue`/`apiKey`/`plaintext`, rotate revokes-then-creates, never echoes old ref                                                | `workspace-store.mjs:15516–15562`, `6755`/`12280`                                                                |
| Permissions matrix               | Real static capability matrix (OWNER/ADMIN/CLIENT_MANAGER/REVIEWER)                                                                                                                       | `permissions.mjs`                                                                                                |
| Generated OpenAPI client         | Real generated client + OpenAPI doc served at `/openapi.json`                                                                                                                             | `packages/contracts/generated/v0-client.mjs`; `server.mjs:15,1830`                                               |
| Callback scaffolding             | Real dedup `(workspaceId,source,eventId)` + 5-min replay window + constant-time HMAC compare                                                                                              | `workspace-store.mjs:5332–5341` (mem) / `10560–10572` (Prisma); `timingSafeEqual`                                |

Note: "properly wired" above means the mechanism is real. Persistence is real *only when the
Prisma store is selected* (see §4.1) — the default runtime is in-memory.

---

## 3. Master status table — external integrations

| Integration                         | Status                        | Mode switch                   | Refuses live?                             | Reads its keys?                                                                            |
| ----------------------------------- | ----------------------------- | ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Firecrawl / brand crawl             | NOT INTEGRATED                | none                          | n/a                                       | n/a — vendored, never imported                                                             |
| LLM (script gen / brand extraction) | SIMULATOR                     | `input.simulatorMode` arg     | no guard at all                           | no (`LLM_*` never read)                                                                    |
| Xpoz (viral discovery)              | SIMULATOR (fixtures)          | `input.providerMode` arg      | **no guard — silently falls to fixtures** | **no** (`XPOZ_*` declared, never read)                                                     |
| HeyGen generation                   | SIMULATOR                     | `HEYGEN_MODE`                 | yes → `PROVIDER_UNAVAILABLE`              | **no** (`HEYGEN_API_BASE_URL/KEY` never read)                                              |
| AE render worker                    | SIMULATOR                     | `AE_WORKER_MODE`              | yes → `AE_RENDER_FAILED`                  | no                                                                                         |
| AE capability registry              | HARDCODED LITERAL             | none                          | n/a                                       | only `AE_CAPABILITY_VERSION`                                                               |
| Meta publishing                     | SIMULATOR                     | `META_MODE`                   | yes → `PROVIDER_UNAVAILABLE`              | no                                                                                         |
| YouTube publishing                  | SIMULATOR                     | `YOUTUBE_MODE`                | yes → `PROVIDER_UNAVAILABLE`              | no (live route out of V0 scope)                                                            |
| Audience verification               | SIMULATOR                     | `VERIFY_MODE`                 | yes → `PROVIDER_UNAVAILABLE`              | no                                                                                         |
| Performance observation             | SIMULATOR                     | `PERFORMANCE_MODE`            | yes → `PERFORMANCE_PROVIDER_UNAVAILABLE`  | no                                                                                         |
| Payments (Razorpay/Stripe)          | SIMULATOR                     | **no `PAYMENT_MODE` switch**  | n/a — always simulator                    | **no** (`RAZORPAY_*`/`STRIPE_*` never read)                                                |
| B2 object storage                   | NOT INTEGRATED (local-FS sim) | none                          | n/a                                       | partial (reads `LOCAL_STORAGE_ROOT` + bucket names; ignores `OBJECT_STORAGE_ENDPOINT/KEY`) |
| B2 transfer benchmark               | SIMULATOR                     | `B2_STORAGE_MODE`             | yes                                       | no                                                                                         |
| Queue backlog probe                 | SIMULATOR                     | `QUEUE_BACKLOG_MODE`          | yes                                       | no                                                                                         |
| Incident rehearsal                  | SIMULATOR (intentional)       | `INCIDENT_REHEARSAL_MODE`     | yes                                       | no                                                                                         |
| BullMQ queue worker                 | STUB (9-line heartbeat)       | n/a                           | n/a                                       | no `bullmq`/`ioredis`                                                                      |
| Python/media worker                 | STUB (prints 1 line)          | n/a                           | n/a                                       | no                                                                                         |
| Notifications/email                 | LOG mode only                 | `NOTIFICATION_MODE=log`       | n/a                                       | no email provider                                                                          |
| Observability (OTEL)                | NOT INTEGRATED                | n/a                           | n/a                                       | no `@opentelemetry`                                                                        |
| Supabase Auth (JWT)                 | PARTIAL — HS256 only          | `SUPABASE_JWT_SECRET`         | n/a                                       | reads secret; no JWKS/RS256/issuer/audience                                                |
| Readiness probe                     | STUB (lies during outage)     | `V0_LOCAL_DEPENDENCY_FAILURE` | n/a                                       | deps named `fakeWorker`/`fakeProvider`                                                     |

Key asymmetry: the paid/publishing simulators refuse live mode loudly (correct). The crawl/LLM/
Xpoz simulators have no refusal guard — `viral-discovery.mjs` silently returns fixtures for any
mode, and `script-generation.mjs` has no live path at all. Payments has no `PAYMENT_MODE`
switch — it is always simulator regardless of env.

---

## 4. Per-integration detail (evidence + required changes)

### 4.1 Persistence (cross-cutting) — real but defaulted OFF
- Factory: `workspace-store.mjs:135–140` — `if (env.V0_RUNTIME_DB === "prisma") return createPrismaWorkspaceStore(env); return createWorkspaceStore(env);` The **in-memory store is the default**.
- Prisma import: `workspace-store.mjs:2` — `import { PrismaClient } from "../../../packages/db/generated/client/index.js"`.
- Prisma store: `createPrismaWorkspaceStore` at `:7262` does `new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } })`, all work in `prisma.$transaction` + `setActorContext` tenant context, full domain method set (50+ async functions: `createWorkspace:7291`, `createGenerationEstimate:7947`, `submitGenerationJob:8295`, review/publish/verify/lineage/performance…). `disconnect: () => prisma.$disconnect()` at `:15453`.
- In-memory store: `:142+`, ~50 `new Map()`/`Set()`/`[]` at `:143–258`. Lost on restart. Only hardcoded fixture: `providerPriceVersions` rate `1600` (`:230–241`, mirrored by a migration seed row in the Prisma path).
- `.env.example` never sets `V0_RUNTIME_DB`, so the default runtime loses all state on restart.
- Change: set `V0_RUNTIME_DB=prisma` + `DATABASE_URL` + run migrations (`packages/db/scripts/db-migrate-dev.mjs`). Confirm `setActorContext` enforces `workspace_id` tenant predicates for every query (CLAUDE.md §7/§11/§16).

### 4.2 Supabase Auth — PARTIAL (HS256 only)
- `auth.mjs:9,29–55` verifies HS256 JWTs with `env.SUPABASE_JWT_SECRET` via HMAC, hard-requires `payload.aud === "authenticated"` (`:16`). No `iss` check, no JWKS fetch, no RS256 path. No `jose`/`@supabase/supabase-js` installed.
- `.env.example` declares `SUPABASE_JWT_ISSUER/AUDIENCE/JWKS` but not `SUPABASE_JWT_SECRET` — a config/code mismatch. Modern Supabase defaults to RS256; this verifier cannot validate those tokens.
- Change: add JWKS/RS256 verification (`jose`, `SUPABASE_JWT_ISSUER/AUDIENCE/JWKS_URL`); keep HS256 for local/test; add distinct error codes for no-token/bad-secret/expired.

### 4.3 Brand crawl / Firecrawl — NOT INTEGRATED
- `brand-extraction.mjs` is a pure regex/hash parser of already-supplied `scrape.pages[].text/markdown/branding` (`:9`). Reads zero env vars, no network call, only `node:crypto` imported.
- The crawl step that would produce that `scrape` shape does not exist in `apps/api/src`. `firecrawl-main/` is vendored but never imported; `apps/api/src` has zero Firecrawl references.
- Hardcoded confidence values (0.82/0.84/0.72… `:67–125`) and a fixed 4-phrase audience allowlist (`:93`).
- Change: implement an approved crawl adapter (Firecrawl or alternative) that owns outbound crawl I/O and returns `{pages:[{text|markdown,url,title,branding}]}`; add `BRAND_CRAWL_MODE=simulator|api` with the refuse-guard pattern; optionally add an LLM extractor behind `LLM_PROVIDER`.

### 4.4 LLM / script generation — SIMULATOR, no live path
- `script-generation.mjs`: hardcoded hook/proof/CTA templates (`:70,109–118`); `scoreFromHash` = `parseInt(hash.slice(0,8),16) % 40` mapped to 0.60–0.99 (`:231–235`) — a hash-derived pseudo-score, not a model. No env switch, no refusal guard, no AI SDK. `SCRIPT_PROMPT_VERSION`/`SCRIPT_MODEL_VERSION` are version strings only (`:12–13`).
- Note: V2/Sakhaa scoring is "Do not implement" per `CLAUDE.md §12`; the real score must come from a V0-sanctioned provider evaluation, not V2.
- Change: real LLM call replacing templates + pseudo-score; `SCRIPT_AI_PROVIDER/KEY/MODEL/BASE_URL`; map provider refusal→`AI_REQUEST_REFUSED`, schema-invalid→`AI_OUTPUT_SCHEMA_INVALID`; persist side-effect before I/O. The policy/brand-rule/formula validation in `evaluateScriptVariant:124–203` is real and can stay; only the `modelScore:167` and variant text generation (`:64–107`) are fake.

### 4.5 Xpoz / viral discovery — SIMULATOR, silently falls back
- `viral-discovery.mjs`: three hardcoded fixtures (`:5–33`), deterministic rank `views+likes*8+comments*20+shares*35` (`:114–116`), `provider: "xpoz-simulator"` (`:55`), `provenance.type: "provider_fixture"` (`:80`). `XPOZ_API_BASE_URL` in `.env.example:46` but **never read**. **No refusal guard** — unrecognized `providerMode` silently returns fixtures.
- Change: define the Xpoz provider contract first (`API_INTEGRATION_KEYS.md:312` notes none exists beyond base URL/key/normalized fields — contracts before code per CLAUDE.md §3); then real `fetch(XPOZ_API_BASE_URL)` with `XPOZ_API_KEY`/`XPOZ_TIMEOUT_MS`; add `XPOZ_MODE` refuse guard; keep manual fallback (`:44–50`).

### 4.6 HeyGen generation — SIMULATOR, refuses live
- `heygen-provider.mjs`: `HEYGEN_MODE !== "simulator"` → `return { ok:false, kind:"unavailable", errorCode:"PROVIDER_UNAVAILABLE" }` (`:66–69`, `:144–146`). Only `node:crypto` imported. `HEYGEN_API_BASE_URL`/`HEYGEN_API_KEY` never read.
- Synthetic `externalId: hg_…` (`:87–91`); fake media `Buffer.from("v0-g5-media:…")` (`:131–133`); hardcoded `resolution:{width:1280,height:720}`, `contentType:video/mp4` (`:168–170`); hardcoded rate `HEYGEN_SIMULATOR_RATE_MINOR_PER_SECOND = 1600` (`:129`) not from DB price version.
- Change: real `POST {HEYGEN_API_BASE_URL}/v3/videos` with `Bearer HEYGEN_API_KEY`, real reconcile `GET`, real media download + sha256/duration/codec probe, real `x-heygen-signature` HMAC callback over raw bytes, price-version DB lookup replacing `1600`, `unknown`-on-timeout semantics. Flip the `:66` guard from refuse→call.

### 4.7 AE render + capability registry — SIMULATOR + hardcoded
- `ae-render-provider.mjs`: `AE_WORKER_MODE !== "simulator"` refuses (`:64–67`); no `child_process`/`spawn`/`ffmpeg`; `renderAeVideo` returns sha256-derived hashes + arithmetic byte sizes (`byteSize: 1024 + durationSeconds*64` `:91`). `goldenRenderHash` exact-match validation (`:150–158`) would reject legitimate real renders — real output is not bit-identical across runs.
- `ae-capability-registry.mjs`: zero imports; hardcoded literal `fonts:["Satoshi","Clash Display","JetBrains Mono"]`, `plugins:["ae_builtin"]`, `codecs:["h264"]`, templates/effects (`:26–35`). Never reads disk manifests.
- Change: real `child_process.spawn(aerender)` or HTTP to licensed AE worker producing actual files written to B2; real sha256/size/codec from output; read real plugin/font/effect manifests; relax golden-hash to structural/codec/resolution validation; map real worker failures to `AE_RENDER_FAILED`/`AE_CAPABILITY_UNAVAILABLE`.

### 4.8 Meta publishing — SIMULATOR, refuses live
- `meta-provider.mjs`: `META_MODE !== "simulator"` refuses (`:66–69`); fake `https://meta.example.test/p/...` (`:52`); synthetic `meta_…` ids (`:91`). No Graph API call.
- Callback HMAC `verifyMetaSignature` (`workspace-store.mjs:16431–16439`) is real constant-time HMAC-SHA256 but over `stableJson(envelope)` canonical JSON, not raw bytes — comment at `:16321–16326` admits production providers verify over raw bytes. A real Meta webhook would fail.
- Change: real `POST graph.facebook.com/v{ver}/{page-id}/feed` with page token from credential service; real reconcile `GET`; raw-body `x-hub-signature-256` HMAC with `META_WEBHOOK_SECRET` + timestamp window (scaffolding exists); derive real permalink.

### 4.9 YouTube publishing — SIMULATOR (live out of V0 scope)
- `youtube-provider.mjs`: `YOUTUBE_MODE !== "simulator"` refuses (`:90–93`); fake `youtube.example.test/shorts/...` (`:60`); quota is a test flag `V0_YOUTUBE_SIMULATOR_QUOTA=exhausted` (`:70`). Same canonical-JSON callback caveat as Meta.
- Change: real resumable YouTube Data API v3 upload with OAuth2 channel token from credential service; real quota check; raw-body `x-youtube-signature`. `API_INTEGRATION_KEYS.md:284` marks live route out of V0 scope — keep simulator unless scope explicitly changes.

### 4.10 Audience verification — SIMULATOR, echoes expected values
- `verify-provider.mjs`: `VERIFY_MODE !== "simulator"` refuses (`:84–87`). On "success" it echoes the expected values back as "observed" (`:135–143`) — `observedMediaSha256 = expectedMediaSha256`, `observedAccount = expectedAccount`. It never fetches `request.liveUrl`. The evidence hash only proves the simulator ran, not that a real post was observed.
- Change: actually read the live post (Graph API / YouTube Data API / controlled public fetch), download + hash real media, read real account/caption/visibility/publish-time, map platform states to the existing result enum.

### 4.11 Payments (Razorpay/Stripe) — fully simulator, no live path
- `workspace-store.mjs`: no `PAYMENT_MODE` switch exists (grep-confirmed zero). `createCreditPurchase` always emits `providerReference: sim_${provider}_${uuid}` (`:5280` mem / `:9047` Prisma) + simulator-signed envelope (`:5304–5316`). Provider is a label only: INR→"razorpay", else→"stripe" (`:16905–16927`). No SDK, no fetch, no order/checkout creation. `RAZORPAY_*`/`STRIPE_*` never read.
- Callback verification (`processPaymentCallback` `:5320`/`10547`) uses `paymentSimulatorSecret = env.V0_PAYMENT_SIMULATOR_SECRET || "v0-local-payment-secret"` and HMAC over `stableJson(envelope)` — a real provider webhook fails. Credit settlement math itself is real integer-minor `BigInt` (production-correct).
- Change: create `razorpay-provider.mjs`/`stripe-provider.mjs` adapters (mirror heygen pattern); real order/checkout creation using `RAZORPAY_KEY_ID/SECRET`, `STRIPE_SECRET_KEY`; raw-body signature verification (`x-razorpay-signature` hex HMAC, Stripe `t=…,v1=…`); gate behind `PAYMENT_MODE=providers`; pass raw body (not parsed JSON) to verifier.

### 4.12 B2 object storage — NOT INTEGRATED (local-FS simulator)
- `packages/config/src/storage.mjs`: filesystem-only; `provider: "local-filesystem"` (`:19`); ignores `OBJECT_STORAGE_PROVIDER` entirely; `OBJECT_STORAGE_ENDPOINT/REGION/KEY_ID/APPLICATION_KEY` never read. No `@aws-sdk/client-s3`.
- Signed URLs are fabricated: `signedContract()` returns `token: randomUUID()` (`workspace-store.mjs:15474–15481`) stored in in-memory `Map`s with 15-min expiry — not real presigned URLs. `completeArtifactUpload` flips status to `CLEAN` with no storage I/O (`:438–440`).
- Change: real B2/S3 adapter (`S3Client` against endpoint/region/key), branch on `OBJECT_STORAGE_PROVIDER`, real `PutObject`/`GetObject`, real `getSignedUrl` presigned PUT/GET with `SIGNED_UPLOAD/DOWNLOAD_TTL_SECONDS` + `MAX_UPLOAD_BYTES`, bucket-scoped least-privilege keys (ADR-020), persist token metadata in DB.

### 4.13 BullMQ queue worker — STUB
- `workers/queue/src/processor.mjs` is 9 lines: logs a heartbeat. No `bullmq`/`ioredis`; `package.json` has no deps.
- The API side has real worker-auth endpoints (`server.mjs:1930–1935` `internal/jobs/:id/claim|heartbeat|complete|fail`, lease-expire, outbox-relay, gated by `assertWorker` `:1963–1972`) — but nothing calls them.
- Change: real BullMQ `Worker` over `REDIS_URL`/`QUEUE_PREFIX` carrying opaque wake-up IDs (PostgreSQL owns canonical state per CLAUDE.md §5); call API `internal/jobs/*` with `WORKER_AUTH_TOKEN` (local) or `WORKER_SIGNING_KEY_REF`-signed JWT (prod) in `x-v0-worker-token` via `WORKER_CALLBACK_BASE_URL`; drive lease-expire + outbox-relay on schedule; worker gets only Redis URL, never DB creds.

### 4.14 Python/media worker — STUB
- `workers/python/fake_worker.py` prints one line and exits. Out of V0 scope today (`ae-render-provider.mjs:3–4`).
- Change: if enabled — authenticated API callback + AE/ffmpeg invocation + B2 upload, no DB/Redis creds to worker.

### 4.15 Observability / notifications / readiness — NOT INTEGRATED / STUB
- No `@opentelemetry` anywhere; `OTEL_*` cataloged but unused. `NOTIFICATION_MODE=log` only, no email provider.
- `readiness.mjs` is a stub: every dependency returns `status:"available"` with no probe (`:46–52`); deps literally named `fakeWorker` and `fakeProvider` (`:1–9`); object storage hardcoded `mode:"simulator"` (`:54–60`). `/ready` reports ready during a real outage.
- Change: real probes (Prisma `SELECT 1`, `ioredis.ping`, B2 HEAD, Supabase JWKS HEAD, BullMQ queue depth); real OTEL OTLP exporter to `OTEL_EXPORTER_OTLP_ENDPOINT`; email adapter behind `EMAIL_PROVIDER`.

---

## 5. Cross-cutting code issues affecting real operation

1. **Persistence defaults OFF.** `createStore` picks in-memory unless `V0_RUNTIME_DB=prisma` (`workspace-store.mjs:135–140`). `.env.example` never sets it; every restart loses all state. The Prisma store is real and complete — flip the env + run migrations.
2. **Auth is HS256-only.** `auth.mjs:9,29–55` — no `iss`, no JWKS, no RS256. No `jose`/`@supabase/supabase-js` installed. `.env.example` declares JWKS vars but not `SUPABASE_JWT_SECRET` — config/code mismatch. Modern Supabase RS26/RS256 tokens cannot be verified.
3. **Worker-token compare not constant-time.** `server.mjs:1966` uses `!==` (auth.mjs correctly uses `timingSafeEqual`).
4. **`trace_id` hardcoded.** `server.mjs:2007` returns `"v0-local-trace"` in every error — no real tracing.
5. **`secretRef` is a prefix check, not a strict URI regex.** `workspace-store.mjs:15531–15532`. Minor hardening.
6. **ServiceCredential refs are never resolved/consumed.** Providers read secrets from `env` directly; the credential registry stores references but nothing turns `secret-manager://…` into a real secret at call time.
7. **Callback HMACs sign canonical JSON, not raw bytes** (payments, Meta, YouTube). Real provider webhooks sign raw bodies — all three verifiers would reject real callbacks. Requires passing raw body into `server.mjs` route handlers (currently pass parsed `request.body`).
8. **`apps/api/package.json` has no provider/infra SDKs.** Only NestJS + Fastify + Prisma + reflect-metadata + rxjs. To go live: add `jose`, `ioredis`/`bullmq`, `razorpay`/`stripe`, `@aws-sdk/client-s3`, an HTTP client, and per-provider SDKs as each adapter is implemented.

---

## 6. Changes required for real functionality — prioritized

### Tier 0 — flip the switches that already work (no new code)
1. Set `V0_RUNTIME_DB=prisma` + `DATABASE_URL` + run Prisma migrations → persistence becomes real.
2. Set `SUPABASE_JWT_SECRET` to the real Supabase project JWT secret (or, for RS256 projects, this is a Tier 1 code change).

### Tier 1 — load-bearing code changes to make any real external call possible
3. Add an outbound HTTP client + per-provider SDKs to `apps/api/package.json`.
4. `auth.mjs`: add JWKS/RS256 verification (`jose`, issuer/audience checks); keep HS256 for local/test.
5. Real B2 storage adapter + replace fabricated `signedContract()` tokens with real presigned URLs.
6. Real BullMQ worker replacing the 9-line `processor.mjs` stub.
7. `readiness.mjs`: replace stub returns with real probes.
8. Raw-body capture for callback routes + raw-body HMAC verification (payments, Meta, YouTube).

### Tier 2 — real provider adapters (one per integration, behind existing adapter boundary)
9. Brand crawl adapter (Firecrawl or approved alternative) feeding `brand-extraction.mjs`.
10. LLM adapter for script generation (replacing templates + `scoreFromHash`).
11. Xpoz adapter (define contract first) for viral discovery + add refusal guard.
12. HeyGen live adapter (real `POST /v3/videos`, reconcile, media fetch, price-version DB lookup, signed callback).
13. AE render worker (real `aerender`/HTTP invocation, disk manifests) + relax golden-hash validation.
14. Meta Graph API publish + credential-stored page token + raw-body callback.
15. Razorpay + Stripe live purchase creation + signed callback reconciliation (gated by `PAYMENT_MODE=providers`).
16. Real audience verifier that fetches the live post and hashes real media.
17. (Optional, scope-gated) YouTube live upload.
18. Performance insights adapter (Meta/YouTube insights APIs).
19. B2 benchmark / queue backlog → real measurements; OTEL exporter; email adapter.

### Intentionally left as simulator (per CLAUDE.md §12 — Do Not Implement)
V2/Sakhaa scoring, TRIBEv2 inference, viral-reach guarantees, automated A/B testing,
KlingAI/Higgsfield/Magnific/Google Flow routes, TikTok Direct Post.

---

## 7. Appendix — backend file inventory

| Path | Role | Real I/O? |
|---|---|---|
| `apps/api/src/server.mjs` | NestJS+Fastify controller, full `/api/v0` route surface | delegates all persistence/provider work to `workspace-store.mjs` |
| `apps/api/src/auth.mjs` | JWT verification (HS256 only) | local HMAC only |
| `apps/api/src/permissions.mjs` | capability matrix | in-memory lookup |
| `apps/api/src/readiness.mjs` | health/readiness probe | stub — no probes |
| `apps/api/src/build-info.mjs` | static version metadata | none |
| `apps/api/src/workspace-store.mjs` | persistence/payments/credentials/settlement/lineage/callbacks (18,616 lines) | real Prisma path (gated by `V0_RUNTIME_DB=prisma`); in-memory default |
| `apps/api/src/brand-extraction.mjs` | brand-candidate parser | none — parses supplied scrape data |
| `apps/api/src/viral-discovery.mjs` | Xpoz discovery | none — fixtures |
| `apps/api/src/script-generation.mjs` | script tournament | none — templates + hash pseudo-score |
| `apps/api/src/heygen-provider.mjs` | HeyGen generation | none — refuses live |
| `apps/api/src/ae-render-provider.mjs` | AE render | none — refuses live |
| `apps/api/src/ae-capability-registry.mjs` | AE capability/plan validator | none — hardcoded literal |
| `apps/api/src/meta-provider.mjs` | Meta publishing | none — refuses live |
| `apps/api/src/youtube-provider.mjs` | YouTube publishing | none — refuses live |
| `apps/api/src/verify-provider.mjs` | audience verification | none — echoes expected values |
| `apps/api/src/performance-provider.mjs` | performance observation | none — refuses live |
| `apps/api/src/b2-transfer-benchmark-provider.mjs` | B2 benchmark | none — sha256-derived |
| `apps/api/src/incident-rehearsal-provider.mjs` | recovery drill | none — hardcoded scripts |
| `apps/api/src/queue-backlog-provider.mjs` | backlog probe | none — synthetic curve |
| `packages/config/src/storage.mjs` | object storage config | local-FS only |
| `packages/config/src/env.mjs` | env var catalogue | none |
| `packages/db/prisma/schema.prisma` | Prisma schema | real (PostgreSQL datasource) |
| `packages/db/generated/client/` | generated Prisma client | real |
| `workers/queue/src/processor.mjs` | queue worker | stub — heartbeat only |
| `workers/python/fake_worker.py` | python/media worker | stub — prints one line |
| `packages/contracts/generated/v0-client.mjs` | generated OpenAPI client | real (generated) |