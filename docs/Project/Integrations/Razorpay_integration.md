# Razorpay Integration — India (INR) Credit Purchase

Status: In-depth reference for the Razorpay payment integration (India-first, INR only). Documents
Razorpay's actual API/key behaviour, the exact order/webhook JSON, the keys required, and how V0's
verified-credit-purchase contract maps to Razorpay and back to V0's feature output.
Date verified: 2026-07-02 (against Razorpay official docs, read directly).

Companion documents in this folder: `HeyGen_integration.md`, `Supabase_integration.md`,
`B2_integration.md`, `Stripe_integration.md` (international counterpart).

Canonical V0 contracts that own the behaviour (this doc is the provider-side companion):
- `docs/V0/V0_API.md` §"Credit Wallet, Verified Purchase And Ledger (V0-G2)"
- `docs/V0/V0_DATA_MODELS.md` — `CreditPurchase`, `CreditWallet`, `WalletLedgerEntry`
- `docs/V0/V0_SECURITY.md` — paid-action idempotency, signature on raw bytes, replay protection
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — payment key names

Sources: Razorpay official docs —
razorpay.com/docs/api/orders/create/, /docs/webhooks/validate-test/, /docs/webhooks/,
/docs/payments/dashboard/account-settings/api-keys/.

---

## 0. The key fact

Razorpay is V0's **India-first payment provider for credit purchase (INR only)**. The flow is
asynchronous and idempotent: V0 creates an **order** server-side, the browser pays via Razorpay
Checkout, Razorpay sends a signed **webhook** (`order.paid` / `payment.captured`), and V0 verifies
the signature, reconciles amount/currency/workspace, and credits the wallet **exactly once** via an
append-only integer-minor ledger.

> **Razorpay returns an order id and later a signed webhook — not a payment file. V0 credits the
> wallet only after a verified webhook reconciles against the initiated purchase; a timeout after
> possible acceptance is `unknown` and reconciled before any retry.**

V0 never stores payment-instrument details. Money is integer minor units (paise for INR) end to
end; the ledger is append-only and corrections are compensating entries.

---

## 1. Integration keys and configuration

Source: `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` + `.env.example`.

| Variable | Required | Expected value / type | Classification | Used for |
|---|---|---|---|---|
| `PAYMENT_MODE` | yes | enum `simulator,providers` | Internal | Selects simulator vs live providers. Local `simulator`; prod must be explicit. |
| `RAZORPAY_KEY_ID` | India provider mode | Razorpay API key id | **Secret** | Basic-auth username for `/v1/orders`; also used in browser Checkout. |
| `RAZORPAY_KEY_SECRET` | India provider mode | Razorpay API key secret | **Secret** | Basic-auth password (server-only; **never browser**). |
| `RAZORPAY_WEBHOOK_SECRET` | India provider mode | Webhook signing secret | **Secret** | HMAC-SHA256 key for verifying `X-Razorpay-Signature`. Callback startup fails if unset. |
| `PAYMENT_CALLBACK_BASE_URL` | provider mode | HTTPS URL (port 443) | Internal | Base for `POST /callbacks/razorpay` registered with Razorpay. |

**Currency policy (V0 hard rule):** Razorpay accepts **INR only**. A non-INR purchase routed to
Razorpay returns `VALIDATION_FAILED` (422) (`V0_API.md:265`). International (non-INR) uses Stripe
(see `Stripe_integration.md`).

**Key safety:** `RAZORPAY_KEY_ID` may be exposed to the browser for Razorpay Checkout JS;
`RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are server-only, never in browser code, logs,
analytics, or retained artifacts. Keys are obtained from Razorpay Dashboard → Settings → API Keys.

**Current code reality:** V0 payments are **simulator-only**. `createCreditPurchase`
(`workspace-store.mjs:5262`) always emits `providerReference: sim_razorpay_<uuid>`
(`:5280`) and a simulator-signed envelope using `V0_PAYMENT_SIMULATOR_SECRET || "v0-local-payment-
secret"` (`:5304`); `processPaymentCallback` (`:5320`) verifies the HMAC over **canonical JSON**
(`stableJson(envelope)`), not raw bytes. `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` are **never read**;
no `razorpay-provider.mjs` adapter exists. A real Razorpay webhook would fail the current verifier
(see §7, §12).

