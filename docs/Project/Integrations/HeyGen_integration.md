# HeyGen Integration — How HeyGen Delivers Video (URL, Not File)

Status: In-depth reference for the real HeyGen provider adapter. Documents HeyGen's actual API
behaviour, the exact request/response JSON, the keys required, and how V0's domain inputs map to
HeyGen's API and back to V0's feature output.
Date verified: 2026-07-02 (against developers.heygen.com reference docs, read directly).

Companion documents (in this folder):
- `docs/Project/Integrations/API_INTEGRATION_KEYS.md` — credential/parameter inventory
- `docs/Project/Integrations/API_AND_INTEGRATION_WIRING_REQUIRED.md` — final-wiring checklist
- `docs/Project/Integrations/BACKEND_API_WIRING_AUDIT.md` — current simulator-state audit

Canonical V0 contracts (these own the product behaviour; this doc is the provider-side companion):
- `docs/V0/V0_HEYGEN_INTEGRATION.md`
- `docs/V0/V0_HEYGEN_COST_MODEL.md`
- `docs/V0/V0_API.md`, `docs/V0/V0_DATA_MODELS.md`

Sources: HeyGen official developer docs —
developers.heygen.com/reference/create-video, /reference/get-video, /docs/webhooks,
/docs/webhook-events, /docs/upload-assets, /docs/usage-limits.

---

## 0. The key fact

**HeyGen does not return the generated video file in any API response.** Generation is
asynchronous: you submit a generate request, HeyGen returns a `video_id`, and when the video is
ready HeyGen provides a **presigned video URL** (transient, time-limited) that you download the
finished MP4 from. The video file itself is never streamed inline, chunked, or attached — only a
URL is exchanged.

> **HeyGen sends a video URL, not an entire file.**

This is the single most important integration behaviour and the reason no chunking is required on
either side. V0 must download that URL once, retain the bytes to owned B2 storage, and never
persist the transient HeyGen URL.

---

## 1. Integration keys and configuration

HeyGen uses a **platform-level API key**, not per-workspace OAuth. The key is a deployment-level
environment secret (not a `ServiceCredential`). Source: `API_INTEGRATION_KEYS.md` §HeyGen.

