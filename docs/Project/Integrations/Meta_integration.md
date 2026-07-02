# Meta Integration — Instagram Reels (Content Publishing) + Graph API Webhooks

Status: In-depth reference for the Meta publishing integration (Instagram Reels via the Instagram
Graph API Content Publishing flow; Facebook Page video is the same-family alternative). Documents
Meta's actual API/key/token behaviour, the exact two-step container→publish request/response
JSON, the Graph API webhooks scheme, the keys and per-workspace tokens required, and how V0's
verified-publication contract maps to Meta and back to V0's feature output.
Date verified: 2026-07-02 (against Meta/Facebook official developer docs, read directly).

Companion documents in this folder: `YouTube_integration.md` (the other V0 publish platform),
`B2_integration.md` (supplies the presigned `video_url` Meta fetches),
`HeyGen_integration.md`, `Supabase_integration.md`, `Razorpay_integration.md`, `Stripe_integration.md`.

Canonical V0 contracts that own the behaviour (this doc is the provider-side companion):
- `docs/V0/V0_API.md` §"Idempotent Platform Publication (V0-U2, V0-U3)" and §"Audience-facing verify (V0-U4)"
- `docs/V0/V0_STATUS_ENUMS.md` — publish + calendar statuses
- `docs/V0/V0_JOBS.md` — reconcile/verify retry schedule
- `docs/V0/V0_SECURITY.md` — callback signature on raw bytes, replay protection, tenant isolation
- `docs/V0/V0_PERMISSIONS.md` — `schedule_publish_approved_media` capability
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — publishing key names

Sources: Meta/Facebook official developer docs —
developers.facebook.com/docs/instagram-platform/content-publishing,
/docs/instagram-platform/instagram-graph-api/reference/ig-user/media,
/docs/instagram-platform/instagram-graph-api/reference/ig-user/media_publish,
/docs/instagram-platform/content-publishing/resumable-uploads,
/docs/graph-api/webhooks/getting-started,
/docs/graph-api/reference/v25.0/ (appsecret_proof).

---

## 0. The key fact

Meta is V0's **publishing provider for the `meta` platform** — Instagram Reels via the Instagram
Graph API Content Publishing flow (and Facebook Page video as the same-family alternative). V0's
short-form 9:16 creative output is published to the customer's connected Instagram Business
account through a deterministic, idempotent, **poll-based** flow:

1. V0 persists a `PublishOperation` (`submitting`) **before** any network I/O.
2. The adapter creates an IG **container** (`POST /{ig-user-id}/media` with `media_type=REELS` and a
   short-lived B2 presigned `video_url`) → binds the container id as the `externalId`, operation
   `accepted`.
3. V0 **reconciles by polling** the container `status_code` (`IN_PROGRESS` → `FINISHED`) — Meta
   publishes **no webhook on publish completion**; the operation moves forward only through
   reconcile (never a blind resubmit).
4. On `FINISHED`, the adapter publishes (`POST /{ig-user-id}/media_publish?creation_id=…`) →
   published media id, fetches the `permalink` → operation `completed`, `publicUrl` bound.
5. V0 then **independently verifies the audience-facing live post** (`POST /calendar-posts/{id}/verify`)
   before any publication is claimed as done.

> **Meta returns a container id, then a published media id and a permalink — not a "publish
> succeeded" webhook. V0 binds the public post URL only after the container finishes processing and
> the publish call succeeds, and claims publication done only after the independent audience-facing
> verify. A timeout after possible acceptance is `unknown` and is reconciled before any retry.**

Meta webhooks (`X-Hub-Signature-256`, App-Secret-signed) are a **separate, optional** surface for
engagement/insights notifications (which can feed V0-A1 performance collection) — they are **not**
the publish-completion signal. The current V0 simulator conflates the two (it drives publish
completion through a signed callback envelope); the real Meta API does not.

---

## 1. Integration keys and configuration

Source: `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` + `.env.example` + `apps/api/src/meta-provider.mjs`.

| Variable | Required | Expected value / type | Classification | Used for |
|---|---|---|---|---|
| `PUBLISHING_MODE` | yes | enum `simulator,providers` | Internal | Selects simulator vs live publishing. Local `simulator`; prod explicit. |
| `META_APP_ID` | provider mode | Meta app numeric id | Internal | Identifies the Meta app (not a secret). |
| `META_APP_SECRET` | provider mode | App Secret (hex string) | **Secret** | (1) HMAC-SHA256 key for `X-Hub-Signature-256` webhook verification; (2) `appsecret_proof = HMAC-SHA256(access_token, app_secret)`. **Server-only; never browser, never logged.** |
| `META_WEBHOOK_VERIFY_TOKEN` | provider mode (if webhooks used) | arbitrary string | **Secret** | Matches `hub.verify_token` in the webhook GET handshake. |
| `PUBLISH_CALLBACK_BASE_URL` | provider mode | HTTPS URL | Internal | Base hosting `POST /callbacks/publishing/meta`. Real Meta has **no publish webhook**; this base hosts the optional engagement/insights webhook + the GET handshake. |
| `VERIFY_RETRY_SCHEDULE_SECONDS` | optional | default `0,60,180,420,900` | Internal | Audience-facing verify retry backoff (V0-U4). |
| `GRAPH_API_VERSION` (recommended) | provider mode | e.g. `v25.0` | Internal | Pinned Graph API version in `graph.facebook.com/{version}/…`. Pin to avoid silent breakage. |

