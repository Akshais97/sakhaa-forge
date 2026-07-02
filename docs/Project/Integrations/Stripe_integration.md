# Stripe Integration — International (non-INR) Credit Purchase

Status: In-depth reference for the Stripe payment integration (international, non-INR only — the
counterpart to Razorpay for India/INR). Documents Stripe's actual API/key behaviour, the exact
Checkout Session / PaymentIntent / webhook JSON, the keys required, and how V0's verified
credit-purchase contract maps to Stripe and back to V0's feature output.
Date verified: 2026-07-02 (against Stripe official docs, read directly).

Companion documents in this folder: `Razorpay_integration.md` (India/INR counterpart),
`HeyGen_integration.md`, `Supabase_integration.md`, `B2_integration.md`.

Canonical V0 contracts that own the behaviour (this doc is the provider-side companion):
- `docs/V0/V0_API.md` §"Credit Wallet, Verified Purchase And Ledger (V0-G2)"
- `docs/V0/V0_DATA_MODELS.md` — `CreditPurchase`, `CreditWallet`, `WalletLedgerEntry`
- `docs/V0/V0_SECURITY.md` — paid-action idempotency, signature on raw bytes, replay protection
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — payment key names

Sources: Stripe official docs —
docs.stripe.com/api/checkout/sessions/create, /api/payment_intents/create,
/api/idempotent_requests, /webhooks, /webhooks/quickstart.

---

## 0. The key fact

Stripe is V0's **international payment provider for credit purchase (non-INR currencies only)**.
The flow is asynchronous and idempotent: V0 creates a **Checkout Session** (hosted) or a
**PaymentIntent** server-side, the customer pays, Stripe sends a signed **webhook**
(`checkout.session.completed` / `payment_intent.succeeded`), and V0 verifies the signature,
reconciles amount/currency/workspace, and credits the wallet **exactly once** via an append-only
integer-minor ledger.

> **Stripe returns a session URL / PaymentIntent id and later a signed webhook — not a payment
> file. V0 credits the wallet only after a verified webhook reconciles against the initiated
> purchase; a timeout after possible acceptance is `unknown` and reconciled before any retry.**

V0 never stores payment-instrument details. Money is integer smallest-currency-unit units end to
end (cents for USD/EUR; see §10 for 0/3-decimal currencies); the ledger is append-only and
corrections are compensating entries. INR never goes to Stripe — it goes to Razorpay.

---

## 1. Integration keys and configuration

Source: `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` + `.env.example`.

| Variable | Required | Expected value / type | Classification | Used for |
|---|---|---|---|---|
| `PAYMENT_MODE` | yes | enum `simulator,providers` | Internal | Selects simulator vs live providers. Local `simulator`; prod explicit. |
| `STRIPE_SECRET_KEY` | International provider mode | Stripe server secret key (`sk_live_…` / `sk_test_…`) | **Secret** | Bearer auth for `/v1/checkout/sessions`, `/v1/payment_intents`. **Server-only; never browser.** |
| `STRIPE_WEBHOOK_SECRET` | International provider mode | Endpoint signing secret (`whsec_…`) | **Secret** | HMAC-SHA256 key for verifying `Stripe-Signature`. Callback startup fails if unset. |
| `PAYMENT_CALLBACK_BASE_URL` | provider mode | HTTPS URL | Internal | Base for `POST /callbacks/stripe` registered as the Stripe webhook endpoint. |

**Currency policy (V0 hard rule):** Stripe accepts **non-INR currencies only**. An INR purchase
routed to Stripe returns `VALIDATION_FAILED` (422) (`V0_API.md:265`). India/INR uses Razorpay
(see `Razorpay_integration.md`). Stripe currencies are **lowercase ISO 4217** (e.g. `usd`, `eur`,
`aed`) and amounts are in the **smallest currency unit** (cents for 2-decimal currencies).

**Key safety:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only — never in browser
code, logs, analytics, or retained artifacts. A **publishable key** (`pk_…`) is the browser-safe
key (used only if V0 builds a custom Stripe.js PaymentIntent flow); V0's hosted-Checkout path
needs only the secret key server-side.

