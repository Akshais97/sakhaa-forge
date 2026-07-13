# Supabase Integration — Identity + Durable Tenant Truth

Status: In-depth reference for the Supabase platform integration (Auth + PostgreSQL). Documents
Supabase's actual API/key behaviour, the exact JWT/JWKS structures, the keys required, and how V0's
identity and system-of-record needs map to Supabase and back to V0's feature output.
Date verified: 2026-07-02 (against Supabase official docs, read directly).

Companion documents in this folder: `HeyGen_integration.md` (sibling provider-integration reference).

Canonical V0 contracts that own the behaviour (this doc is the provider-side companion):
- `docs/V0/V0_SECURITY.md` — JWT validation, RLS, tenant isolation, secret handling
- `docs/V0/V0_ARCHITECTURE.md` — Supabase Auth + PostgreSQL, Prisma sole schema/migration owner
- `docs/V0/V0_API.md`, `docs/V0/V0_PERMISSIONS.md`, `docs/V0/V0_PRISMA_SCHEMA.md`

Sources: Supabase official docs —
supabase.com/docs/guides/auth/jwts, /docs/guides/auth/jwt-fields, /docs/guides/auth/signing-keys,
/docs/guides/getting-started/api-keys, /docs/guides/self-hosting/self-hosted-auth-keys;
changelog/29289-supabase-auth-asymmetric-keys-support-in-2025.

---

## 0. The key fact

Supabase is not one API — it is the platform that supplies V0 with two foundational things that V0
cannot provide for itself:

1. **Verified user identity** — Supabase Auth issues JWTs to the browser; the V0 API verifies those
   JWTs server-side (issuer + audience + signature via JWKS) to establish the authenticated actor
   for every request.
2. **Durable tenant truth** — Supabase PostgreSQL is the canonical database; V0 writes to it
   exclusively through Prisma, with Row Level Security enforcing workspace isolation as
   defence-in-depth.

> **Supabase gives V0 a verified actor for every call and a durable, tenant-isolated system of
> record. Without it, V0 has no trusted identity and no persistent tenant truth.**

V0 does **not** use Supabase's REST/PostgREST data API or the `service_role` secret key for data
access. V0 connects to PostgreSQL directly via Prisma (`DATABASE_URL`) and verifies Auth JWTs via
JWKS. The publishable/anon key is used only by the browser to initialise Supabase Auth.

---

## 1. Integration keys and configuration

Source: the genuine `.env.example` (root) + `packages/config/src/env.mjs` + `apps/api/src/auth.mjs`.
Prices/keys are deployment secrets; never committed.

| Variable | Required | Expected value / type | Used for |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes (browser) | Supabase project URL, e.g. `https://<project-ref>.supabase.co` | Browser Auth client initialisation. Browser-safe. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes (browser) | Publishable key (`sb_publishable_…`, legacy `anon` JWT) | Identifies the public app to Supabase Auth/Storage. Browser-safe under RLS. |
| `SUPABASE_URL` | yes (server) | Server-side Supabase project URL | Server reference to the project. |
| `SUPABASE_JWT_ISSUER` | yes | `https://<project-ref>.supabase.co/auth/v1` | Expected JWT `iss` claim. |
| `SUPABASE_JWT_AUDIENCE` | yes | `authenticated` | Expected JWT `aud` claim for user tokens. |
| `SUPABASE_JWKS_URL` | yes | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` | JWKS endpoint for RS256/ES256 signature verification. |
| `DATABASE_URL` | yes (runtime) | Pooled PostgreSQL connection string, e.g. `postgresql://v0_runtime:…@host:5432/v0` | API + queue runtime Postgres access via Prisma (pooled). |
| `DIRECT_DATABASE_URL` | yes (migrations) | Direct (non-pooled) PostgreSQL connection string | Prisma migrations only (migration-owner role). |
| `SUPABASE_JWT_SECRET` | legacy/local only | HS256 shared secret | **Current `auth.mjs` reads this for HS256 verification.** Canonical config expects JWKS/issuer/audience instead. See §7 gap. |