**Per-workspace access token (NOT in the config catalog):** publishing requires a **long-lived
User or Page access token** with the Instagram Content Publishing scopes, granted by the customer
via OAuth and stored per-workspace as a `ServiceCredential` (a `secret-manager://` reference, never
the raw token in code, logs, or browser). The config catalog holds only **app-level** keys
(`META_APP_ID` / `META_APP_SECRET` / `META_WEBHOOK_VERIFY_TOKEN`); the customer's connection token
is a tenant-owned credential, exactly like the Supabase per-user identity and the payment customer
profile. The token is sent as `access_token` (and paired with `appsecret_proof`) on every Graph API
call — it is never a browser value.

**Required permissions (scopes), Facebook Login path (V0 primary):** `instagram_basic`,
`instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, plus a Page that is
linked to an Instagram Business account. (Instagram Login alternative: `instagram_business_basic`,
`instagram_business_content_publish`.) Only Instagram **Business** accounts support API publishing;
Creator accounts are rejected by Meta.

**Key safety:** `META_APP_SECRET` and the per-workspace access token are server-only — never in
browser code, logs, analytics, retained artifacts, or provider payloads. `META_APP_ID` is not
secret. The presigned B2 `video_url` passed to Meta is short-lived and is a provider I/O, never
rendered to the browser as copy/tooltip/data-attribute.

**Current code reality:** V0 publishing is **simulator-only**. `apps/api/src/meta-provider.mjs` makes
no network call; the refusal guard `if (env.META_MODE && env.META_MODE !== "simulator")` returns
`{ ok: false, kind: "unavailable", errorCode: "PROVIDER_UNAVAILABLE" }` (`meta-provider.mjs:66–69`).
`submitMetaPost` synthesizes `externalId: meta_${slug}` (slug from `operationId`,
`:77–93`); `metaPublicUrl` returns the fake `https://meta.example.test/p/{externalId}`
(`:51–53`); `reconcileMetaOperation` synthesizes a status + externalId + fake publicUrl and never
resubmits (`:99–111`). `META_APP_ID` / `META_APP_SECRET` / the access token are **never read**. The
domain store signs the simulator callback envelope with `META_WEBHOOK_SECRET` (canonical JSON),
which does **not** match Meta's real `X-Hub-Signature-256` raw-body scheme (see §7, §12).

---

## 2. Authentication and request headers

### V0 → Meta (Graph API: create container, poll, publish, fetch permalink)
```
POST https://graph.facebook.com/{GRAPH_API_VERSION}/{ig-user-id}/media
     ?media_type=REELS
     &video_url={short-lived B2 presigned GET URL}
     &caption={caption}
     &access_token={per-workspace user/page token}
     &appsecret_proof={hex HMAC-SHA256(access_token, META_APP_SECRET)}
Content-Type: application/json   (response; request params are query string or form body)
```
- **Access token**: the per-workspace long-lived User/Page token (ServiceCredential), not the App
  Secret. Sent as `access_token` on every call.
- **`appsecret_proof`**: `hex(HMAC-SHA256(access_token, META_APP_SECRET))`, sent as a query param
  alongside `access_token`. Required when "Require App Secret Proof for Server API calls" is enabled
  in the app dashboard; V0 sends it unconditionally (replay protection). Computed server-side with
  `META_APP_SECRET`; the secret never leaves the server.
- **Version**: `GRAPH_API_VERSION` pinned in the path (`graph.facebook.com/v25.0/…`). Meta
  deprecates old versions on a schedule; pinning prevents silent breakage.
- Meta Graph API calls accept parameters as a **query string** (POST or GET); the response is JSON.
  V0 uses the Graph API via the adapter (domain modules never import a provider SDK).

### Meta → V0 (webhook — engagement/insights, optional; NOT publish completion)
```
POST {PUBLISH_CALLBACK_BASE_URL}/callbacks/publishing/meta
X-Hub-Signature-256: sha256={hex-signature}
Content-Type: application/json

<raw webhook body>
```
- Header `X-Hub-Signature-256`: format `sha256={hex-signature}` — the literal prefix `sha256=`
  followed by the hex HMAC-SHA256. Constant-time compare of the part after `sha256=`.
- **Key**: the app's **App Secret** (`META_APP_SECRET`).
- **Signed**: the HMAC is over the **raw request body** (the JSON payload bytes), not parsed JSON.
- **No built-in timestamp or event-id**: Meta does not provide a replay window or a mandatory
  event-id field in the common payload. V0 must enforce its own dedup (V0 `InboxEvent`
  `(workspaceId, 'meta', <stable event key>)`) and its own freshness check. Failed deliveries are
  retried with decreasing frequency over **36 hours**; unacknowledged responses are dropped after 36h.
- A legacy `X-Hub-Signature` (SHA-1) header may also be present; V0 verifies `X-Hub-Signature-256`
  (SHA-256) and ignores the SHA-1 header.

### Webhook GET handshake (App Dashboard subscription)
When the webhook endpoint is registered in the Meta App Dashboard, Meta sends:
```
GET {PUBLISH_CALLBACK_BASE_URL}/callbacks/publishing/meta
    ?hub.mode=subscribe
    &hub.challenge={integer}
    &hub.verify_token={META_WEBHOOK_VERIFY_TOKEN}
```
- The endpoint checks `hub.verify_token` equals `META_WEBHOOK_VERIFY_TOKEN` and responds `200 OK` with
  the `hub.challenge` value echoed as the body. `hub.mode` is always `subscribe`.
- Endpoint must be HTTPS with a valid TLS certificate (self-signed not supported). Optional mTLS is
  available for WhatsApp subscriptions (not needed for IG).

---

## 3. The end-to-end flow (Instagram Reels Content Publishing — V0 primary)

### Step 0 — Connect the Instagram Business account (OAuth, one-time per workspace)
The customer connects their Instagram Business account (linked to a Facebook Page) via OAuth,
granting the Content Publishing scopes. V0 exchanges the code for a **long-lived User/Page access
token** (60 days, refreshable) and stores it per-workspace as a `ServiceCredential`
(`secret-manager://` reference). This is a tenant-owned credential, out of the publish hot path
but a prerequisite for any publish. The IG user id (`ig-user-id`) is also bound to the workspace's
connected account.