**Current code reality:** V0 payments are **simulator-only**. `createCreditPurchase`
(`workspace-store.mjs:5262`) always emits `providerReference: sim_stripe_<uuid>` (`:5280`) and a
simulator-signed envelope using `V0_PAYMENT_SIMULATOR_SECRET || "v0-local-payment-secret"`
(`:5304`); `processPaymentCallback` (`:5320`) verifies the HMAC over **canonical JSON**
(`stableJson(envelope)`), not raw bytes. `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are **never
read**; no `stripe-provider.mjs` adapter exists. A real Stripe webhook would fail the current
verifier (see §7, §12).

---

## 2. Authentication and request headers

### Server → Stripe (create session / payment intent / fetch)
**Bearer auth** with the secret key:
```
POST https://api.stripe.com/v1/checkout/sessions      (or /v1/payment_intents)
Authorization: Bearer {STRIPE_SECRET_KEY}
Content-Type: application/x-www-form-urlencoded        (Stripe uses form-encoded params, not JSON)
Idempotency-Key: {v0-idempotency-key}                 (optional but V0 sends one; replays within ~24h)
```
Note: Stripe's REST API takes **form-encoded** parameters (e.g. `amount=2000&currency=usd`), with
nested fields as `line_items[0][price_data][unit_amount]=…`. The SDKs handle this; V0 uses the
Stripe SDK, not hand-rolled form encoding.

### Stripe → V0 (webhook)
```
POST {PAYMENT_CALLBACK_BASE_URL}/callbacks/stripe
Stripe-Signature: t=1492774577,v1=5257a869…,v0=6ffbb59b…
Content-Type: application/json