| Variable | Required | Expected value / type | Used for |
|---|---|---|---|
| `HEYGEN_MODE` | yes | `"simulator"` (default) or `"api"` | Selects the simulator vs live adapter. Current code refuses `"api"` until the live adapter is implemented (`apps/api/src/heygen-provider.mjs:66`). |
| `HEYGEN_API_BASE_URL` | yes (live) | HTTPS URL, e.g. `https://api.heygen.com` | Base for `POST /v3/videos`, `GET /v3/videos/{id}`, `POST /v3/webhooks/endpoints`. |
| `HEYGEN_API_KEY` | yes (live) | HeyGen dashboard API key (secret) | Sent as `x-api-key` header (or `Authorization: Bearer`). Never in browser code, logs, or analytics. |
| `HEYGEN_WEBHOOK_SECRET` | yes (live) | Endpoint `secret` returned once by `POST /v3/webhooks/endpoints` (e.g. `whsec_…`) | HMAC-SHA256 key for verifying `Heygen-Signature`. Stored in secret manager, not `.env`-committed. |
| `HEYGEN_CALLBACK_URL` | yes (live) | Public HTTPS URL of V0's `POST /callbacks/heygen` route | Registered as the webhook endpoint URL; also usable as per-request `callback_url`. |
| `HEYGEN_CONCURRENCY_LIMIT` | yes | Integer `1`–`10` | V0-side cap on in-flight HeyGen jobs (HeyGen async pay-as-you-go limit = 10 concurrent). |
| `HEYGEN_MAX_SCRIPT_CHARACTERS` | yes | Integer, default `5000` | V0-side script-length validation (matches HeyGen's 5,000-char script limit). |

**Prices are NOT environment variables.** They are `ProviderPriceVersion` DB rows (global,
non-tenant) holding `rateMinorPerSecond` in integer minor units per `provider` + `priceVersion`.
The estimate binds the active version; see §7 (Cost model).

**Object storage dependency.** The adapter must retain the downloaded MP4 to V0-owned Backblaze
B2. Therefore the HeyGen integration also depends on the B2 keys in `API_INTEGRATION_KEYS.md`
§Backblaze B2 (`OBJECT_STORAGE_PROVIDER=b2`, `OBJECT_STORAGE_ENDPOINT/REGION/KEY_ID/APPLICATION_KEY`,
`B2_BUCKET_CLEAN_MEDIA`, `SIGNED_DOWNLOAD_TTL_SECONDS`, `MAX_UPLOAD_BYTES`). Until the B2 adapter
is real, retained media has nowhere to live.

**Simulator-only controls** (local/staging; not provider keys): `V0_HEYGEN_SIMULATOR_MODE`
(`success|timeout|malformed|duplicate`), `V0_HEYGEN_SIMULATOR_RECONCILE`
(`accepted|processing|completed|failed|pending`), `V0_HEYGEN_SIMULATOR_SECRET`,
`V0_HEYGEN_CONCURRENCY_LIMIT`, `V0_G5_SIMULATOR_MODE`
(`success|malformed_media|cost_mismatch|crash_after_retain`). These stay for tests after the live
adapter is added.

**Where secrets live:** `HEYGEN_API_KEY` and `HEYGEN_WEBHOOK_SECRET` are deployment-level env
secrets (secret manager). HeyGen does NOT use workspace `ServiceCredential` rows — there is one
platform account. (Workspace OAuth credentials are used by the *publishing* providers Meta/YouTube,
not by HeyGen.)

---

## 2. Authentication and request headers

HeyGen v3 accepts either auth scheme (use the first; it is simplest):

| Header | Value | Notes |
|---|---|---|
| `x-api-key` | `<HEYGEN_API_KEY>` | "HeyGen API key. Obtain from your HeyGen dashboard." Primary method. |
| `Authorization` | `Bearer <token>` | Alternative (OAuth2 bearer). |
| `Content-Type` | `application/json` | All create/status requests are JSON. |
| `Idempotency-Key` | client string matching `^[A-Za-z0-9_\-:.]{1,255}$` | Optional but **required for V0**. Replays the original response within 24 h; a concurrent retry returns `409 request_in_progress`. V0 derives this from its `requestHash`/operation id (see §6). |
| `Accept` | `application/json` | Optional. |

Errors use a single envelope (see §5.4): `{ "error": { "code", "message", "param", "doc_url" } }`.

---

## 3. The end-to-end flow

### Step 1 — Generate: `POST /v3/videos` (single JSON body, no file, no multipart)

V0 sends one JSON request describing the video it wants. HeyGen responds with a `video_id` and an
initial `status` of `"waiting"`. **No video bytes are sent or returned.**

**Headers:**
```
POST {HEYGEN_API_BASE_URL}/v3/videos
x-api-key: {HEYGEN_API_KEY}
Content-Type: application/json
Idempotency-Key: {v0-idempotency-key}
```

**Request body (V0 path = `type: "avatar"`, catalog avatar + text script):**
```json
{
  "type": "avatar",
  "avatar_id": "Wayne_20240716",
  "script": "What if your next home already had the paperwork sorted? At Ashoka Greens, handover-ready towers come with RERA-compliant documentation on file. Site visits are open this weekend.",
  "voice_id": "075ab2b118bb4429b7a93a67de94c842",
  "voice_settings": {
    "speed": 1.0,
    "pitch": 0,
    "volume": 1.0,
    "locale": "en-IN"
  },
  "resolution": "1080p",
  "aspect_ratio": "9:16",
  "output_format": "mp4",
  "engine": { "type": "avatar_iv" },
  "callback_url": "https://api.sakhaaforge.example/api/v0/callbacks/heygen",
  "callback_id": "op_0192f3a1-7c4b-7f2a-9a01-1c8d2e6b9a33"
}
```

**Success response (HTTP 200):**
```json
{
  "data": {
    "video_id": "v_abc123def456",
    "status": "waiting",
    "output_format": "mp4"
  }
}
```
V0 stores `video_id` as `ProviderOperation.externalId` and advances the operation to `accepted`.

**Error responses** (envelope `{ "error": { code, message, param, doc_url } }`):

| HTTP | `code` | Meaning / V0 handling |
|---|---|---|
| 400 | `invalid_parameter` | Bad field → V0 `VALIDATION_FAILED` (do not retry blindly). |
| 401 | `authentication_failed` | Bad/expired key → V0 `PROVIDER_UNAVAILABLE` (config). |
| 409 | `request_in_progress` | Idempotency key in flight → treat as accepted/duplicate, reconcile. |
| 429 | `rate_limit_exceeded` | Includes `Retry-After` (seconds) → retryable; respect `HEYGEN_CONCURRENCY_LIMIT`. |

### Step 2 — Wait for completion: webhook (primary) OR polling (fallback)

Both are valid; V0 uses the webhook as primary and `POST /generation-jobs/{jobId}/reconcile`
(polling) as the safety net for `unknown`/timeout recovery.

**Webhook setup.** Register one persistent endpoint to obtain the signing secret:
```
POST {HEYGEN_API_BASE_URL}/v3/webhooks/endpoints
x-api-key: {HEYGEN_API_KEY}
Content-Type: application/json

{ "url": "{HEYGEN_CALLBACK_URL}", "events": ["avatar_video.success", "avatar_video.fail"] }
```
Response includes `secret` (e.g. `whsec_…`) **shown once** — store it as `HEYGEN_WEBHOOK_SECRET`.
Rotate via `POST /v3/webhooks/endpoints/{endpoint_id}/rotate-secret`. Also pass `callback_id`
(= V0 `operationId`) on each create request so the webhook can be correlated to the operation.

**Webhook delivery to V0 `POST /callbacks/heygen`:**
```
Heygen-Signature: {hex-hmac-sha256-of-raw-body}
Heygen-Timestamp: 1719900000
Heygen-Event-Id: evt_01H8…
Content-Type: application/json

{ "event_type": "avatar_video.success", "event_data": { "video_id": "v_abc123def456", "url": "https://files.heygen.ai/…/v_abc123def456.mp4", "gif_download_url": "…", "video_page_url": "…", "video_share_page_url": "…", "folder_id": "…", "callback_id": "op_0192f3a1-7c4b-7f2a-9a01-1c8d2e6b9a33" } }
```
- Respond `2xx` within 10 seconds; HeyGen retries with exponential backoff for up to 24 h.
- De-duplicate using `Heygen-Event-Id` (primary replay defense) plus V0's `inbox_events`
  `(workspaceId, 'heygen', eventId)` unique row.

**Polling fallback — `GET /v3/videos/{video_id}`:**
```
GET {HEYGEN_API_BASE_URL}/v3/videos/v_abc123def456
x-api-key: {HEYGEN_API_KEY}
```
**Response (HTTP 200)** — `VideoDetail`:
```json
{
  "data": {
    "id": "v_abc123def456",
    "status": "completed",
    "created_at": 1719900000,
    "completed_at": 1719900180,
    "video_url": "https://files.heygen.ai/…/v_abc123def456.mp4",
    "captioned_video_url": "https://files.heygen.ai/…/v_abc123def456_captioned.mp4",
    "subtitle_url": "https://files.heygen.ai/…/v_abc123def456.srt",
    "thumbnail_url": "https://files.heygen.ai/…/v_abc123def456.jpg",
    "gif_url": "https://files.heygen.ai/…/v_abc123def456.gif",
    "duration": 27.4,
    "video_page_url": "https://app.heygen.com/…/v_abc123def456",
    "folder_id": null,
    "output_language": null,
    "failure_code": null,
    "failure_message": null
  }
}
```
`status` enum: `pending | processing | completed | failed`. On `failed`, read `failure_code` /
`failure_message`. Polling errors: 404 `not_found`, 401 `authentication_failed`, 429
`rate_limit_exceeded` (with `Retry-After`).

### Step 3 — Retrieve: one whole GET of the presigned URL

`video_url` (or `captioned_video_url`) is a **presigned HTTPS URL on `files.heygen.ai`** (CDN/S3),
time-limited. Download the MP4 in a **single GET** — no chunked/segmented/resumable download API
exists at any size. Fetch promptly; if expired, re-fetch via `GET /v3/videos/{id}`. V0 then hashes
the bytes, computes size/duration/content-type/resolution, retains the file to B2, and **never
stores the transient HeyGen URL**.

---

## 4. Full request body schema — `POST /v3/videos`

The body is a `oneOf` discriminated by `type`. V0 uses **Variant A (`"avatar"`)** with a text
script and a catalog/consent avatar. Variants B and C are documented for completeness; they are
not in the V0 short-form real-estate path.

### Variant A — `CreateVideoFromAvatar` (`type: "avatar"`) — V0 path

Required: `type`, `avatar_id`. All other fields optional.

| Field | Type | Required | Allowed values | Description |
|---|---|---|---|---|
| `type` | string (const) | yes | `"avatar"` | Discriminator. |
| `avatar_id` | string | yes | HeyGen avatar/look ID | "Video avatar or photo avatar look ID." V0 source: consent-bound avatar profile. |
| `title` | string \| null | no | — | Dashboard title. Default `null`. |
| `script` | string (min 1) \| null | no* | text ≤ 5000 chars | TTS script. Mutually exclusive with `audio_url`/`audio_asset_id`. V0 source: approved script text. |
| `voice_id` | string \| null | no* | HeyGen voice ID | Required when `script` is provided unless `avatar_id` carries a default voice. V0 source: avatar/brand voice. |
| `audio_url` | string \| null | no | public URL | Audio for lip-sync; mutually exclusive with `script`. Not used by V0 text path. |
| `audio_asset_id` | string \| null | no | HeyGen asset ID | Uploaded audio; mutually exclusive with `script`. |
| `voice_settings` | object \| null | no | see below | Voice tuning; applies only with `script` + `voice_id`. |
| `resolution` | string \| null | no | `"4k"`, `"1080p"`, `"720p"` | Output resolution. V0 pilot: `"1080p"`. |
| `aspect_ratio` | string \| null | no | `"16:9"`, `"9:16"`, `"4:5"`, `"5:4"`, `"1:1"`, `"auto"` | Default `"16:9"`. V0 short-form: `"9:16"`. |
| `fit` | string \| null | no | `"contain"`, `"cover"` | `cover` fills (may crop); `contain` fits (may show bg). Server auto-selects when omitted. |
| `background` | object \| null | no | see below | Background config. |
| `remove_background` | boolean \| null | no | — | Requires matting-enabled video avatar. |
| `output_format` | string | no | `"mp4"`, `"webm"` | Default `"mp4"`. `webm` = transparent bg (needs matting-capable avatar). V0: `"mp4"`. |
| `callback_url` | string \| null | no | HTTPS URL | One-off webhook URL (alternative to registered endpoint). |
| `callback_id` | string \| null | no | caller-defined | Echoed in webhook payload for correlation. V0 sets = `operationId`. |
| `watermark` | object \| null | no | — | Custom watermark (Enterprise). Not used by V0. |
| `caption` | object \| null | no | — | Caption settings; sidecar SRT always returned via `subtitle_url`. |
| `motion_prompt` | string \| null | no | natural language | Body motion/gestures; photo avatars or Avatar V only; rejected for Avatar IV video avatars. |
| `expressiveness` | string \| null | no | `"high"`, `"medium"`, `"low"` | Photo avatars only; default `"low"`. |
| `engine` | object \| null | no | see below | Engine selection; defaults to Avatar IV when omitted. |

\* V0 always sends `script` + `voice_id` together (text path). One of `script` / `audio_url` /
`audio_asset_id` must be present; HeyGen rejects "exactly one visual source" otherwise.

**`voice_settings` sub-object:**

| Sub-field | Type | Default | Range | Description |
|---|---|---|---|---|
| `speed` | number | `1` | `0.5`–`1.5` | Playback speed multiplier. |
| `pitch` | number | `0` | `-50`–`+50` | Pitch in semitones. |
| `volume` | number | `1` | `0`–`1` | Voice volume. |
| `locale` | string \| null | `null` | e.g. `"en-IN"` | Locale/accent hint. |
| `engine_settings` | object \| null | `null` | discriminated by `engine_type` | Engine-specific tuning: `"elevenlabs"`, `"fish"`, or `"starfish"`. |

`engine_settings.elevenlabs`: `model` (`eleven_multilingual_v2` | `eleven_turbo_v2_5` |
`eleven_flash_v2_5` | `eleven_v3`), `similarity_boost` (0–1), `stability` (0–1), `style` (0–1),
`use_speaker_boost` (bool). `engine_settings.fish`: `model` (`s1` | `s2-pro`), `stability` (0–1),
`similarity` (0–1). `engine_settings.starfish`: no tunable fields.

**`engine` sub-object (discriminated by `type`):**

| Engine | `type` | Extra fields | V0 use |
|---|---|---|---|
| Avatar III | `"avatar_iii"` | none; no `motion_prompt`/`expressiveness` | not used |
| Avatar IV (default) | `"avatar_iv"` | none | photo-avatar pilot path |
| Avatar V | `"avatar_v"` | `reference_look_id` (string \| null) — instant_avatar look as animation reference | digital twin/studio path |

**`background` sub-object:** `type` (`"color"` | `"image"`); `value` (hex color, required when
`type="color"`); `url` and `asset_id` (mutually exclusive, for `type="image"`).

### Variant B — `CreateVideoFromImage` (`type: "image"`)
Required: `type`, `image` (discriminated: `url` | `asset_id` | `base64`). Same fields as avatar
variant except no `avatar_id`, no `engine`. `motion_prompt` is "photo avatars only." Not the V0
text path.

### Variant C — `CreateVideoFromCinematicAvatar` (`type: "cinematic_avatar"`)
Required: `type`, `prompt` (1–10000 chars), `avatar_id` (array of 1–3 look IDs). Extra:
`references` (asset inputs), `auto_duration` (bool), `duration` (int 4–15, default 10),
`enhance_prompt` (bool). No script/voice/audio fields. Resolution limited to `720p`/`1080p`;
aspect ratio limited to `16:9`/`9:16`/`1:1`. Cinematic pricing is per-video, not per-second (see
`V0_HEYGEN_COST_MODEL.md`). Not the V0 pilot path.

---

## 5. Full response schemas

### 5.1 Create response — `CreateAvatarVideoResponse` (HTTP 200)
```json
{ "data": { "video_id": "string", "status": "waiting", "output_format": "mp4" } }
```
- `video_id` (string, required) — unique video identifier → V0 `ProviderOperation.externalId`.
- `status` (string, required) — initial status (e.g. `"waiting"`).
- `output_format` (`"mp4"` | `"webm"`, optional, default `"mp4"`) — resolved output format.

### 5.2 Get-video response — `VideoDetail` (HTTP 200)
| Field | Type | Description |
|---|---|---|
| `id` | string | Unique video identifier. |
| `title` | string \| null | Video title. |
| `status` | string (`pending` \| `processing` \| `completed` \| `failed`) | Current status. |
| `created_at` | integer \| null | Unix timestamp (seconds) of creation. |
| `completed_at` | integer \| null | Unix timestamp when generation finished. |
| `video_url` | string \| null | **Presigned URL to download the MP4.** Transient. |
| `captioned_video_url` | string \| null | Presigned URL for captions-burned-in MP4. |
| `subtitle_url` | string \| null | Presigned URL for SRT subtitle. |
| `thumbnail_url` | string \| null | Thumbnail image URL. |
| `gif_url` | string \| null | Animated GIF preview URL. |
| `duration` | number \| null | Duration in seconds → V0 `durationSeconds`. |
| `folder_id` | string \| null | Containing folder ID. |
| `output_language` | string \| null | BCP-47 code (translated videos only). |
| `failure_code` | string \| null | Machine-readable failure reason (only when `status="failed"`). |
| `failure_message` | string \| null | Human-readable failure description (only when `failed`). |
| `video_page_url` | string \| null | URL to the video page in the HeyGen app. |

### 5.3 Webhook payload
Top-level JSON contains `event_type` plus an `event_data` object. For `avatar_video.success`:
```json
{
  "event_type": "avatar_video.success",
  "event_data": {
    "video_id": "v_abc123def456",
    "url": "https://files.heygen.ai/…/v_abc123def456.mp4",
    "gif_download_url": "…",
    "video_page_url": "…",
    "video_share_page_url": "…",
    "folder_id": "…",
    "callback_id": "op_0192f3a1-7c4b-7f2a-9a01-1c8d2e6b9a33"
  }
}
```
`avatar_video.fail` carries the same correlation fields plus a failure reason. **Confirm the exact
`event_data` field set against `developers.heygen.com/docs/webhook-events` at deployment time** —
the webhook overview page defers the full payload schema to that page. Headers are certain:
`Heygen-Signature`, `Heygen-Timestamp`, `Heygen-Event-Id`.

### 5.4 Error envelope — `StandardAPIError`
```json
{ "error": { "code": "invalid_parameter", "message": "…", "param": "avatar_id", "doc_url": null } }
```
`code` (string, required), `message` (string, required), `param` (string \| null),
`doc_url` (string \| null).

---

## 6. V0 input → HeyGen request mapping (what V0 sends)

This is the second-order connection: V0's domain objects become HeyGen API fields. V0 already
holds the creative inputs at generation-submit time — they are bound into the `GenerationJob` and
hashed into `requestHash` (`apps/api/src/workspace-store.mjs:16375–16388`,
`computeProviderRequestHash` = sha256 over `{ jobId, selectedScriptId, avatarProfileId,
durationSeconds, priceVersion, provider: "heygen" }`).

| V0 domain object / field | HeyGen request field | Notes |
|---|---|---|
| `GenerationJob.workspaceId` | (tenant scope; not sent to HeyGen) | V0 keeps tenancy; HeyGen sees only the platform account. |
| `GenerationJob.selectedScriptId` → approved script text (V0-S1 tournament winner) | `script` | Validate ≤ `HEYGEN_MAX_SCRIPT_CHARACTERS` (5000) before send. |
| `GenerationJob.avatarProfileId` → consent-bound avatar profile | `avatar_id` | Consent eligibility checked server-side first (`AVATAR_CONSENT_REQUIRED` if pending). |
| Avatar profile → brand voice | `voice_id` | From avatar/brand profile. |
| Brand/avatar voice defaults | `voice_settings` `{speed, pitch, volume, locale, engine_settings}` | V0 supplies only the fields it intends to tune; omitted fields use HeyGen defaults. |
| Avatar tier (photo / digital twin / studio) | `engine.type` (`avatar_iv` / `avatar_v`) | Photo-avatar pilot → `avatar_iv`; digital twin/studio → `avatar_v` (+ `reference_look_id`). |
| V0 short-form vertical product | `aspect_ratio` = `"9:16"`, `resolution` = `"1080p"`, `output_format` = `"mp4"` | Pilot cap 30 s; 1080×1920. |
| `ProviderOperation.id` | `callback_id` | Echoed in webhook → correlates webhook to the operation. |
| `HEYGEN_CALLBACK_URL` | `callback_url` (and registered endpoint URL) | Where HeyGen posts `avatar_video.success/fail`. |
| `ProviderOperation.idempotencyKey` / `requestHash` | `Idempotency-Key` header | Must match `^[A-Za-z0-9_\-:.]{1,255}$`; V0 derives a safe substring of the operation id / requestHash. |
| `HEYGEN_API_KEY` | `x-api-key` header | Deployment secret. |

**Contract gap the real adapter must close.** Today `submitHeygenVideo(env, request)` receives
only `{ operationId, requestHash, mode }` (`workspace-store.mjs:1171–1175` / `8428–8432`) — the
script text, `avatar_id`, `voice_id`, aspect, resolution, and engine are **not passed to the
adapter**; they are hashed away server-side. To build the real `POST /v3/videos` body, the call
site must pass the creative payload (script text, avatar_id, voice_id, voice_settings, aspect,
resolution, engine, callback_id, idempotency key) into the adapter. This is a signature change on
the adapter boundary, independent of chunking.

**Persist before I/O.** V0 must create the `ProviderOperation` row (status `SUBMITTING`,
`idempotencyKey`, `requestHash`) **before** calling HeyGen, so a crash between persist and response
leaves a resumable operation, never a blind duplicate (`docs/V0/V0_API.md:365`).

---

## 7. HeyGen response → V0 output mapping (what V0 gets back, by feature)

The integration's product output is not "a URL" — it is a **consent-safe, cost-settled, retained
generated video segment** that downstream stages compose and publish. Mapping:

| HeyGen response | V0 object / action | Feature meaning |
|---|---|---|
| Create `video_id` | `ProviderOperation.externalId = video_id`, status → `accepted`; `GenerationJob.status` → `submitted`/`generating` | "HeyGen accepted the job." Operation is resumable; reconcile or webhook will advance it. |
| Webhook `avatar_video.success` (verified) OR poll `status: completed` | Operation → `COMPLETED`; job → `generated` exactly once (dedup via `Heygen-Event-Id` + `inbox_events`) | "The video is done." Triggers media fetch + settlement. |
| Webhook `avatar_video.fail` OR poll `status: failed` (`failure_code`) | Operation → `FAILED`; job → `failed`; RELEASE ledger entry | "Generation failed." Credits released; no media retained. |
| `video_url` (presigned) | Adapter downloads whole MP4 → `Artifact` (`QUARANTINED` → `CLEAN`), `objectKey` in B2 clean-media bucket | "V0 owns the retained production copy." Transient URL is discarded. |
| Downloaded bytes | `sha256`, `byteSize`, `contentType` (`video/mp4`), `durationSeconds` (from `duration` or probed), `resolution` (`{width:1080,height:1920}`) | Integrity + retention metadata; validated (non-zero size, positive duration, supported content type). |
| `duration` × `ProviderPriceVersion.rateMinorPerSecond` | `providerTotalMinor` (integer minor units) | Actual provider charge. |
| `providerTotalMinor` vs estimate `maximumAuthorizedMinor` | `CAPTURE` ledger entry if ≤; else `PROVIDER_COST_EXCEEDS_AUTHORIZATION` (refuse + refund difference) | Money truth: never over-charge, never over-capture. |
| Settled descriptor | `GeneratedSegment` `{externalId, durationSeconds, contentType, byteSize, sha256, artifactId}` + `GeneratedAsset` `{kind: "provider_video", …}` + `CreativeLineage` (brandProfile/script/avatar/estimate/priceVersion/finalVideo) | Lineage root: this generated segment is the creative input to composition and the audit trail for the published ad. |

**Feature-level outcome (second order).** The HeyGen integration converts an *approved script +
consent-bound avatar + authorized budget* into a *retained, verifiable, billed generated video
segment*. That segment is the input to the AE composition stage (which renders the final video),
which flows to review → calendar post → publish (Meta/YouTube) → audience verification →
performance. So HeyGen is the **creative-generation root** of the V0 pipeline: every downstream
artifact (final video, calendar post, published ad, verified observation, performance snapshot)
traces lineage back to this `ProviderOperation`. If HeyGen does not know (timeout after acceptance),
V0 keeps `unknown` and reconciles before any retry — it never blindly re-submits paid work.

---

## 8. Webhook signature verification (real scheme)

The real HeyGen scheme differs from the current V0 simulator verifier
(`apps/api/src/workspace-store.mjs:16357–16369`, which checks `x-heygen-signature` over canonical
key-sorted JSON). It also differs from the row in `API_INTEGRATION_KEYS.md` §HeyGen
("V0 callback verification … `x-heygen-signature` … HMAC-SHA256 over the canonical envelope"),
which describes the simulator, not the live provider. **A real HeyGen webhook would fail the
current verifier.** The real scheme:

- **Header:** `Heygen-Signature` (not `x-heygen-signature`).
- **Signature:** hex-encoded HMAC-SHA256 of the **raw request body**, keyed with the endpoint
  `secret` (`HEYGEN_WEBHOOK_SECRET`, e.g. `whsec_…`).
- **Companion headers:** `Heygen-Timestamp` (Unix seconds; reject if skew > ~5 min) and
  `Heygen-Event-Id` (dedup — primary replay defense).
- **Critical:** compute the HMAC over the **raw bytes**, not re-serialized JSON — any whitespace
  or key-order change breaks the signature. Use constant-time comparison
  (`crypto.timingSafeEqual`).

**Verification (Node):**
```js
// rawBody must be the unparsed request bytes (capture before JSON parse in Fastify)
const expected = createHmac("sha256", HEYGEN_WEBHOOK_SECRET).update(rawBody).digest("hex");
const ok = expected.length === signature.length
  && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
const ageOk = Math.abs(Date.now()/1000 - Number(timestamp)) <= 300; // 5 min
// then dedup by Heygen-Event-Id via inbox_events(workspaceId,'heygen',eventId)
```
**Confirm the exact signing string** (whether the timestamp is prefixed) against HeyGen's
verification sample at deployment. The docs state the HMAC is over the raw body; enforce
`Heygen-Timestamp` skew as a separate window check.

**Route implication:** `POST /callbacks/heygen` (`apps/api/src/server.mjs`) must receive the
**raw body** for verification, not the parsed `request.body` it currently passes
(`workspace-store.mjs:16357–16369` signs/verifies canonical JSON). Raw-body capture is a Fastify
pre-parse hook change.

---

## 9. Idempotency, unknown, and retry semantics

- **Idempotency-Key** on `POST /v3/videos`: V0 sends a stable key derived from the operation
  identity. A replay within 24 h returns the original response; a concurrent retry returns `409
  request_in_progress` (treat as accepted, then reconcile).
- **Persist before I/O:** the `ProviderOperation` row is written before the HeyGen call, so a
  crash leaves a `SUBMITTING`/`UNKNOWN` operation that reconcile can resolve — never a blind
  duplicate paid submission.
- **Timeout after possible acceptance → `unknown`:** if the HTTP request times out after HeyGen
  may have accepted, V0 marks the operation `UNKNOWN` and reconciles via `GET /v3/videos/{id}`
  (using the idempotency key / externalId) before any retry. Never blindly re-submit.
- **Reconcile never resubmits:** `reconcileHeygenOperation` only queries; `pending` stays
  `unknown: true`; `completed` advances; `failed` fails.
- **Rate limits:** `429` + `Retry-After` → retryable, honoring `HEYGEN_CONCURRENCY_LIMIT` (≤10).

---

## 10. HeyGen error → V0 error code mapping

| HeyGen signal | V0 error code | Action |
|---|---|---|
| `401 authentication_failed` | `PROVIDER_UNAVAILABLE` | Config/secret issue; do not retry from job path. |
| `400 invalid_parameter` | `VALIDATION_FAILED` | Bad input; surface to caller; do not blind-retry. |
| `409 request_in_progress` | (treat as accepted) | Reconcile to resolve externalId. |
| `429 rate_limit_exceeded` (+ `Retry-After`) | retryable | Back off; respect concurrency limit. |
| Timeout after possible accept | `unknown` | Reconcile before retry. |
| `status: failed` / `failure_code` | `PROVIDER_OUTPUT_INVALID` (or `ASSET_MEDIA_MALFORMED` if media unreadable) | Fail job; RELEASE credits. |
| Downloaded media unreadable / wrong type | `ASSET_MEDIA_MALFORMED` | Block promotion to CLEAN; fail. |
| `providerTotalMinor > maximumAuthorizedMinor` | `PROVIDER_COST_EXCEEDS_AUTHORIZATION` | Refuse + refund difference; fail. |

---

## 11. No chunking anywhere

- **Generate:** single whole JSON POST (`application/json`).
- **Retrieve:** single whole file GET of the presigned `video_url`.
- **Custom asset uploads** (not in V0 scope): `POST /v3/assets` multipart ≤ 32 MB; > 32 MB uses a
  3-step init / PUT / complete flow where the PUT is a **single whole-file PUT** to a presigned URL
  — still not chunked or resumable.
- HeyGen's docs never mention chunked, multipart-by-parts, or resumable upload/download. The
  absence of a chunking requirement is itself the answer.
- V0's adapter boundary never moves media bytes anyway (`fetchHeygenMedia` returns a
  descriptor-only object), so any byte handling is adapter-internal — the store contract is
  unchanged.

