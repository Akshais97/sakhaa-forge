# YouTube Integration — YouTube Shorts Publication (Data API v3)

Status: In-depth reference for the YouTube publishing integration (Shorts via the YouTube Data API
v3 `videos.insert` resumable-upload flow). Documents Google/YouTube's actual API/key/token
behaviour, the exact two-phase resumable-upload request/response JSON, the video resource status
fields, the per-client upload-quota gate, the keys and per-workspace OAuth tokens required, and how
V0's verified-publication contract maps to YouTube and back to V0's feature output.
Date verified: 2026-07-02 (against Google/YouTube official developer docs, read directly).

Companion documents in this folder: `Meta_integration.md` (the other V0 publish platform),
`B2_integration.md` (the clean-media object V0 reads and pushes to YouTube),
`HeyGen_integration.md`, `Supabase_integration.md`, `Razorpay_integration.md`, `Stripe_integration.md`.

Canonical V0 contracts that own the behaviour (this doc is the provider-side companion):
- `docs/V0/V0_API.md` §"Idempotent Platform Publication (V0-U2, V0-U3)" (incl. the YouTube
  upload-quota gate, the YouTube accepted→processing→completed lifecycle) and §"Audience-facing
  verify (V0-U4)"
- `docs/V0/V0_STATUS_ENUMS.md` — publish + calendar statuses
- `docs/V0/V0_JOBS.md` — reconcile/verify retry schedule
- `docs/V0/V0_SECURITY.md` — tenant isolation, callback signature, replay protection
- `docs/V0/V0_PERMISSIONS.md` — `schedule_publish_approved_media` capability
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — publishing key names

Sources: Google/YouTube official developer docs —
developers.google.com/youtube/v3/docs/videos/insert,
developers.google.com/youtube/v3/docs/videos#resource,
developers.google.com/youtube/v3/guides/using_resumable_upload_protocol,
developers.google.com/youtube/v3/guides/auth (OAuth scopes).

---

## 0. The key fact

YouTube is V0's **publishing provider for the `youtube-shorts` platform** — vertical short-form
video published as a YouTube Short via the YouTube Data API v3 `videos.insert` **resumable upload**.
Unlike Meta (where V0 hands Meta a presigned URL to fetch), YouTube requires **V0 to push the video
bytes**: a two-phase resumable upload (metadata POST opens a session and returns an upload URI in
the `Location` header; a binary PUT streams the file in 256 KB chunks). The flow is deterministic,
idempotent at the V0 boundary, and **poll-based for completion**:

1. V0 runs a **pre-flight upload-quota gate** (3 uploads/day per client) BEFORE any network I/O;
   exhaustion returns `PUBLISH_QUOTA_EXHAUSTED` (429) with a `retryAfterMs` and writes **no**
   `PublishOperation` row.
2. V0 persists a `PublishOperation` (`submitting`) **before** any network I/O.
3. The adapter starts the resumable session (POST metadata) and uploads the bytes (PUT); on the
   `201` response the operation is `accepted` **and** `processing` — the video id is bound as
   `externalId` and the public URL is `null` (still processing).
4. V0 **reconciles by polling** `GET /videos?id={videoId}&part=status,processingDetails` until
   `status.uploadStatus=processed` and `processingDetails.processingStatus=succeeded` — YouTube
   sends **no webhook**; the operation moves forward only through reconcile (never a blind resubmit).
5. V0 binds the public short URL `https://www.youtube.com/shorts/{videoId}` (operation `completed`),
   then **independently verifies the audience-facing live post** (`POST /calendar-posts/{id}/verify`).

> **YouTube returns a video id at upload time, then a processed/succeeded status when polled — not
> a "publish succeeded" webhook (YouTube Data API has no webhooks at all). V0 binds the public
> short URL only after processing completes, and claims publication done only after the independent
> audience-facing verify. A timeout after possible acceptance is `unknown` and is reconciled before
> any retry.**

The simulator's `x-youtube-signature` callback envelope has **no real-YouTube counterpart** — the
YouTube Data API is a pure request/response + polling API with no inbound push. Real-wiring must
replace the simulator's callback-driven completion with poll-driven reconciliation.

---

## 1. Integration keys and configuration

Source: `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` + `.env.example` + `apps/api/src/youtube-provider.mjs`.

| Variable | Required | Expected value / type | Classification | Used for |
|---|---|---|---|---|
| `PUBLISHING_MODE` | yes | enum `simulator,providers` | Internal | Selects simulator vs live publishing. Local `simulator`; prod explicit. |
| `YOUTUBE_CLIENT_ID` | provider mode | Google OAuth client id (`…apps.googleusercontent.com`) | Internal | The V0 YouTube OAuth client (not a secret). |
| `YOUTUBE_CLIENT_SECRET` | provider mode | Google OAuth client secret | **Secret** | Paired with `YOUTUBE_CLIENT_ID` to refresh access tokens. Server-only. |
| `PUBLISH_CALLBACK_BASE_URL` | provider mode | HTTPS URL | Internal | Base hosting `POST /callbacks/publishing/youtube` — **simulator only**; real YouTube sends no webhooks. |
| `VERIFY_RETRY_SCHEDULE_SECONDS` | optional | default `0,60,180,420,900` | Internal | Audience-facing verify + reconcile retry backoff (V0-U4). |

**Per-workspace OAuth tokens (NOT in the config catalog):** publishing requires a Google OAuth
grant for the customer's YouTube channel, stored per-workspace as a `ServiceCredential`
(`secret-manager://` reference). Google OAuth issues a **short-lived access token** (~1 hour) plus a
**long-lived refresh token**; V0 must refresh the access token before expiry using the refresh
token (and `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`). Both are tenant-owned credentials, stored
per-workspace, never in browser code, logs, or retained artifacts. The config catalog holds only
the app-level OAuth client; the customer's connection grant is a tenant credential — exactly like
the Meta per-workspace access token.

**Required OAuth scope (upload):** `https://www.googleapis.com/auth/youtube.upload` (upload-only,
preferred — least privilege). Alternatives accepted by `videos.insert`: `youtube` (full),
`youtubepartner`, `youtube.force-ssl`. V0 requests `youtube.upload` only.