---

## 2. Authentication and request headers

### Server → Razorpay (create order, capture, fetch)
**HTTP Basic auth:** `RAZORPAY_KEY_ID` as username, `RAZORPAY_KEY_SECRET` as password.
```
POST https://api.razorpay.com/v1/orders
Authorization: Basic base64(RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET)
Content-Type: application/json
```

### Razorpay → V0 (webhook)
```
POST {PAYMENT_CALLBACK_BASE_URL}/callbacks/razorpay
X-Razorpay-Signature: <hex-hmac-sha256-of-raw-body>
X-Razorpay-Event-Id: <unique-per-event>      (dedup)
Content-Type: application/json

<raw webhook body>
```
- Signature: HMAC-SHA256 of the **raw request body**, keyed with `RAZORPAY_WEBHOOK_SECRET`,
  **hex-encoded**. Compared constant-time.
- **Critical:** the HMAC is computed over the **raw bytes**, not parsed/re-serialized JSON. V0
  must capture the raw body before JSON parsing (Fastify pre-parse hook) and verify against it.
- Dedup: `X-Razorpay-Event-Id` is unique per event; V0 dedups via `InboxEvent (workspaceId,
  'razorpay', eventId)` plus the V0 `(workspaceId, provider, providerReference)` key.
- Rotated secret: older retried webhooks must verify against the **previous** secret; V0 must
  accept both during rotation.

### Browser → Razorpay Checkout
The browser loads Razorpay Checkout JS with `RAZORPAY_KEY_ID` and the V0 order id, collects the
payment instrument, and Razorpay returns the result to V0 via webhook. V0 never sees or stores
the instrument.

---

## 3. The end-to-end flow

### Step 1 — V0 creates the purchase + order (server, before any external I/O)
`POST /credit-purchases` (Idempotency-Key required, `purchase_credits_and_view_wallet_ledger`
capability). V0 creates a `CreditPurchase` row in `initiated` with a `providerReference`, one
wallet per currency (idempotent on `(workspaceId, currency)`), and a `RESERVE`-style intent —
**persisted before** the Razorpay call (persist-before-I/O). Then V0 calls Razorpay:

```
POST https://api.razorpay.com/v1/orders   (Basic auth)
{ "amount": 50000, "currency": "INR", "receipt": "<v0-receipt>", "notes": { "workspaceId": "…", "purchaseId": "…" } }
```
Response (200):
```json
{
  "id": "order_RB58MiP5SPFYyM",
  "entity": "order",
  "amount": 50000,
  "amount_paid": 0,
  "amount_due": 50000,
  "currency": "INR",
  "receipt": "<v0-receipt>",
  "status": "created",
  "attempts": 0,
  "notes": { "workspaceId": "…", "purchaseId": "…" },
  "created_at": 1756455561,
  "offer_id": null
}
```
V0 stores `order.id` as the `providerReference` (and `notes` correlate the webhook back to the
purchase), then responds `202 Accepted` with the signed `checkout` envelope (the order id + amount
+ currency + workspace + providerReference) so the browser can open Checkout. **No
payment-instrument detail is stored or returned.**

### Step 2 — Browser pays via Razorpay Checkout
The browser opens Razorpay Checkout with `RAZORPAY_KEY_ID` + the order id; the customer pays.
Razorpay captures the payment and the order moves `created → attempted → paid`.

### Step 3 — Razorpay sends the signed webhook
`order.paid` (and/or `payment.captured` / `payment.authorized`) is POSTed to
`{PAYMENT_CALLBACK_BASE_URL}/callbacks/razorpay` with `X-Razorpay-Signature` + `X-Razorpay-Event-Id`.

### Step 4 — V0 verifies, reconciles, credits (exactly once)
`processPaymentCallback` (`workspace-store.mjs:5320`):
1. Verify `X-Razorpay-Signature` = HMAC-SHA256(raw body, `RAZORPAY_WEBHOOK_SECRET`) (constant-time).
2. Reject replays outside the 5-minute timestamp window.
3. Dedup via `InboxEvent (workspaceId, 'razorpay', eventId)` + `(workspaceId, provider,
   providerReference)`.
