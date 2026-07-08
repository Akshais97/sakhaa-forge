# Backblaze B2 Integration — V0's Owned Durable Media Store

Status: In-depth reference for the Backblaze B2 object-storage integration. Documents B2's actual
S3-compatible API/key behaviour, the exact request shapes, the keys required, and how V0's
quarantine/clean-media/private-artifact retention needs map to B2 and back to V0's feature output.
Date verified: 2026-07-02 (against Backblaze official docs, read directly).

Companion documents in this folder: `HeyGen_integration.md`, `Supabase_integration.md`.

Canonical V0 contracts that own the behaviour (this doc is the provider-side companion):
- `docs/V0/V0_API.md` — Artifact QUARANTINED→CLEAN promotion, retention classes, signed-URL rules
- `docs/V0/V0_ARCHITECTURE.md` — private B2 areas for quarantine, clean media, private artifacts
- `docs/V0/V0_SECURITY.md` — artifact validation, least-privilege keys, no signed URLs in logs
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — authoritative key names + TTLs

Sources: Backblaze official docs —
backblaze.com/docs/cloud-storage-application-keys,
/docs/cloud-storage-s3-compatible-api,
/docs/cloud-storage-call-the-s3-compatible-api,
/docs/cloud-storage-s3-compatible-app-keys.

---

## 0. The key fact

B2 is **V0's owned, durable media store**. V0 never relies on a provider's transient media URL for
the production copy — it downloads provider media once, validates it in quarantine, and retains the
**owned** bytes to B2. Three private buckets hold three retention classes:

- `B2_BUCKET_QUARANTINE` — untrusted incoming media (provider output, crawled media) before validation.
- `B2_BUCKET_CLEAN_MEDIA` — validated, trusted media ready for composition/publishing.
- `B2_BUCKET_PRIVATE_ARTIFACTS` — private artifacts (composition plans, render logs, evidence, lineage).

> **V0 owns the retained production copy. Transient provider URLs (HeyGen `video_url`, etc.) are
> downloaded once and discarded; the durable truth lives in B2, addressed by V0 `objectKey`, never
> by the provider URL.**

B2 is accessed through its **S3-compatible API** (AWS Signature V4), so V0 uses the AWS S3 SDK
against a B2 endpoint — no B2-native SDK required.

---

## 1. Integration keys and configuration

Source: `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` (authoritative key names) + the
genuine `.env.example` + `packages/config/src/storage.mjs`.

| Variable | Required | Expected value / type | Classification | Used for |
|---|---|---|---|---|
| `OBJECT_STORAGE_PROVIDER` | yes | enum `local-filesystem,b2` | Internal | Selects local simulator vs B2. Local default; **others fail**. |
| `LOCAL_STORAGE_ROOT` | local only | relative/absolute path | Internal | Local-filesystem simulator root (`.local/storage`). |
| `OBJECT_STORAGE_ENDPOINT` | B2 mode | absolute URL `https://s3.<region>.backblazeb2.com` | Internal | S3 endpoint. Fail if unset in B2 mode. |
| `OBJECT_STORAGE_REGION` | B2 mode | region string (e.g. `us-east-005`, `eu-central-003`) | Internal | AWS-style region. |
| `OBJECT_STORAGE_KEY_ID` | B2 mode | B2 application key ID (`keyID`) | **Secret / OPS-SEC** | S3 access key id. |
| `OBJECT_STORAGE_APPLICATION_KEY` | B2 mode | B2 application key (`applicationKey`, secret) | **Secret / OPS-SEC** | S3 secret access key. Shown once at creation. |
| `B2_BUCKET_QUARANTINE` | yes | bucket name | Sensitive reference | Quarantine bucket. |
| `B2_BUCKET_CLEAN_MEDIA` | yes | bucket name | Sensitive reference | Clean-media bucket. |
| `B2_BUCKET_PRIVATE_ARTIFACTS` | yes | bucket name | Sensitive reference | Private-artifacts bucket. |
| `SIGNED_UPLOAD_TTL_SECONDS` | no | integer `60`–`3600` | Internal | Presigned PUT TTL. Default `900` (15 min). |
| `SIGNED_DOWNLOAD_TTL_SECONDS` | no | integer `30`–`3600` | Internal | Presigned GET TTL. Default `300` (5 min). |
| `MAX_UPLOAD_BYTES` | yes | positive integer | Internal | Max object size (`.env.example`: `104857600` = 100 MB). |