### Step 1 — V0 creates the calendar post and persists the PublishOperation (server, before any I/O)
`POST /calendar-posts/{id}/publish` (`Idempotency-Key` required, `schedule_publish_approved_media`
capability). The provider is derived server-side from the calendar post `platform` (`meta` →
`meta-simulator`/live meta). The body carries `workspaceId` and `account` (must equal the calendar
post's bound account, else `PUBLISH_ACCOUNT_MISMATCH` 409). A durable `PublishOperation` is
persisted `SUBMITTING` **before** the provider call, binding the workspace, calendar post, provider
route, idempotency key, and a server-side `requestHash` (sha256 over canonical bound inputs incl.
provider). One `PublishOperation` per `CalendarPost`. A manual-export post returns
`PUBLISH_NOT_SUBMITTABLE` (409). A platform with no V0 adapter returns `PUBLISH_PLATFORM_UNSUPPORTED`
(409) before any I/O. A timeout after possible acceptance marks the operation `UNKNOWN`; the caller
must reconcile before any retry.

### Step 2 — Adapter creates the IG container
```
POST https://graph.facebook.com/{version}/{ig-user-id}/media
     ?media_type=REELS
     &video_url={short-lived B2 presigned GET URL for the approved final video}
     &caption={caption}            (≤2200 chars; V0 caption ≤2000)
     &share_to_feed=true           (Reels must share to feed for Reels-tab eligibility)
     &access_token={token}
     &appsecret_proof={hex}
```
Response (200):
```json
{ "id": "17889899090000000" }
```
The adapter binds the **container id** as the operation `externalId`; the operation advances to
`accepted` and the calendar post to `accepted`. The public URL is `null` (the post is not live).
**The container expires after 24 hours** if not published — this drives a hard 24h completion SLA
on the reconcile/publish path. `video_url` must be publicly fetchable by Meta's servers (a B2
presigned GET URL with `SIGNED_DOWNLOAD_TTL` covering the window until `FINISHED`; self-healing in
the media component — see `B2_integration.md`). Container limits: **400 containers per rolling
24-hour period** per IG user.

### Step 3 — Reconcile by polling the container status (never resubmits)
`POST /calendar-posts/{id}/publish/reconcile` (`Idempotency-Key` required). The adapter queries
Meta only:
```
GET https://graph.facebook.com/{version}/{container_id}?fields=status_code&access_token={token}&appsecret_proof={hex}
```
Response:
```json
{ "status_code": "IN_PROGRESS" }        // or "FINISHED" | "EXPIRED" | "ERROR" | "PUBLISHED"
```
Meta recommends polling **once per minute for no more than 5 minutes**. Reconciliation **never
resubmits**; it resolves `unknown`/`submitting`/`accepted` to a terminal state. V0's
`VERIFY_RETRY_SCHEDULE_SECONDS` (default `0,60,180,420,900`) governs the reconcile/verify retry
backoff. `EXPIRED` (container not published within 24h) or `ERROR` → operation `failed`
(`PROVIDER_OUTPUT_INVALID` for `ERROR`); the calendar post is left in its pre-publish state and the
user must re-initiate. `IN_PROGRESS` → the operation stays uncertain; keep reconciling. This is
the poll-based substitute for the simulator's publish callback: **real Meta has no publish-completion
webhook.**

### Step 4 — Publish the finished container
Once the container is `FINISHED`:
```
POST https://graph.facebook.com/{version}/{ig-user-id}/media_publish
     ?creation_id={container_id}
     &access_token={token}
     &appsecret_proof={hex}
```
Response (200):
```json
{ "id": "17920238422030506" }
```
The `id` is the published **IG Media id** — the durable, audience-facing identity. This is the
canonical `externalId` once known (see §5/§12 for the container-id-vs-media-id decision).

### Step 5 — Fetch the public permalink and bind the publicUrl
```
GET https://graph.facebook.com/{version}/{media_id}?fields=permalink,timestamp&access_token={token}&appsecret_proof={hex}
```
Response:
```json
{ "permalink": "https://www.instagram.com/reel/CxYz123.../", "timestamp": "2026-07-02T10:15:30+0000" }
```
The adapter binds `permalink` as the operation `publicUrl` (the only URL surfaced, and only once the
post is live); the operation advances to `completed` and the calendar post to `published_unverified`.
A `publish.state_changed` audit (`reason: completed`) is retained. **The raw provider media id,
account id, token, and signed URLs stay adapter-private.**

### Step 6 — Independent audience-facing verification (V0-U4)
`POST /calendar-posts/{id}/verify` (no `Idempotency-Key` required; exactly-once is the
one-`PostVerification`-row-per-post rule). The verifier independently fetches the live media from
Meta and reports whether the target account, media identity (the approved final-video sha256),
caption, visibility, and publish time match. Provider acknowledgement alone never becomes success.
- Not yet live (`accepted`/`submitting`/`processing`) → `202` with `VERIFY_PROCESSING_WAIT` +
  `retryAfterMs`, no verification record.
- `verified` → calendar post `published_verified`; immutable audience-evidence `Artifact` (a public
  sha256 fingerprint; object key never surfaced); exactly-one deduplicated `publish_completed`
  in-app notification; initial immutable `PerformanceSnapshot` (`source: audience_verification_initial`);
  `calendar.verification_completed` audit.
- `identity_mismatch` (wrong account/media) → `VERIFY_IDENTITY_MISMATCH` (409); evidence +
  `identity_mismatch` row retained; `calendar.verification_failed`; no notification.
