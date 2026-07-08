import { banner, escapeHtml, formatMinor, renderBanner } from "./workflow-markup-utils.mjs";
export { formatMinor };

export function ledgerEntryState(entry) {
  return { PURCHASE: "purchase", REFUND: "refund", ADJUSTMENT: "adjustment" }[entry?.type] ?? "unknown";
}

export function ledgerEntryLabel(entry) {
  return { PURCHASE: "Credit purchase", REFUND: "Refund or dispute", ADJUSTMENT: "Adjustment" }[entry?.type] ?? "Unknown";
}

export function classifyWalletLedgerError(error) {
  return { WORKSPACE_ACCESS_DENIED: "blocked-hidden", PERMISSION_DENIED: "forbidden" }[error?.code] ?? "error";
}

export function reconciliationState(summary) {
  if (!summary) return "hidden";
  if (summary.matched === true) return "matched";
  if (summary.matched === false) return "mismatched";
  return "unknown";
}

export function deriveWalletLedgerState(input = {}) {
  if (input.phase === "loading") return { banner: banner("loading", "Loading wallet ledger."), wallet: null, entries: [], reconciliation: null };
  if (input.phase === "error") {
    const state = classifyWalletLedgerError(input.error);
    return { banner: banner(state, state === "blocked-hidden" ? "We could not find that wallet in this workspace." : "Wallet ledger is not available."), wallet: null, entries: [], reconciliation: null };
  }
  if (input.phase === "ready") {
    const wallet = input.wallet ? { ...input.wallet, balanceDisplay: formatMinor(input.wallet.balanceMinor, input.wallet.currency) } : null;
    const entries = (input.entries ?? []).map((entry) => ({ ...entry, state: ledgerEntryState(entry), label: ledgerEntryLabel(entry), amountDisplay: formatMinor(entry.amountMinor, entry.currency), runningBalanceDisplay: formatMinor(entry.runningBalanceMinor, entry.currency) }));
    const reconciliation = input.reconciliation ? { ...input.reconciliation, state: reconciliationState(input.reconciliation) } : null;
    return { banner: banner("ready", `${wallet?.balanceDisplay ?? "INR 0.00"} with ${entries.length} append-only ledger entries.`), wallet, entries, reconciliation };
  }
  return { banner: banner("empty", "No wallet selected."), wallet: null, entries: [], reconciliation: null };
}

export function walletLedgerMarkup(descriptor) {
  return {
    banner: renderBanner("wallet-ledger-status", descriptor.banner),
    wallet: descriptor.wallet ? `<section data-testid="wallet-balance" data-state="ready" data-currency="${escapeHtml(descriptor.wallet.currency)}">Wallet balance: ${escapeHtml(descriptor.wallet.balanceDisplay)}</section>` : "",
    grid: (descriptor.entries ?? []).map((entry) => `<article data-testid="wallet-ledger-entry" data-entry-id="${escapeHtml(entry.id)}" data-state="${escapeHtml(entry.state)}">${escapeHtml(entry.label)} ${escapeHtml(entry.amountDisplay)} ${escapeHtml(entry.runningBalanceDisplay)}</article>`).join(""),
    reconciliation: descriptor.reconciliation ? `<section data-testid="wallet-reconciliation-status" data-state="${escapeHtml(descriptor.reconciliation.state)}">Reconciliation ${escapeHtml(descriptor.reconciliation.state)}</section>` : ""
  };
}