**Key mapping (B2 → AWS S3):**
- B2 **keyID** = AWS **Access Key ID** → `OBJECT_STORAGE_KEY_ID`.
- B2 **applicationKey** = AWS **Secret Access Key** → `OBJECT_STORAGE_APPLICATION_KEY`.

**Least-privilege rule:** the **master app key is NOT supported** for the S3-compatible API. V0
must create **standard, bucket-scoped** application keys — one capability set per bucket — so a
compromised clean-media key cannot read private artifacts. Per `V0_SECURITY.md`, production keys
are least-privilege and bucket-scoped.

**Capability set per V0 bucket (recommended):**

| Bucket | Needed capabilities |
|---|---|
| `B2_BUCKET_QUARANTINE` | `writeFiles`, `readFiles`, `deleteFiles`, `listFiles` (+ `listAllBucketNames` for SDK compat) |
| `B2_BUCKET_CLEAN_MEDIA` | `writeFiles`, `readFiles`, `listFiles` (+ `listAllBucketNames`) |
| `B2_BUCKET_PRIVATE_ARTIFACTS` | `writeFiles`, `readFiles`, `listFiles` (+ `listAllBucketNames`) |

Never grant `writeBuckets`/`deleteBuckets` to bucket-restricted keys (not allowed anyway). Avoid
`bypassGovernance`/`writeFileLegalHolds` unless Object Lock is used.

**Current code reality:** `packages/config/src/storage.mjs` is a **local-filesystem simulator
only** (`provider: "local-filesystem"`, `storage.mjs:18`). It reads `LOCAL_STORAGE_ROOT` +
`B2_BUCKET_QUARANTINE/CLEAN_MEDIA/PRIVATE_ARTIFACTS` (`storage.mjs:11–15`) and creates three local
directories. It **ignores** `OBJECT_STORAGE_PROVIDER/ENDPOINT/REGION/KEY_ID/APPLICATION_KEY`
entirely — there is no S3 SDK import. Production artifacts cannot leave local storage mode until a
real B2 adapter is added (see §12).

---

## 2. Authentication and request headers

B2's S3-compatible API uses **AWS Signature Version 4 only** (v2 signatures are not supported).

- **Access key ID** = `OBJECT_STORAGE_KEY_ID` (B2 keyID).
- **Secret access key** = `OBJECT_STORAGE_APPLICATION_KEY` (B2 applicationKey).
- **Endpoint** = `OBJECT_STORAGE_ENDPOINT` (`https://s3.<region>.backblazeb22.com`), HTTPS only.
- **Region** = `OBJECT_STORAGE_REGION`.

The AWS S3 SDK (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) signs each request with Sig
V4 and injects the `Authorization` header. V0 does not hand-sign. For an S3 client configured with
`endpoint`, `region`, `credentials: { accessKeyId, secretAccessKey }`, the SDK handles signing,
region routing, and presigning.

**Bucket endpoint forms (both valid):**
- Virtual-hosted: `https://<bucket>.s3.<region>.backblazeb2.com/<objectKey>`
- Path-style: `https://s3.<region>.backblazeb2.com/<bucket>/<objectKey>`

---

## 3. The end-to-end flow

### Step 1 — Quarantine: upload untrusted incoming media to the quarantine bucket
Provider media (e.g. HeyGen MP4) or crawled media is downloaded once, then V0 issues a presigned
PUT (or a direct `PutObject`) to `B2_BUCKET_QUARANTINE` at a V0-chosen `objectKey`
(`workspaces/{workspaceId}/quarantine/{artifactId}/{sha256}.{ext}`). The bytes are validated
(SHA-256, non-zero size, positive duration, supported content type) before promotion.

### Step 2 — Promote: validated media moves to clean-media (or private-artifacts)
On validation success, V0 copies/moves the object to `B2_BUCKET_CLEAN_MEDIA` at
`workspaces/{workspaceId}/clean-media/{artifactId}/{sha256}.mp4` (or for non-media artifacts,
`private-artifacts/{…}`), records the `Artifact` row as `CLEAN` with retention class
`clean-media`/`plan-artifact`/`render-logs`, producer (e.g. `job:{jobId}`), and schema version
(e.g. `artifact.generated.v1`), and deletes the quarantine copy.