**Key safety:** `YOUTUBE_CLIENT_SECRET` and the per-workspace tokens are server-only — never in
browser code, logs, analytics, or retained artifacts. `YOUTUBE_CLIENT_ID` is not secret. The clean
media bytes V0 pushes to YouTube are adapter-internal; the store only sees the descriptor/externalId
(see `HeyGen_integration.md` §0/`B2_integration.md`).

**Current code reality:** V0 publishing is **simulator-only**. `apps/api/src/youtube-provider.mjs`
makes no network call; the refusal guard
`if (env.YOUTUBE_MODE && env.YOUTUBE_MODE !== "simulator")` returns
`{ ok: false, kind: "unavailable", errorCode: "PROVIDER_UNAVAILABLE" }` (`youtube-provider.mjs:90–94`).
`checkYouTubeQuota` (`:69–76`) returns `PUBLISH_QUOTA_EXHAUSTED` when
`V0_YOUTUBE_SIMULATOR_QUOTA=exhausted` (retry after 24h) — the real 3/day-per-client rule is the
production contract (`V0_API.md:699`). `submitYouTubePost` synthesizes `externalId: yt_${slug}`
(slug from `operationId`, `:101–124`); the `processing` mode returns `{ accepted: true, processing:
true, externalId }` (`:110–117`) to model the upload delayed-processing state; `youtubePublicUrl`
returns the fake `https://youtube.example.test/shorts/{externalId}` (`:59–61`);
`reconcileYouTubeOperation` synthesizes a status + externalId + fake publicUrl and never resubmits
(`:130–142`). `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/the OAuth tokens are **never read**. The
domain store signs the simulator callback envelope with a YouTube-specific canonical-JSON secret
(routed via `x-youtube-signature`, `V0_API.md:819–820`), which has **no real-YouTube analogue**.

---

## 2. Authentication and request headers

### V0 → YouTube (resumable upload — open session)
```
POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
Authorization: Bearer {per-workspace access token}
Content-Type: application/json; charset=UTF-8
Content-Length: {byte count of JSON body}
X-Upload-Content-Length: {total video file size in bytes}
X-Upload-Content-Type: video/*             (or application/octet-stream)

{ "snippet": {…}, "status": {…} }
```
Response: `200 OK` with an empty body and a `Location` header = the unique upload URI:
```
Location: https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=…&part=snippet,status
```
- **Bearer auth** with the per-workspace **access token** (refreshed from the refresh token before
  it expires). Never the client secret in the browser; the client secret is server-only and used
  only for token refresh.
- **`X-Upload-Content-Length` / `X-Upload-Content-Type`**: declare the binary payload size and MIME
  type up front so YouTube can allocate the resumable session.

### V0 → YouTube (resumable upload — stream bytes)
```
PUT {Location upload URI}
Authorization: Bearer {access token}
Content-Length: {chunk size}
Content-Type: video/*
Content-Range: bytes {first}-{last}/{total}      (chunked; single PUT if whole file)

{video bytes}
```
- Each non-final chunk must be a **multiple of 256 KB**. A successful non-final chunk returns
  `308 Resume Incomplete` with a `Range: bytes=0-{lastReceived}` header; the next chunk starts at
  `lastReceived + 1` ("You cannot upload a noncontinuous block").
- An empty-body PUT with `Content-Range: bytes */{total}` checks status (returns `308` + `Range`,
  or `201` if complete).
- Completion: `201 Created` with the `video` resource in the body. Transient `5xx` → resume with
  exponential backoff; `404` → session URI expired, start a new upload from the POST.
- **Final response** carries the video resource (see §4) — including the `id` (the externalId).

### V0 → YouTube (poll completion)
```
GET https://www.googleapis.com/youtube/v3/videos?id={videoId}&part=status,processingDetails
Authorization: Bearer {access token}
```
Response: `{ "items": [ { "id": "…", "status": { "uploadStatus": "…", "privacyStatus": "…" }, "processingDetails": { "processingStatus": "…", "processingProgress": {…} } } ] }`

### YouTube → V0 (webhook)
**None.** The YouTube Data API v3 has no webhooks. Completion is poll-based only. The simulator's
`POST /callbacks/publishing/youtube` (`x-youtube-signature` canonical-JSON envelope) is a test
convenience with no real counterpart and must be removed from the live path.

---

## 3. The end-to-end flow (YouTube Shorts — V0 primary)

### Step 0 — Connect the YouTube channel (OAuth, one-time per workspace)
The customer connects their YouTube channel via Google OAuth (scope `youtube.upload`). V0 stores
the **access token** (short-lived) + **refresh token** (long-lived) per-workspace as a
`ServiceCredential` (`secret-manager://` reference). V0 refreshes the access token before expiry
using the refresh token + `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`. This is a tenant-owned
credential, out of the publish hot path but a prerequisite for any publish.