<raw webhook body>
```
- Header `Stripe-Signature`: comma-separated `t=<timestamp>`, `v1=<hex sig>` (live), `v0=…` (test
  only — **ignore v0** to prevent downgrade attacks).
- Signature: HMAC-SHA256 over `"{timestamp}.{raw_body}"`, keyed with `STRIPE_WEBHOOK_SECRET`
  (`whsec_…`), hex-encoded. Constant-time compare.
- **Critical:** the HMAC is over the **raw bytes** with the timestamp prefix — not parsed JSON.
- 5-minute replay tolerance (default); keep NTP-synced.
- Multiple `v1` signatures during secret rotation (previous secret active up to 24h) — verify
  against each active secret.
- Event id dedup: log processed event ids; also dedup by `data.object.id` + `event.type`.

---

## 3. The end-to-end flow (Checkout Session path — V0 primary)

### Step 1 — V0 creates the purchase + Checkout Session (server, before any external I/O)
`POST /credit-purchases` (Idempotency-Key required, `purchase_credits_and_view_wallet_ledger`
capability). V0 creates a `CreditPurchase` row in `initiated` (persisted before the Stripe call),
one wallet per currency, then creates a Stripe Checkout Session:

```
POST https://api.stripe.com/v1/checkout/sessions   (Bearer secret)
mode=payment
line_items[0][price_data][currency]=usd
line_items[0][price_data][unit_amount]=2000
line_items[0][price_data][product_data][name]=V0 Credits
line_items[0][quantity]=1
success_url={PUBLIC_WEB_URL}/billing/return?purchase={purchaseId}
cancel_url={PUBLIC_WEB_URL}/billing
metadata[workspaceId]={workspaceId}
metadata[purchaseId]={purchaseId}
client_reference_id={purchaseId}
```
Response (200):
```json
{
  "id": "cs_test_a11YYufWQzNY63zpQ6QSNRQhkUpVph4WRmzW0zWJO2znZKdVujZ0N0S22u",
  "object": "checkout.session",
  "amount_subtotal": 2000,
  "amount_total": 2000,
  "currency": "usd",
  "mode": "payment",
  "status": "open",
  "payment_status": "unpaid",
  "payment_intent": null,
  "url": "https://checkout.stripe.com/c/pay/cs_test_…",
  "expires_at": 1679686615,
  "metadata": { "workspaceId": "…", "purchaseId": "…" }
}
```
V0 stores `session.id` as the `providerReference` and embeds the `url` in the signed `checkout`
envelope; the browser redirects to the hosted Checkout URL. **No payment-instrument detail is
stored or returned.** (PaymentIntent alternative in §4.3.)

### Step 2 — Customer pays on Stripe-hosted Checkout
The browser opens `session.url`; the customer pays; Stripe captures and the session moves
`open → complete`, `payment_status: unpaid → paid`.

### Step 3 — Stripe sends the signed webhook
`checkout.session.completed` (and/or `payment_intent.succeeded`) is POSTed to
`{PAYMENT_CALLBACK_BASE_URL}/callbacks/stripe` with `Stripe-Signature`.

### Step 4 — V0 verifies, reconciles, credits (exactly once)
`processPaymentCallback` (`workspace-store.mjs:5320`):
1. Verify `Stripe-Signature` `v1` = HMAC-SHA256(`{t}.{raw body}`, `STRIPE_WEBHOOK_SECRET`)
   (constant-time; ignore `v0`; 5-min tolerance; accept previous secret during rotation).
2. Dedup via `InboxEvent (workspaceId, 'stripe', eventId)` + `(workspaceId, provider,
   providerReference)`; Stripe does not guarantee event ordering.
3. Reconcile `amount` (smallest unit), `currency`, `providerReference` (= session id /
   `payment_intent`), `workspaceId` (from `metadata`) against the initiated `CreditPurchase`.
   Mismatch → `PAYMENT_AMOUNT_MISMATCH` (409), credit nothing.
4. Match → purchase `succeeded`, append **exactly one** `PURCHASE` ledger entry in integer minor
   units, credit the wallet. Refund/dispute (`charge.refunded`/`charge.dispute.created`) append
   `REFUND` ledger entries that debit the wallet; purchase → `refunded`/`disputed`.
5. Timeout after possible provider acceptance → `unknown`; reconcile via
   `GET /v1/checkout/sessions/{id}` / `/v1/payment_intents/{id}` before any retry. Never blindly
   re-credit.

---

## 4. Full request/response schemas

### 4.1 Checkout Session — request (form-encoded; SDK normalizes)
| Field | Type | Required | Notes |
|---|---|---|---|
| `mode` | enum | yes | `payment` (one-time). V0 uses `payment`. |
| `line_items[0][price_data][currency]` | string | yes | lowercase ISO (`usd`). Non-INR. |
| `line_items[0][price_data][unit_amount]` | integer | yes | smallest currency unit (2000 = $20.00). |
| `line_items[0][price_data][product_data][name]` | string | yes | e.g. "V0 Credits". |
| `line_items[0][quantity]` | integer | yes | `1` for a fixed credit pack. |
| `success_url` | string | yes | V0 return URL (carries `purchaseId`). |
| `cancel_url` | string | recommended | V0 cancel URL. |
| `metadata` | object | no | `{workspaceId, purchaseId}` — echoed in webhook. |
| `client_reference_id` | string | no | V0 `purchaseId` for correlation. |
| `customer_email` | string | no | Prefill. |

### 4.2 Checkout Session — response
| Field | Type | Description |
|---|---|---|
| `id` | string | `cs_…` → V0 `providerReference`. |
| `object` | string | `"checkout.session"`. |
| `url` | string | Hosted checkout URL → browser. |
| `amount_total` | integer | Smallest unit total. |
| `currency` | string | lowercase ISO. |
| `status` | string | `open` \| `complete` \| `expired`. |
| `payment_status` | string | `unpaid` \| `paid` \| `no_payment_required`. |
| `payment_intent` | string \| null | `pi_…` (null until created). |
| `expires_at` | integer | Default 24h after creation. |
| `metadata` | object | Echoed. |

### 4.3 PaymentIntent — alternative (custom Stripe.js flow)
Create:
```
POST https://api.stripe.com/v1/payment_intents   (Bearer secret)
amount=2000
currency=usd
metadata[workspaceId]=…
metadata[purchaseId]=…
automatic_payment_methods[enabled]=true
```
Response (200):
```json
{
  "id": "pi_3MtwBwLkdIwHu7ix28a3tqPa",
  "object": "payment_intent",
  "amount": 2000,
  "currency": "usd",
  "client_secret": "pi_3MtwBwLkdIwHu7ix28a3tqPa_secret_YrKJUKribcBjcG8HVhfZluoGH",
  "status": "requires_payment_method",
  "metadata": { "workspaceId": "…", "purchaseId": "…" }
}
```
Statuses: `requires_payment_method` → `requires_confirmation` → `requires_action` (3DS) →
`processing` → `succeeded` (or `canceled` / `requires_capture` for manual). The browser confirms
via Stripe.js using `client_secret` + the **publishable key** (`pk_…`); V0 stores `pi.id` as
`providerReference`. The Checkout Session path is simpler for V0 (no client-side card handling);
PaymentIntent is used only if V0 builds a custom embedded payment UI.

### 4.4 Webhook event
Stripe POSTs an `Event` object as the raw body:
```json
{
  "id": "evt_1N…",
  "object": "event",
  "type": "checkout.session.completed",
  "data": { "object": { "id": "cs_…", "amount_total": 2000, "currency": "usd", "metadata": { "workspaceId": "…", "purchaseId": "…" }, "payment_status": "paid", "payment_intent": "pi_…" } },
  "created": 1680800504,
  "livemode": false
}
```
Events V0 handles: `checkout.session.completed` / `payment_intent.succeeded` (credit on success);
`payment_intent.payment_failed` (no credit); `charge.refunded` / `charge.dispute.created`
(append `REFUND` ledger, debit wallet). Confirm exact per-event `data.object` fields against
Stripe's event reference at deployment time; the signature scheme above is certain.

### 4.5 Webhook signature — exact
- Header `Stripe-Signature`: `t=<unix>,v1=<hex>,v0=<test-only>`.
- signed_payload = `{t}.{raw_body}` (timestamp + `.` + raw bytes).
- Key: `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
- Algorithm: HMAC-SHA256, hex output.
- Compare: constant-time; accept any matching `v1`; ignore `v0`.
- Tolerance: 5 min (configurable; never `0`). Multi-secret during 24h rotation.