### Step 3 — Serve: short-lived presigned GETs for media components
Downstream UI/components that need to display media request a **presigned GET** from V0, which
generates a short-lived URL (`SIGNED_DOWNLOAD_TTL_SECONDS`, default 300 s) to the clean-media
object. The URL is **self-healing** (re-fetched when expired) and **never rendered as copy,
tooltip, analytics, error, or data attribute** (`V0_API.md`, `V0_SECURITY.md`). The `objectKey` and
sha256 are public content; the presigned URL is transient.

### Step 4 — Retention / evidence
Final videos, plan artifacts, render logs, lineage and evidence are retained in
`B2_BUCKET_PRIVATE_ARTIFACTS`/`B2_BUCKET_CLEAN_MEDIA` per retention class; V0's append-only/
immutable rules apply at the DB/lineage layer, with B2 as the byte store.

---

## 4. Full request/response shapes

### 4.1 Presigned PUT (upload) — `PutObject` presigned URL
V0 generates a presigned URL (TTL `SIGNED_UPLOAD_TTL_SECONDS`, default 900 s) and the uploader PUTs
the bytes:

```
PUT <short-lived-b2-upload-url-redacted>
Content-Type: video/mp4
Content-Length: <bytes>
x-amz-content-sha256: <sha256>     (optional; enables server-side integrity check)

<raw bytes>
```
Response: `200 OK`, `ETag: "<md5>"` (and `x-amz-checksum-sha256` if a checksum header was supplied).
B2 supports `PutObject`, multipart upload (`CreateMultipartUpload`/`UploadPart`/`CompleteMultipartUpload`),
and server-side integrity via `x-amz-content-sha256`/`x-amz-checksum-sha256`.

### 4.2 Direct `PutObject` (server-side, V0 adapter retaining provider media)
```
PUT https://<bucket>.s3.<region>.backblazeb2.com/<objectKey>
Authorization: AWS4-HMAC-SHA256 Credential=<keyId>/…/s3/aws4_request, SignedHeaders=…, Signature=…
Content-Type: video/mp4
Content-Length: <bytes>

<raw bytes>
```
Response: `200 OK`, `ETag`. V0 computes its own `sha256`/`byteSize` from the bytes it writes (the
adapter boundary is descriptor-only; see `HeyGen_integration.md` §7).

### 4.3 Presigned GET (download) — `GetObject` presigned URL
```
GET <short-lived-b2-download-url-redacted>
```
Response: `200 OK`, `Content-Type: video/mp4`, `Content-Length`, `ETag`, body bytes. TTL
`SIGNED_DOWNLOAD_TTL_SECONDS` (default 300 s).

### 4.4 Object metadata / `HeadObject`
```
HEAD https://<bucket>.s3.<region>.backblazeb2.com/<objectKey>
```
Response headers: `Content-Length`, `Content-Type`, `ETag`, `Last-Modified`,
`x-amz-checksum-sha256` (if stored). V0 uses this to verify retention integrity without downloading.

### 4.5 List / delete
`ListObjectsV2` (capability `listFiles`, prefix-restricted keys must use an equally-restrictive
prefix) and `DeleteObject`/`DeleteObjects` (capabilities `deleteFiles` + `writeFiles` for
by-version deletes).

---

## 5. V0 input → B2 mapping (what V0 sends/uses)

| V0 side | B2 side | Notes |
|---|---|---|
| `workspaceId` | `objectKey` prefix `workspaces/{workspaceId}/…` | Tenant isolation by key prefix + bucket-scoped keys; RLS still owns the DB row. |
| `Artifact.id` / `sha256` | `objectKey` stem + extension | Deterministic key; sha256 in key enables integrity re-verification. |
| Retention class (`quarantine`/`clean-media`/`plan-artifact`/`render-logs`/evidence) | Target bucket + key prefix | `B2_BUCKET_QUARANTINE/CLEAN_MEDIA/PRIVATE_ARTIFACTS` selected by retention class. |
| `contentType` (e.g. `video/mp4`, `application/json`) | `Content-Type` header | Set on PUT; B2 stores it. |
| `byteSize` | `Content-Length` | Validated non-zero (`V0_API.md:434`). |
| `sha256` | `x-amz-content-sha256` / `x-amz-checksum-sha256` (optional) | Server-side integrity check. |
| `SIGNED_UPLOAD_TTL_SECONDS` / `SIGNED_DOWNLOAD_TTL_SECONDS` | presigned URL `X-Amz-Expires` | Short-lived, application-controlled. |
| `MAX_UPLOAD_BYTES` | reject-before-PUT size guard | V0 rejects oversize uploads before B2. |

