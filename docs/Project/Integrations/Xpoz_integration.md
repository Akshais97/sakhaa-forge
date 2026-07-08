# Xpoz Integration — Viral Candidate Discovery (V0-P2)

Status: In-depth reference for the Xpoz discovery integration — the **V0-P2 Viral Candidate
Discovery** provider that searches public social platforms (Instagram, TikTok, Twitter/X, Reddit)
for high-engagement reference content in a real-estate niche, so a Client Manager can review ranked
viral candidates, select one with immutable metric evidence and rights warnings, and feed it into
V0-P3 rights-aware media acquisition. Documents Xpoz's actual API/key/auth behaviour (confirmed
from Xpoz's public tool catalog and SDK examples), the exact search-tool input parameters, the
V0-side normalized `ViralCandidate` / `MetricSnapshot` contract (canonical), and the rights/immutability
guardrails. **Contracts-before-code caveat:** Xpoz's public catalog publishes input schemas only;
the exact response post-object field names are confirmed where observable from SDK examples and
flagged "to confirm against the live MCP server / `xpoz-ts-sdk` at wiring time" — this doc does not
invent provider response fields.
Date verified: 2026-07-02 (against Xpoz official public docs + the MCP tool catalog, read directly).

Companion documents in this folder: `Meta_integration.md`, `YouTube_integration.md` (the downstream
publish targets), `B2_integration.md` (the private clean-media area V0-P3 writes the acquired
analysis copy to), `HeyGen_integration.md`, `Supabase_integration.md`, `Razorpay_integration.md`,
`Stripe_integration.md`.

Canonical V0 contracts that own the behaviour (this doc is the provider-side companion):
- `docs/V0/V0_API.md` — `POST /viral-candidates/search` (V0-P2), `POST /viral-candidates/{id}/extract-blueprint` (V0-P3)
- `docs/V0/V0_DATA_MODELS.md` — `ViralCandidate`, `MetricSnapshot`
- `docs/V0/Sprints/V0-P2_VIRAL_CANDIDATE_DISCOVERY_AND_IMMUTABLE_METRICS_SPRINT.md`
- `docs/V0/V0_ERROR_CATALOG.md` — `DISCOVERY_PROVIDER_UNAVAILABLE`
- `docs/V0/Source_Notes/V0_SOURCE_VIRAL_VIDEO_FINDER.md` (non-authoritative source note; promoted
  here only where the canonical contracts confirm it)
- `docs/Project/Security/PROJECT_SECURITY_PRIVACY_AND_RIGHTS_METHODOLOGY.md`
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` §9 — discovery key names

Sources: Xpoz official public docs —
www.xpoz.ai (social data API overview),
www.xpoz.ai/.well-known/mcp/tools.json (MCP tool catalog, JSON-Schema input parameters),
github.com/XPOZpublic/xpoz-mcp (MCP server config, tool list, auth tiers),
www.xpoz.ai/sdk/ (SDK usage, observable response fields).

---

## 0. The key fact

Xpoz is V0's **V0-P2 Viral Candidate Discovery** provider. It is a real public **social data API +
remote MCP server** (`https://mcp.xpoz.ai/mcp`, Streamable HTTP) that indexes public posts across
Instagram, TikTok, Twitter/X, and Reddit and exposes typed search tools (e.g.
`getInstagramPostsByKeywords`, `getTiktokPostsByKeywords`, `getTwitterPostsByKeywords`). V0 uses it
to find high-engagement reference content in a customer's real-estate niche; the selected candidate
feeds **V0-P3 rights-aware media acquisition** and the downstream blueprint-formula/director-prompt
pipeline (V0-P3/P4/P5).

The flow is synchronous and read-only:

1. A Client Manager initiates a `new_discovery` blueprint request; V0 calls
   `POST /viral-candidates/search` with the niche query.
2. The adapter calls Xpoz's keyword-search tool with the niche query + date range + bounded `limit`;
   Xpoz returns ranked public posts with engagement metrics and media URLs.
3. V0 **normalizes** each post into a bounded ranked `ViralCandidate` record, records an **immutable
   `MetricSnapshot`** (engagement counts + an observation timestamp + a source hash), and attaches
   **rights warnings** (the candidate is third-party social content — analysis only until rights are
   acquired in V0-P3).
4. The Client Manager selects one candidate; V0 retains a selection audit; the candidate's source URL
   + media URL feed V0-P3 `POST /viral-candidates/{id}/extract-blueprint` (rights-aware retrieval).

> **Xpoz returns ranked public posts with engagement metrics and media URLs — not a virality
> prediction. V0 records the metrics as an immutable snapshot at observation time (never a
> performance guarantee, reach forecast, or conversion promise), and never reuses the candidate
> media until V0-P3 acquires rights. Provider outage/timeout/empty/malformed returns
> `DISCOVERY_PROVIDER_UNAVAILABLE` and creates no fabricated candidates.**

This is V0-P2 (creative-input discovery), **not** V2 scoring/learning. Xpoz engagement metrics are
**observations of past public platform state**; V0's ranking is a bounded engagement heuristic for
candidate selection, not a scientific/predictive virality score (CLAUDE.md §12 forbids V2
scoring/predictive claims — this integration respects that boundary).

**Contracts-before-code caveat:** Xpoz's public tool catalog (`tools.json`) publishes **input
schemas only**; the exact response post-object field names are confirmed where observable from the
SDK examples (`likeCount`, `retweetCount`, `username`, `id`, `pagination.totalRows`) and otherwise
flagged "to confirm against the live MCP server response / `xpoz-ts-sdk` reference at wiring time."
This doc maps confirmed/observable Xpoz fields to V0's canonical normalized candidate fields and
does **not** invent unconfirmed provider response fields.