---

## 12. Limits (validate at deployment time)

- Script: 5,000 characters (`HEYGEN_MAX_SCRIPT_CHARACTERS`).
- Avatar audio: 10 minutes (600 s).
- Input video: 100 MB (<2K). Input image: 50 MB. Input audio: 50 MB.
- Async pay-as-you-go: 10 concurrent jobs (`HEYGEN_CONCURRENCY_LIMIT`). Respect `429`/`Retry-After`.
- Max video duration: 30 minutes. Output: 128–4096 px per side, default 1080p, 25 fps, up to 50
  scenes.
- V0 is short-form: 5–90s, pilot cap 30s, 1080×1920 vertical → output is low-MB; single whole
  download is normal.

---

## 13. Cost model (duration-based, DB-backed)

- Cost = `durationSeconds × rateMinorPerSecond`, from a `ProviderPriceVersion` DB row (global,
  non-tenant), integer minor units. Example rates: photo avatar 720p/1080p ≈ $0.05/sec; digital
  twin/studio ≈ $0.0667/sec; Video Agent ≈ $0.0333/sec; Cinematic $7/video. Treat prices as
  configuration, not constants.
- The current hardcoded `HEYGEN_SIMULATOR_RATE_MINOR_PER_SECOND = 1600`
  (`heygen-provider.mjs:129`) is a simulator stand-in for the seeded `heygen-simulator v0.local.1`
  price row. The real adapter must look up the active `ProviderPriceVersion` bound at estimate time.