**Boundary rule (from `V0_API.md`/`V0_SECURITY.md`):** transient provider URLs, signed URLs, and
object keys are never returned in API responses as URLs; the surfaced artifact identity is the
`objectKey`/sha256/id, and media components re-derive short-lived presigned URLs on demand. Raw
provider payloads and secrets never enter B2 metadata or logs.

---

## 6. B2 → V0 output mapping (what V0 gets back, by feature)

| B2 output | V0 object / action | Feature meaning |
|---|---|---|
| Stored object at `objectKey` | `Artifact` row (`QUARANTINED` → `CLEAN`) with `objectKey`, `sha256`, `byteSize`, `contentType`, retention class, producer, schema version | "V0 owns the retained production copy." Provider-transient URLs are discarded. |
| `ETag` / checksum | Integrity re-verification (HeadObject) without re-download | "The retained bytes are unchanged." |
| Presigned GET (short-lived) | Media component URL for UI | "UI can display media without V0 ever exposing a durable URL." Self-healing on expiry. |
| Durable bytes in clean-media | Input to AE composition; source for publishing; evidence for verification | "Composition/publish/verify operate on V0-owned bytes, not a provider URL that could expire." |
| Durable bytes in private-artifacts | Plan artifacts, render logs, lineage, evidence | "Reproducible renders and audit-grade evidence survive restarts." |

**Feature-level outcome (second order).** B2 is the **retention backbone** of V0's evidence-and-
lineage contract. Every expensive, irreversible action (generation, render, publish) ultimately
produces retained bytes in B2 that lineage rows point to. This is why V0 can assert truth after a
crash: the `Artifact` row in PostgreSQL says an object exists at `objectKey` with a given sha256,
and B2 holds the bytes to prove it. If B2 is unavailable, V0 cannot complete a `CAPTURE` (no
retained media) or a render (no output bytes) — so V0 treats storage failure as a load-shaping
incident, not a silent retry, and the India-first B2 latency/cost is benchmarked (V0-A2
`/b2-benchmark`). The integration's product feature = **durable, owned, verifiable media and
evidence that downstream stages trust.**

---

## 7. Presigned URL lifecycle and security

- **Short-lived:** upload TTL `SIGNED_UPLOAD_TTL_SECONDS` (60–3600 s, default 900); download TTL
  `SIGNED_DOWNLOAD_TTL_SECONDS` (30–3600 s, default 300). V0 issues the minimum TTL the consumer
  needs.
- **Self-healing:** media components re-fetch a fresh presigned GET when the previous one expires;
  no UI holds a stale URL.
- **Never exposed as data:** signed URLs must not appear as copy, tooltips, analytics events,
  error messages, or `data-*` attributes (`V0_API.md:347`, `V0_SECURITY.md:30`). The `objectKey`
  and sha256 are public content; the URL is transient.
- **Never logged:** `OBJECT_STORAGE_APPLICATION_KEY` and presigned URLs are never in logs, analytics,
  or retained artifacts.
- **Least-privilege keys:** bucket-scoped standard keys with only the needed capabilities; never
  the master key (unsupported for S3-compatible anyway) and never `BYPASSRLS`-equivalent broad
  keys.

---

## 8. Idempotency, unknown, and retry semantics

- **`PutObject` is idempotent** for the same bytes at the same key: re-PUT after a timeout just
  overwrites the same object. V0 uses a deterministic `objectKey` (sha256-based) so retries are
  safe and produce the same retained artifact.
- **Multipart upload** for large objects: V0 uses `CreateMultipartUpload` + `UploadPart` +
  `CompleteMultipartUpload` for objects above a threshold; an interrupted upload is aborted
  (`AbortMultipartUpload`) to avoid orphaned parts. Completion is idempotent given the same part
  ETags.