---

## 1. Integration keys and configuration

Source: `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` §9 + `.env.example` + `apps/api/src/viral-discovery.mjs`.

| Variable | Required | Expected value / type | Classification | Used for |
|---|---|---|---|---|
| `XPOZ_API_BASE_URL` | provider mode | HTTPS URL (e.g. `https://mcp.xpoz.ai/mcp` or `https://api.xpoz.ai`) | Internal | Xpoz endpoint base. Simulator default; live = the MCP/REST base. |
| `XPOZ_API_KEY` | provider mode | Xpoz API key / trial token (`TRIAL…` / free key) | **Secret** | Bearer auth for the Xpoz search call. **Server-only; never browser.** Catalog marks it "Discovery fallback only." |
| `XPOZ_TIMEOUT_MS` | optional | integer | Internal | Request timeout; default `30000`. |
| `LLM_PROVIDER` | yes for B2+ | adapter enum | Internal | The downstream analysis LLM (V0-P3/P4 blueprint stages), not Xpoz itself. Simulator until enabled. |
| `LLM_API_KEY` | provider mode | provider secret | **Secret** | Downstream analysis LLM key (scene blueprint / formula derivation), not Xpoz. |
| `CRAWL_USER_AGENT` | yes | non-empty contact-bearing identifier | Public | Polite crawler identification if V0 fetches candidate pages; not the Xpoz call itself. |