4. Reconcile `amount`, `currency`, `providerReference` (= order id), `workspaceId` against the
   initiated `CreditPurchase`. Mismatch → `PAYMENT_AMOUNT_MISMATCH` (409), credit nothing.
5. Match → purchase `succeeded`, append **exactly one** `PURCHASE` ledger entry in integer minor
   units, credit the wallet. Refund/dispute callbacks append `REFUND` ledger entries that debit
   the wallet; purchase moves to `refunded`/`disputed`.
6. Timeout after possible provider acceptance → `unknown`; reconcile (fetch order status) before
   any retry. Never blindly re-credit.

---

## 4. Full request/response schemas

### 4.1 Create order — request
| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | integer | yes | Amount in **paise** (INR is 2-decimal: ₹500 → `50000`). Min INR 1.00 → `100`. |
| `currency` | string | yes | ISO 4217, 3 chars. V0: `"INR"` only. |
| `receipt` | string | no | Max 40 chars, unique — **acts as an idempotency key** (duplicates rejected). V0 sets a short workspace+purchase-derived value. |
| `notes` | object | no | Up to 15 key-value pairs, 256 chars/value. V0 puts `{workspaceId, purchaseId}` for webhook correlation. |

### 4.2 Create order — response
| Field | Type | Description |
|---|---|---|
| `id` | string | Order id, `order_…`. → V0 `providerReference`. |
| `entity` | string | `"order"`. |
| `amount` | integer | Paise. |
| `amount_paid` | integer | Paid so far. |
| `amount_due` | integer | Remaining. |
| `currency` | string | `INR`. |
| `receipt` | string | Echoed. |
| `status` | string | `created` \| `attempted` \| `paid` (stays `paid` even after refund). |
| `attempts` | integer | Payment attempt count. |
| `notes` | object | Echoed (correlation). |
| `created_at` | integer | Unix timestamp. |
| `offer_id` | string \| null | Offer id. |

### 4.3 Create order — errors (HTTP 400 unless noted)
- Auth failure / test-live key mismatch / expired key → 401.
- `amount < 100` (INR) → "amount must be at least INR 1.00".
- Non-integer/negative/oversize amount.
- `BAD_REQUEST_INVALID_CURRENCY` — currency not enabled for account.
- Receipt > 40 chars / bad encoding (`BAD_REQUEST_ENCODING_VALIDATION_FAILED`).
- Duplicate `receipt` → "Duplicate request. This request has already been processed." (idempotent).
- Concurrent operation → "Request failed because another order operation is in progress."

### 4.4 Webhook payload
Razorpay POSTs the event JSON as the **raw body** (the signature is over those raw bytes). Top-level
shape for `payment.*` / `order.*` events carries the entity + `notes` (V0's correlation fields are
echoed back). **Confirm the exact per-event payload fields against Razorpay's "List of Webhook
Events" reference at deployment time**; the signature scheme and headers above are certain.

Events V0 handles: `order.paid`, `payment.captured` / `payment.authorized` (credit on success);
`payment.failed` (no credit); refund/dispute events (append `REFUND` ledger entry, debit wallet).
Terminal events (`payment.captured`/`payment.failed`) — ignore webhooks after a terminal state.

### 4.5 Webhook signature — exact
- Header: `X-Razorpay-Signature` (hex HMAC-SHA256).
- Key: `RAZORPAY_WEBHOOK_SECRET`.
- Message: **raw request body bytes** (do not parse/re-serialize).
- Compare: constant-time (`crypto.timingSafeEqual`).
- Dedup header: `X-Razorpay-Event-Id`.

---

## 5. V0 input → Razorpay mapping (what V0 sends)