- **Checksums:** V0 sends `x-amz-content-sha256`/`x-amz-checksum-sha256` so B2 verifies integrity
  server-side; a mismatch returns an error and V0 does not treat the object as retained.
- **Timeout after possible acceptance → `unknown`:** if a PUT times out after B2 may have accepted
  the bytes, V0 reconciles with `HeadObject` on the deterministic key before retrying — never a
  blind re-PUT that could race. (Same `unknown`-before-retry principle as paid providers.)
- **Delete is idempotent** (`DeleteObject` on a missing key returns success).
- **Same-second versioning caveat:** B2 does not guarantee ordering for multiple uploads of the
  same key within the same second; V0 avoids this by using sha256-keyed, write-once object keys.

---

## 9. B2/S3 error → V0 error code mapping

| B2 / S3 signal | HTTP | V0 error code | Action |
|---|---|---|---|
| Bad credentials / Sig V4 failure | 403 `Forbidden` | `DEPENDENCY_UNAVAILABLE` (503) | Config/secret issue; do not serve storage routes. |
| Bucket missing / wrong region | 404 `NoSuchBucket` / 301 `PermanentRedirect` | `DEPENDENCY_UNAVAILABLE` | Config; resolve region/endpoint. |
| Object missing on `HeadObject`/`GetObject` | 404 `NoSuchKey` | `ASSET_NOT_FOUND` / `unknown` (reconcile) | If after a PUT timeout → reconcile before retry. |
| Oversize | 413 `EntityTooLarge` | `ASSET_MEDIA_MALFORMED` / validation | Reject before PUT via `MAX_UPLOAD_BYTES`. |
| Checksum mismatch | 400 `BadDigest` / `x-amz-checksum-…` mismatch | `ASSET_MEDIA_MALFORMED` | Do not promote to CLEAN. |
| Rate limited | 429 `SlowDown` | retryable | Back off; respect concurrency. |
| Quota / account issue | 403 | `DEPENDENCY_UNAVAILABLE` | Ops incident. |

---

## 10. Limits

- **Object size:** `MAX_UPLOAD_BYTES` (default 100 MB in `.env.example`). B2 itself supports very
  large objects via multipart upload; V0's cap is application-side.
- **Presigned URL TTL:** upload 60–3600 s (default 900); download 30–3600 s (default 300). Keep
  short-lived.
- **Application keys:** up to 100 million per account; master key unsupported for S3-compatible.
- **Capabilities:** per-bucket, per-prefix scoping; bucket-restricted keys need
  `listAllBucketNames` for SDK compatibility.
- **Endpoint:** HTTPS only (`https://s3.<region>.backblazeb2.com`); IPv4 + IPv6.
- **Unsupported S3 features:** object-level ACLs (beyond private/public-read), IAM roles, object
  tagging, browser-based POST presigned uploads. V0 uses server-side presigned PUT/GET, not
  browser POST.

---

## 11. Cost model

B2 is **not a per-call V0 cost driver** the way HeyGen is. B2 pricing is storage (≈$0.005/GB/mo
class) + egress (free first GB/mo, then cheap; egress to many destinations including Cloudflare is
free). V0's B2 cost is operational (storage volume + India egress for verification/publishing),
priced from the provider, not a `ProviderPriceVersion` ledger entry. The V0-A2 slice benchmarks
India-to-B2 transfer latency/cost to prove the budget assumption (`/b2-benchmark`), but B2 is not
metered into the credit ledger. Storage class / lifecycle rules (`readBucketLifecycleRules`/
`writeBucketLifecycleRules`) can tier cold evidence; V0 applies retention policy at the DB layer.

---

## 12. Mapping to the current V0 code