### 4.6 Errors
Stripe returns JSON `{ "error": { "type", "code", "message", "param", … } }` with HTTP status
(e.g. 400 `invalid_request_error`, 401 `authentication_error`, 402 `card_error` /
`insufficient_funds`, 429 `rate_limit_error`, 503 `api_error`). `Idempotency-Key` reuse with a
different body → 409 `idempotency_error`.

---

## 5. V0 input → Stripe mapping (what V0 sends)

| V0 field | Stripe field | Notes |
|---|---|---|
| `CreditPurchase.amountMinor` (integer minor) | `line_items[0][price_data][unit_amount]` / PaymentIntent `amount` | Smallest currency unit. Map per currency decimals (see §10). |
| `currency` (non-INR, lowercase) | `currency` | V0 enforces non-INR for Stripe (`VALIDATION_FAILED` 422 for INR). Stripe uses lowercase ISO. |
| `workspaceId`, `CreditPurchase.id` | `metadata` (+ `client_reference_id`) | Echoed in webhook → correlates back to the purchase. |
| `CreditPurchase.providerReference` | `session.id` (`cs_…`) or `payment_intent` (`pi_…`) | V0 stores the Stripe object id as providerReference. |
| `Idempotency-Key` (V0 request) | `Idempotency-Key` header (Stripe) | Double idempotency: V0 key on the purchase route + Stripe `Idempotency-Key` on the session/payment-intent create. |
| `STRIPE_SECRET_KEY` | Bearer auth | Server-only. |
| `PUBLIC_WEB_URL` | `success_url` / `cancel_url` | Return URL after Checkout. |

**Persist before I/O:** the `CreditPurchase` row (`initiated`, `providerReference`, `amountMinor`,
`currency`, `workspaceId`) is written **before** the Stripe create call, so a crash leaves a
resumable purchase, never a blind duplicate.

