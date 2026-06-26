import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMinor,
  ledgerEntryState,
  ledgerEntryLabel,
  classifyWalletLedgerError,
  reconciliationState,
  deriveWalletLedgerState,
  walletLedgerMarkup
} from "../../apps/web/src/wallet-ledger-workflow.mjs";

test("formatMinor renders integer minor units with integer math and never floats", () => {
  assert.equal(formatMinor(50000, "INR"), "INR 500.00");
  assert.equal(formatMinor(0, "INR"), "INR 0.00");
  assert.equal(formatMinor(2500, "USD"), "USD 25.00");
  assert.equal(formatMinor(10099, "INR"), "INR 100.99");
  // Negative refunds and debits render with a leading minus.
  assert.equal(formatMinor(-2500, "USD"), "-USD 25.00");
  assert.equal(formatMinor(-2000, "INR"), "-INR 20.00");
  // No floating-point rounding: 1050 minor units is 10.50, not 10.4999...
  assert.equal(formatMinor(1050, "INR"), "INR 10.50");
});

test("ledgerEntryState maps known ledger types and preserves unknown", () => {
  assert.equal(ledgerEntryState({ type: "PURCHASE" }), "purchase");
  assert.equal(ledgerEntryState({ type: "REFUND" }), "refund");
  assert.equal(ledgerEntryState({ type: "ADJUSTMENT" }), "adjustment");
  assert.equal(ledgerEntryState({ type: "RESERVE" }), "unknown");
  assert.equal(ledgerEntryState({ type: "CAPTURE" }), "unknown");
  assert.equal(ledgerEntryState(null), "unknown");
  assert.equal(ledgerEntryState({ type: "future_type" }), "unknown");
});

test("ledgerEntryLabel stays calm and honest without settlement claims", () => {
  assert.equal(ledgerEntryLabel({ type: "PURCHASE" }), "Credit purchase");
  assert.equal(ledgerEntryLabel({ type: "REFUND" }), "Refund or dispute");
  assert.equal(ledgerEntryLabel({ type: "ADJUSTMENT" }), "Adjustment");
  assert.equal(ledgerEntryLabel({ type: "unknown_future" }), "Unknown");
});

test("classifyWalletLedgerError maps ledger problem codes to workflow states", () => {
  assert.equal(classifyWalletLedgerError({ code: "WORKSPACE_ACCESS_DENIED" }), "blocked-hidden");
  assert.equal(classifyWalletLedgerError({ code: "PERMISSION_DENIED" }), "forbidden");
  assert.equal(classifyWalletLedgerError({ code: "VALIDATION_FAILED" }), "error");
  assert.equal(classifyWalletLedgerError(null), "error");
  assert.equal(classifyWalletLedgerError({}), "error");
});

test("reconciliationState maps the summary and preserves unknown and hidden", () => {
  assert.equal(reconciliationState({ matched: true }), "matched");
  assert.equal(reconciliationState({ matched: false }), "mismatched");
  assert.equal(reconciliationState({ matched: undefined }), "unknown");
  assert.equal(reconciliationState(null), "hidden");
});