- `visibility_restricted` → `VERIFY_VISIBILITY_RESTRICTED` (409); no notification.

**Publication is never claimed `Done` before this audience-facing verification.**

### Facebook Page video — same-family alternative
Facebook Page video publishing reuses the same App Secret / token / `appsecret_proof` model. The
classic Page video API is `POST /{page-id}/videos?file_url=…&access_token=…` → `{id}`; the newer
Facebook Reels API is `POST /{page-id}/video_reels` → reel id, then
`POST /{page-id}/video_reels/{reel-id}/publish`. V0's primary V0 target is Instagram Reels (the
dominant short-form/Reels surface for India-first B2 real-estate); Facebook Page video is wired
only if a customer's connected account is a Facebook Page. Both share the verify path (Step 6)
and the same webhook/security model.

---

## 4. Full request/response schemas

### 4.1 Create container — `POST /{ig-user-id}/media` (request params)
| Field | Type | Required | Notes |
|---|---|---|---|
| `media_type` | enum | yes | `REELS` (V0 short-form). `IMAGE`/`VIDEO`/`CAROUSEL` exist but are out of V0 scope. |
| `video_url` | string(URL) | yes | Publicly fetchable URL Meta downloads. V0 = short-lived B2 presigned GET URL. Reels: MP4/MOV, H.264/HEVC, 9:16, ≤90s, ≤100MB. |
| `caption` | string | no | ≤2200 chars (V0 enforces ≤2000 at the calendar layer). |
| `share_to_feed` | boolean | no | `true` for Reels-tab eligibility (recommended). |
| `cover_url` | string(URL) | no | Cover frame URL (JPEG, ≤8MB, sRGB, 9:16 recommended). |
| `thumb_offset` | float | no | Cover frame offset (seconds). |
| `audio_name` | string | no | Original audio name. |
| `collaborators` | string | no | Collab usernames. |
| `location_id` | string | no | Location page id. |
| `user_tags` | array | no | Tagged users. |
| `access_token` | string | yes | Per-workspace User/Page token. |
| `appsecret_proof` | string | yes (recommended) | `hex(HMAC-SHA256(access_token, META_APP_SECRET))`. |

### 4.2 Create container — response
| Field | Type | Description |
|---|---|---|
| `id` | string | **IG Container id** → V0 `externalId` at `accepted` (transient, 24h TTL). |

### 4.3 Poll container status — `GET /{container_id}?fields=status_code` (response)
| Field | Type | Description |
|---|---|---|
| `status_code` | enum | `IN_PROGRESS` \| `FINISHED` \| `EXPIRED` \| `ERROR` \| `PUBLISHED`. |
| `id` | string | Container id (echoed). |

Status meaning: `IN_PROGRESS` — still processing (keep polling); `FINISHED` — ready to publish;
`PUBLISHED` — already published (idempotent re-publish attempt); `EXPIRED` — not published within
24h (operation fails); `ERROR` — processing failed (operation fails, `PROVIDER_OUTPUT_INVALID`).

### 4.4 Publish — `POST /{ig-user-id}/media_publish?creation_id=…` (response)
| Field | Type | Description |
|---|---|---|
| `id` | string | **Published IG Media id** (durable audience-facing id) → V0 `externalId` at `completed`. |

### 4.5 Fetch permalink — `GET /{media_id}?fields=permalink,timestamp` (response)
| Field | Type | Description |
|---|---|---|
| `permalink` | string | Audience-facing URL `https://www.instagram.com/reel/{shortcode}/` → V0 `publicUrl` at `completed`. |
| `timestamp` | string | ISO-8601 publish time. |
| `id` | string | Media id (echoed). |

### 4.6 Webhook event (engagement/insights — optional, not publish completion)
Meta POSTs a notification object as the raw body:
```json
{
  "object": "instagram",
  "entry": [
    {
      "id": "17889899090000000",
      "time": 1751465730,
      "changes": [
        { "field": "comments", "value": { "id": "…", "text": "…", "from": { "id": "…", "username": "…" } } }
      ]
    }
  ]
}
```
- `object`: the object type (`instagram`, `page`, …).
- `entry[]`: batched change objects (up to ~1000).
- `entry[].id`: the object id; `entry[].time`: when the notification was sent (not the change).
- `entry[].changes[]`: changed fields + new values (if "Include Values" enabled) or
  `changed_fields[]` (names only). Subscribe to specific fields per object in the App Dashboard.
- **V0 does not rely on these for publish completion** (publish is poll-based). If subscribed, V0
  uses them only as a hint to trigger on-demand performance collection (V0-A1), then fetches insights
  explicitly. Confirm exact per-object/per-field payloads against Meta's webhook field reference at
  deployment time; the signature scheme (`X-Hub-Signature-256`, App Secret, raw body) is certain.

### 4.7 Webhook signature — exact
- Header `X-Hub-Signature-256`: `sha256={hex-signature}`.
- signed_payload = the **raw request body** bytes.
- Key: `META_APP_SECRET` (App Secret).
- Algorithm: HMAC-SHA256, hex output.
- Compare: constant-time; compare the hex after the `sha256=` prefix. Ignore `X-Hub-Signature` (SHA-1).
- **No built-in timestamp/event-id**: V0 enforces its own dedup (`InboxEvent`) and freshness;
  Meta retries unacked for up to 36h.

### 4.8 Errors
Meta Graph API errors are JSON:
```json
{ "error": { "message": "Invalid parameter", "type": "OAuthException", "code": 100, "fbtrace_id": "…", "error_subcode": 2207042 } }
```
Common publish errors: `code 190` (invalid/expired token → re-auth the workspace connection);
`code 100`/`error_subcode 2207001` (server-side upload failure → retry once, then new container);
`error_subcode 2207042` (publishing rate limit exceeded); `code 4`/`17`/`32`/`613` (generic rate
limit / too many calls → back off); container `status_code=EXPIRED` (24h window missed);
`media_publish` 400 (container not yet `FINISHED` — poll first). HTTP status accompanies the body
(400/401/403/429/500).