- `byteSize` and `sha256` are for retention integrity, dedup, and quarantine validation, **not
  billing**.
- Settlement: `providerTotalMinor` (from `duration × rate`) is compared to the estimate's
  `maximumAuthorizedMinor` (48,000 minor for the 30s pilot cap). Overrun →
  `PROVIDER_COST_EXCEEDS_AUTHORIZATION`; under/equal → `CAPTURE` (refund the difference between
  authorized and actual).

---

## 14. Mapping to the current V0 adapter boundary (code)

The adapter boundary is descriptor-only: `fetchHeygenMedia` returns
`{ externalId, sha256, durationSeconds, contentType, byteSize, resolution, providerTotalMinor }`
(`apps/api/src/heygen-provider.mjs:143–173`); the store persists only the descriptor and an
`objectKey` reference (`workspace-store.mjs:4895–4936` in-memory, `10418–10446` Prisma). Today the
`objectKey` is a dangling reference and `signedContract` (`:15474`) is a stub — no bytes are
stored. The real adapter must, internally:

1. On submit: build the real `POST /v3/videos` body from the creative payload (requires the
   signature change in §6), send `x-api-key` + `Idempotency-Key`, parse `video_id` → `externalId`.
2. On completion (verified webhook or reconcile poll): read `video_url` (+ `duration`).
3. Download the **whole MP4** from `video_url` in a single GET (re-fetch via `GET /v3/videos/{id}`
   if expired).
