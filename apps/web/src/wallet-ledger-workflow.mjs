// V0-G2 creator wallet and verified credit purchase workflow. Pure, DOM-agnostic
// state functions that are unit-tested in Node, plus a browser glue that wires the
// generated V0Client to the page. The ledger is server-truth: the workflow only
// renders the wallet balance, the append-only ledger entries and the provider
// financial reconciliation summary the API returns. It never fabricates a balance,
// edits history, shows a payment instrument, or claims settlement before the
// backend says so. Money is rendered from integer minor units with integer math;
// no floating point is used for display. Cross-workspace wallets hide behind the
// same blocked state. Browser code never holds database, Redis, provider or secret
// credentials beyond the caller's Supabase JWT. V0Client is imported dynamically
// inside the browser glue so the pure functions below can be imported and tested in
// Node without browser module resolution.

// Format integer minor units as a calm currency string using integer math only.
// Negative values (refunds, debits) render with a leading minus. Floats are never
// used: the whole and fractional parts come from integer division and modulo.
export function formatMinor(amountMinor, currency = "INR") {
  const value = Number(amountMinor) || 0;
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${currency} ${whole}.${String(fraction).padStart(2, "0")}`;
}

// Map a ledger entry type to a stable UI state. Only PURCHASE, REFUND and
// ADJUSTMENT are produced in V0-G2; RESERVE/CAPTURE/RELEASE belong to later credit
// reservation work and are not invented here. An unmapped type preserves `unknown`
// as a real state rather than collapsing it.
export function ledgerEntryState(entry) {
  const type = entry?.type;
  if (type === "PURCHASE") {
    return "purchase";
  }
  if (type === "REFUND") {
    return "refund";
  }
  if (type === "ADJUSTMENT") {
    return "adjustment";
  }
  return "unknown";
}

// Calm, honest label for each ledger entry. Refunds and debits are labelled as
// negative movements without settlement or reversal claims beyond server truth.
export function ledgerEntryLabel(entry) {
  const labels = {
    purchase: "Credit purchase",
    refund: "Refund or dispute",
    adjustment: "Adjustment",
    unknown: "Unknown"
  };
  return labels[ledgerEntryState(entry)] || "Unknown";
}

// Map a wallet ledger problem to the workflow banner state. Cross-workspace and
// missing wallets hide behind the same blocked state so the other workspace's id
// never leaks; permission problems get their own calm state; anything else is a
// recoverable error.
export function classifyWalletLedgerError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  if (problem.code === "WORKSPACE_ACCESS_DENIED") {
    return "blocked-hidden";
  }
  if (problem.code === "PERMISSION_DENIED") {
    return "forbidden";
  }
  return "error";
}

// Map the server reconciliation summary to a stable UI state. A null summary means
// the caller's role cannot view provider financial reconciliation and the section
// stays hidden. A matched summary is shown as reconciled; an unmatched summary is
// shown as mismatched; a missing matched flag is preserved as unknown.
export function reconciliationState(reconciliation) {
  if (!reconciliation) {
    return "hidden";
  }
  if (reconciliation.matched === true) {
    return "matched";
  }
  if (reconciliation.matched === false) {
    return "mismatched";
  }
  return "unknown";
}

// Derive the workflow descriptor from the current phase and API response. The
// descriptor is a plain object so it can be asserted in Node without a DOM; the
// browser glue renders it via walletLedgerMarkup.
export function deriveWalletLedgerState({
  phase,
  wallet = null,
  entries = [],
  reconciliation = null,
  error = null
}) {
  const cards = entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    state: ledgerEntryState(entry),
    label: ledgerEntryLabel(entry),
    amountMinor: entry.amountMinor,
    amountDisplay: formatMinor(entry.amountMinor, entry.currency || wallet?.currency),
    runningBalanceMinor: entry.runningBalanceMinor,
    runningBalanceDisplay: formatMinor(entry.runningBalanceMinor, entry.currency || wallet?.currency),
    reason: entry.reason ?? null,
    effectiveAt: entry.effectiveAt
  }));

  let banner = { state: "empty", text: "No wallet ledger loaded." };
  if (phase === "loading") {
    banner = { state: "loading", text: "Loading the wallet ledger." };
  } else if (phase === "error") {
    banner = { state: classifyWalletLedgerError(error), text: ledgerErrorMessage(error) };
  } else if (phase === "ready") {
    const balance = wallet ? formatMinor(wallet.balanceMinor, wallet.currency) : "Unknown";
    banner = {
      state: "ready",
      text: `Wallet balance is ${balance} across ${cards.length} append-only ledger ${cards.length === 1 ? "entry" : "entries"}.`
    };
  }

  return {
    phase,
    banner,
    wallet: wallet
      ? {
          id: wallet.id,
          currency: wallet.currency,
          balanceMinor: wallet.balanceMinor,
          balanceDisplay: formatMinor(wallet.balanceMinor, wallet.currency)
        }
      : null,
    entries: cards,
    reconciliation: reconciliation
      ? {
          state: reconciliationState(reconciliation),
          currency: reconciliation.currency,
          ledgerPurchaseMinor: reconciliation.ledgerPurchaseMinor,
          ledgerPurchaseDisplay: formatMinor(reconciliation.ledgerPurchaseMinor, reconciliation.currency),
          ledgerRefundMinor: reconciliation.ledgerRefundMinor,
          ledgerRefundDisplay: formatMinor(reconciliation.ledgerRefundMinor, reconciliation.currency),
          simulatorPaidMinor: reconciliation.simulatorPaidMinor,
          simulatorPaidDisplay: formatMinor(reconciliation.simulatorPaidMinor, reconciliation.currency),
          matched: reconciliation.matched
        }
      : null
  };
}

function ledgerErrorMessage(error) {
  if (!error) {
    return "Could not load the wallet ledger. Try again.";
  }
  if (error.code === "WORKSPACE_ACCESS_DENIED") {
    return "We could not find that wallet in this workspace.";
  }
  if (error.code === "PERMISSION_DENIED") {
    return "Your role cannot view the wallet ledger.";
  }
  return error.detail || "Could not load the wallet ledger. Try again.";
}

// Render the descriptor as HTML for the page. The status banner, wallet summary,
// each ledger row and the reconciliation summary carry data-state attributes so the
// e2e suite can assert empty/loading/ready/refund/adjustment/matched/mismatched/
// forbidden/blocked-hidden states. Payment instrument details and signed URLs never
// appear in the rendered markup.
export function walletLedgerMarkup(descriptor) {
  const banner = `<p class="status workflow-status" data-testid="wallet-ledger-status" data-state="${escapeAttribute(descriptor.banner.state)}">${escapeText(descriptor.banner.text)}</p>`;
  const wallet = descriptor.wallet
    ? `<p class="status" data-testid="wallet-balance" data-state="ready" data-currency="${escapeAttribute(descriptor.wallet.currency)}">Balance: ${escapeText(descriptor.wallet.balanceDisplay)}</p>`
    : "";
  const rows = descriptor.entries
    .map((card) => {
      const reason = card.reason ? `<p>Reason: ${escapeText(card.reason)}</p>` : "";
      return `<article class="candidate" data-testid="wallet-ledger-entry" data-entry-id="${escapeAttribute(card.id)}" data-state="${escapeAttribute(card.state)}">
        <h3>${escapeText(card.label)}</h3>
        <p>Amount: ${escapeText(card.amountDisplay)}</p>
        <p>Running balance: ${escapeText(card.runningBalanceDisplay)}</p>
        ${reason}
        <span class="status" data-state="${escapeAttribute(card.state)}">${escapeText(card.label)}</span>
      </article>`;
    })
    .join("");
  const grid = `<div class="candidate-grid" data-testid="wallet-ledger-entries">${rows}</div>`;
  const reconciliation = descriptor.reconciliation
    ? `<section aria-labelledby="wallet-reconciliation-title" data-testid="wallet-reconciliation">
        <h3 id="wallet-reconciliation-title">Provider financial reconciliation</h3>
        <p>Ledger purchases: ${escapeText(descriptor.reconciliation.ledgerPurchaseDisplay)}</p>
        <p>Ledger refunds: ${escapeText(descriptor.reconciliation.ledgerRefundDisplay)}</p>
        <p>Simulator paid: ${escapeText(descriptor.reconciliation.simulatorPaidDisplay)}</p>
        <span class="status" data-testid="wallet-reconciliation-status" data-state="${escapeAttribute(descriptor.reconciliation.state)}">${escapeText(reconciliationLabel(descriptor.reconciliation.state))}</span>
      </section>`
    : "";
  return { banner, wallet, grid, reconciliation };
}

function reconciliationLabel(state) {
  const labels = {
    matched: "Reconciled",
    mismatched: "Mismatched",
    unknown: "Unknown",
    hidden: "Hidden"
  };
  return labels[state] || "Unknown";
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Browser glue. Wires the form + ledger grid to the generated V0Client. The ledger
// is read-only server truth; no paid, credit-capture, publishing or adjustment
// action is taken optimistically from this view. Only runs in the browser; the pure
// functions above are exported for Node tests.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const apiBase = window.location.origin.replace(/:\d+$/, ":3001") + "/api/v0";
  const form = document.querySelector("[data-testid='wallet-ledger-form']");
  const section = document.querySelector("[data-testid='wallet-ledger-contract']");
  let clientModulePromise = null;
  function client() {
    const sessionToken = form.elements.sessionToken.value.trim();
    clientModulePromise ??= import("/v0-client.mjs");
    return clientModulePromise.then(({ V0Client }) => new V0Client({ baseUrl: apiBase, authToken: sessionToken }));
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const workspaceId = form.elements.workspaceId.value.trim();
    const walletId = form.elements.walletId.value.trim();
    render(deriveWalletLedgerState({ phase: "loading" }));
    try {
      const v0 = await client();
      const response = await v0.getWalletLedger(walletId, { workspaceId, limit: 50 });
      if (response.status === 200) {
        render(
          deriveWalletLedgerState({
            phase: "ready",
            wallet: response.body.wallet,
            entries: response.body.entries,
            reconciliation: response.body.reconciliation
          })
        );
      } else {
        render(deriveWalletLedgerState({ phase: "error", error: response.body }));
      }
    } catch (fetchError) {
      render(deriveWalletLedgerState({ phase: "error", error: { detail: fetchError.message } }));
    }
  });

  function render(descriptor) {
    const markup = walletLedgerMarkup(descriptor);
    section.querySelector("[data-testid='wallet-ledger-status']")?.replaceWith(createBanner(markup.banner));
    const balanceNode = section.querySelector("[data-testid='wallet-balance']");
    if (markup.wallet) {
      balanceNode?.replaceWith(createBanner(markup.wallet));
    } else if (balanceNode) {
      balanceNode.remove();
    }
    section.querySelector("[data-testid='wallet-ledger-entries']")?.replaceWith(createFragment(markup.grid));
    const reconNode = section.querySelector("[data-testid='wallet-reconciliation']");
    if (markup.reconciliation) {
      reconNode?.replaceWith(createFragment(markup.reconciliation));
    } else if (reconNode) {
      reconNode.remove();
    }
  }

  function createBanner(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function createFragment(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content;
  }
}