| V0 field | Razorpay field | Notes |
|---|---|---|
| `CreditPurchase.amountMinor` (integer minor/paise) | `amount` | Direct: V0 integer minor units = Razorpay paise for INR. |
| `currency` (`INR`) | `currency` | V0 enforces INR-only for Razorpay (`VALIDATION_FAILED` 422 otherwise). |
| `CreditPurchase.id` / idempotency | `receipt` (≤40 chars, unique, idempotency key) | V0 must derive a short receipt (workspace+purchase), not the long `sim_…` UUID. |
| `workspaceId`, `CreditPurchase.id` | `notes` | Echoed in webhook → correlates back to the purchase. |
| `RAZORPAY_KEY_ID` / `SECRET` | Basic auth | Server-only. |
| `CreditPurchase.providerReference` | `order.id` (response) | V0 stores the order id as providerReference. |
| `Idempotency-Key` (V0 request) | (V0-side) + Razorpay `receipt` | Double idempotency: V0 Idempotency-Key on the purchase route + Razorpay `receipt` on the order. |

**Persist before I/O:** the `CreditPurchase` row (`initiated`, `providerReference`, `amountMinor`,
`currency`, `workspaceId`) is written **before** the Razorpay `POST /v1/orders`, so a crash leaves
a resumable purchase, never a blind duplicate order.

---

## 6. Razorpay → V0 output mapping (what V0 gets back, by feature)

| Razorpay output | V0 object / action | Feature meaning |
|---|---|---|
| `order.id` + `status: created` | `CreditPurchase.providerReference = order.id`, status stays `initiated`; respond `202` + signed checkout | "Order created; browser can pay." |
| `order.paid` / `payment.captured` (verified webhook) | purchase → `succeeded`; append **one** `PURCHASE` `WalletLedgerEntry` (integer minor); credit `CreditWallet` | "Verified purchase — credits landed exactly once." |
| `payment.failed` | purchase → `failed`; no credit; RELEASE reservation | "Payment failed — no credits." |
| Refund/dispute webhook | append `REFUND` ledger entry (debit wallet); purchase → `refunded`/`disputed` | "Money truth is append-only; corrections are compensating, never edits." |
| Mismatched amount/currency/workspace | `PAYMENT_AMOUNT_MISMATCH` (409); no credit | "Forged/tampered callback cannot credit the wallet." |
| Timeout after possible acceptance | `unknown`; reconcile via `GET /v1/orders/{id}` before retry | "Never blindly re-credit a paid purchase." |

**Feature-level outcome (second order).** Razorpay is the **India money-in** boundary of V0's
credit economy. A verified `order.paid` webhook is the only thing that turns rupees into spendable
V0 credits — and it does so through an append-only integer-minor ledger that is the root of all
downstream paid actions (generation settlement, publishing). Because the credit is granted **only**
after a signed, deduplicated, reconciled webhook, V0 can never double-credit or credit a
mismatched amount; and because the ledger is append-only, the money trail is auditable forever.
This credit balance is what the HeyGen settlement `CAPTURE` draws down (see `HeyGen_integration.md`
§7), so Razorpay is the **source of V0's spendable truth** for the India customer.

---

## 7. Webhook signature verification — real scheme vs current code

**Real Razorpay scheme:**
- Header `X-Razorpay-Signature`; HMAC-SHA256 over the **raw body**; hex; keyed with
  `RAZORPAY_WEBHOOK_SECRET`; constant-time compare; dedup via `X-Razorpay-Event-Id`; 5-minute
  replay window (V0 rule); accept previous secret during rotation.

**Current V0 code (`workspace-store.mjs:5320` + `signPaymentEnvelope`/`verifyPaymentSignature`):**
- Verifies the HMAC over **canonical JSON** (`stableJson(envelope)`), not raw bytes — a real
  Razorpay webhook (raw-body HMAC) would **fail** verification.
- Uses the simulator secret (`V0_PAYMENT_SIMULATOR_SECRET || "v0-local-payment-secret"`), not
  `RAZORPAY_WEBHOOK_SECRET`.
- The webhook route (`POST /callbacks/razorpay`) receives parsed `request.body`, not the raw body
  needed for HMAC.