test("deriveWalletLedgerState renders empty, loading, ready and error states", () => {
  assert.equal(deriveWalletLedgerState({ phase: "empty" }).banner.state, "empty");
  assert.equal(deriveWalletLedgerState({ phase: "loading" }).banner.state, "loading");

  const ready = deriveWalletLedgerState({
    phase: "ready",
    wallet: { id: "w1", currency: "INR", balanceMinor: 50000 },
    entries: [
      entry("e1", "PURCHASE", 50000, 50000),
      entry("e2", "ADJUSTMENT", -2000, 48000)
    ],
    reconciliation: { currency: "INR", ledgerPurchaseMinor: 50000, ledgerRefundMinor: 0, simulatorPaidMinor: 50000, matched: true }
  });
  assert.equal(ready.banner.state, "ready");
  assert.match(ready.banner.text, /INR 500.00/);
  assert.match(ready.banner.text, /2 append-only ledger entries/);
  assert.equal(ready.wallet.balanceDisplay, "INR 500.00");
  assert.equal(ready.entries.length, 2);
  assert.equal(ready.entries[0].state, "purchase");
  assert.equal(ready.entries[0].amountDisplay, "INR 500.00");
  assert.equal(ready.entries[0].runningBalanceDisplay, "INR 500.00");
  assert.equal(ready.entries[1].state, "adjustment");
  assert.equal(ready.entries[1].amountDisplay, "-INR 20.00");
  assert.equal(ready.entries[1].runningBalanceDisplay, "INR 480.00");
  assert.equal(ready.reconciliation.state, "matched");

  const hidden = deriveWalletLedgerState({
    phase: "error",
    error: { code: "WORKSPACE_ACCESS_DENIED", detail: "We could not find that item." }
  });
  assert.equal(hidden.banner.state, "blocked-hidden");
  assert.equal(hidden.banner.text, "We could not find that wallet in this workspace.");

  const forbidden = deriveWalletLedgerState({ phase: "error", error: { code: "PERMISSION_DENIED" } });
  assert.equal(forbidden.banner.state, "forbidden");
});

test("deriveWalletLedgerState hides reconciliation when the role cannot view it", () => {
  const descriptor = deriveWalletLedgerState({
    phase: "ready",
    wallet: { id: "w1", currency: "INR", balanceMinor: 1000 },
    entries: [entry("e1", "PURCHASE", 1000, 1000)],
    reconciliation: null
  });
  assert.equal(descriptor.reconciliation, null);
});

test("walletLedgerMarkup renders rows with data-state and never shows payment instruments", () => {
  const markup = walletLedgerMarkup(
    deriveWalletLedgerState({
      phase: "ready",
      wallet: { id: "w1", currency: "INR", balanceMinor: 48000 },
      entries: [
        entry("e1", "PURCHASE", 50000, 50000),
        entry("e2", "REFUND", -2000, 48000)
      ],
      reconciliation: { currency: "INR", ledgerPurchaseMinor: 50000, ledgerRefundMinor: 2000, simulatorPaidMinor: 48000, matched: false }
    })
  );
  assert.match(markup.banner, /data-state="ready"/);
  assert.match(markup.wallet, /data-testid="wallet-balance"/);
  assert.match(markup.grid, /data-testid="wallet-ledger-entry" data-entry-id="e1" data-state="purchase"/);
  assert.match(markup.grid, /data-state="refund"/);
  assert.match(markup.grid, /-INR 20.00/);
  assert.match(markup.reconciliation, /data-testid="wallet-reconciliation-status" data-state="mismatched"/);
  // Payment instrument details, signed URLs and simulator secrets never appear.
  assert.equal(/\b(card|cvv|pan|expiry_year|instrument_number|signature|secret)\b/i.test(markup.grid + markup.reconciliation + markup.wallet), false);
});

test("walletLedgerMarkup hides the reconciliation section when the summary is absent", () => {
  const markup = walletLedgerMarkup(
    deriveWalletLedgerState({
      phase: "ready",
      wallet: { id: "w1", currency: "INR", balanceMinor: 1000 },
      entries: [entry("e1", "PURCHASE", 1000, 1000)],
      reconciliation: null
    })
  );
  assert.equal(markup.reconciliation, "");
});

function entry(id, type, amountMinor, runningBalanceMinor, reason = null) {
  return {
    id,
    workspaceId: "ws1",
    walletId: "w1",
    generationJobId: null,
    type,
    amountMinor,
    currency: "INR",
    idempotencyKey: `idem-${id}`,
    reason,
    effectiveAt: "2026-06-26T05:00:00.000Z",
    createdAt: "2026-06-26T05:00:00.000Z",
    runningBalanceMinor
  };
}