---

## 6. Stripe → V0 output mapping (what V0 gets back, by feature)

| Stripe output | V0 object / action | Feature meaning |
|---|---|---|
| `session.id`/`url` (`open`) | `CreditPurchase.providerReference = session.id`; respond `202` + signed checkout (embeds `url`) | "Session created; browser can pay." |
| `checkout.session.completed` / `payment_intent.succeeded` (verified) | purchase → `succeeded`; append **one** `PURCHASE` `WalletLedgerEntry` (integer minor); credit `CreditWallet` | "Verified purchase — credits landed exactly once." |
| `payment_intent.payment_failed` | purchase → `failed`; no credit; RELEASE | "Payment failed — no credits." |
| `charge.refunded` / `charge.dispute.created` | append `REFUND` ledger (debit wallet); purchase → `refunded`/`disputed` | "Money truth is append-only; corrections are compensating." |
| Mismatched amount/currency/workspace | `PAYMENT_AMOUNT_MISMATCH` (409); no credit | "Forged/tampered callback cannot credit." |
| Timeout after possible acceptance | `unknown`; reconcile via `GET /v1/checkout/sessions/{id}` before retry | "Never blindly re-credit a paid purchase." |

**Feature-level outcome (second order).** Stripe is the **international money-in** boundary of
V0's credit economy, mirroring Razorpay's India role for non-INR customers. A verified
`checkout.session.completed` webhook is the only thing that turns foreign currency into spendable
V0 credits — through the same append-only integer-minor ledger that is the root of all downstream
paid actions. Because credit is granted only after a signed, deduplicated, reconciled webhook
(raw-body HMAC with the timestamp prefix, multi-secret rotation-aware), V0 can never double-credit
or credit a mismatched amount; the ledger is auditable forever. This credit is what the HeyGen
settlement `CAPTURE` draws down (see `HeyGen_integration.md` §7), so Stripe is the **source of V0's
spendable truth for the international customer**.

---

## 7. Webhook signature verification — real scheme vs current code

**Real Stripe scheme:**
- Header `Stripe-Signature`; parse `t=` (timestamp) and `v1=` (hex sig); ignore `v0` (downgrade
  protection).
- `signed_payload = "{t}.{raw_body}"`; HMAC-SHA256 with `STRIPE_WEBHOOK_SECRET` (`whsec_…`); hex;
  constant-time compare; 5-min tolerance; accept any active secret during 24h rotation.
- Dedup by event id + `data.object.id`+`event.type`; Stripe does not guarantee ordering.

**Current V0 code (`workspace-store.mjs:5320` + `signPaymentEnvelope`/`verifyPaymentSignature`):**
- Verifies HMAC over **canonical JSON** (`stableJson(envelope)`), not raw bytes — a real Stripe
  webhook (timestamp-prefixed raw-body HMAC) would **fail**.
- Uses the simulator secret (`V0_PAYMENT_SIMULATOR_SECRET || "v0-local-payment-secret"`), not
  `STRIPE_WEBHOOK_SECRET`.
- The webhook route (`POST /callbacks/stripe`) receives parsed `request.body`, not the raw body
  + header needed for the Stripe scheme.

**Real-wiring gap (documentation; no code here):**
1. Capture the **raw body** in the callback route (Fastify pre-parse) and read the `Stripe-Signature`
   header.
2. Parse `t`/`v1`, compute HMAC-SHA256(`{t}.{raw_body}`, `STRIPE_WEBHOOK_SECRET`), constant-time
   compare, 5-min tolerance, accept previous secret during rotation.
3. Replace the canonical-JSON simulator verifier with the raw-body verifier (branch by
   `PAYMENT_MODE`: simulator→canonical-JSON, providers→Stripe scheme).

---

## 8. Idempotency, unknown, and retry semantics

- **Stripe `Idempotency-Key` header:** V0 sends a stable key on the create call; replays within
  ~24h return the original response; a different body with the same key → `409 idempotency_error`.
  Combined with V0's `Idempotency-Key` on `POST /credit-purchases`, this prevents duplicate
  sessions/intents and duplicate purchases.