4. Compute `sha256`, `byteSize`, `contentType`, `durationSeconds`, `resolution` from the bytes.
5. **Put the bytes to B2** at the `objectKey` the store reserved (clean-media bucket) — this is
   where the B2 adapter dependency (§1) is required.
6. Compute `providerTotalMinor` from `durationSeconds × ProviderPriceVersion.rateMinorPerSecond`.
7. Return the descriptor the store already expects; **never persist the transient HeyGen URL**.

Flip the `HEYGEN_MODE=api` refusal guard (`heygen-provider.mjs:66`) to call the real adapter; keep
the simulator as the default for tests.

---

## 15. Summary — what the reader needs to know

- **What V0 sends (input):** a JSON `POST /v3/videos` body — `type:"avatar"`, `avatar_id`,
  `script` (text ≤5000), `voice_id`, `voice_settings`, `resolution` (`1080p`), `aspect_ratio`
  (`9:16`), `output_format` (`mp4`), `engine`, `callback_url`, `callback_id` (= V0 operation id) —
  with `x-api-key` and `Idempotency-Key` headers. No file, no multipart.
- **What HeyGen returns (output):** a `video_id` immediately; later, a **presigned `video_url`**
  (transient) via webhook or poll — **not the file itself**. V0 downloads the whole MP4 once.