| Concern | Current code | Canonical target |
|---|---|---|
| Storage adapter | `packages/config/src/storage.mjs` — local-filesystem simulator only; ignores `OBJECT_STORAGE_PROVIDER/ENDPOINT/REGION/KEY_ID/APPLICATION_KEY` (`storage.mjs:10–27`) | Branch on `OBJECT_STORAGE_PROVIDER=b2`; use `@aws-sdk/client-s3` against endpoint/region/credentials; `PutObject`/`GetObject`/`HeadObject`/`ListObjectsV2`/multipart. |
| Presigned URLs | `signedContract()` returns fabricated `token: randomUUID()` stored in in-memory Maps with 15-min expiry (`workspace-store.mjs:15474–15481`); `objectKey` is a dangling reference | Real `getSignedUrl` (presigned PUT/GET) with `SIGNED_UPLOAD/DOWNLOAD_TTL_SECONDS`; persist token metadata in DB; bucket-scoped keys. |
| Artifact promotion | `completeArtifactUpload` flips status to `CLEAN` with no storage I/O | Validate (sha256/size/duration/content-type) then move quarantine→clean-media; record retention class/producer/schema version. |
| Bucket scoping | Three bucket names read from env (`storage.mjs:12–15`); no per-bucket keys | Three bucket-scoped least-privilege application keys; never master key. |
| Security | `V0_SECURITY.md` requires least-privilege keys + no signed URLs in logs | Enforce via bucket-scoped keys + short-lived self-healing presigned URLs; never log URLs/secrets. |

**Real-wiring gap (documentation; no code here):** add an `@aws-sdk/client-s3`-based B2 adapter
branched on `OBJECT_STORAGE_PROVIDER`, replace fabricated `signedContract()` tokens with real
presigned URLs, implement quarantine→clean-media promotion with real `PutObject`/`CopyObject`/
`DeleteObject`, and provision three bucket-scoped least-privilege application keys. Flip
`OBJECT_STORAGE_PROVIDER` from `local-filesystem` to `b2` only after the adapter + presigned URL
lifecycle + key scoping are verified.

---

## 13. Summary — what the reader needs to know

- **What V0 uses (input):** AWS S3 SDK against B2's S3-compatible endpoint
  (`https://s3.<region>.backblazeb2.com`) with `OBJECT_STORAGE_KEY_ID`/`OBJECT_STORAGE_APPLICATION_KEY`
  (AWS Sig V4), writing to three private buckets by retention class (quarantine/clean-media/
  private-artifacts) at deterministic sha256-keyed `objectKey`s, with short-lived presigned PUT/GET
  (`SIGNED_*_TTL_SECONDS`).
- **What B2 returns (output):** stored objects (`ETag`/checksum), presigned GET URLs (short-lived),
  and `HeadObject` metadata — the durable bytes that V0 owns.
- **What V0 produces (feature):** durable, owned, verifiable media and evidence — the retention
  backbone for generation lineage, composition, publishing, verification, and audit.
- **Keys needed:** `OBJECT_STORAGE_PROVIDER`, `OBJECT_STORAGE_ENDPOINT/REGION/KEY_ID/APPLICATION_KEY`,
  `B2_BUCKET_QUARANTINE/CLEAN_MEDIA/PRIVATE_ARTIFACTS`, `SIGNED_UPLOAD/DOWNLOAD_TTL_SECONDS`,
  `MAX_UPLOAD_BYTES`. Keys are Secret/OPS-SEC; use bucket-scoped standard keys, never the master key.
- **Real-wiring gap:** `storage.mjs` is local-filesystem only and ignores the B2 env vars;
  `signedContract()` is a stub. A real S3 SDK B2 adapter + presigned URLs + bucket-scoped keys are
  required before production artifacts leave local storage.

---

## Sources

- backblaze.com/docs/cloud-storage-application-keys — keyID/applicationKey, capabilities, scoping, least-privilege
- backblaze.com/docs/cloud-storage-s3-compatible-api — S3 compatibility, presigned URLs, unsupported features
- backblaze.com/docs/cloud-storage-call-the-s3-compatible-api — endpoint `s3.<region>.backblazeb2.com`, Sig V4 only, HTTPS
- backblaze.com/docs/cloud-storage-s3-compatible-app-keys — keyID↔access key id, applicationKey↔secret access key, S3 capabilities, master key unsupported
- `docs/V0/V0_API.md` — Artifact QUARANTINED→CLEAN, retention classes, signed-URL rules
- `docs/V0/V0_ARCHITECTURE.md` — private B2 areas, India-first latency/cost
- `docs/V0/V0_SECURITY.md` — artifact validation, least-privilege keys, no signed URLs in logs
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — authoritative key names + TTL defaults
- `packages/config/src/storage.mjs` — current local-filesystem simulator (code-grounded)
- root `.env.example` — `OBJECT_STORAGE_PROVIDER`, `B2_BUCKET_*`, `MAX_UPLOAD_BYTES`
