import { banner, escapeHtml, formatMinor, renderBanner } from "./workflow-markup-utils.mjs";
export { formatMinor };

export function estimateState(estimate) {
  return { awaiting_confirmation: "awaiting", credits_reserved: "reserved" }[estimate?.status] ?? "unknown";
}

export function reservationState(reservation) {
  const status = String(reservation?.status ?? "").toLowerCase();
  return ["active", "captured", "released", "expired", "adjusted"].includes(status) ? status : "unknown";
}

export function generationJobState(job) {
  return ["queued", "submitting", "unknown", "generated", "cancelled"].includes(job?.status) ? job.status : "unknown";
}

export function classifyConfirmationError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    CREDIT_BALANCE_INSUFFICIENT: "insufficient",
    ESTIMATE_EXPIRED: "expired",
    ESTIMATE_INPUT_CHANGED: "input-changed",
    RESOURCE_VERSION_STALE: "stale",
    CREDIT_RESERVATION_CONFLICT: "conflict",
    IDEMPOTENCY_KEY_REQUIRED: "idempotency-required"
  }[error?.code] ?? "error";
}

const MESSAGES = {
  insufficient: "Add creator credits before reserving this generation.",
  expired: "This generation estimate expired.",
  "input-changed": "The script, avatar or settings changed after this estimate.",
  stale: "This estimate changed after you opened it.",
  conflict: "Credits are already reserved for this generation.",
  "blocked-hidden": "We could not find that estimate in this workspace."
};

export function deriveConfirmationState(input = {}) {
  if (input.phase === "loading") return { banner: banner("loading", "Loading generation estimate."), estimate: null, wallet: null, confirmation: null };
  if (input.phase === "error") {
    const state = classifyConfirmationError(input.error);
    return { banner: banner(state, MESSAGES[state] ?? "Generation cannot be confirmed."), estimate: null, wallet: null, confirmation: null };
  }
  const estimate = input.estimate ? { ...input.estimate, state: estimateState(input.estimate), maximumAuthorizedDisplay: formatMinor(input.estimate.maximumAuthorizedMinor, input.estimate.currency) } : null;
  const wallet = input.wallet ? { ...input.wallet, balanceDisplay: formatMinor(input.wallet.balanceMinor, input.wallet.currency) } : null;
  const confirmation = input.confirmation ? {
    job: { ...input.confirmation.job, state: generationJobState(input.confirmation.job) },
    reservation: { ...input.confirmation.reservation, state: reservationState(input.confirmation.reservation), amountDisplay: formatMinor(input.confirmation.reservation.amountMinor, input.confirmation.reservation.currency) },
    ledgerEntry: { ...input.confirmation.ledgerEntry, amountDisplay: formatMinor(input.confirmation.ledgerEntry.amountMinor, input.confirmation.ledgerEntry.currency) }
  } : null;
  if (confirmation) return { banner: banner("reserved", "Provider submission has not started. Credits are reserved."), estimate, wallet, confirmation };
  if (estimate) return { banner: banner(estimate.state, "Review the generation estimate."), estimate, wallet, confirmation };
  return { banner: banner("empty", "No generation estimate loaded."), estimate: null, wallet: null, confirmation: null };
}

export function confirmationMarkup(descriptor) {
  return {
    banner: renderBanner("generation-confirmation-status", descriptor.banner),
    estimate: descriptor.estimate ? `<section data-testid="generation-estimate" data-estimate-id="${escapeHtml(descriptor.estimate.id)}" data-state="${escapeHtml(descriptor.estimate.state)}">Maximum authorization: ${escapeHtml(descriptor.estimate.maximumAuthorizedDisplay)} Price version: ${escapeHtml(descriptor.estimate.priceVersion)}</section>` : "",
    wallet: descriptor.wallet ? `<section data-testid="generation-wallet-balance" data-state="ready" data-currency="${escapeHtml(descriptor.wallet.currency)}">Wallet balance: ${escapeHtml(descriptor.wallet.balanceDisplay)}</section>` : "",
    confirmation: descriptor.confirmation ? `<section data-testid="generation-confirmation" data-state="${escapeHtml(descriptor.banner.state)}">Generation job: ${escapeHtml(descriptor.confirmation.job.state)} Ledger: ${escapeHtml(descriptor.confirmation.ledgerEntry.type)} ${escapeHtml(descriptor.confirmation.ledgerEntry.amountDisplay)}</section>` : ""
  };
}