- **Webhook dedup:** Stripe event id + V0 `InboxEvent (workspaceId, 'stripe', eventId)` and
  `(workspaceId, provider, providerReference)`. Stripe may send duplicate or out-of-order events;
  V0 credits exactly once.
- **Timeout after possible acceptance → `unknown`:** if V0 times out after Stripe may have created
  the session/intent (or after a webhook that may have credited), V0 marks the purchase `unknown`
  and reconciles via `GET /v1/checkout/sessions/{id}` / `/v1/payment_intents/{id}` before any retry.
  Never blindly re-create or re-credit.
- **Refund/dispute:** append `REFUND` (debit); never edit history.
- **Session expiry:** Checkout Sessions expire after 24h; V0 re-initiates an expired purchase on
  customer retry (new session), preserving the same `CreditPurchase` id.

---

## 9. Stripe error → V0 error code mapping

| Stripe signal | HTTP | V0 error code | Action |
|---|---|---|---|
| `authentication_error` (bad/revoked key) | 401 | `PROVIDER_UNAVAILABLE` (503) | Config/secret; do not retry from purchase path. |
| `invalid_request_error` (bad amount/currency) | 400 | `VALIDATION_FAILED` (422) | Validate before send. |
| INR routed to Stripe | — | `VALIDATION_FAILED` (422) | V0 enforces non-INR pre-call. |
| `card_error` / `insufficient_funds` / `declined` | 402 | `PAYMENT_DECLINED`/surface to customer | No credit; customer retries. |
| `rate_limit_error` | 429 | retryable | Back off. |
| `idempotency_error` (key reuse, diff body) | 409 | (treat as conflict) | Reconcile. |
| Webhook signature mismatch | — | `PAYMENT_SIGNATURE_INVALID` (401) | Reject; do not credit. |
| Webhook amount/currency/workspace mismatch | — | `PAYMENT_AMOUNT_MISMATCH` (409) | No credit. |
| Webhook replay (>5 min) | — | reject | Drop. |
| Timeout after possible accept | — | `unknown` | Reconcile before retry. |

---

## 10. Limits

- **Amount:** positive integer, smallest currency unit, min ~$0.50 USD equivalent; up to 8 digits
  (99999999). V0 `amountMinor` maps directly for **2-decimal currencies** (USD/EUR/AED → cents).
  For **0-decimal currencies** (JPY, KRW) pass the whole amount; for **3-decimal currencies** (KWD,
  BHD, OMR) the smallest unit is 1/1000 — V0 must convert per Stripe's currency-decimal table.
- **Currency:** lowercase ISO 4217, **non-INR only** for V0's Stripe path.
- **Checkout Session:** expires 24h after creation; `success_url` required for redirect.
- **Idempotency-Key:** up to 255 chars; replays within ~24h.
- **Webhook tolerance:** 5 min default (never 0); keep NTP-synced; rotation window 24h.
- **Metadata:** key-value, string values; V0 uses `{workspaceId, purchaseId}`.

---

## 11. Cost model

Stripe's **transaction fee** (≈2.9% + $0.30 domestic, more international, per Stripe's published
pricing) is an **operational cost borne by the platform**, not a V0 ledger entry. V0 credits the
wallet at the **face value** the customer paid (`amountMinor` = smallest unit), consumed later by
generation settlement (`providerTotalMinor` via `ProviderPriceVersion`). The Stripe fee is an ops
P&L item, not a `WalletLedgerEntry`. V0 therefore does not model a Stripe `ProviderPriceVersion`;
the ledger records the customer's spendable credit, and HeyGen's per-second price version records
the generation cost (see `HeyGen_integration.md` §13). Wallet reconciliation (Owner/Admin) matches
ledger totals against the simulator paid totals (`matched`/`mismatched`/`unknown`).

---

## 12. Mapping to the current V0 code