### Step 1 — Pre-flight quota gate (BEFORE any I/O)
`checkYouTubeQuota` (`youtube-provider.mjs:69–76`) counts uploads per `(workspaceId, account)` per
UTC day. When the **3 uploads/day-per-client** limit is reached, it returns
`PUBLISH_QUOTA_EXHAUSTED` (429) with `retryAfterMs` (next daily window) and writes **no**
`PublishOperation` row — quota failure is explicit and non-corrupting, never hidden as generic
failure and never creating a duplicate operation. (This is a **V0 business gate**, distinct from
YouTube's own per-API-project quota; see §10.) The caller surfaces this to the user; the user
retries at the shown time or exports manually.

### Step 2 — Pre-flight Shorts-eligibility validation (BEFORE any I/O)
Shorts require **≤ 60 seconds** + **vertical 9:16** (note: this is shorter than Reels' 90s). V0
must validate the bound final video's duration/aspect for the `youtube-shorts` platform before
upload: a creative > 60s would upload as a regular video (watch URL `/watch?v=…`, not
`/shorts/{id}`) and break the public-URL contract. A creative that is not vertical 9:16 is not
Short-eligible. Mismatch → `VALIDATION_FAILED`/`PUBLISH_NOT_SUBMITTABLE`-class before any I/O.

### Step 3 — V0 creates the calendar post and persists the PublishOperation (server, before I/O)
`POST /calendar-posts/{id}/publish` (`Idempotency-Key` required, `schedule_publish_approved_media`).
The provider is derived server-side from `platform` (`youtube-shorts` → `youtube-simulator`/live).
Body carries `workspaceId` + `account` (must equal the bound account, else `PUBLISH_ACCOUNT_MISMATCH`
409). A durable `PublishOperation` is persisted `SUBMITTING` **before** the provider call, binding
workspace, calendar post, provider route, idempotency key, and server-side `requestHash`. One
`PublishOperation` per `CalendarPost`. A manual-export post returns `PUBLISH_NOT_SUBMITTABLE` (409).
A timeout after possible acceptance marks the operation `UNKNOWN`; reconcile before retry.

### Step 4 — Adapter opens the resumable session (metadata POST)
```
POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
Authorization: Bearer {token}
X-Upload-Content-Length: {finalVideoByteSize}
X-Upload-Content-Type: video/*

{
  "snippet": {
    "title": "{caption-derived title}",
    "description": "{caption}",
    "tags": ["…"],
    "categoryId": "22",                       // People & Blogs (V0 default; pin per brand)
    "defaultLanguage": "en"
  },
  "status": {
    "privacyStatus": "public",                 // or "private" + publishAt for scheduled
    "publishAt": "{scheduledAt ISO-8601 UTC}",  // ONLY when privacyStatus="private" (scheduled)
    "selfDeclaredMadeForKids": false,
    "containsSyntheticMedia": true,            // V0 avatar videos are synthetic — declare honestly
    "embeddable": true,
    "license": "youtube"
  }
}
```
Response: `200 OK`, empty body, `Location: <upload URI>`. (For a scheduled post, V0 sets
`privacyStatus="private"` + `publishAt={scheduledAt}`; YouTube holds it private and flips to public
at `publishAt`. For an immediate post, `privacyStatus="public"` and no `publishAt`. `publishAt` can
only be set when `privacyStatus` is `private`.)

### Step 5 — Adapter streams the video bytes (binary PUT)
V0 reads the approved final-video bytes from the **clean-media B2 object** (adapter-internal; see
`B2_integration.md`) and PUTs them to the upload URI (single whole file, or 256 KB chunks with
`Content-Range` for large files). Completion: `201 Created` with the `video` resource:
```json
{
  "id": "dQw4w9WgXcQ",
  "snippet": { "title": "…", "description": "…", "publishedAt": null, "thumbnails": {…} },
  "status": { "uploadStatus": "uploaded", "privacyStatus": "public", "selfDeclaredMadeForKids": false },
  "processingDetails": { "processingStatus": "processing", "processingProgress": { "partsTotal": 10, "partsProcessed": 3, "timeLeftMs": 8000 } }
}
```
The adapter binds the **video id** as `externalId`; the operation advances to `accepted` **and**
`processing` (the YouTube upload is accepted but still being processed); the calendar post stays
`accepted`. **The public URL is `null`** (the post is not live). A `publish.state_changed` audit
(`reason: accepted`) is retained. Raw provider payloads, tokens, and signed URLs stay
adapter-private.

### Step 6 — Reconcile by polling processing status (never resubmits)
`POST /calendar-posts/{id}/publish/reconcile` (`Idempotency-Key` required). The adapter queries:
```
GET https://www.googleapis.com/youtube/v3/videos?id={videoId}&part=status,processingDetails
Authorization: Bearer {token}
```
Drive toward: `status.uploadStatus = "processed"` **and** `processingDetails.processingStatus =
"succeeded"`. Reconciliation **never resubmits**; it only polls. `processing` → keep reconciling;
`uploadStatus="failed"`/`"rejected"` or `processingStatus="failed"`/`"terminated"` → operation
`failed` (`PROVIDER_OUTPUT_INVALID` / `PUBLISH_PROVIDER_REJECTED`), no public URL. This is the
poll-based substitute for the simulator's `publish.processing` → `publish.completed` callback:
**real YouTube has no completion webhook.** The reconcile retry schedule
(`VERIFY_RETRY_SCHEDULE_SECONDS`, default `0,60,180,420,900`) bounds the polling cadence.

### Step 7 — Bind the public short URL
On `uploadStatus=processed` / `processingStatus=succeeded`, the adapter binds the public URL:
```
https://www.youtube.com/shorts/{videoId}
```
The operation advances to `completed`; the calendar post to `published_unverified`; a
`publish.state_changed` audit (`reason: completed`) is retained. The public short URL is the only
URL surfaced, and only once the post is live.

### Step 8 — Independent audience-facing verification (V0-U4)
`POST /calendar-posts/{id}/verify` (no `Idempotency-Key`; one-`PostVerification`-row-per-post rule).
The verifier independently fetches the live video (`GET /videos?id={videoId}&part=snippet,status`)
and reports whether the target channel, media identity (approved final-video sha256), caption,
visibility (`privacyStatus`), and publish time match. Provider acknowledgement alone never becomes
success.
- Not yet live/processed → `202` with `VERIFY_PROCESSING_WAIT` + `retryAfterMs`, no record.
- `verified` → calendar post `published_verified`; immutable audience-evidence `Artifact`; exactly-one
  deduplicated `publish_completed` notification; initial `PerformanceSnapshot`
  (`source: audience_verification_initial`); `calendar.verification_completed`.
- `identity_mismatch` → `VERIFY_IDENTITY_MISMATCH` (409); `visibility_restricted`
  (`privacyStatus != public`, e.g. an **unverified API project** forcing private — see §10) →
  `VERIFY_VISIBILITY_RESTRICTED` (409); no notification.

**Publication is never claimed `Done` before this audience-facing verification.**

---

## 4. Full request/response schemas

### 4.1 Open session — `POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` (request)
| Field | Type | Required | Notes |
|---|---|---|---|
| `snippet.title` | string | yes | ≤100 chars; V0 derives from caption/brand. `invalidTitle` (400) if empty. |
| `snippet.description` | string | no | ≤5000 chars; V0 caption ≤2000. |
| `snippet.tags[]` | string[] | no | ≤500 chars total; `invalidTags` (400) if exceeded. |
| `snippet.categoryId` | string | recommended | YouTube category id (e.g. `22` People & Blogs). `invalidCategoryId` (400) if bad. |
| `snippet.defaultLanguage` | string | no | BCP-47 (e.g. `en`). Required if localizations set. |
| `status.privacyStatus` | enum | yes | `public` \| `private` \| `unlisted`. V0: `public` (immediate) or `private` (scheduled). `forbiddenPrivacySetting` (403) if invalid. |
| `status.publishAt` | datetime | no | ISO-8601 UTC; **only when `privacyStatus="private"`** (scheduled). `invalidPublishAt` (400) if invalid. |
| `status.selfDeclaredMadeForKids` | boolean | recommended | COPPA designation. |
| `status.containsSyntheticMedia` | boolean | recommended | **V0 sets `true`** — avatar videos are synthetic; honest disclosure. |
| `status.embeddable` | boolean | no | Allow embedding. |
| `status.license` | enum | no | `youtube` (default) \| `creativeCommon`. `forbiddenLicenseSetting` (403) if invalid. |
| `notifySubscribers` | boolean | no | Default `true`; V0 may set `false` to avoid notifying. |
| `X-Upload-Content-Length` | integer (header) | yes | Total video size in bytes. |
| `X-Upload-Content-Type` | string (header) | yes | `video/*` / `application/octet-stream`. |
| `Authorization` | Bearer (header) | yes | Per-workspace access token. |

### 4.2 Open session — response
`200 OK`, empty body, with header `Location: <upload URI>` (the resumable session URI; used for the
binary PUT). The session URI is short-lived; `404` on the PUT means it expired (restart from the POST).

### 4.3 Stream bytes — `PUT {upload URI}` (request)
| Header | Value |
|---|---|
| `Authorization` | `Bearer {access token}` |
| `Content-Type` | `video/*` (must match `X-Upload-Content-Type`) |
| `Content-Length` | chunk size (must match `X-Upload-Content-Length` for a whole-file PUT) |
| `Content-Range` | `bytes {first}-{last}/{total}` (chunked); omit for single whole-file PUT |

Non-final chunk → `308 Resume Incomplete` + `Range: bytes=0-{lastReceived}`. Final → `201 Created`
+ the `video` resource. `5xx` → resume with backoff; `404` → session expired.

### 4.4 Video resource — response (the `201` body)
```json
{
  "id": "dQw4w9WgXcQ",
  "snippet": {
    "publishedAt": "2026-07-02T10:15:30.000Z",
    "title": "…",
    "description": "…",
    "tags": ["…"],
    "categoryId": "22",
    "defaultLanguage": "en",
    "thumbnails": { "default": { "url": "…", "width": 120, "height": 90 }, "high": {…}, "maxres": {…} }
  },
  "status": {
    "uploadStatus": "uploaded",
    "privacyStatus": "public",
    "publishAt": null,
    "license": "youtube",
    "embeddable": true,
    "selfDeclaredMadeForKids": false,
    "containsSyntheticMedia": true
  },
  "processingDetails": {
    "processingStatus": "processing",
    "processingProgress": { "partsTotal": 10, "partsProcessed": 3, "timeLeftMs": 8000 }
  }
}
```
- `status.uploadStatus`: `uploaded` | `processed` | `failed` | `rejected` | `deleted`.
  - `uploaded`: bytes received, processing started (V0 operation `accepted`+`processing`).
  - `processed`: ready/public (V0 operation `completed`, bind public URL).
  - `failed`/`rejected`/`deleted`: terminal failure.
- `processingDetails.processingStatus`: `processing` | `succeeded` | `failed` | `terminated`.
- `processingDetails.processingProgress.partsTotal` / `partsProcessed` / `timeLeftMs`: progress
  estimate (V0 may surface progress to the UI as an honest "still processing" state; never as a
  success claim).
- `snippet.thumbnails`: generated by YouTube; `maxres` only when available.

### 4.5 Poll — `GET /youtube/v3/videos?id={videoId}&part=status,processingDetails` (response)
```json
{
  "kind": "youtube#videoListResponse",
  "items": [
    { "id": "dQw4w9WgXcQ", "status": { "uploadStatus": "processed", "privacyStatus": "public" },
      "processingDetails": { "processingStatus": "succeeded", "processingProgress": { "partsTotal": 10, "partsProcessed": 10, "timeLeftMs": 0 } } }
  ]
}
```
Empty `items[]` (e.g. video deleted/private-inaccessible) → treat as not-yet-live or failed; reconcile.

### 4.6 Webhook event
**None.** YouTube Data API v3 has no webhooks. Do not expect any push from YouTube; drive completion
exclusively through the poll in §4.5.

### 4.7 Errors
YouTube returns JSON `{ "error": { "code": 403, "message": "…", "errors": [ { "reason": "quotaExceeded", "domain": "youtube.quota", "location": "…", "locationType": "parameter" } ] } }` with HTTP status. Key reasons: `quotaExceeded` (403, daily API quota — distinct from V0's 3/day gate), `uploadLimitExceeded` (400, per-upload), `forbidden` (403), `forbiddenPrivacySetting`/`forbiddenLicenseSetting` (403), `invalidTitle`/`invalidDescription`/`invalidTags`/`invalidCategoryId`/`invalidPublishAt` (400), `mediaBodyRequired` (400, no video bytes), `badRequest` `defaultLanguageNotSet` (400). Token errors → `401`/`403 invalid_credentials` (refresh the token). Session `404` → restart upload.

---

## 5. V0 input → YouTube mapping (what V0 sends)

| V0 field | YouTube field | Notes |
|---|---|---|
| `CalendarPost.platform = "youtube-shorts"` | provider route selection | Server-derived; body carries no `provider`. |
| `CalendarPost.account` (channel) | channel bound to the OAuth token | Must equal connected account; mismatch → `PUBLISH_ACCOUNT_MISMATCH`. |
| `CalendarPost.caption` (≤2000) | `snippet.title` (≤100) + `snippet.description` (≤5000) | V0 splits caption into title + description (title ≤100). |
| Approved final-video bytes (clean-media B2 object) | binary PUT body | Adapter reads from B2 and streams; store sees only the descriptor. See `B2_integration.md`. |
| `CalendarPost` 9:16 + duration | (Shorts auto-detection by YouTube) | V0 pre-flight-validates **≤60s + 9:16** (Shorts); >60s → regular video, breaks `/shorts/` URL. |
| `CalendarPost.scheduledAt` (future) | `status.privacyStatus="private"` + `status.publishAt={scheduledAt}` | YouTube holds private, flips to public at `publishAt`. Immediate post → `privacyStatus="public"`. |
| Per-workspace access token (ServiceCredential) | `Authorization: Bearer {token}` | Refreshed from refresh token before expiry; server-only. |
| `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` | token refresh only | Server-only; never browser. |
| Synthetic (avatar) media | `status.containsSyntheticMedia=true` | Honest disclosure per YouTube policy. |
| `Idempotency-Key` (V0 request) | (V0 server-side `requestHash` + one `PublishOperation` per post) | YouTube has no native upload idempotency key; V0's one-operation-per-post + `requestHash` is the boundary (a re-upload would create a NEW video id — V0 must reconcile, never re-upload blindly). |
| Upload count per `(workspaceId, account)` per UTC day | (V0 pre-flight quota counter) | 3/day-per-client V0 business gate (§1/§10); NOT a YouTube API call. |

**Persist before I/O:** the `PublishOperation` (`submitting`, `externalId` placeholder,
`requestHash`, `workspaceId`, `calendarPostId`, `provider`) is written **before** the resumable
session POST, so a crash between persistence and the network response leaves a resumable operation,
never a blind duplicate. The video id is bound to the operation only after the `201` response.

**External-id decision (real-wiring):** the operation stores **one** `externalId`. At
`accepted`+`processing` the **video id** (from the `201` resource) is the durable reference — it is
known immediately at upload time, unlike Meta's container id. So `externalId = videoId` from
`accepted` onward; the `publicUrl = https://www.youtube.com/shorts/{videoId}` is bound only at
`completed` (after `uploadStatus=processed`). The video id is stable across the crash window, so a
reconcile replay rebinds the same id + URL without ambiguity.

---

## 6. YouTube → V0 output mapping (what V0 gets back, by feature)

| YouTube output | V0 object / action | Feature meaning |
|---|---|---|
| `201` video resource `id` (upload PUT) | `PublishOperation.externalId = videoId`; operation `accepted`+`processing`; calendar post `accepted`; `publicUrl = null` | "Upload accepted and processing — the post is not live yet." |
| `status.uploadStatus="uploaded"` + `processingDetails.processingStatus="processing"` (reconcile poll) | operation stays `processing`; keep reconciling | "Still processing — never resubmit, keep polling." |
| `status.uploadStatus="processed"` + `processingStatus="succeeded"` | bind `publicUrl = youtube.com/shorts/{videoId}`; operation `completed`; calendar post `published_unverified`; `publish.state_changed` audit | "Processed and public — the audience-facing URL is bound now, only once live." |
| `status.uploadStatus="failed"`/`"rejected"` or `processingStatus="failed"`/`"terminated"` | operation `failed` (`PROVIDER_OUTPUT_INVALID` / `PUBLISH_PROVIDER_REJECTED`); no public URL | "Provider processing failed — honest failure, never claim done." |
| `privacyStatus="private"` at verify (e.g. unverified project) | `VERIFY_VISIBILITY_RESTRICTED` (409); no notification | "Not actually public — never claim done (unverified-project risk, §10)." |
| Token invalid/expired (`401`/`403 invalid_credentials`) | operation `unknown`/`failed`; refresh token; reconcile first | "Connection credential died — reconcile, never blindly retry." |
| API quota exceeded (`quotaExceeded` 403) | operation `unknown`/`failed`; back off; reconcile | "YouTube API quota hit — back off (distinct from V0's 3/day gate)." |
| Timeout after possible acceptance | operation `unknown`; reconcile via `GET /videos?id={videoId}&part=status,processingDetails` before retry | "Never blindly re-upload (would create a duplicate video)." |
| Audience-facing verify `verified` | calendar post `published_verified`; immutable audience-evidence `Artifact`; `publish_completed` notification; initial `PerformanceSnapshot` | "Publication independently confirmed live — the only state that may be called done." |

**Feature-level outcome (second order).** YouTube is the second **audience-facing publication
boundary** of V0's creative pipeline (the `youtube-shorts` platform). The approved, consent-safe,
review-bound final video leaves V0's owned storage as a binary push (resumable upload), not a
hand-off URL; what comes back is a video id, then a processed status, then a short URL — never the
raw provider payload. Because completion is **poll-based and reconciled** (no webhook to forge), and
because V0 runs an **independent audience-facing verify** comparing channel/media-sha256/caption/
visibility/publish-time against the approved calendar post, V0 can never claim publication success
on provider acknowledgement alone. The pre-flight **3 uploads/day-per-client** quota gate makes
quota failure explicit and non-corrupting (no duplicate operation) — a V0 business guard layered
over YouTube's own per-project API quota. The `unknown`-on-timeout + reconcile-before-retry rule
prevents duplicate uploads (a re-upload would mint a new video id, so reconciliation — never a blind
re-upload — is the only safe recovery). The **Shorts ≤60s** pre-flight validation keeps the
`/shorts/{id}` URL contract honest. The unverified-project-forces-private caveat (§10) is a hard
deployment gate: an unaudited YouTube API project would force every upload private, which V0's
verify would correctly flag as `visibility_restricted` — so a verified/audited project is a
prerequisite for V0 public Shorts. This is the publication-truth half of V0's "calm, honest system
of record," mirroring Meta on the other platform.

---

## 7. Webhook signature verification — real scheme vs current code

**Real YouTube webhook scheme: none.** The YouTube Data API v3 has no webhooks. Completion is
poll-based (`GET /videos?part=status,processingDetails`). There is no inbound signature to verify.

**Current V0 code (`workspace-store.mjs` simulator callback path + `youtube-provider.mjs`):**
- The domain store drives YouTube publish completion through a signed simulator callback envelope
  routed via the `x-youtube-signature` header (`V0_API.md:819–820`), verified over **canonical JSON**
  (`stableJson(envelope)`). This is a **test convenience with no real-YouTube analogue**.
- `submitYouTubePost` `processing` mode (`youtube-provider.mjs:110–117`) models the
  accepted-then-processing state; a later `publish.processing` → `publish.completed` simulator
  callback drives `processing` → `completed`.

**Real-wiring gap (documentation; no code here):**
1. **Remove the callback-as-completion path for the live YouTube route.** Completion is purely
   poll-based: `submitYouTubePost` opens the resumable session + streams bytes → binds videoId at
   `accepted`+`processing`; `reconcileYouTubeOperation` polls `GET /videos?part=status,processingDetails`
   until `uploadStatus=processed`/`processingStatus=succeeded` → binds `publicUrl`. No callback, no
   signature, no `POST /callbacks/publishing/youtube` in the live path.
2. The `x-youtube-signature` simulator verifier stays for simulator/tests only; it must not run when
   `PUBLISHING_MODE=providers` (there is nothing to verify in the live path).
3. Keep the `processing` operation state — it maps exactly to YouTube's `uploadStatus="uploaded"` +
   `processingStatus="processing"` window (this is the one V0 status the YouTube lifecycle genuinely
   needs, unlike Meta which absorbs processing into accepted).

---

## 8. Idempotency, unknown, and retry semantics

- **One `PublishOperation` per `CalendarPost` + V0 `Idempotency-Key`:** the idempotency boundary is
  V0-side. YouTube has **no native upload idempotency key** — a re-upload would create a **new video
  id** (a duplicate video). V0 prevents this with the one-operation-per-post rule + server-side
  `requestHash`: a replay with the same `Idempotency-Key` + same post + account returns the existing
  operation (`replay: true`); a different post/account returns `IDEMPOTENCY_INPUT_CONFLICT` (409).
- **Reconcile never resubmits:** `POST /calendar-posts/{id}/publish/reconcile` only polls
  (`GET /videos?part=status,processingDetails`); it never re-opens a session or re-uploads bytes.
  If the upload never reached YouTube (e.g. session `404` before any bytes), reconcile reports
  `unknown`/`failed` and the operation fails — the user re-initiates (new publish call), which is the
  only safe way to retry an upload that never produced a video id.
- **Resumable upload session resume:** if the binary PUT fails mid-stream (`5xx`), the adapter
  resumes from the last acknowledged byte (`Range` header + 1) using the same session URI — this is
  provider-level idempotency for the byte transfer, distinct from the publish-level idempotency.
  A `404` (session expired) requires starting a new session (new POST) — but only if no video id was
  ever bound; if a video id was bound, reconcile instead.
- **Timeout after possible acceptance → `unknown`:** if V0 times out after the PUT may have
  completed (video id may exist), the operation is `UNKNOWN` and the caller must reconcile via
  `GET /videos?id={videoId}` before any retry. Never blindly re-upload (would duplicate the video).
- **Pre-flight quota gate (3/day per client):** runs before the `PublishOperation` is written; a
  refusal writes no row and never reaches YouTube. The per-client daily counter is a V0-persisted
  count (per `(workspaceId, account)` per UTC day), reset at the daily window.
- **Token refresh:** short-lived access tokens (~1h) are refreshed from the stored refresh token
  before expiry; a refresh failure mid-operation → `unknown`/`failed`; reconcile first, re-auth the
  workspace connection, never blindly retry.

---

## 9. YouTube error → V0 error code mapping

| YouTube signal | HTTP | V0 error code | Action |
|---|---|---|---|
| Invalid/expired token (`invalid_credentials`) | 401/403 | `PROVIDER_UNAVAILABLE`/operation `failed` | Refresh token; re-auth connection if refresh fails; reconcile first. |
| `invalidTitle`/`invalidDescription`/`invalidTags`/`invalidCategoryId` | 400 | `VALIDATION_FAILED` (422) | Validate caption/title/category before send. |
| `invalidPublishAt` (scheduled) | 400 | `PUBLISH_SCHEDULE_INVALID` (422) | Validate `scheduledAt` is future ISO-8601 UTC. |
| `forbiddenPrivacySetting`/`forbiddenLicenseSetting` | 403 | `VALIDATION_FAILED` (422) | Fix privacy/license value. |
| `mediaBodyRequired` (no bytes) | 400 | `PROVIDER_OUTPUT_INVALID` | Ensure clean-media bytes present. |
| `uploadLimitExceeded` (per-upload) | 400 | `VALIDATION_FAILED`/`failed` | File too large; validate ≤ max. |
| `quotaExceeded` (YouTube API quota) | 403 | `unknown`/`failed`; back off | YouTube per-project quota (distinct from V0 3/day gate). |
| `uploadStatus="failed"`/`"rejected"` / `processingStatus="failed"`/`"terminated"` | — | `PROVIDER_OUTPUT_INVALID` / `PUBLISH_PROVIDER_REJECTED` | Fail; never claim done. |
| Session `404` (URI expired) | 404 | restart session (only if no videoId bound) | New POST; if videoId bound, reconcile. |
| V0 pre-flight quota (3/day/client) | — | `PUBLISH_QUOTA_EXHAUSTED` (429) + `retryAfterMs` | Pre-I/O; no operation written; user retries/exports manually. |
| V0 pre-flight Shorts-eligibility (>60s / not 9:16) | — | `VALIDATION_FAILED`/`PUBLISH_NOT_SUBMITTABLE` | Pre-I/O; reject. |
| Timeout after possible accept | — | `unknown` | Reconcile via `GET /videos?id={videoId}` before retry. |
| Audience verify `privacyStatus != public` | — | `VERIFY_VISIBILITY_RESTRICTED` (409) | Unverified-project risk; no notification. |
| Audience verify `identity_mismatch` | — | `VERIFY_IDENTITY_MISMATCH` (409) | Retain evidence; fail; no notification. |
| Audience verify not yet live/processed | 202 | `VERIFY_PROCESSING_WAIT` | Retry after `retryAfterMs`. |

---

## 10. Limits

- **V0 upload quota (binding business gate):** **3 uploads/day per client** (per
  `(workspaceId, account)` per UTC day) — a V0-imposed pre-flight gate
  (`V0_API.md:699`; `V0_SOURCE_CALENDAR_INTEGRATIONS.md:8–11`), enforced BEFORE any I/O, returns
  `PUBLISH_QUOTA_EXHAUSTED` (429) with `retryAfterMs`. The source note flags that scaling beyond
  3/day may require multiple OAuth servers running in parallel.
- **YouTube API quota (per API project, distinct):** the `videos.insert` reference lists the video
  upload in the "Video Uploads" quota bucket at ~1 unit with a ~100-calls/day default under the
  current per-method quota model (the legacy model used 10,000 units/day with `videos.insert` at
  ~1600 units → ~6/day). **Confirm the actual quota allocation for V0's API project at deployment
  time** — the number varies by project and changes; V0's 3/day-per-client is the conservative
  binding gate regardless.
- **Unverified API project — CRITICAL:** "All videos uploaded via `videos.insert` from unverified
  API projects created after 28 July 2020 will be restricted to **private viewing mode**. An audit
  is required to lift the restriction." For V0 this means an unaudited project forces every upload
  `privacyStatus=private` (even if V0 sets `public`) → V0 audience-verify would flag
  `VERIFY_VISIBILITY_RESTRICTED`. **A verified/audited YouTube API project is a hard deployment
  prerequisite** for V0 public Shorts.
- **Shorts eligibility:** **≤ 60 seconds** + **vertical 9:16** (auto-detected by YouTube; a video
  >60s or non-vertical uploads as a regular video at `/watch?v=…`, breaking the `/shorts/{id}`
  contract). V0 pre-flight-validates duration/aspect for the `youtube-shorts` platform.
- **File size:** up to 256 GB accepted by the API (V0 short-form Reels are far smaller); chunked
  resumable upload in 256 KB multiples for large files.
- **Title ≤100 chars; description ≤5000 chars; tags total ≤500 chars** (`invalidTitle`/`invalidDescription`/`invalidTags` 400 if exceeded). V0 caption ≤2000 + title ≤100.
- **`publishAt`:** ISO-8601 UTC, only when `privacyStatus="private"` (scheduled). Immediate posts use `privacyStatus="public"`.
- **Token lifetime:** access token ~1h (refresh from stored refresh token); refresh token long-lived.
- **Reconcile/verify retry schedule:** `VERIFY_RETRY_SCHEDULE_SECONDS` default `0,60,180,420,900`.
- **Scope:** `youtube.upload` (least privilege; upload-only).

---

## 11. Cost model

YouTube Data API v3 is a **free API** (no per-upload charge). V0 therefore does **not** model a
YouTube `ProviderPriceVersion` (unlike HeyGen's per-second generation cost). Publication cost in V0
is the upstream generation cost already settled (HeyGen `CAPTURE` from the wallet — see
`HeyGen_integration.md` §7); publishing to YouTube consumes no additional wallet credit. The
operational costs (Google Cloud project + API audit, OAuth client management, B2 read bandwidth for
the upload push, token refresh infra, multi-OAuth-server scaling beyond 3/day) are platform P&L,
not `WalletLedgerEntry`. Wallet reconciliation (Owner/Admin) still matches ledger totals against
paid generation totals (`matched`/`mismatched`/`unknown`); publishing is a non-billed boundary on
the money side, but a **billed-in-truth boundary** on the publication/verify side: the
audience-evidence `Artifact` and `PerformanceSnapshot` are the retained proof of publication, not a
money event. The 3 uploads/day-per-client gate is a product constraint, not a money event.

---

## 12. Mapping to the current V0 code

| Concern | Current code | Canonical target |
|---|---|---|
| Adapter | `youtube-provider.mjs` synthesizes `yt_${slug}` externalId + fake `youtubePublicUrl` (`youtube.example.test/shorts/`); refuses `YOUTUBE_MODE != simulator` (`:90–124`, `:59–61`) | Real adapter: POST resumable session + PUT bytes → videoId at `accepted`+`processing`; poll `GET /videos?part=status,processingDetails` until `processed`/`succeeded` → bind `youtube.com/shorts/{videoId}`. |
| Mode switch | Refusal guard reads `env.YOUTUBE_MODE` (`:90`); config-catalog umbrella is `PUBLISHING_MODE` | Reconcile gating to `PUBLISHING_MODE=providers`; keep simulator for tests. |
| Keys | `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/OAuth tokens never read | Read OAuth client from env; per-workspace access+refresh tokens from `ServiceCredential`; server-only; refresh before expiry. |
| Quota gate | `checkYouTubeQuota` returns `PUBLISH_QUOTA_EXHAUSTED` on `V0_YOUTUBE_SIMULATOR_QUOTA=exhausted` (`:69–76`); real 3/day is the production contract | Real per-`(workspaceId,account)`-per-UTC-day persisted counter; 429 + `retryAfterMs` BEFORE I/O; no operation written. |
| Shorts eligibility | Not validated (simulator) | Real pre-flight: duration ≤60s + 9:16 for `youtube-shorts`; else reject pre-I/O. |
| External id | Synthesized `yt_${slug}` (from `operationId`) | videoId from the `201` resource (known immediately at upload; stable across crash window). |
| Public URL | Fake `https://youtube.example.test/shorts/{externalId}` | Real `https://www.youtube.com/shorts/{videoId}` (bound only at `completed`, after `processed`). |
| Processing state | `processing` mode returns `{accepted, processing, externalId}` (`:110–117`) — kept | Maps to YouTube `uploadStatus="uploaded"` + `processingStatus="processing"`; poll reconcile drives `completed`. |
| Reconcile | `reconcileYouTubeOperation` synthesizes status + externalId + fake publicUrl, never resubmits (`:130–142`) | Real `GET /videos?id={videoId}&part=status,processingDetails` poll; never resubmit; bind publicUrl on `processed`. |
| Completion signal | Simulator `publish.processing` → `publish.completed` callback via `x-youtube-signature` | **No real webhook.** Completion is poll-based (reconcile). Remove callback-as-completion from live path. |
| Byte transfer | Not wired (simulator stores no bytes) | Real resumable upload (POST session → PUT bytes from B2 clean-media); adapter-internal binary transfer. |
| Scheduled publish | Not wired | `privacyStatus="private"` + `publishAt={scheduledAt}` (YouTube holds, flips at `publishAt`). |
| Synthetic media | Not declared | `status.containsSyntheticMedia=true` (honest disclosure). |

**Real-wiring gap:** create the real `youtube-provider.mjs` publish path (resumable session + binary
PUT + poll) gated behind `PUBLISHING_MODE=providers`, read the OAuth client from env and the
per-workspace access+refresh tokens from `ServiceCredential`, implement the real 3/day-per-client
pre-flight quota counter + the ≤60s/9:16 Shorts-eligibility pre-flight, drive completion via
reconcile polling (not a callback), bind `youtube.com/shorts/{videoId}` only at `completed`, declare
`containsSyntheticMedia=true`, and map scheduled posts to `private`+`publishAt`. **Verify the
YouTube API project is audited** (unverified forces private → `visibility_restricted`). Keep the
simulator for tests; keep the independent audience-facing verify
(`POST /calendar-posts/{id}/verify`) as the only path to `published_verified`.

---

## 13. Summary — what the reader needs to know

- **What V0 sends (input):** a **pre-flight quota check** (3 uploads/day per client — `PUBLISH_QUOTA_EXHAUSTED`
  429 + `retryAfterMs`, no operation written) and a **Shorts-eligibility check** (≤60s + 9:16). Then a
  resumable upload: `POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` with
  the metadata JSON (`snippet.title`/`description`/`tags`/`categoryId`, `status.privacyStatus`
  (`public` or `private`+`publishAt` for scheduled), `status.containsSyntheticMedia=true`,
  `status.selfDeclaredMadeForKids`) + `X-Upload-Content-Length`/`X-Upload-Content-Type` headers +
  `Bearer {per-workspace access token}` → `Location` upload URI; then `PUT {upload URI}` streaming
  the clean-media video bytes (whole or 256 KB chunks). All after persisting the `PublishOperation`
  (`submitting`).
- **What YouTube returns (output):** a `Location` upload URI (session start), then a `201` video
  resource with the **video id** (`status.uploadStatus="uploaded"`,
  `processingDetails.processingStatus="processing"`) → poll `GET /videos?id={videoId}&part=status,processingDetails`
  until `uploadStatus="processed"` / `processingStatus="succeeded"`. **No webhook.**
- **What V0 produces (feature):** an honestly-verified audience-facing YouTube Short. The operation
  moves `submitting` → `accepted`+`processing` (videoId) → `completed` (`youtube.com/shorts/{videoId}`)
  via reconcile polling, then the independent audience-facing verify graduates the calendar post to
  `published_verified` with an immutable audience-evidence `Artifact` and initial
  `PerformanceSnapshot`. Provider acknowledgement alone never becomes success; a timeout is `unknown`
  and reconciled before retry (never a blind re-upload, which would duplicate the video); quota
  failure is explicit and non-corrupting.
- **Keys needed:** `PUBLISHING_MODE`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`,
  `PUBLISH_CALLBACK_BASE_URL` (simulator only), `VERIFY_RETRY_SCHEDULE_SECONDS`; plus a
  **per-workspace OAuth access+refresh token** (scope `youtube.upload`) stored as a
  `ServiceCredential`. Client secret + tokens are server-only; never browser/log/artifact.
- **Real-wiring gap:** no live adapter; the simulator drives completion via a signed callback
  envelope (`x-youtube-signature`, canonical JSON) that has **no real-YouTube analogue**. A real
  `youtube-provider.mjs` (resumable session + binary PUT + poll), OAuth token refresh, the real
  3/day-per-client quota counter, the ≤60s/9:16 Shorts-eligibility pre-flight, reconcile-driven
  completion, `containsSyntheticMedia` disclosure, and **an audited YouTube API project** (unverified
  forces private → `visibility_restricted`) are required before real publication — always behind
  the independent audience-facing verify.

---

## Sources

- developers.google.com/youtube/v3/docs/videos/insert — `POST /upload/youtube/v3/videos`, scopes (`youtube.upload`), `part`, `notifySubscribers`, max 256 GB, accepted MIME types, errors (`invalidTitle`/`invalidPublishAt`/`uploadLimitExceeded`/`forbiddenPrivacySetting`/etc.), the unverified-project-forces-private caveat (28 July 2020)
- developers.google.com/youtube/v3/docs/videos#resource — video resource fields: `id`, `snippet` (`title`/`description`/`tags`/`categoryId`/`defaultLanguage`/`publishedAt`/`thumbnails`), `status` (`uploadStatus`: uploaded/processed/failed/rejected/deleted; `privacyStatus`: public/private/unlisted; `publishAt`; `license`; `embeddable`; `selfDeclaredMadeForKids`; `containsSyntheticMedia`), `processingDetails` (`processingStatus`: processing/succeeded/failed/terminated; `processingProgress`: partsTotal/partsProcessed/timeLeftMs)
- developers.google.com/youtube/v3/guides/using_resumable_upload_protocol — resumable upload: POST session (metadata + `X-Upload-Content-Length`/`Type`) → `Location` URI; PUT bytes (whole or 256 KB chunks + `Content-Range`); `308 Resume Incomplete` + `Range`; resume from `Range+1`; `201` + video resource; `5xx` resume; `404` session expired
- developers.google.com/youtube/v3/guides/auth — OAuth scopes (`youtube.upload` least-privilege), access (~1h) + refresh token model
- `docs/V0/V0_API.md` §V0-U2/U3 (publish + reconcile, YouTube quota gate + accepted→processing→completed lifecycle) and §V0-U4 (audience-facing verify) — publication contract
- `docs/V0/V0_STATUS_ENUMS.md` — publish + calendar statuses
- `docs/V0/V0_JOBS.md` — reconcile/verify retry schedule
- `docs/V0/V0_SECURITY.md` — tenant isolation, callback signature, replay protection
- `docs/V0/V0_PERMISSIONS.md` — `schedule_publish_approved_media`
- `docs/V0/Source_Notes/V0_SOURCE_CALENDAR_INTEGRATIONS.md` — YouTube 3 uploads/day per client, quota/audit watch, multi-OAuth-server scaling note
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — publishing key names (`PUBLISHING_MODE`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `PUBLISH_CALLBACK_BASE_URL`, `VERIFY_RETRY_SCHEDULE_SECONDS`)
- `apps/api/src/youtube-provider.mjs` — current simulator publishing path (code-grounded)