**Real-wiring gap (documentation; no code here):**
1. Capture the **raw body** in the callback route (Fastify pre-parse) before JSON parsing.
2. Verify `X-Razorpay-Signature` = HMAC-SHA256(raw body, `RAZORPAY_WEBHOOK_SECRET`) constant-time.
3. Read `X-Razorpay-Event-Id` for dedup; keep the 5-min window + `InboxEvent` dedup.
4. Accept the previous secret during rotation (rotation window).
5. Replace the canonical-JSON simulator verifier with the raw-body verifier (or branch by
   `PAYMENT_MODE`: simulator→canonical-JSON, providers→raw-body).

---

## 8. Idempotency, unknown, and retry semantics

- **Order idempotency:** Razorpay `receipt` is the idempotency key for `POST /v1/orders`
  (duplicates rejected). V0 also carries its own `Idempotency-Key` on `POST /credit-purchases`.
  Double idempotency prevents duplicate orders and duplicate purchases.
- **Webhook dedup:** `X-Razorpay-Event-Id` + V0 `InboxEvent (workspaceId, 'razorpay', eventId)` and
  the `(workspaceId, provider, providerReference)` key. A retried webhook credits exactly once.
- **Timeout after possible acceptance → `unknown`:** if V0 times out after Razorpay may have
  accepted the order (or after a webhook that may have credited), V0 marks the purchase `unknown`
  and reconciles by fetching order/payment status before any retry. Never blindly re-create an
  order or re-credit.
- **Refund/dispute:** append `REFUND` (debit); never edit history.
- **Concurrency:** Razorpay rejects concurrent order operations; V0 serializes per purchase.

---

## 9. Razorpay error → V0 error code mapping

| Razorpay signal | HTTP | V0 error code | Action |
|---|---|---|---|
| Bad/expired key, test-live mismatch | 401 | `PROVIDER_UNAVAILABLE` (503) | Config/secret; do not retry from purchase path. |
| `amount < 100` / non-integer / oversize | 400 | `VALIDATION_FAILED` (422) | Validate amountMinor before send. |
| `BAD_REQUEST_INVALID_CURRENCY` / non-INR | 400 | `VALIDATION_FAILED` (422) | V0 already enforces INR-only pre-call. |
| Receipt > 40 / bad encoding | 400 | `VALIDATION_FAILED` (422) | Derive short ASCII receipt. |
| Duplicate `receipt` | 400 | (treat as accepted) | Reconcile to existing order. |
| Concurrent order op | 400 | retryable | Back off; serialize per purchase. |
| Webhook signature mismatch | — | `PAYMENT_SIGNATURE_INVALID` (401) | Reject; do not credit. |
| Webhook amount/currency/workspace mismatch | — | `PAYMENT_AMOUNT_MISMATCH` (409) | No credit. |
| Webhook replay (>5 min) | — | `PAYMENT_SIGNATURE_INVALID`/reject | Drop. |
| Timeout after possible accept | — | `unknown` | Reconcile before retry. |

---

## 10. Limits

- **Amount:** minimum INR 1.00 (`100` paise); per-account/currency maximum enforced by Razorpay.
- **Currency:** INR only for V0's Razorpay path; V0 rejects non-INR with `VALIDATION_FAILED`.
- **`receipt`:** max 40 chars, ASCII only, unique (idempotency key).
- **`notes`:** up to 15 key-value pairs, 256 chars/value.
- **Webhook endpoint:** HTTPS, port 443 (or 80). Whitelist Razorpay webhook IPs.
- **Minor units:** INR is 2-decimal → paise. V0 `amountMinor` maps directly (₹500 → `50000`).

---

## 11. Cost model

Razorpay's **transaction fee** (≈2-3% domestic cards/UPI per Razorpay's published pricing) is an
**operational cost borne by the platform**, not a V0 ledger entry. V0 credits the wallet at the
**face value** the customer paid (`amountMinor` = paise), and the credit is later consumed by
generation settlement (`providerTotalMinor` via `ProviderPriceVersion`). The Razorpay fee is an ops
P&L item, not a `WalletLedgerEntry`. V0 therefore does not model a Razorpay `ProviderPriceVersion`;
the ledger records the customer's spendable credit, and HeyGen's per-second price version records
the generation cost (see `HeyGen_integration.md` §13). Wallet reconciliation (Owner/Admin) matches
ledger purchase/refund totals against the simulator paid totals (`matched`/`mismatched`/`unknown`).