| Concern | Current code | Canonical target |
|---|---|---|
| Adapter | No `stripe-provider.mjs`; `createCreditPurchase` emits `sim_stripe_<uuid>` + simulator signature (`workspace-store.mjs:5262–5316`) | Real adapter: `POST /v1/checkout/sessions` (or `/v1/payment_intents`) with Bearer auth; store `cs_…`/`pi_…` as `providerReference`. |
| Mode switch | `PAYMENT_MODE=simulator` always; no provider branch | Gate live path behind `PAYMENT_MODE=providers`; keep simulator for tests. |
| Keys | `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` never read | Read from env; server-only. |
| Webhook verification | HMAC over canonical JSON (`stableJson`), simulator secret (`:5320–5341`) | Raw-body `t.{body}` HMAC-SHA256 with `STRIPE_WEBHOOK_SECRET`; parse `Stripe-Signature`; 5-min tolerance; rotation-aware. |
| Raw body | Route receives parsed `request.body` | Capture raw body (Fastify pre-parse) for HMAC. |
| Currency | Provider label only (non-INR→"stripe") | Real non-INR lowercase ISO; map `amountMinor` per currency decimals. |
| Reconcile | Simulator reconcile (`matched/mismatched/unknown`) | Real `GET /v1/checkout/sessions/{id}` / `/v1/payment_intents/{id}` for `unknown` recovery. |

**Real-wiring gap:** create `stripe-provider.mjs` (mirror the Heygen/Razorpay adapter pattern),
implement real Checkout Session/PaymentIntent creation + raw-body webhook verification, gate
behind `PAYMENT_MODE=providers`, map amounts per currency decimals, and reconcile via
session/intent status. Keep the simulator for tests.

---

## 13. Summary — what the reader needs to know

- **What V0 sends (input):** `POST /v1/checkout/sessions` (Bearer `STRIPE_SECRET_KEY`) with
  `mode=payment`, `line_items[0][price_data]` (`currency` lowercase non-INR, `unit_amount` smallest
  unit), `success_url`/`cancel_url`, and `metadata {workspaceId, purchaseId}` — after persisting the
  `CreditPurchase` row. (`Idempotency-Key` header on the Stripe call.)
- **What Stripe returns (output):** a `cs_…` session id + hosted `url`; later a signed webhook
  (`Stripe-Signature: t=…,v1=…` = HMAC-SHA256 over `{t}.{raw_body}` with `whsec_…`) confirming
  `checkout.session.completed` / `payment_intent.succeeded`.
- **What V0 produces (feature):** verified, exactly-once credit into an append-only integer-minor
  wallet ledger — the spendable truth for the international customer that downstream paid actions
  (generation settlement) draw down. Refunds/disputes are append-only compensating entries.
- **Keys needed:** `PAYMENT_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `PAYMENT_CALLBACK_BASE_URL`. Secret/webhook-secret server-only; non-INR only.
- **Real-wiring gap:** no live adapter; webhook verifies canonical JSON (not raw body) with the
  simulator secret; keys unread. A real `stripe-provider.mjs` + raw-body HMAC + currency-decimal
  mapping + session/intent reconcile is required before real money.

---

## Sources

- docs.stripe.com/api/checkout/sessions/create — endpoint, Bearer auth, request/response, `cs_` id, `url`
- docs.stripe.com/api/payment_intents/create — endpoint, request/response, `pi_` id, `client_secret`, statuses
- docs.stripe.com/webhooks — `Stripe-Signature`, `t=`/`v1=`, HMAC-SHA256 over `{t}.{raw_body}`, `whsec_…`, 5-min tolerance, rotation, dedup
- docs.stripe.com/api/idempotent_requests — `Idempotency-Key` header semantics
- `docs/V0/V0_API.md` §V0-G2 — verified purchase + ledger contract (non-INR→Stripe)
- `docs/V0/V0_DATA_MODELS.md` — `CreditPurchase`, `CreditWallet`, `WalletLedgerEntry`
- `docs/V0/V0_SECURITY.md` — paid-action idempotency, raw-bytes signature, replay protection
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — payment key names
- `apps/api/src/workspace-store.mjs` — current simulator payments path (code-grounded)