### 4.9 Large-file resumable upload (optional, >standard threshold)
For videos that exceed the standard `video_url` fetch path (large files; Meta's resumable limit
reaches 100MB for Reels), the resumable upload flow uses a different host:
- Step 1: `POST /{ig-user-id}/media?upload_type=resumable&media_type=REELS&access_token=…` →
  `{ id, uri }` (container id + upload uri).
- Step 2: `POST https://rupload.facebook.com/ig-api-upload/{version}/{container_id}` with the file
  binary (single whole-file PUT/POST to the upload uri; chunked start/end offsets are supported for
  very large files but V0 short-form Reels fit the whole-file path).
- Step 3: `POST /{ig-user-id}/media_publish?creation_id={container_id}` (same as §3 Step 4).
V0's short-form Reels (≤90s) generally fit the standard `video_url` flow; the resumable path is the
>threshold alternative. This is the only place binary media crosses to Meta; it is adapter-internal.

---

## 5. V0 input → Meta mapping (what V0 sends)

| V0 field | Meta field | Notes |
|---|---|---|
| `CalendarPost.platform = "meta"` | provider route selection | Server-derived; body carries no `provider`. |
| `CalendarPost.account` (IG handle/ig-user-id) | `{ig-user-id}` path segment | Must equal the connected account; mismatch → `PUBLISH_ACCOUNT_MISMATCH`. |
| `CalendarPost.caption` (≤2000) | `caption` (Meta ≤2200) | V0's stricter limit governs. |
| Approved final-video bytes (clean-media B2 object) | `video_url` (B2 presigned GET) | Short-lived, self-healing; Meta fetches it. See `B2_integration.md`. |
| `CalendarPost` 9:16 creative | `media_type=REELS`, `share_to_feed=true` | Reels-tab eligibility. |
| Per-workspace access token (ServiceCredential) | `access_token` | OAuth-granted, server-only, never browser. |
| `META_APP_SECRET` | `appsecret_proof` (HMAC-SHA256 over `access_token`) + webhook key | Server-only; never sent to browser. |
| `Idempotency-Key` (V0 request) | (V0 server-side `requestHash` + one `PublishOperation` per post) | Meta has no native publish idempotency key; V0's one-operation-per-post + requestHash is the idempotency boundary (container `PUBLISHED` status is the provider-side guard against a re-publish). |
| `GRAPH_API_VERSION` | path version | Pinned. |

**Persist before I/O:** the `PublishOperation` (`submitting`, `externalId` placeholder,
`requestHash`, `workspaceId`, `calendarPostId`, `provider`) is written **before** the
`POST /media` call, so a crash between persistence and the network response leaves a resumable
operation, never a blind duplicate. The container id is bound to the operation only after the
provider responds.

**External-id decision (real-wiring):** the operation stores **one** `externalId`. At `accepted`
the only id known is the **container id** (transient, 24h TTL); at `completed` the durable
audience-facing id is the **published media id**. Recommended mapping: `externalId = container_id`
at `accepted`; on successful `/media_publish`, record the media id (the durable reference) and bind
`publicUrl = permalink`. The implementation may keep `externalId = container_id` (the operation's
internal correlation id) or update it to the media id — the contract requires only "external id
bound at accepted" + "public url bound at completed"; the permalink (which encodes the media id) is
the surfaced audience-facing reference. The **24h container TTL** is the hard deadline: if publish
does not complete within 24h, the container `EXPIRED`s and the operation fails (the user re-initiates).

---

## 6. Meta → V0 output mapping (what V0 gets back, by feature)

| Meta output | V0 object / action | Feature meaning |
|---|---|---|
| container `id` (POST /media) | `PublishOperation.externalId`; operation `accepted`; calendar post `accepted`; `publicUrl = null` | "Provider accepted the upload; the post is not live yet." |
| container `status_code = IN_PROGRESS` (reconcile poll) | operation stays `accepted`/uncertain; keep reconciling | "Container still processing — never resubmit, keep polling." |
| container `status_code = FINISHED` | adapter proceeds to `/media_publish` | "Container ready — publish now." |
| `media_publish` media `id` (POST /media_publish) | durable audience-facing media id recorded; operation → `completed` path | "Published — the durable live identity is known." |
| `permalink` (GET /{media_id}) | `PublishOperation.publicUrl`; operation `completed`; calendar post `published_unverified`; `publish.state_changed` audit | "The audience-facing URL is bound — only now, and only once the post is live." |
| container `status_code = EXPIRED` (>24h) | operation `failed`; calendar post left pre-publish; user re-initiates | "24h publish window missed — honest failure, not a silent Done." |
| container `status_code = ERROR` | operation `failed`, `PROVIDER_OUTPUT_INVALID`; no public URL | "Provider processing failed — never claim done." |
| token invalid/expired (`code 190`) | operation `failed`/`unknown`; re-auth the workspace connection | "Connection credential died — reconcile, never blindly retry." |
| publish rate limit (`2207042` / `code 4`/`17`/`32`/`613`) | operation `unknown`/`failed`; back off; reconcile | "Rate limited — back off, do not hammer." |
| Timeout after possible acceptance | operation `unknown`; reconcile via `GET /{container_id}?fields=status_code` before retry | "Never blindly re-create a container or re-publish." |
| Audience-facing verify `verified` | calendar post `published_verified`; immutable audience-evidence `Artifact`; `publish_completed` notification; initial `PerformanceSnapshot` | "Publication independently confirmed live — the only state that may be called done." |