---

## 12. Mapping to the current V0 code

| Concern | Current code | Canonical target |
|---|---|---|
| Adapter | No `razorpay-provider.mjs`; `createCreditPurchase` emits `sim_razorpay_<uuid>` + simulator signature (`workspace-store.mjs:5262–5316`) | Real adapter: `POST /v1/orders` with Basic auth; store `order.id` as `providerReference`. |
| Mode switch | `PAYMENT_MODE=simulator` always; no provider branch | Gate live path behind `PAYMENT_MODE=providers`; keep simulator for tests. |
| Keys | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` never read | Read from env; `KEY_SECRET` server-only. |
| Webhook verification | HMAC over canonical JSON (`stableJson`), simulator secret (`:5320–5341`) | Raw-body HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET`; `X-Razorpay-Signature`; `X-Razorpay-Event-Id` dedup. |
| Raw body | Route receives parsed `request.body` | Capture raw body (Fastify pre-parse) for HMAC. |
| Receipt | `sim_<provider>_<uuid>` (long, not a Razorpay receipt) | Short ≤40-char ASCII receipt (workspace+purchase). |
| Reconcile | Simulator reconcile (`matched/mismatched/unknown`) | Real `GET /v1/orders/{id}` + payment status for `unknown` recovery. |

**Real-wiring gap:** create `razorpay-provider.mjs` (mirror the HeyGen adapter pattern), implement
real order creation + raw-body webhook verification, gate behind `PAYMENT_MODE=providers`, derive a
short receipt, and reconcile via order/payment status. Keep the simulator for tests.

---

## 13. Summary — what the reader needs to know

- **What V0 sends (input):** `POST /v1/orders` (Basic auth with `RAZORPAY_KEY_ID`/`SECRET`) with
  `amount` (paise), `currency: INR`, a short `receipt` (idempotency), and `notes`
  (`workspaceId`/`purchaseId`) — after persisting the `CreditPurchase` row.
- **What Razorpay returns (output):** an `order_…` id; later a signed webhook
  (`X-Razorpay-Signature` = hex HMAC-SHA256 over the raw body, `X-Razorpay-Event-Id`) confirming
  `order.paid`/`payment.captured`.
- **What V0 produces (feature):** verified, exactly-once credit into an append-only integer-minor
  wallet ledger — the spendable truth that downstream paid actions (generation settlement) draw
  down. Refunds/disputes are append-only compensating entries.
- **Keys needed:** `PAYMENT_MODE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
  `PAYMENT_CALLBACK_BASE_URL`. `KEY_SECRET`/`WEBHOOK_SECRET` server-only; INR only.
- **Real-wiring gap:** no live adapter; webhook verifies canonical JSON (not raw body) with the
  simulator secret; keys unread; receipt format wrong. A real `razorpay-provider.mjs` + raw-body
  HMAC + short receipt + order-status reconcile is required before real money.

---

## Sources

- razorpay.com/docs/api/orders/create/ — endpoint, Basic auth, request/response fields, errors
- razorpay.com/docs/webhooks/validate-test/ — `X-Razorpay-Signature`, HMAC-SHA256 over raw body, hex, `X-Razorpay-Event-Id`
- razorpay.com/docs/webhooks/ — events, port 443, IP whitelist
- razorpay.com/docs/payments/dashboard/account-settings/api-keys/ — key id/secret
- `docs/V0/V0_API.md` §V0-G2 — verified purchase + ledger contract
- `docs/V0/V0_DATA_MODELS.md` — `CreditPurchase`, `CreditWallet`, `WalletLedgerEntry`
- `docs/V0/V0_SECURITY.md` — paid-action idempotency, raw-bytes signature, replay protection
- `docs/Project/Operations/PROJECT_CONFIGURATION_CATALOG.md` — payment key names
- `apps/api/src/workspace-store.mjs` — current simulator payments path (code-grounded)