**Not used by V0 (and why):**
- `service_role` / `sb_secret_…` secret key — grants `BYPASSRLS` full data access. V0 never uses it;
  V0 writes via Prisma with tenant-scoped runtime roles and RLS. Including it would create a
  RLS-bypass path, which `V0_SECURITY.md` forbids ("runtime roles do not own tables or have
  `BYPASSRLS`").
- PostgREST / Supabase Data API — V0 uses Prisma against PostgreSQL, not the REST data API.

**Two key formats (current vs legacy):**

| Current format | Legacy equivalent | Privilege | Browser-safe? |
|---|---|---|---|
| `sb_publishable_…` | `anon` (JWT) | Low — `anon`/`authenticated` Postgres roles under RLS | yes |
| `sb_secret_…` | `service_role` (JWT) | Elevated — `service_role`, `BYPASSRLS`, full data access | **no** (new format returns 401 if `User-Agent` looks like a browser) |

**Key rotation:** a leaked secret key is replaced via Dashboard → Settings → API Keys (create new →
replace across components → delete old; deletion is irreversible). For asymmetric signing keys,
rotation is zero-downtime: both old and new public keys remain in JWKS during rotation.

---

## 2. Authentication and request headers

### Browser → Supabase Auth (sign-in)
The browser uses the **publishable/anon key**, sent as the `apikey` header (and optionally
`Authorization: Bearer <anon-key>` only when it exactly matches the `apikey` value — otherwise the
new non-JWT key format is rejected as `Authorization`).

```
POST https://<project-ref>.supabase.co/auth/v1/signup   (or /token?grant_type=password / /magiclink / /otp)
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Content-Type: application/json

{ "email": "…", "password": "…" }
```
Response: an **access token JWT** (plus refresh token). The browser stores the session and sends
the access token to V0's API as `Authorization: Bearer <jwt>`.

### Browser → V0 API (authenticated call)
```
GET {API_BASE_URL}/workspaces
Authorization: Bearer <supabase-access-jwt>
```
The V0 API verifies the JWT (see §3, §7) and resolves the actor `{userId, email}`.

### V0 API → PostgreSQL (data)
Not an HTTP API. Prisma opens a pooled PostgreSQL connection using `DATABASE_URL` and issues
parameterised SQL inside `prisma.$transaction` with tenant context set (see §6). No `apikey`/JWT
is sent to Postgres; the connection authenticates with the Postgres role in the connection string.

---

## 3. The end-to-end flow

### Step 1 — Browser sign-in via Supabase Auth
The browser initialises the Supabase Auth client with `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, runs a sign-in flow (email/password, magic link, OTP, or OAuth
provider), and receives a session containing an **access JWT** and a refresh token.

### Step 2 — Browser calls V0 API with the JWT
Every authenticated V0 request carries `Authorization: Bearer <access-jwt>`. The V0 API
(`apps/api/src/auth.mjs`) extracts the token and verifies it.

### Step 3 — V0 API verifies the JWT (canonical design)
Canonical verification (what `.env.example` configures and `V0_SECURITY.md` requires):

1. Parse the JWT `header.payload.signature`.
2. Read `header.alg` (`RS256` | `ES256` | `HS256`) and `header.kid`.
3. For asymmetric (`RS256`/`ES256`): fetch the matching public key from `SUPABASE_JWKS_URL`
   (JWKS, cached), verify the signature.
4. Validate claims: `iss === SUPABASE_JWT_ISSUER`, `aud === SUPABASE_JWT_AUDIENCE`
   (`authenticated`), `exp` in the future, `sub` present (user UUID), `role` present.
5. On success → actor `{userId: payload.sub, email: payload.email}`.

> **Current code reality:** `auth.mjs` implements **only HS256** with `env.SUPABASE_JWT_SECRET`
> (`auth.mjs:9,29–55`), checks `payload.aud === "authenticated"` and `payload.sub`, and rejects
> expired tokens. It performs **no `iss` check and no JWKS/RS256 path**. New Supabase projects
> (created after 2025-05-01) default to **RS256** asymmetric keys verified via JWKS — those tokens
> **cannot** be validated by the current HS256 verifier. This is an implementation gap against the
> canonical config; see §7 and §12.

### Step 4 — V0 API reads/writes PostgreSQL via Prisma with RLS
All persistence goes through the Prisma store (`createPrismaWorkspaceStore`,
`workspace-store.mjs:7262`) over `DATABASE_URL`, inside `prisma.$transaction` with
`setActorContext` establishing the transaction-local `workspace_id` for RLS. Migrations run
separately via `DIRECT_DATABASE_URL` (`packages/db/scripts/db-migrate-dev.mjs`).

---

## 4. Full schemas

### 4.1 Supabase Auth JWT
A JWT is `base64url(header).base64url(payload).base64url(signature)`.

**Header:**
```json
{ "alg": "RS256", "typ": "JWT", "kid": "<key-id-matching-jwks>" }
```
`alg`: `HS256` (legacy shared secret) | `RS256` (RSA 2048, default for new projects) | `ES256`
(NIST P-256) | `EdDSA` (Ed25519, roadmap). `kid`: key identifier to match a JWKS entry (asymmetric
only).

**Payload claims** (the ones V0 validates):

| Claim | Type | Required | Expected value | V0 use |
|---|---|---|---|---|
| `iss` | string (URL) | yes | `https://<project-ref>.supabase.co/auth/v1` | Must equal `SUPABASE_JWT_ISSUER`. Appending `/.well-known/jwks.json` gives the JWKS URL. |
| `aud` | string | yes | `authenticated` (user) | Must equal `SUPABASE_JWT_AUDIENCE`. (`anon`/`service_role` for other token kinds.) |
| `exp` | integer (Unix s) | yes | future timestamp | Reject if `<= now`. |
| `sub` | string (UUID) | yes | user id | V0 actor `userId`. |
| `role` | string | yes | `authenticated` | Postgres role for RLS. |
| `email` | string | no | user email | V0 actor `email` (optional). |
| `iat`, `nbf`, `session_id`, `aal`, `amr` | various | no | — | Not required by V0's current verifier. |

**Signature:**
- HS256: HMAC-SHA256 over `header.payload` keyed with `SUPABASE_JWT_SECRET` (base64url). Legacy.
- RS256/ES256: asymmetric signature verified with the public key from JWKS matching `kid`.

### 4.2 JWKS response — `GET {SUPABASE_JWKS_URL}`
```json
{
  "keys": [
    {
      "kid": "<key-id>",
      "alg": "RS256",
      "kty": "RSA",
      "use": "sig",
      "key_ops": ["verify"],
      "n": "<base64url modulus>",
      "e": "AQAB"
    }
  ]
}
```
- Returns **only asymmetric** public keys. If the project still uses the legacy HS256 shared
  secret, this endpoint returns **no keys** (the HS256 secret is not published).
- **Caching:** edge-cached 10 min; client libraries cache up to 10 min more. Supabase recommends
  waiting ≥ 20 min after creating a standby key or revoking a key to avoid rejecting valid tokens.
- **Rotation:** during asymmetric-key rotation, both old and new public keys remain in JWKS, so
  existing tokens continue to verify while new tokens are signed with the new key (zero-downtime).

### 4.3 PostgreSQL connection (not JSON)
`DATABASE_URL` / `DIRECT_DATABASE_URL` are libpq connection strings:
`postgresql://<role>:<password>@<host>:5432/<db>?<params>`. V0 uses two distinct roles: a pooled
runtime role (`DATABASE_URL`, for API/queue) and a migration-owner role (`DIRECT_DATABASE_URL`,
for Prisma migrations only). No JSON request/response — Prisma generates parameterised SQL.

---

## 5. V0 input → Supabase mapping (what V0 sends/uses)

| V0 side | Supabase side | Notes |
|---|---|---|
| Browser Auth client (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Supabase Auth sign-in endpoint (`/auth/v1/…`) | Publishable key identifies the app; RLS governs data access. |
| Browser session access token | `Authorization: Bearer <jwt>` to V0 API | The JWT is V0's identity input. |
| `SUPABASE_JWT_ISSUER` / `SUPABASE_JWT_AUDIENCE` / `SUPABASE_JWKS_URL` | JWT `iss` / `aud` claims + JWKS keys | Server-side verification config. |
| `DATABASE_URL` (Prisma) | Supabase PostgreSQL (pooled) | Every tenant write goes through Prisma `$transaction` + `setActorContext(workspace_id)`. |
| `DIRECT_DATABASE_URL` | Supabase PostgreSQL (direct, migration role) | Migrations only; never runtime. |
| `setActorContext(workspace_id)` | RLS policy predicate `workspace_id = current_setting('…')` | Transaction-local tenant context; RLS is defence-in-depth, runtime roles do not bypass it. |

**Boundary rule (from `V0_SECURITY.md`):** NestJS validates Supabase JWTs and authorizes every
resource server-side; PostgreSQL RLS uses transaction-local workspace context; runtime roles do not
own tables or have `BYPASSRLS`. V0 therefore deliberately does **not** use the `service_role`
secret key (which would bypass RLS).

---

## 6. Supabase → V0 output mapping (what V0 gets back, by feature)

| Supabase output | V0 object / action | Feature meaning |
|---|---|---|
| Verified JWT (`sub`, `email`, `role=authenticated`) | `actor {userId, email}` for the request; authorization via the permissions matrix | "This request is from a real, signed-in user." Every tenant route is authenticated and authorized against this actor. |
| Authenticated session | Membership lookup → active `workspaceId` | Tenant scoping for every query/write. |
| PostgreSQL durable rows (workspaces, memberships, credit wallet/purchase/ledger, generation jobs/estimates, calendar posts, lineage, performance, service credentials) | The V0 system of record (Prisma models) | "Tenant truth survives restarts." Credit math, lineage, publication state, consent — all durable and append-only/immutable where the contract says so. |
| RLS policy enforcement | Defence-in-depth tenant isolation | "Even a query-shape bug cannot leak cross-tenant data." |

**Feature-level outcome (second order).** Supabase is the **identity and system-of-record
foundation** of V0. Auth converts an anonymous browser into a *verified actor* that V0 can
authorize for every paid/publishing/consent-sensitive action; PostgreSQL (via Prisma + RLS) is the
*durable, tenant-isolated ledger* that holds credit reservations/captures, generation lineage,
publication state, consent records and evidence. Every downstream provider integration (HeyGen,
payments, publishing) operates on top of this foundation: the actor Supabase authenticated, the
workspace RLS isolates, and the immutable ledger PostgreSQL holds. If Supabase Auth is uncertain,
V0 cannot trust the actor; if PostgreSQL is unavailable, V0 cannot assert money/lineage/publication
truth — so V0 treats database failures as load-shaping events, not silent retries.

---

## 7. JWT verification — canonical scheme vs current code

**Canonical scheme (Supabase docs + `.env.example` + `V0_SECURITY.md`):**
- Asymmetric (RS256/ES256) by default for new projects; verify via JWKS matching `kid`.
- Validate `iss`, `aud`, `exp`, `sub`, `role`.
- Recommended library: `jose` — `createRemoteJWKSet(new URL(SUPABASE_JWKS_URL))` +
  `jwtVerify(token, JWKS, { issuer: SUPABASE_JWT_ISSUER, audience: SUPABASE_JWT_AUDIENCE })`.
- Keep an HS256 fallback only for local/test or legacy projects still on the shared secret.

**Current code (`apps/api/src/auth.mjs`):**
- HS256 only: `createHmac("sha256", env.SUPABASE_JWT_SECRET)` over `header.payload`, base64url,
  `timingSafeEqual` compare (`auth.mjs:42–48`). Constant-time compare is correct.
- Checks `header.alg === "HS256"`, `payload.sub` present, `payload.aud === "authenticated"`,
  `payload.exp` not expired (`auth.mjs:38,16,50`).
- **Missing:** `iss` check, JWKS fetch, RS256/ES256 path, `kid` handling.
- **Config mismatch:** `.env.example` declares `SUPABASE_JWT_ISSUER/AUDIENCE/JWKS_URL` but **not**
  `SUPABASE_JWT_SECRET`; the code reads `SUPABASE_JWT_SECRET`. A project on RS256 (the modern
  default) issues tokens the current verifier cannot validate.

**Real-wiring gap to close (documentation; no code here):**
1. Add `jose` (or equivalent) and an RS256/ES256 JWKS verification path keyed by
   `SUPABASE_JWKS_URL`, with `iss`/`aud`/`exp` claim checks.
2. Keep the HS256 path only for local/test or explicitly-legacy projects.
3. Reconcile `.env.example` so the verifier's required variables match what the code reads.
4. Add distinct error codes for no-token (`AUTH_REQUIRED`), bad signature/expired
   (`AUTH_TOKEN_INVALID`), and issuer/audience mismatch.

---

## 8. Idempotency, unknown, and retry semantics

- **Auth is stateless:** each request's JWT is verified independently; no server session. Token
  refresh is a browser-side concern (refresh token). V0 never stores the JWT.
- **Database writes are transactional:** Prisma `$transaction` keeps writes short and
  database-only (`V0_API.md`). Credit reservation/capture/release is idempotent and transactional
  (`V0_ARCHITECTURE.md:91`).
- **Database failure is load-shaping, not silent retry:** per `V0_SECURITY.md`/ops, a DB outage is
  an incident (queue backlogs, reconcile) — V0 does not blindly retry paid/publishing operations
  against an uncertain database. Pending work waits in the queue; PostgreSQL owns canonical state.
- **JWT expiry / JWKS cache:** a token past `exp` is rejected (`AUTH_TOKEN_INVALID`). During
  asymmetric-key rotation, the 20-min JWKS cache window means V0 should tolerate both old and new
  `kid`s; do not hard-pin a single key.

---

## 9. Supabase/Auth error → V0 error code mapping

| Supabase / JWT signal | V0 error code | Action |
|---|---|---|
| No `Authorization: Bearer` header | `AUTH_REQUIRED` (401) | `auth.mjs:6` — prompt sign-in. |
| No `SUPABASE_JWT_SECRET` (HS256 path) / JWKS unreachable (RS256 path) | `AUTH_TOKEN_INVALID` (401) | Config/availability; do not serve the route. |
| Bad signature / `alg` mismatch | `AUTH_TOKEN_INVALID` (401) | `auth.mjs:11,17` — reject; client re-signs-in. |
| `aud !== "authenticated"` / missing `sub` | `AUTH_TOKEN_INVALID` (401) | `auth.mjs:16` — reject. |
| `exp` passed | `AUTH_TOKEN_INVALID` (401) | `auth.mjs:50` — reject; refresh session. |
| (Canonical) `iss` mismatch | `AUTH_TOKEN_INVALID` (401) | Not yet checked — add with JWKS path. |
| Postgres connection error | load-shaping incident | Do not silent-retry paid work; surface via readiness + queue backlog. |

---

## 10. Limits

- **JWT lifetime:** set by Supabase Auth (default access token ~1 h; refresh token longer). V0
  rejects expired access tokens; the browser refreshes.
- **JWKS cache:** edge 10 min + client 10 min; allow ≥ 20 min on key rotation/revocation.
- **Asymmetric key algorithms:** RS256 (default), ES256 (recommended for size/perf), EdDSA
  (roadmap). Legacy HS256 shared secret supported for older projects.
- **Key formats:** `sb_publishable_…` / `sb_secret_…` (current) vs `anon` / `service_role` (legacy
  JWT). New `sb_secret_…` rejects browser `User-Agent` with 401.
- **RLS:** publishable key maps to `anon` (unauthenticated) or `authenticated` (logged-in)
  Postgres roles; protection depends entirely on RLS policies being enabled. Secret key maps to
  `service_role` with `BYPASSRLS` — V0 does not use it.

---

## 11. Cost model

Supabase is **not a V0 cost driver.** V0's paid costs are HeyGen generation and (eventually) AE
rendering, priced per-second via `ProviderPriceVersion` DB rows (see `HeyGen_integration.md` §13).
Supabase Auth + PostgreSQL are platform infrastructure (free/pro tier), not per-call metered costs
in V0's billing. V0 therefore does not model a Supabase price version. The integration's "cost" is
operational (project tier, connection pool size, storage size) — config, not a ledger entry.

---

## 12. Mapping to the current V0 code

| Concern | Current code | Canonical target |
|---|---|---|
| JWT verification | `auth.mjs` — HS256 via `SUPABASE_JWT_SECRET`, `aud`/`sub`/`exp` checks, constant-time compare | RS256/ES256 via JWKS + `iss`/`aud`/`exp`/`sub` checks (`jose`, `SUPABASE_JWKS_URL`) |
| Postgres runtime | Prisma store gated by `V0_RUNTIME_DB=prisma` (`workspace-store.mjs:135–140,7262`) over `DATABASE_URL` | Same; ensure `setActorContext` enforces `workspace_id` tenant predicates for every query |
| Migrations | `DIRECT_DATABASE_URL` via `packages/db/scripts/db-migrate-dev.mjs` | Same; migration role only |
| RLS | `V0_SECURITY.md` requires transaction-local workspace context; runtime roles no `BYPASSRLS` | Enforced via `setActorContext`; never introduce `service_role`/secret-key data path |
| Browser Auth | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` declared | Wire web app Auth client (current web is local presentation surface; app wiring TBD) |
| Secret posture | No `service_role` key used; secrets via env/secret manager | Keep; never put `sb_secret_…`/`SUPABASE_JWT_SECRET` in browser code or logs |

---

## 13. Summary — what the reader needs to know

- **What V0 uses (input):** browser publishable/anon key for Supabase Auth sign-in → JWT; server
  verifies the JWT via `SUPABASE_JWT_ISSUER`/`AUDIENCE`/`JWKS_URL` (RS256/JWKS) → actor; Prisma
  writes to PostgreSQL over `DATABASE_URL` with RLS tenant context; migrations over
  `DIRECT_DATABASE_URL`.
- **What Supabase returns (output):** a verified user identity (`sub`/`email`/`role`) per request,
  and durable, tenant-isolated tenant truth (workspaces, credit ledger, generation lineage,
  publication state, consent, evidence) in PostgreSQL.
- **What V0 produces (feature):** a trusted-actor + durable-system-of-record foundation that
  every paid/publishing/consent-sensitive V0 feature builds on.
- **Keys needed:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
  `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWKS_URL`, `DATABASE_URL`,
  `DIRECT_DATABASE_URL` (+ `SUPABASE_JWT_SECRET` only for HS256 legacy/local). V0 does **not** use
  the `service_role`/`sb_secret_…` secret key or PostgREST.
- **Real-wiring gap:** `auth.mjs` is HS256-only and cannot validate modern RS256 Supabase tokens;
  add a JWKS/RS256 verification path (`jose`) with `iss`/`aud` checks, and reconcile `.env.example`.

---

## Sources

- supabase.com/docs/guides/auth/jwts — JWT/JWKS verification, `jose` example, HS256 vs asymmetric
- supabase.com/docs/guides/auth/jwt-fields — JWT claims reference (`iss`, `aud`, `exp`, `sub`, `role`)
- supabase.com/docs/guides/auth/signing-keys — key lifecycle, rotation, revocation, algorithm comparison
- supabase.com/docs/guides/getting-started/api-keys — publishable/secret keys, RLS roles, rotation
- supabase.com/docs/guides/self-hosting/self-hosted-auth-keys — `JWT_JWKS` self-hosted config
- supabase.com/changelog/29289-supabase-auth-asymmetric-keys-support-in-2025 — RS256 default, `getClaims()`
- `docs/V0/V0_SECURITY.md`, `docs/V0/V0_ARCHITECTURE.md`, `docs/V0/V0_API.md`,
  `docs/V0/V0_PERMISSIONS.md`, `docs/V0/V0_PRISMA_SCHEMA.md` — canonical V0 contract
- `apps/api/src/auth.mjs` — current HS256 verifier (code-grounded)
- root `.env.example`, `packages/config/src/env.mjs` — key names (genuine config sources)