**Feature-level outcome (second order).** Meta is the **audience-facing publication boundary** of
V0's creative pipeline for the `meta` platform. The approved, consent-safe, review-bound final
video leaves V0's owned storage only as a transient presigned URL Meta fetches; what comes back is a
container id, then a media id, then a permalink — never the raw provider payload. Because completion
is **poll-based and reconciled** (no publish webhook to forge), and because V0 then runs an
**independent audience-facing verify** comparing account/media-sha256/caption/visibility/time
against the approved calendar post, V0 can never claim publication success on provider
acknowledgement alone. The `unknown`-on-timeout + reconcile-before-retry rule prevents duplicate
publishes across the crash window; the 24h container TTL makes the publish SLA explicit; and the
one-`PublishOperation`-per-post + `requestHash` is the idempotency boundary Meta does not natively
provide. This is the publication-truth half of V0's "calm, honest system of record"; the verify step
is what graduates `published_unverified` → `published_verified`, after which performance (V0-A1) can
be observed.

---

## 7. Webhook signature verification — real scheme vs current code

**Real Meta webhook scheme:**
- Header `X-Hub-Signature-256`: `sha256={hex-signature}`; compare the hex after `sha256=` (constant-time).
- HMAC-SHA256 over the **raw request body** with `META_APP_SECRET` (the App Secret).
- Ignore `X-Hub-Signature` (SHA-1) if present.
- **No timestamp / no event-id**: V0 enforces its own dedup (`InboxEvent
  `(workspaceId, 'meta', <stable event key>)`) and freshness; Meta retries unacked up to 36h.
- GET handshake: verify `hub.verify_token == META_WEBHOOK_VERIFY_TOKEN`, echo `hub.challenge`.

**Current V0 code (`workspace-store.mjs` simulator callback path + `meta-provider.mjs`):**
- The domain store signs the simulator publish-completion callback envelope with
  `META_WEBHOOK_SECRET` over **canonical JSON** (`stableJson(envelope)`), not raw bytes — a real
  Meta webhook (`X-Hub-Signature-256` raw-body HMAC with the App Secret) would **fail**.
- It uses the simulator envelope secret (`META_WEBHOOK_SECRET`), not `META_APP_SECRET`.
- The publish-completion is driven by the simulator callback; **real Meta has no publish-completion
  webhook** — completion is poll-based (reconcile).
- The callback route receives parsed `request.body`, not the raw body + header the real scheme needs.

**Real-wiring gap (documentation; no code here):**
1. **Decouple publish completion from webhooks.** The real publish path is: container → poll
   `status_code` → `/media_publish` → permalink, driven by reconcile (Step 3–5), not a callback.
   The simulator's signed callback envelope is a test convenience that has no real-Meta analogue.
2. **Webhook endpoint (engagement/insights only):** if V0 subscribes to IG/Page webhooks, capture the
   **raw body** in the callback route (Fastify pre-parse), read `X-Hub-Signature-256`, compute
   HMAC-SHA256(raw body, `META_APP_SECRET`), constant-time compare. Use `META_WEBHOOK_VERIFY_TOKEN`
   for the GET handshake. These webhooks only hint that on-demand performance collection (V0-A1)
   should run; they never confirm publication.
3. Replace the canonical-JSON simulator verifier with the raw-body verifier, keyed by
   `META_APP_SECRET`, branched by `PUBLISHING_MODE` (simulator → canonical-JSON + `META_WEBHOOK_SECRET`;
   providers → raw-body + `META_APP_SECRET`).

---

## 8. Idempotency, unknown, and retry semantics

- **One `PublishOperation` per `CalendarPost` + V0 `Idempotency-Key` on the publish route:** the
  idempotency boundary is V0-side. Meta has no native publish idempotency key; the one-operation-per-post
  rule + the server-side `requestHash` prevents a duplicate publish. The container `PUBLISHED`
  `status_code` is the provider-side guard: re-publishing a `PUBLISHED` container is a no-op (idempotent).
- **Reconcile never resubmits:** `POST /calendar-posts/{id}/publish/reconcile` only queries Meta
  (poll container status / fetch permalink); it never re-creates a container or re-calls
  `/media_publish` unless the container is freshly `FINISHED` and the publish step has not yet run.
  A replay with the same `Idempotency-Key` returns the existing operation (`replay: true`).
- **Timeout after possible acceptance → `unknown`:** if V0 times out after `POST /media` may have
  succeeded (container created), the operation is `UNKNOWN` and the caller must reconcile via
  `GET /{container_id}?fields=status_code` before any retry. Never blindly re-create a container.
- **24h container TTL:** the container `EXPIRED`s if not published within 24h. The reconcile schedule
  (`VERIFY_RETRY_SCHEDULE_SECONDS`, default `0,60,180,420,900`) plus the polling cadence must
  complete publish well within 24h; a missed window is an honest `failed`, not a silent Done.
- **`appsecret_proof` replay protection:** every Graph API call carries `appsecret_proof =
  HMAC-SHA256(access_token, META_APP_SECRET)`, preventing token replay. Compute server-side only.
- **Token expiry (`code 190`):** a long-lived token lapsing mid-operation → `unknown`/`failed`; the
  workspace connection must be re-authed; reconcile first, never blindly retry.
- **Performance dedup (if webhooks used):** `InboxEvent (workspaceId, 'meta', <stable event key>)`;
  Meta may redeliver; V0 acts exactly once on the hint, then fetches insights on demand.

---

## 9. Meta error → V0 error code mapping

| Meta signal | HTTP | V0 error code | Action |
|---|---|---|---|
| Invalid/expired token (`code 190`) | 401 | `PROVIDER_UNAVAILABLE`/operation `failed` | Re-auth the workspace connection; reconcile first. |
| Invalid parameter (`code 100`) / `VALIDATION_FAILED`-class | 400 | `VALIDATION_FAILED` (422) | Validate caption/account/video before send. |
| `media_publish` 400 (container not `FINISHED`) | 400 | reconcile / `PUBLISH_POST_LOCKED`-class | Poll container first; do not publish early. |
| Server-side upload failure (`2207001`) | — | retryable (1–2×) | Retry once; if persists, new container. |
| Publish rate limit (`2207042`) / generic rate limit (`code 4`/`17`/`32`/`613`) | 429 | `unknown`/`failed`; back off | Honor Meta retry hint; reconcile, do not hammer. |
| Container `EXPIRED` (>24h) | — | operation `failed` | Re-initiate publish (new container). |
| Container `ERROR` / malformed provider response | — | `PROVIDER_OUTPUT_INVALID` (422) | Fail; never claim done. |
| Webhook signature mismatch | — | `PUBLISH_SIGNATURE_INVALID` (401) | Reject; do not act. |
| Webhook replay / dedup hit | — | drop | `InboxEvent` dedup. |
| Timeout after possible accept | — | `unknown` | Reconcile via `GET /{container_id}?fields=status_code` before retry. |
| Audience verify `identity_mismatch` | — | `VERIFY_IDENTITY_MISMATCH` (409) | Retain evidence; fail; no notification. |
| Audience verify `visibility_restricted` | — | `VERIFY_VISIBILITY_RESTRICTED` (409) | Fail; no notification. |
| Audience verify not yet live | 202 | `VERIFY_PROCESSING_WAIT` | Retry after `retryAfterMs`. |

---

## 10. Limits

- **Containers:** 400 containers per rolling 24-hour period per IG user; **container TTL 24h**
  (must publish before expiry).
- **Published posts:** 50–100 API-published posts per rolling 24-hour window per IG user (Meta's own
  docs show a discrepancy between the reference page (50) and the content-publishing guide (100); pin
  the conservative 50 at deployment time and confirm against the live app limits).
- **Reels specs:** MP4 or MOV (moov atom at front); H.264 or HEVC, progressive, closed GOP, 4:2:0;
  AAC audio ≤48kHz; 23–60 FPS; aspect 9:16 (required for Reels tab); **duration 5–90 seconds**;
  max 100MB; max 1920 horizontal pixels; cover JPEG ≤8MB sRGB.
- **Caption:** Meta ≤2200 chars; V0 enforces ≤2000 at the calendar layer.
- **Rate limits:** Meta Graph API throttles per token/app; honor `code 4`/`17`/`32`/`613` and
  `error_subcode 2207042`; back off and reconcile.
- **Polling:** once per minute, max ~5 minutes, per Meta's content-publishing guidance.
- **Token lifetime:** long-lived User/Page token ≈60 days; refresh before expiry; `code 190` on lapse.
- **Account type:** Instagram **Business** only (Creator accounts cannot publish via API).
- **Permissions:** `instagram_basic`, `instagram_content_publish`, `pages_show_list`,
  `pages_read_engagement` (FB Login); or `instagram_business_basic`,
  `instagram_business_content_publish` (Instagram Login).
- **Webhook retries:** decreasing frequency over 36h; unacked dropped after 36h; V0 self-dedup.

---

## 11. Cost model

Meta Content Publishing is a **free API** (no per-post charge). V0 therefore does **not** model a
Meta `ProviderPriceVersion` (unlike HeyGen's per-second generation cost). Publication cost in V0 is
the upstream generation cost already settled (HeyGen `CAPTURE` from the wallet — see
`HeyGen_integration.md` §7); publishing to Meta consumes no additional wallet credit. The
operational costs (Meta app review, App Secret management, presigned B2 bandwidth for Meta's fetch,
token refresh) are platform P&L, not `WalletLedgerEntry`. Wallet reconciliation (Owner/Admin) still
matches ledger totals against paid generation totals (`matched`/`mismatched`/`unknown`); publishing
is a non-billed boundary on the money side, but a **billed-in-truth boundary** on the
publication/verify side: the audience-evidence `Artifact` and `PerformanceSnapshot` are the
retained proof of publication, not a money event.

---

## 12. Mapping to the current V0 code

| Concern | Current code | Canonical target |
|---|---|---|
| Adapter | `meta-provider.mjs` synthesizes `meta_${slug}` externalId + fake `metaPublicUrl` (`meta.example.test`); refuses `META_MODE != simulator` (`:66–93`, `:51–53`) | Real adapter: `POST /{ig-user-id}/media` → container id; poll `status_code`; `POST /{ig-user-id}/media_publish` → media id; `GET /{media_id}?fields=permalink` → publicUrl. |
| Mode switch | Refusal guard reads `env.META_MODE` (`:66`); config-catalog umbrella is `PUBLISHING_MODE` | Reconcile gating to `PUBLISHING_MODE=providers`; keep simulator for tests. |
| Keys | `META_APP_ID`/`META_APP_SECRET`/access token never read | Read app-level keys from env; access token from per-workspace `ServiceCredential`; server-only. |
| External id | Synthesized `meta_${slug}` (from `operationId`) | container id at `accepted`; published media id at `completed` (real-wiring decision — see §5). |
| Public URL | Fake `https://meta.example.test/p/{externalId}` | Real `permalink` from `GET /{media_id}?fields=permalink` (bound only at `completed`). |
| Reconcile | `reconcileMetaOperation` synthesizes status + externalId + fake publicUrl, never resubmits (`:99–111`) | Real `GET /{container_id}?fields=status_code` (poll) + `/media_publish` + permalink fetch; never resubmit; honor 24h TTL. |
| Webhook (publish completion) | Simulator signed callback envelope drives `accepted` → `completed` | **No real publish webhook.** Completion is poll-based (reconcile). Remove the callback-as-completion assumption from the live path. |
| Webhook (engagement/insights) | Simulator canonical-JSON verifier with `META_WEBHOOK_SECRET` | Real `X-Hub-Signature-256` raw-body HMAC with `META_APP_SECRET`; GET handshake with `META_WEBHOOK_VERIFY_TOKEN`; self-dedup via `InboxEvent`. |
| `appsecret_proof` | Not implemented | Add `appsecret_proof = HMAC-SHA256(access_token, META_APP_SECRET)` to every Graph API call. |
| video_url | Not wired (simulator stores no bytes) | Short-lived B2 presigned GET URL for the clean-media final video (see `B2_integration.md`); self-healing; valid until `FINISHED`. |
| Raw body | Callback route receives parsed `request.body` | Capture raw body (Fastify pre-parse) for the webhook HMAC. |

**Real-wiring gap:** create the real `meta-provider.mjs` publish path (container → poll → publish →
permalink) gated behind `PUBLISHING_MODE=providers`, read app-level keys from env and the access
token from per-workspace `ServiceCredential`, add `appsecret_proof` to every Graph API call, supply
a short-lived B2 `video_url`, drive completion via reconcile (not a webhook), and wire the optional
engagement/insights webhook with the real `X-Hub-Signature-256` raw-body verifier. Keep the
simulator for tests; keep the 24h container TTL and the independent audience-facing verify
(`POST /calendar-posts/{id}/verify`) as the only path to `published_verified`.

---

## 13. Summary — what the reader needs to know

- **What V0 sends (input):** `POST /{ig-user-id}/media` with `media_type=REELS`, a short-lived B2
  presigned `video_url` for the approved final video, `caption`, `share_to_feed=true`, the
  per-workspace `access_token`, and `appsecret_proof = HMAC-SHA256(access_token, META_APP_SECRET)` —
  after persisting the `PublishOperation` (`submitting`). Then `GET /{container_id}?fields=status_code`
  (poll), then `POST /{ig-user-id}/media_publish?creation_id=…`, then
  `GET /{media_id}?fields=permalink`.
- **What Meta returns (output):** a container `id` (transient, 24h TTL) → a container `status_code`
  (`IN_PROGRESS`→`FINISHED`/`EXPIRED`/`ERROR`) → a published media `id` (durable) → a `permalink`
  (the audience-facing URL). **No publish-completion webhook.**
- **What V0 produces (feature):** an honestly-verified audience-facing publication. The operation
  moves `submitting`→`accepted` (container id) → `completed` (permalink) via reconcile, then the
  independent audience-facing verify graduates the calendar post to `published_verified` with an
  immutable audience-evidence `Artifact` and initial `PerformanceSnapshot`. Provider
  acknowledgement alone never becomes success; a timeout is `unknown` and reconciled before retry;
  a missed 24h window is an honest `failed`.
- **Keys needed:** `PUBLISHING_MODE`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`
  (if webhooks used), `PUBLISH_CALLBACK_BASE_URL`, `VERIFY_RETRY_SCHEDULE_SECONDS`,
  `GRAPH_API_VERSION`; plus a **per-workspace long-lived access token** stored as a `ServiceCredential`.
  App Secret + access token are server-only; never browser/log/artifact.
- **Real-wiring gap:** no live adapter; the simulator drives completion via a signed callback
  envelope (canonical JSON, `META_WEBHOOK_SECRET`) that has no real-Meta analogue. A real
  `meta-provider.mjs` (container→poll→publish→permalink), `appsecret_proof` on every call, B2
  `video_url`, reconcile-driven completion, and the real `X-Hub-Signature-256` raw-body webhook
  verifier are required before real publication — always behind the independent audience-facing
  verify.

---

## Sources

- developers.facebook.com/docs/instagram-platform/content-publishing — three-step container→poll→publish flow, status codes, permissions, polling cadence
- developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media — `POST /{ig-user-id}/media` request params (media_type=REELS, video_url, caption, share_to_feed), `{id}` response, container limits (400/24h, 24h TTL)
- developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media_publish — `POST /{ig-user-id}/media_publish?creation_id=…`, `{id}` published media id, 50/24h publish limit
- developers.facebook.com/docs/instagram-platform/content-publishing/resumable-uploads — large-file `rupload.facebook.com` resumable flow
- developers.facebook.com/docs/graph-api/webhooks/getting-started — GET handshake (`hub.mode`/`hub.verify_token`/`hub.challenge`), `X-Hub-Signature-256: sha256={hex}` over raw body with App Secret, 36h retries, dedup, HTTPS/mTLS
- Meta Graph API `appsecret_proof` reference — `appsecret_proof = HMAC-SHA256(access_token, app_secret)`, "Require App Secret Proof" setting
- `docs/V0/V0_API.md` §V0-U2/U3 (publish + reconcile) and §V0-U4 (audience-facing verify) — publication contract
- `docs/V0/V0_STATUS_ENUMS.md` — publish + calendar statuses
- `docs/V0/V0_JOBS.md` — reconcile/verify retry schedule
- `docs/V0/V0_SECURITY.md` — callback signature on raw bytes, replay protection, tenant isolation
- `docs/V0/V0_PERMISSIONS.md` — `schedule_publish_approved_media`
- `docs/V0/V0_PRODUCT_SPECIFICATION.md` — "Facebook Pages + Instagram … start here"; Calendar MVP Instagram/Facebook first; 9:16 Reels/Shorts format
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — publishing key names (`PUBLISHING_MODE`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `PUBLISH_CALLBACK_BASE_URL`, `VERIFY_RETRY_SCHEDULE_SECONDS`)
- `apps/api/src/meta-provider.mjs` — current simulator publishing path (code-grounded)