**Platform-level key (not per-workspace):** unlike the publishing providers (Meta/YouTube, which
need a per-workspace OAuth token for the customer's connected account), the Xpoz API key is a
**platform-level** discovery credential — V0 queries Xpoz with its own key; the *query* (the
customer's real-estate niche keywords/USP) is per-blueprint-request, derived from the approved brand
profile. There is no per-workspace Xpoz credential.

**Auth tiers (confirmed from Xpoz public docs):**
1. **OAuth 2.1** — dynamic client registration with Google as the upstream IdP; "no API keys to
   manage." The MCP client handles the OAuth flow. (Best for interactive MCP clients; V0's server
   adapter more likely uses a static key/trial token.)
2. **Trial token** — `POST https://api.xpoz.ai/api/trial/token` returns a `TRIAL…` token valid ~5
   days (~432000s) with a limited result set. Sent as `Authorization: Bearer TRIAL…`.
3. **API key** — a free key from `xpoz.ai/get-token`; sent as `Authorization: Bearer {key}`.

V0 maps the chosen credential to `XPOZ_API_KEY` (Secret, server-only). The catalog's note "Discovery
fallback only" reflects that the simulator is the default and the live Xpoz key is used only when
`XPOZ_API_BASE_URL` points at the live endpoint.

**Key safety:** `XPOZ_API_KEY` is server-only — never in browser code, logs, analytics, or retained
artifacts. Candidate media URLs returned by Xpoz are **third-party public social URLs** used for
analysis/reference only; they are **not** V0-owned and are never rendered to the browser as if they
were approved brand media, and never retained as copy without V0-P3 rights acquisition. Raw Xpoz
response payloads stay adapter-private (V0_API.md:147).

**Current code reality:** V0 discovery is **simulator-only**. `apps/api/src/viral-discovery.mjs`
makes no network call: `searchXpozCandidates(input, actorUserId)` returns three deterministic
**fixture candidates** (`viral-discovery.mjs:5–33`) ranked by `rankScore` (views + likes×8 +
comments×20 + shares×35, `:114–116`). `XPOZ_API_BASE_URL` / `XPOZ_API_KEY` are **never read**. The
provider-mode branches it does handle — `timeout` / `outage` / `empty` / `malformed` →
`DISCOVERY_PROVIDER_UNAVAILABLE` (`:36–43`, retryable unless `malformed`) and `manual_fallback` → a
manually-supplied candidate with provenance (`:44–50`, `:84–108`) — are the contract-correct
failure/fallback shapes the real adapter must preserve. The normalized candidate fields and
`candidateSourceHash` (`:58–67`) are the canonical V0 contract the real adapter must emit.

---

## 2. Authentication and request headers

### V0 → Xpoz (MCP server — Streamable HTTP, JSON-RPC)
```
POST https://mcp.xpoz.ai/mcp
Authorization: Bearer {XPOZ_API_KEY}            (TRIAL… / free key; or OAuth 2.1 token)
Content-Type: application/json
Accept: application/json, text/event-stream

{
  "jsonrpc": "2.0",
  "id": "<request-id>",
  "method": "tools/call",
  "params": {
    "name": "getInstagramPostsByKeywords",
    "arguments": { "query": "<niche keywords>", "limit": 100, "startDate": "…", "endDate": "…" }
  }
}
```
- **Transport:** Streamable HTTP (JSON-RPC 2.0 `tools/call`). Direct probes of the endpoint return
  `401 Unauthorized` without a valid token — the OAuth/credential flow is mandatory.
- **Auth:** `Authorization: Bearer {XPOZ_API_KEY}` (trial token or free key), or OAuth 2.1 (handled by
  an MCP client). V0's server adapter uses the static `XPOZ_API_KEY` (trial/free key).
- **Method dispatch:** `params.name` selects the tool; `params.arguments` carries the search args
  (§4.1). No platform-specific API keys are required — Xpoz abstracts Twitter/Instagram/TikTok/Reddit
  behind its own credential (a core Xpoz selling point: "no platform API keys needed").

### V0 → Xpoz (SDK alternative — `@xpoz/xpoz`)
```
import { XpozClient } from "@xpoz/xpoz";
const client = new XpozClient({ apiKey: process.env.XPOZ_API_KEY });
await client.connect();
const results = await client.instagram.searchPosts("niche keywords", { limit: 100, startDate, endDate, cursor });
```
- The SDK wraps the same MCP endpoint with typed methods (`client.<platform>.searchPosts(query,
  options)`). The TypeScript SDK source is `XPOZpublic/xpoz-ts-sdk`; Python is
  `XPOZpublic/xpoz-python-sdk`. V0 calls Xpoz **behind an adapter** (the domain never imports the
  provider SDK — CLAUDE.md §6; the adapter is the only place the SDK/HTTP call lives).

### Xpoz → V0 (webhook)
**None.** Xpoz is synchronous request/response (MCP `tools/call` returns the result inline, or an
async operation id polled via `checkOperationStatus`). There are no inbound webhooks; the
"tracking" tools (`addTrackedItems`/`getTrackedItems`) are polling-based monitoring, not push
callbacks. Discovery completion is the synchronous response (or a polled async export), never a
signed callback.

---

## 3. The end-to-end flow (V0-P2 Viral Candidate Discovery — V0 primary)

### Step 1 — Client Manager initiates a new-discovery blueprint request
A Client Manager (Owner/Admin/Client Manager; Reviewer denied) creates a `POST /blueprint-requests`
with the explicit path `new_discovery`, binding `workspaceId`, active `brandProfileId`, exact
`brandProfileVersion`, objective type and objective. The approved brand profile carries the
real-estate niche, USP, target audience, keywords — the **query source** for discovery.

### Step 2 — V0 calls `POST /viral-candidates/search`
The search is bound to the `new_discovery` blueprint request. The adapter derives the niche query
from the approved brand profile (niche keywords/USP/audience terms), picks the Xpoz platform tool(s)
(Instagram Reels and/or TikTok for short-form real-estate content; optionally Twitter/Reddit for
audience-signal context), and calls Xpoz with the query + bounded `limit` + date range. **Raw
Xpoz payloads stay adapter-private** (V0_API.md:147).

### Step 3 — Xpoz returns ranked public posts
Xpoz returns a bounded page of public posts matching the query, each carrying engagement metrics
(likes/views/comments/shares or retweets), the post URL, media URL(s), cover/thumbnail, creator
handle, and timestamp (exact response field names: confirmed where observable from SDK examples
(`likeCount`, `retweetCount`, `username`, `id`); the remainder — `url`, `text`/caption, `mediaUrls`,
`videoUrl`, `thumbnail`/`coverImage`, `viewCount`, `commentCount`, `shareCount`, `createdAt`,
`language` — **to confirm against the live MCP server / `xpoz-ts-sdk` at wiring time**). Pagination
is cursor-based (`cursor` param; response-side cursor structure to confirm).

### Step 4 — V0 normalizes, snapshots, ranks, and warns
The adapter maps each Xpoz post to a normalized **`ViralCandidate`** (§5/§4.3 — the canonical V0
fields: `sourceIdentity`, `sourceUrl`, `title`, `creatorHandle`, `metrics {views, likes, comments,
shares}`, `observedAt`, `rightsWarnings[]`, `metadata {durationSeconds, language, hookType}`,
`provenance`). For each candidate V0 records an **immutable `MetricSnapshot`** with the engagement
counts, the **observation timestamp** (`observedAt`), and a **source hash** (`sha256` over the
stable JSON of `{sourceIdentity, sourceUrl, metrics, observedAt}` — `viral-discovery.mjs:58–67`).
The candidates are **ranked** by a bounded engagement heuristic (`rankScore = views + likes×8 +
comments×20 + shares×35`) — a selection aid, **not** a virality score. Each candidate carries
**rights warnings** (e.g. "Source is third-party social content. Use for analysis only until
acquisition rights are recorded.", "Observed metrics do not grant reuse rights.") — rights warnings
are preserved and cannot be hidden by ranking (V0-P2 sprint guardrail).

### Step 5 — Client Manager reviews and selects one candidate
The Client Manager reviews the bounded ranked candidates (with metrics, source URL, rights
warnings) and selects one. V0 retains a **candidate selection audit** (P2 completion evidence) and
anchors the selected candidate to the blueprint request. The selection does **not** acquire any
media rights — it only nominates the reference content for V0-P3.

### Step 6 — V0-P3 rights-aware media acquisition (downstream, separate contract)
`POST /viral-candidates/{candidate_id}/extract-blueprint` (V0-P3) takes the selected candidate with
a **rights decision**, an **approved retrieval policy**, and the **expected source hash**. When
rights permit a retained analysis copy, V0 creates a `MediaAcquisition`, a private clean `Artifact`
(in B2 — see `B2_integration.md`), a `ThumbnailBlueprint`, a `media_acquire` job, and audit rows.
Reference-only rights, unsupported retrieval, source-hash mismatch, or low-confidence OCR return
the stable blocked errors and do **not** mark blueprint input ready. **V0 never reuses candidate
media without this rights acquisition.**

### Manual fallback (when Xpoz is unavailable or empty)
If the provider is unavailable/empty or the Client Manager has a specific reference, V0 supports a
**manual candidate**: the Client Manager supplies `sourceUrl`, `sourceIdentity`, `title`,
`creatorHandle`, `rightsBasis`, and `metrics {views, likes, comments, shares}` (all integers ≥0).
`normaliseManualCandidate` (`viral-discovery.mjs:84–108`) validates all required fields and emits a
candidate with `provenance { type: "manual", actorUserId, rightsBasis }`. A manual candidate with
missing/invalid fields returns `VALIDATION_FAILED` (`:46–47`). Manual fallback never fabricates
metrics — the human supplies them, and they are recorded with provenance.

### Provider failure modes
`searchXpozCandidates` (`:36–43`) returns `DISCOVERY_PROVIDER_UNAVAILABLE` with `retryable: true`
for `timeout`/`outage`/`empty` and `retryable: false` for `malformed` — and **creates no fabricated
candidates** (the first failing P2 test: "provider changes, empty results, malformed payloads or
timeouts fabricate candidates or mutate metric evidence" must fail). The UI surfaces empty/outage
states (V0-P2 backlog).

---

## 4. Full request/response schemas

### 4.1 Search tool input — `getInstagramPostsByKeywords` / `getTiktokPostsByKeywords` / `getTwitterPostsByKeywords`
(Confirmed from `xpoz.ai/.well-known/mcp/tools.json`.)

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `query` | string | **yes** | `minLength: 1`. Keywords/phrase matched against post text/captions/hashtags. V0 derives from the approved brand niche/USP. |
| `limit` | integer | no | 1–1000, default 100. V0 uses a bounded `limit` (bounded results per V0_API.md:148). |
| `startDate` | string (date-time) | no | ISO 8601 lower bound (inclusive). |
| `endDate` | string (date-time) | no | ISO 8601 upper bound (inclusive). |
| `lang` | string | no | BCP-47 (e.g. `en`). **Twitter tool only.** |
| `country` | string | no | ISO 3166-1 alpha-2. **Twitter tool only.** |
| `cursor` | string | no | Pagination cursor from a prior call. |
| `userPrompt` | string | no | Natural-language question (global arg; Xpoz optimizes the search). |

**Parameters that do NOT exist** (do not send): `hashtags` (keywords already match captions +
hashtags), `accounts`/`user` (only in `getTwitterPostsByAuthor` / `getInstagramPostsByUser`), any
`minLikes`/`minViews` engagement filter (Xpoz does not offer server-side engagement filtering — V0
ranks client-side after the response), `forceLatest`, `maxResults` (use `limit`).

### 4.2 Search tool response — Xpoz post object (partially confirmed; contracts-before-code)
Observable from SDK examples:
```json
{
  "data": [
    {
      "id": "<provider post id>",
      "username": "<creator handle>",
      "likeCount": 6400,
      "retweetCount": 980              // Twitter; Instagram/TikTok use shareCount/commentCount equivalents (to confirm)
      // url, text/caption, mediaUrls, videoUrl, thumbnail/coverImage,
      // viewCount, commentCount, shareCount, createdAt, language:
      //   to confirm against the live MCP server / xpoz-ts-sdk at wiring time
    }
  ],
  "pagination": { "totalRows": 2451, /* nextCursor / hasMore: to confirm */ }
}
```
- Confirmed/observable fields: `id`, `username` (creator handle), `likeCount`, `retweetCount`
  (Twitter), `pagination.totalRows`, `results.data[]`, `results.exportCsv()`.
- **To confirm at wiring time** (do not assume exact names): `url` (post URL), `text`/`caption`,
  `mediaUrls` / `videoUrl` (the media file URL V0-P3 acquires), `thumbnail`/`coverImage`, `viewCount`,
  `commentCount`, `shareCount` (non-Twitter), `createdAt`/`timestamp`, `language`, and the
  response-side pagination cursor shape. The V0 adapter must map whatever the live response provides
  into the canonical normalized candidate fields (§4.3) — the **V0-side contract is fixed; the
  provider-side field names are confirmed at wiring.**

### 4.3 Normalized V0 `ViralCandidate` (canonical — from `viral-discovery.mjs` + V0_API.md)
```json
{
  "provider": "xpoz",                  // or "manual"
  "sourceIdentity": "xpoz:<provider-post-id>",   // stable provider-side id; manual = client-supplied
  "sourceUrl": "https://instagram.com/reel/…",   // the public social post URL
  "title": "Site visit proof before price discussion",
  "creatorHandle": "@blr_property_studio",
  "metrics": { "views": 128000, "likes": 6400, "comments": 312, "shares": 980 },
  "observedAt": "2026-06-24T09:00:00.000Z",
  "rightsWarnings": [
    "Source is third-party social content. Use for analysis only until acquisition rights are recorded."
  ],
  "metadata": { "durationSeconds": 42, "language": "en-IN", "hookType": "proof-first" },
  "provenance": { "type": "provider", "provider": "xpoz" }   // manual: { type:"manual", actorUserId, rightsBasis }
}
```
- `metrics` are **integers ≥0** (`views`, `likes`, `comments`, `shares`) — validated by `isMetrics`
  (`viral-discovery.mjs:110–112`).
- `observedAt` is the **observation timestamp** (when V0 observed the metrics) — the MetricSnapshot
  anchor; **immutable**.
- `rightsWarnings` are preserved and surfaced; ranking cannot hide them.
- `metadata.hookType` (e.g. `proof-first`, `walkthrough`, `amenity`, `manual`) is a V0-side analysis
  label, not an Xpoz field.
- `provenance` records the source (provider fixture / live provider / manual) and, for manual, the
  `actorUserId` + `rightsBasis`.

### 4.4 `MetricSnapshot` + source hash (canonical)
- `MetricSnapshot`: immutable record of `{candidateIdentity, metrics, observedAt, sourceHash}` —
  the engagement counts at observation time. **Never mutated; never a performance guarantee.**
- `sourceHash = sha256(stableJson({sourceIdentity, sourceUrl, metrics, observedAt}))`
  (`viral-discovery.mjs:58–67`) — the integrity anchor V0-P3 re-checks against the
  `expected source hash` before acquiring media.

### 4.5 Errors
Xpoz errors surface as HTTP/JSON-RPC error responses (e.g. `401 Unauthorized` for a bad/expired
token, `429`/quota for credit exhaustion, `5xx` for outage). V0 maps these to
`DISCOVERY_PROVIDER_UNAVAILABLE` (retryable for timeout/outage/empty/quota; non-retryable for
malformed/schema-invalid). A schema-invalid Xpoz response (missing required fields, non-integer
metrics) is `malformed` → `DISCOVERY_PROVIDER_UNAVAILABLE` non-retryable (and never
`PROVIDER_OUTPUT_INVALID`-promoted into a fabricated candidate). Token expiry (`401`) → refresh the
trial/free key (or re-run OAuth); retryable after credential refresh.

---

## 5. V0 input → Xpoz mapping (what V0 sends)

| V0 field | Xpoz field | Notes |
|---|---|---|
| `BlueprintRequest.path = "new_discovery"` | triggers `POST /viral-candidates/search` | Only `new_discovery` calls Xpoz; `existing_blueprint`/`default_formula` do not. |
| Approved `BrandProfile` niche/USP/keywords/audience | `query` | V0 derives the niche query from approved brand truth (never unapproved brand truth — CLAUDE.md §6). |
| Objective type / platform intent | tool selection (`getInstagramPostsByKeywords` / `getTiktokPostsByKeywords` / `getTwitterPostsByKeywords`) | V0 picks the platform tool(s) matching the creative intent (short-form → IG Reels / TikTok). |
| Bounded result set | `limit` (1–1000; V0 bounds well below 1000) | Bounded results (V0_API.md:148). |
| Discovery window | `startDate` / `endDate` (ISO 8601) | Optional recency window. |
| `lang` / `country` | `lang` / `country` (Twitter tool only) | India-first (`lang: "en"`, `country: "IN"`) where applicable. |
| Pagination | `cursor` | V0 fetches one bounded page; cursor for additional pages if needed. |
| `XPOZ_API_KEY` | `Authorization: Bearer {key}` | Platform-level secret; server-only. |
| `XPOZ_TIMEOUT_MS` | request timeout | Default 30000; on timeout → `DISCOVERY_PROVIDER_UNAVAILABLE` (retryable). |

**No persist-before-I/O requirement (read-only):** discovery is a read, not a paid/publishing
mutation, so there is no `PublishOperation`-style durable record to persist before the call. V0 does
persist the **`MetricSnapshot`** (immutable) and the **selection audit** after the response — these
are the evidence records. The blueprint request row (created in Step 1) is the durable anchor.

---

## 6. Xpoz → V0 output mapping (what V0 gets back, by feature)

| Xpoz output | V0 object / action | Feature meaning |
|---|---|---|
| Post `id` | `ViralCandidate.sourceIdentity = "xpoz:{id}"` | Stable provider-side identity for dedup + the source-hash anchor. |
| Post `url` | `ViralCandidate.sourceUrl` | The public social post URL (audience-facing reference; feeds V0-P3 retrieval). |
| Post `text`/caption | `ViralCandidate.title` | Human-readable caption for review. |
| Post `username`/author | `ViralCandidate.creatorHandle` | Creator attribution (rights review target). |
| Post engagement (`likeCount`/`viewCount`/`commentCount`/`shareCount`/`retweetCount`) | `ViralCandidate.metrics {views, likes, comments, shares}` + immutable `MetricSnapshot` | **Observed** engagement at `observedAt`; a snapshot, never a performance guarantee/prediction. |
| Post `createdAt`/timestamp | (V0 `observedAt` is when V0 observed, not when the post was created — both retained) | Provenance of the observation window. |
| Post media URL(s) / cover | (not retained at discovery; used only by V0-P3 rights-aware acquisition if rights permit) | V0 never retains/reuses media without P3 rights. |
| Ranked candidates | bounded ranked `ViralCandidate[]` by `rankScore` | Selection aid; ranking is a heuristic, not a virality score. |
| Provider timeout/outage/empty | `DISCOVERY_PROVIDER_UNAVAILABLE` (retryable); no fabricated candidates | "Honest empty — never invent a candidate." |
| Provider malformed | `DISCOVERY_PROVIDER_UNAVAILABLE` (non-retryable); `PROVIDER_OUTPUT_INVALID`-class | "Bad provider data — never promote to a candidate." |
| Manual fallback | `ViralCandidate` with `provenance.type="manual"` + `rightsBasis` | Human-supplied reference with provenance; never fabricated metrics. |
| Selected candidate | selection audit + V0-P3 `extract-blueprint` with `expected source hash` | "Reference nominated — rights acquisition is a separate, gated step." |

**Feature-level outcome (second order).** Xpoz is the **discovery-input boundary** of V0's creative
pipeline. It surfaces *what already performed publicly* in a customer's real-estate niche so a
Client Manager can nominate a reference — but V0 is deliberately honest about what that means: the
metrics are an **immutable snapshot of past public engagement** (not a forecast), the ranking is a
bounded **heuristic** (not a virality score), and the candidate media is **third-party content under
rights warning** until V0-P3 acquires it. Nothing Xpoz returns is ever treated as approved brand
truth (only the approved `BrandProfile` is), as a performance promise (CLAUDE.md §12 forbids
guaranteed-virality/reach/conversion claims), or as reusable media (rights acquisition is a separate
gated step with an `expected source hash` re-check). Because provider failure returns
`DISCOVERY_PROVIDER_UNAVAILABLE` with **no fabricated candidates** and **no mutated metric
evidence**, and because the `MetricSnapshot` + `sourceHash` are immutable, V0's discovery record is
auditable and truthful even when the provider is empty or broken. This is the creative-input half of
V0's "calm, honest system of record" — it finds reference material without ever pretending the
reference is a guarantee.

---

## 7. Webhook signature verification — not applicable

**Xpoz is synchronous request/response (MCP `tools/call`) or polled async export
(`checkOperationStatus`).** There are **no inbound webhooks** and therefore **no signature to
verify**. Discovery completion is the inline response (or a polled operation status), never a signed
callback. The "tracking" tools (`addTrackedItems`/`getTrackedItems`/`removeTrackedItems`) are
polling-based monitoring, not push callbacks.

The current V0 simulator has no Xpoz callback path (unlike the publishing providers' simulator
callback envelopes) — `searchXpozCandidates` returns synchronously. The real adapter keeps this
shape: a single synchronous search call (or a polled async export for large result sets) with no
callback receiver. No `POST /callbacks/discovery/xpoz` endpoint exists or is needed.

---

## 8. Immutability, idempotency, and retry semantics

- **Immutable `MetricSnapshot`:** once recorded, a candidate's engagement snapshot (metrics +
  `observedAt` + `sourceHash`) is **never mutated**. A re-observation creates a *new* snapshot row
  (V0-A1 style), preserving history. The first failing P2 test guards that provider changes cannot
  mutate recorded metric evidence.
- **`sourceHash` integrity:** `sha256({sourceIdentity, sourceUrl, metrics, observedAt})` binds the
  observed metrics to the source identity. V0-P3 re-checks the `expected source hash` before
  acquiring media — a mismatch blocks acquisition (the candidate changed between discovery and
  acquisition).
- **No provider-side idempotency key:** Xpoz search is a read; the same query returns
  (possibly refreshed) results. V0's idempotency boundary is the **blueprint request** + the
  **selection audit** (one selection per request), not the search call. Re-searching is harmless
  (read-only) but does **not** re-select or overwrite a prior selection.
- **Retry:** `timeout`/`outage`/`empty`/quota (429) → `DISCOVERY_PROVIDER_UNAVAILABLE` with
  `retryable: true` — the caller may retry the search (read-only, safe). `malformed`/schema-invalid →
  `retryable: false` — do not retry the same response; investigate. Token expiry (401) → refresh
  `XPOZ_API_KEY` (new trial/free key or re-OAuth), then retry.
- **Bounded results:** `limit` caps the page size; V0 bounds it well below the 1000 max to keep the
  review surface calm and the audit bounded. No unbounded fan-out.
- **No blind retry of side-effects:** discovery has no side-effects (read-only), so retry is always
  safe — but V0 never auto-retries into a `malformed` response (non-retryable) and never fabricates a
  candidate to mask an outage.

---

## 9. Xpoz error → V0 error code mapping

| Xpoz signal | HTTP | V0 error code | Action |
|---|---|---|---|
| Bad/expired token (`401`) | 401 | `DISCOVERY_PROVIDER_UNAVAILABLE` (retryable after refresh) | Refresh `XPOZ_API_KEY`; retry. |
| Quota / credit exhaustion (free tier limit) | 429 | `DISCOVERY_PROVIDER_UNAVAILABLE` (retryable) | Wait for credit reset / upgrade tier; retry or manual fallback. |
| Outage / `5xx` | 5xx | `DISCOVERY_PROVIDER_UNAVAILABLE` (retryable) | Back off; retry; or manual fallback. |
| Timeout (> `XPOZ_TIMEOUT_MS`) | — | `DISCOVERY_PROVIDER_UNAVAILABLE` (retryable) | Retry; or manual fallback. |
| Empty result (no posts) | 200 | `DISCOVERY_PROVIDER_UNAVAILABLE` (retryable, `empty`) | Surface empty state; broaden query; or manual fallback. |
| Malformed / schema-invalid response | — | `DISCOVERY_PROVIDER_UNAVAILABLE` (**non-retryable**) | Do not promote to candidate; investigate; never fabricate. |
| Missing required candidate field (manual) | — | `VALIDATION_FAILED` (422, non-retryable) | Client supplies all required manual fields. |
| Cross-workspace / missing blueprint request | — | `WORKSPACE_ACCESS_DENIED` (404) | Existence-hiding; never leak. |

---

## 10. Limits

- **`limit`:** 1–1000 per call (default 100). V0 bounds well below 1000 for a calm review surface.
- **Date range:** `startDate`/`endDate` (ISO 8601, inclusive); optional.
- **`cursor`:** server-side pagination cursor (response-side shape to confirm at wiring).
- **`XPOZ_TIMEOUT_MS`:** default 30000.
- **Free tier:** ~2,500 credits / ~100K results per month (Pro ~$20/mo ~30K credits; Max ~$200/mo
  ~600K credits) — confirm exact allotment for V0's plan at deployment. Async CSV exports up to ~500K
  rows via `checkOperationStatus` polling.
- **Trial token:** ~5 days validity, limited result set — not for production; use a free key.
- **No server-side engagement filter:** Xpoz does not offer `minLikes`/`minViews` — V0 ranks
  client-side after the response (the `rankScore` heuristic).
- **42 tools total** (Twitter/X 14, Instagram 9, Reddit 9, TikTok 7, Tracking 3); V0 uses the
  keyword-search tools primarily.
- **Bounded ranked results:** V0 surfaces a bounded ranked list (V0_API.md:148); no unbounded feed.

---

## 11. Cost model

Xpoz is a **credit-metered read API** (free tier ~2,500 credits / ~100K results/month; paid tiers for
volume). The Xpoz credit cost is a **platform operational cost** (borne by V0/the platform), **not**
a V0 `WalletLedgerEntry` — discovery is a read, not a paid generation/publishing mutation. V0's
wallet credits are consumed downstream at **generation settlement** (HeyGen `CAPTURE` — see
`HeyGen_integration.md` §7), not at discovery. The source note's "without incurring heavy credit
costs" refers to Xpoz's metered credits (and to avoiding heavy V0 spend by pre-filtering virality
candidates server-side before generation), not a V0 ledger entry. V0 therefore does **not** model
a Xpoz `ProviderPriceVersion`; the `MetricSnapshot` + selection audit are the retained discovery
evidence, not money records. The downstream V0-P3/P4/P5 analysis (LLM scene blueprint / formula
derivation) uses the `LLM_PROVIDER`/`LLM_API_KEY` budget, also platform-cost — again not a V0 wallet
charge at discovery time. (If V0 later elects to charge a discovery credit, that would be a separate
contract decision; the current V0 contract does not bill the wallet for discovery.)

---

## 12. Mapping to the current V0 code

| Concern | Current code | Canonical target |
|---|---|---|
| Adapter | `viral-discovery.mjs` returns 3 fixture candidates ranked by `rankScore`; no network call (`:5–56`) | Real adapter: call Xpoz keyword-search tool(s) (MCP `tools/call` or SDK) with the niche `query` + bounded `limit` + date range + `Bearer {XPOZ_API_KEY}`; normalize the response into `ViralCandidate[]`. |
| Keys | `XPOZ_API_BASE_URL`/`XPOZ_API_KEY` never read | Read from env; `XPOZ_API_KEY` server-only; `XPOZ_TIMEOUT_MS` default 30000. |
| Query source | Fixture (hardcoded real-estate candidates) | Derive `query` from the approved `BrandProfile` niche/USP/keywords; pick platform tool by creative intent. |
| Normalized candidate | `normaliseProviderCandidate` emits the canonical fields (`:69–82`) — kept | Map confirmed Xpoz response fields → canonical `ViralCandidate`; **confirm exact Xpoz response field names against the live MCP server / `xpoz-ts-sdk` at wiring** (do not invent). |
| MetricSnapshot + sourceHash | `candidateSourceHash` = sha256 over `{sourceIdentity, sourceUrl, metrics, observedAt}` (`:58–67`) — kept | Record immutable `MetricSnapshot` + `sourceHash`; V0-P3 re-checks `expected source hash`. |
| Ranking | `rankScore = views + likes×8 + comments×20 + shares×35` (`:114–116`) — a heuristic, not a score | Keep as a bounded selection heuristic; **never** present as a virality score/prediction. |
| Failure modes | `timeout`/`outage`/`empty` → `DISCOVERY_PROVIDER_UNAVAILABLE` (retryable); `malformed` → non-retryable; no fabricated candidates (`:36–43`) — kept | Map real Xpoz errors (401/429/5xx/timeout/empty/malformed) to the same `DISCOVERY_PROVIDER_UNAVAILABLE` shape; never fabricate. |
| Manual fallback | `normaliseManualCandidate` validates sourceUrl/sourceIdentity/title/creatorHandle/rightsBasis/metrics (`:84–108`) — kept | Keep the manual path for outage/empty/specific-reference cases; provenance `type: "manual"`. |
| Rights warnings | Fixture candidates carry `rightsWarnings` (`:12`,`:21`,`:30`) — kept | Preserve rights warnings on every live candidate; ranking cannot hide them; V0-P3 acquires rights before media reuse. |
| Mode switch | No explicit `XPOZ_MODE`/`PUBLISHING_MODE`-style gate; simulator is default | Gate live Xpoz behind a provider-mode flag (e.g. `DISCOVERY_MODE=providers` or reuse `LLM_PROVIDER`-style enum); keep simulator for tests. |
| Webhooks | None (synchronous) — correct | None needed; keep synchronous. |

**Real-wiring gap:** create the real Xpoz call inside `viral-discovery.mjs` (or a dedicated
`xpoz-provider.mjs` adapter) gated behind a provider-mode flag, read `XPOZ_API_BASE_URL` /
`XPOZ_API_KEY` from env, call the Xpoz keyword-search tool with the brand-derived niche query + bounded
`limit` + date range, **confirm the exact Xpoz response post-object field names against the live MCP
server / `xpoz-ts-sdk` reference** (do not invent), map the response into the canonical normalized
`ViralCandidate` + immutable `MetricSnapshot` + `sourceHash`, preserve rights warnings, and map
real errors to `DISCOVERY_PROVIDER_UNAVAILABLE`. Keep the simulator fixtures + manual fallback +
the `rankScore` heuristic (as a heuristic, not a score) for tests. **Never** treat Xpoz metrics as a
performance guarantee or reuse candidate media without V0-P3 rights acquisition.

---

## 13. Summary — what the reader needs to know

- **What V0 sends (input):** a Xpoz keyword-search tool call (`getInstagramPostsByKeywords` /
  `getTiktokPostsByKeywords` / `getTwitterPostsByKeywords`) with `query` (derived from the approved
  brand niche/USP), bounded `limit` (1–1000; V0 bounds lower), optional `startDate`/`endDate`
  (ISO 8601), optional `lang`/`country` (Twitter), optional `cursor`, authenticated with
  `Authorization: Bearer {XPOZ_API_KEY}` (trial/free key or OAuth) to `https://mcp.xpoz.ai/mcp`
  (Streamable HTTP JSON-RPC) or via the `@xpoz/xpoz` SDK. Only `new_discovery` blueprint requests
  trigger this.
- **What Xpoz returns (output):** a bounded page of public posts with engagement metrics
  (`likeCount`/`retweetCount`/`username`/`id` confirmed; `url`/`text`/`mediaUrls`/`videoUrl`/
  `thumbnail`/`viewCount`/`commentCount`/`shareCount`/`createdAt`/`language` to confirm at wiring)
  and a `pagination.totalRows` cursor — **no webhooks**.
- **What V0 produces (feature):** bounded ranked `ViralCandidate` records, each with an **immutable
  `MetricSnapshot`** (engagement at `observedAt` + a `sourceHash`), **rights warnings** (analysis-only
  until V0-P3 acquires rights), and a selection audit. The selected candidate feeds V0-P3
  rights-aware media acquisition. Provider failure returns `DISCOVERY_PROVIDER_UNAVAILABLE` with **no
  fabricated candidates**. Metrics are observations, **never** a virality/forecast promise; ranking is
  a heuristic, **not** a score (V0-P2 is discovery, not V2 scoring).
- **Keys needed:** `XPOZ_API_BASE_URL`, `XPOZ_API_KEY` (Secret, server-only), `XPOZ_TIMEOUT_MS`
  (default 30000); plus `LLM_PROVIDER`/`LLM_API_KEY` for the downstream analysis stages. The Xpoz key
  is **platform-level** (not per-workspace).
- **Contracts-before-code caveat:** Xpoz's public catalog publishes input schemas only; the exact
  response post-object field names must be **confirmed against the live MCP server / `xpoz-ts-sdk`
  at wiring time** — this doc maps confirmed/observable fields to V0's canonical normalized candidate
  contract and does not invent unconfirmed provider fields.
- **Real-wiring gap:** no live adapter (`viral-discovery.mjs` is simulator-only with fixture
  candidates; `XPOZ_API_BASE_URL`/`XPOZ_API_KEY` never read). A real Xpoz call (keyword-search tool with
  brand-derived query + bounded limit + Bearer auth), confirmed response-field mapping into the
  canonical `ViralCandidate`/`MetricSnapshot`/`sourceHash`, preserved rights warnings, and real-error
  → `DISCOVERY_PROVIDER_UNAVAILABLE` mapping are required before live discovery — always keeping the
  simulator, the manual fallback, and the heuristic (non-predictive) ranking for tests.

---

## Sources

- www.xpoz.ai — social data API overview (Instagram/TikTok/Twitter/Reddit; engagement filtering; "Viral Content Analysis" use case; pricing tiers)
- www.xpoz.ai/.well-known/mcp/tools.json — MCP tool catalog, JSON-Schema **input** parameters for `getInstagramPostsByKeywords` / `getTiktokPostsByKeywords` / `getTwitterPostsByKeywords` (`query` required, `limit` 1–1000, `startDate`/`endDate` ISO 8601, `lang`/`country` Twitter-only, `cursor`, `userPrompt`); no output schema (input-only catalog)
- github.com/XPOZpublic/xpoz-mcp — MCP server config (`https://mcp.xpoz.ai/mcp`, streamable-http), auth tiers (OAuth 2.1 / trial token `POST api.xpoz.ai/api/trial/token` → `TRIAL…` ~5 days / API key Bearer), 42-tool list (Twitter 14, Instagram 9, Reddit 9, TikTok 7, Tracking 3), discovery surfaces (`mcp.json`, `tools.json`, `llms-full.txt`)
- www.xpoz.ai/sdk/ — `@xpoz/xpoz` (npm) / `xpoz` (pip) SDK; `XpozClient({ apiKey })`; observable response fields (`likeCount`, `retweetCount`, `username`, `id`, `pagination.totalRows`, `results.data[]`, `results.exportCsv()`); full reference at `XPOZpublic/xpoz-ts-sdk`
- `docs/V0/V0_API.md` — `POST /viral-candidates/search` (V0-P2), `POST /viral-candidates/{id}/extract-blueprint` (V0-P3), bounded ranked candidates + immutable `MetricSnapshot` + source/rights warnings, `DISCOVERY_PROVIDER_UNAVAILABLE`
- `docs/V0/Sprints/V0-P2_VIRAL_CANDIDATE_DISCOVERY_AND_IMMUTABLE_METRICS_SPRINT.md` — sprint contract, rights-warnings-preserved guardrail, provider-outage/empty/malformed handling, manual fallback
- `docs/V0/Source_Notes/V0_SOURCE_VIRAL_VIDEO_FINDER.md` — Xpoz free key + MCP data stream; VIDEO URL/MEDIA URL/COVER IMAGE → downstream blueprint pipeline (non-authoritative; promoted only where canonical contracts confirm)
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` §9 — `XPOZ_API_BASE_URL`, `XPOZ_API_KEY` (Secret, "Discovery fallback only"), `XPOZ_TIMEOUT_MS`, `LLM_PROVIDER`/`LLM_API_KEY`, `CRAWL_USER_AGENT`
- `apps/api/src/viral-discovery.mjs` — current simulator discovery path: fixture candidates, `rankScore` heuristic, `candidateSourceHash`, `normaliseProviderCandidate`/`normaliseManualCandidate`, `DISCOVERY_PROVIDER_UNAVAILABLE` failure modes (code-grounded)
