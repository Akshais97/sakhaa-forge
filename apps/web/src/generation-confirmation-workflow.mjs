// V0-G3 versioned generation estimate and atomic reservation workflow. Pure,
// DOM-agnostic state functions that are unit-tested in Node, plus a browser
// glue that wires the generated V0Client to the page. The estimate and
// reservation are server truth: the workflow renders the price version, the
// maximum authorization, the wallet balance and the confirmed generation job
// and reservation the API returns. It never fabricates a balance, reserves
// credits optimistically, claims provider submission, or shows the input hash
// (a server-side validation secret). Paid confirmation is irreversible, so the
// confirm action is never optimistic: the workflow calls the API and renders
// the committed outcome or a calm error. Money is rendered from integer minor
// units with integer math; no floating point is used for display. Cross-workspace
// estimates and jobs hide behind the same blocked state. Browser code never
// holds database, Redis, provider or secret credentials beyond the caller's
// Supabase JWT. V0Client is imported dynamically inside the browser glue so the
// pure functions below can be imported and tested in Node without browser
// module resolution.

// Format integer minor units as a calm currency string using integer math only.
// Negative values (reservation debits) render with a leading minus. Floats are
// never used: the whole and fractional parts come from integer division and
// modulo.
export function formatMinor(amountMinor, currency = "INR") {
  const value = Number(amountMinor) || 0;
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${currency} ${whole}.${String(fraction).padStart(2, "0")}`;
}

// Map an estimate status to a stable UI state. Only awaiting_confirmation and
// credits_reserved are produced in V0-G3; an unmapped status preserves
// `unknown` as a real state rather than collapsing it.
export function estimateState(estimate) {
  const status = estimate?.status;
  if (status === "awaiting_confirmation") {
    return "awaiting";
  }
  if (status === "credits_reserved") {
    return "reserved";
  }
  return "unknown";
}

// Map a credit reservation status to the lowercase V0_STATUS_ENUMS.md
// Reservation contract state.
export function reservationState(reservation) {
  const status = String(reservation?.status ?? "").toLowerCase();
  if (["active", "captured", "released", "expired", "adjusted"].includes(status)) {
    return status;
  }
  return "unknown";
}

// Map a generation job status to the lowercase V0_STATUS_ENUMS.md Generation
// contract state. V0-G3 only produces `queued`; later sprints drive the rest.
export function generationJobState(job) {
  const status = String(job?.status ?? "").toLowerCase();
  const known = [
    "draft", "estimating_credits", "awaiting_confirmation", "credits_reserved",
    "queued", "submitting", "accepted", "unknown", "generating", "generated",
    "failed", "cancel_requested", "cancelled"
  ];
  return known.includes(status) ? status : "unknown";
}

// Map a confirmation problem to the workflow banner state. Cross-workspace and
// missing estimates/jobs hide behind the same blocked state so the other
// workspace's id never leaks; permission problems get their own calm state;
// each paid-generation guard code gets its own honest state so the user knows
// exactly what to do next.
export function classifyConfirmationError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    CREDIT_BALANCE_INSUFFICIENT: "insufficient",
    ESTIMATE_EXPIRED: "expired",
    ESTIMATE_INPUT_CHANGED: "input-changed",
    RESOURCE_VERSION_STALE: "stale",
    CREDIT_RESERVATION_CONFLICT: "conflict",
    IDEMPOTENCY_KEY_REQUIRED: "idempotency-required",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict"
  };
  return map[problem.code] || "error";
}

// Derive the workflow descriptor from the current phase and API response. The
// descriptor is a plain object so it can be asserted in Node without a DOM; the
// browser glue renders it via confirmationMarkup.
export function deriveConfirmationState({
  phase,
  estimate = null,
  wallet = null,
  confirmation = null,
  error = null
}) {
  let banner = { state: "empty", text: "No generation estimate loaded." };
  if (phase === "loading") {
    banner = { state: "loading", text: "Reserving credits for this generation." };
  } else if (phase === "error") {
    banner = { state: classifyConfirmationError(error), text: confirmationErrorMessage(error) };
  } else if (phase === "ready") {
    banner = { state: "reserved", text: "Credits reserved for one generation. Provider submission has not started." };
  } else if (phase === "estimate") {
    banner = { state: estimateState(estimate), text: "Review the estimate and maximum authorization before confirming." };
  }

  const estimateCard = estimate
    ? {
        id: estimate.id,
        state: estimateState(estimate),
        provider: estimate.provider,
        priceVersion: estimate.priceVersion,
        currency: estimate.currency,
        maximumAuthorizedMinor: estimate.maximumAuthorizedMinor,
        maximumAuthorizedDisplay: formatMinor(estimate.maximumAuthorizedMinor, estimate.currency),
        version: estimate.version,
        expiresAt: estimate.expiresAt,
        durationSeconds: estimate.durationSeconds
      }
    : null;

  const walletCard = wallet
    ? {
        id: wallet.id,
        currency: wallet.currency,
        balanceMinor: wallet.balanceMinor,
        balanceDisplay: formatMinor(wallet.balanceMinor, wallet.currency)
      }
    : null;

  const confirmationCard = confirmation
    ? {
        job: {
          id: confirmation.job.id,
          state: generationJobState(confirmation.job),
          status: confirmation.job.status
        },
        reservation: {
          id: confirmation.reservation.id,
          state: reservationState(confirmation.reservation),
          amountMinor: confirmation.reservation.amountMinor,
          amountDisplay: formatMinor(confirmation.reservation.amountMinor, confirmation.reservation.currency)
        },
        ledgerEntry: {
          type: confirmation.ledgerEntry.type,
          amountMinor: confirmation.ledgerEntry.amountMinor,
          amountDisplay: formatMinor(confirmation.ledgerEntry.amountMinor, confirmation.ledgerEntry.currency)
        }
      }
    : null;

  return {
    phase,
    banner,
    estimate: estimateCard,
    wallet: walletCard,
    confirmation: confirmationCard
  };
}

function confirmationErrorMessage(error) {
  if (!error) {
    return "Could not reserve credits. Try again.";
  }
  if (error.code === "WORKSPACE_ACCESS_DENIED") {
    return "We could not find that estimate in this workspace.";
  }
  if (error.code === "PERMISSION_DENIED") {
    return "Your role cannot confirm paid generation.";
  }
  if (error.code === "CREDIT_BALANCE_INSUFFICIENT") {
    return "Add creator credits before generating this video.";
  }
  if (error.code === "ESTIMATE_EXPIRED") {
    return "This estimate expired. Request a new estimate.";
  }
  if (error.code === "ESTIMATE_INPUT_CHANGED") {
    return "The script, avatar or settings changed. Request a new estimate.";
  }
  if (error.code === "RESOURCE_VERSION_STALE") {
    return "This estimate changed after you opened it. Review the latest version.";
  }
  if (error.code === "CREDIT_RESERVATION_CONFLICT") {
    return "Credits are already reserved for this generation.";
  }
  if (error.code === "IDEMPOTENCY_KEY_REQUIRED") {
    return "This action needs a request identity. Refresh and try again.";
  }
  return error.detail || "Could not reserve credits. Try again.";
}

// Render the descriptor as HTML for the page. The status banner, estimate
// summary, wallet balance and confirmation carry data-state attributes so the
// e2e suite can assert awaiting/reserved/insufficient/expired/input-changed/
// stale/conflict/blocked-hidden states. The input hash, signed URLs, provider
// payloads and secrets never appear in the rendered markup.
export function confirmationMarkup(descriptor) {
  const banner = `<p class="status workflow-status" data-testid="generation-confirmation-status" data-state="${escapeAttribute(descriptor.banner.state)}">${escapeText(descriptor.banner.text)}</p>`;
  const estimate = descriptor.estimate
    ? `<article class="candidate" data-testid="generation-estimate" data-estimate-id="${escapeAttribute(descriptor.estimate.id)}" data-state="${escapeAttribute(descriptor.estimate.state)}">
        <h3>Generation estimate</h3>
        <p>Provider: ${escapeText(descriptor.estimate.provider)}</p>
        <p>Price version: ${escapeText(descriptor.estimate.priceVersion)}</p>
        <p>Maximum authorization: ${escapeText(descriptor.estimate.maximumAuthorizedDisplay)}</p>
        <p>Duration: ${escapeText(String(descriptor.estimate.durationSeconds))} seconds</p>
        <p>Version: ${escapeText(String(descriptor.estimate.version))}</p>
        <span class="status" data-state="${escapeAttribute(descriptor.estimate.state)}">${escapeText(estimateLabel(descriptor.estimate.state))}</span>
      </article>`
    : "";
  const wallet = descriptor.wallet
    ? `<p class="status" data-testid="generation-wallet-balance" data-state="ready" data-currency="${escapeAttribute(descriptor.wallet.currency)}">Wallet balance: ${escapeText(descriptor.wallet.balanceDisplay)}</p>`
    : "";
  const confirmation = descriptor.confirmation
    ? `<article class="candidate" data-testid="generation-confirmation" data-state="reserved">
        <h3>Credits reserved</h3>
        <p>Generation job: ${escapeText(descriptor.confirmation.job.status)}</p>
        <p>Reservation: ${escapeText(descriptor.confirmation.reservation.amountDisplay)}</p>
        <p>Ledger: ${escapeText(descriptor.confirmation.ledgerEntry.type)} ${escapeText(descriptor.confirmation.ledgerEntry.amountDisplay)}</p>
        <span class="status" data-state="${escapeAttribute(descriptor.confirmation.job.state)}">Provider submission has not started</span>
      </article>`
    : "";
  return { banner, estimate, wallet, confirmation };
}

function estimateLabel(state) {
  const labels = {
    awaiting: "Awaiting confirmation",
    reserved: "Credits reserved",
    unknown: "Unknown"
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

// Browser glue. Wires the confirm form to the generated V0Client. Paid
// confirmation is irreversible, so the workflow never renders an optimistic
// reserved state: it shows loading, calls the API, and renders the committed
// confirmation or a calm error. Only runs in the browser; the pure functions
// above are exported for Node tests.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const apiBase = window.location.origin.replace(/:\d+$/, ":3001") + "/api/v0";
  const form = document.querySelector("[data-testid='generation-confirmation-form']");
  const section = document.querySelector("[data-testid='generation-confirmation-contract']");
  let clientModulePromise = null;
  function client() {
    const sessionToken = form.elements.sessionToken.value.trim();
    clientModulePromise ??= import("/v0-client.mjs");
    return clientModulePromise.then(({ V0Client }) => new V0Client({ baseUrl: apiBase, authToken: sessionToken }));
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const workspaceId = form.elements.workspaceId.value.trim();
    const estimateId = form.elements.estimateId.value.trim();
    const version = Number(form.elements.version.value);
    const selectedScriptId = form.elements.selectedScriptId.value.trim();
    const avatarProfileId = form.elements.avatarProfileId.value.trim();
    const durationSeconds = Number(form.elements.durationSeconds.value);
    const idempotencyKey = form.elements.idempotencyKey.value.trim();
    render(deriveConfirmationState({ phase: "loading" }));
    try {
      const v0 = await client();
      const response = await v0.confirmGenerationEstimate(
        estimateId,
        { workspaceId, version, selectedScriptId, avatarProfileId, durationSeconds },
        { idempotencyKey }
      );
      if (response.status === 202) {
        render(
          deriveConfirmationState({
            phase: "ready",
            estimate: response.body.estimate,
            wallet: response.body.wallet,
            confirmation: response.body
          })
        );
      } else {
        render(deriveConfirmationState({ phase: "error", error: response.body }));
      }
    } catch (fetchError) {
      render(deriveConfirmationState({ phase: "error", error: { detail: fetchError.message } }));
    }
  });

  function render(descriptor) {
    const markup = confirmationMarkup(descriptor);
    section.querySelector("[data-testid='generation-confirmation-status']")?.replaceWith(createBanner(markup.banner));
    const estimateNode = section.querySelector("[data-testid='generation-estimate']");
    if (markup.estimate) {
      estimateNode?.replaceWith(createFragment(markup.estimate));
    }
    const walletNode = section.querySelector("[data-testid='generation-wallet-balance']");
    if (markup.wallet) {
      walletNode?.replaceWith(createBanner(markup.wallet));
    } else if (walletNode) {
      walletNode.remove();
    }
    const confirmationNode = section.querySelector("[data-testid='generation-confirmation']");
    if (markup.confirmation) {
      confirmationNode?.replaceWith(createFragment(markup.confirmation));
    } else if (confirmationNode) {
      confirmationNode.remove();
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