- **What V0 produces (feature):** a consent-safe, cost-settled, retained generated video segment
  (`Artifact` + `GeneratedSegment` + `GeneratedAsset` + `CreativeLineage` + `CAPTURE` ledger) that
  is the creative root for composition, review, publishing, verification, and performance.
- **Keys needed:** `HEYGEN_MODE`, `HEYGEN_API_BASE_URL`, `HEYGEN_API_KEY`, `HEYGEN_WEBHOOK_SECRET`,
  `HEYGEN_CALLBACK_URL`, `HEYGEN_CONCURRENCY_LIMIT`, `HEYGEN_MAX_SCRIPT_CHARACTERS` (env/secret
  manager) + B2 storage keys (for retention) + `ProviderPriceVersion` DB rows (for billing). See
  `API_INTEGRATION_KEYS.md` §HeyGen and §Backblaze B2.
- **No chunking.** Whole request, whole download.
- **Real-wiring gaps to close (not chunking):** pass creative payload to the adapter; read
  `HEYGEN_API_BASE_URL`/`HEYGEN_API_KEY`; implement raw-body `Heygen-Signature` verification
  (replacing canonical-JSON `x-heygen-signature`); retain bytes to real B2; DB price-version
  lookup; flip the `HEYGEN_MODE=api` guard.

---

## Sources

- developers.heygen.com/reference/create-video — request body schema, auth, idempotency, response
- developers.heygen.com/reference/get-video — `VideoDetail` response, status enum, errors
- developers.heygen.com/docs/webhooks — `Heygen-Signature`/`Heygen-Timestamp`/`Heygen-Event-Id`,
  endpoint registration + secret, delivery behaviour
- developers.heygen.com/docs/webhook-events — event payload (confirm exact `event_data` fields)
- developers.heygen.com/docs/upload-assets — asset upload limits (not in V0 scope)
- developers.heygen.com/docs/usage-limits — script/audio/video/concurrency caps
- `docs/V0/V0_HEYGEN_INTEGRATION.md`, `docs/V0/V0_HEYGEN_COST_MODEL.md`, `docs/V0/V0_API.md`,
  `docs/V0/V0_DATA_MODELS.md` — canonical V0 contract
- `docs/Project/Integrations/API_INTEGRATION_KEYS.md` — keys/parameters
- `docs/Project/Integrations/BACKEND_API_WIRING_AUDIT.md` — current simulator state
