// V0-G5 retained generated media and settled credits workflow. Pure, DOM-agnostic
// state functions unit-tested in Node, plus a browser glue that wires the generated
// V0Client to the page. Settlement is a billing action on an already-authorized
// reservation: it captures the unused remainder once on success or releases the full
// reservation once on failure, and retains completed media into private V0 storage
// through the adapter only. The workflow is never optimistic: it shows loading, calls
// the API, and renders the committed settlement or a calm error. A crash between media
// retention and ledger settlement renders the retryable `dependency-unavailable` state
// and tells the user to try again; a replay renders `replay` and never settles twice.
// The transient provider URL, provider external id, raw hashes, signed URLs and
// secrets never appear in the rendered markup. Browser code holds no database, Redis,
// provider or secret credentials beyond the caller's Supabase JWT. V0Client is
// imported dynamically inside the browser glue so the pure functions can be imported
// and tested in Node.

// Map a credit reservation status (lowercase per V0_STATUS_ENUMS.md) to a stable UI
// state. Captured and released are the terminal settlement states.
export function reservationState(reservation) {
  const status = String(reservation?.status ?? "").toLowerCase();
  const known = ["active", "captured", "released", "expired", "adjusted"];
  return known.includes(status) ? status : "unknown";
}

// Map the settlement outcome to a stable UI state.
export function settlementOutcome(body) {
  const outcome = String(body?.outcome ?? "").toLowerCase();
  return outcome === "captured" || outcome === "released" ? outcome : "unknown";
}

// Map a settlement problem to the workflow banner state. Cross-workspace and missing
// jobs hide behind the same blocked state so the other workspace id never leaks; each
// settlement guard gets its own honest state.
export function classifySettlementError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    GENERATION_JOB_NOT_SUBMITTABLE: "not-submittable",
    PROVIDER_COST_EXCEEDS_AUTHORIZATION: "cost-exceeds",
    ASSET_MEDIA_MALFORMED: "media-malformed",
    DEPENDENCY_UNAVAILABLE: "dependency-unavailable",
    IDEMPOTENCY_KEY_REQUIRED: "idempotency-required"
  };
  return map[problem.code] || "error";
}

// Derive the workflow descriptor from the current phase and API response. The
// descriptor is a plain object so it can be asserted in Node without a DOM; the
// browser glue renders it via settlementMarkup.
export function deriveSettlementState({ phase, body = null, error = null }) {
  let banner = { state: "empty", text: "No generation settlement loaded." };
  if (phase === "loading") {
    banner = { state: "loading", text: "Settling this generation: retaining media and capturing credits." };
  } else if (phase === "error") {
    banner = { state: classifySettlementError(error), text: settlementErrorMessage(error) };
  } else if (phase === "ready") {
    const outcome = settlementOutcome(body);
    if (body?.replay === true) {
      banner = {
        state: outcome,
        text:
          outcome === "released"
            ? "This generation was already settled. Showing the released reservation."
            : "This generation was already settled. Showing the retained media and captured credits."
      };
    } else if (outcome === "released") {
      banner = { state: "released", text: "The provider operation failed. The full reservation was returned to your wallet." };
    } else if (outcome === "captured") {
      banner = { state: "captured", text: "The completed media was retained and validated. Credits were captured for the provider cost." };
    } else {
      banner = { state: "unknown", text: "We could not confirm the settlement outcome. Try again." };
    }
  }

  const media = body && body.artifact && body.segment && body.asset && body.lineage
    ? {
        artifact: {
          id: body.artifact.id,
          state: artifactState(body.artifact),
          status: body.artifact.status,
          contentType: body.artifact.contentType
        },
        segment: {
          id: body.segment.id,
          durationSeconds: body.segment.durationSeconds,
          contentType: body.segment.contentType
        },
        asset: {
          id: body.asset.id,
          version: body.asset.version,
          status: body.asset.status,
          kind: body.asset.kind
        },
        lineage: {
          id: body.lineage.id,
          generationJobId: body.lineage.generationJobId,
          provider: body.lineage.provider,
          priceVersion: body.lineage.priceVersion
        }
      }
    : null;

  const ledger = body?.ledgerEntry
    ? {
        type: body.ledgerEntry.type,
        amountMinor: body.ledgerEntry.amountMinor,
        currency: body.ledgerEntry.currency
      }
    : null;

  const reservation = body?.reservation
    ? {
        id: body.reservation.id,
        state: reservationState(body.reservation),
        status: body.reservation.status,
        amountMinor: body.reservation.amountMinor,
        currency: body.reservation.currency
      }
    : null;

  const wallet = body?.wallet
    ? {
        id: body.wallet.id,
        balanceMinor: body.wallet.balanceMinor,
        currency: body.wallet.currency
      }
    : null;

  return {
    phase,
    banner,
    outcome: body ? settlementOutcome(body) : null,
    replay: body?.replay === true,
    media,
    ledger,
    reservation,
    wallet
  };
}

// Map an artifact trust status (UPPERCASE per V0_STATUS_ENUMS.md AssetTrustStatus
// contract) to a stable UI state.
function artifactState(artifact) {
  const status = String(artifact?.status ?? "").toLowerCase();
  const known = ["quarantined", "validating", "clean", "rejected", "deleted"];
  return known.includes(status) ? status : "unknown";
}

function settlementErrorMessage(error) {
  if (!error) {
    return "Could not settle this generation. Try again.";
  }
  if (error.code === "WORKSPACE_ACCESS_DENIED") {
    return "We could not find that generation in this workspace.";
  }
  if (error.code === "PERMISSION_DENIED") {
    return "Your role cannot settle paid generation.";
  }
  if (error.code === "GENERATION_JOB_NOT_SUBMITTABLE") {
    return "This generation cannot be settled in its current state.";
  }
  if (error.code === "PROVIDER_COST_EXCEEDS_AUTHORIZATION") {
    return "The provider cost exceeded the authorized maximum and was not settled.";
  }
  if (error.code === "ASSET_MEDIA_MALFORMED") {
    return "The generated media failed validation and was not accepted.";
  }
  if (error.code === "DEPENDENCY_UNAVAILABLE") {
    return "Settlement was interrupted after media retention. Try again.";
  }
  if (error.code === "IDEMPOTENCY_KEY_REQUIRED") {
    return "This action needs a request identity. Refresh and try again.";
  }
  return error.detail || "Could not settle this generation. Try again.";
}

// Render the descriptor as HTML. The status banner, media lineage, ledger, reservation
// and wallet carry data-state attributes so the e2e suite can assert
// captured/released/replay/dependency-unavailable/cost-exceeds/media-malformed/
// blocked-hidden states. The transient provider URL, provider external id, raw hashes,
// signed URLs and secrets never appear in the markup.
export function settlementMarkup(descriptor) {
  const banner = `<p class="status workflow-status" data-testid="generation-settlement-status" data-state="${escapeAttribute(descriptor.banner.state)}">${escapeText(descriptor.banner.text)}</p>`;
  const media = descriptor.media
    ? `<article class="candidate" data-testid="generation-settlement-media" data-state="${escapeAttribute(descriptor.media.artifact.state)}">
        <h3>Retained media</h3>
        <p>Status: ${escapeText(descriptor.media.artifact.status)}</p>
        <p>Duration: ${escapeText(String(descriptor.media.segment.durationSeconds))} seconds</p>
        <p>Asset version: ${escapeText(String(descriptor.media.asset.version))}</p>
        <p>Provider reference: retained</p>
        <span class="status" data-state="${escapeAttribute(descriptor.media.artifact.state)}">${escapeText(mediaLabel(descriptor.media.artifact.state))}</span>
      </article>`
    : "";
  const ledger = descriptor.ledger
    ? `<article class="candidate" data-testid="generation-settlement-ledger" data-state="${escapeAttribute(String(descriptor.ledger.type).toLowerCase())}">
        <h3>Credit ledger</h3>
        <p>Entry: ${escapeText(descriptor.ledger.type)}</p>
        <p>Amount: ${escapeText(String(descriptor.ledger.amountMinor))} ${escapeText(descriptor.ledger.currency)} (minor units)</p>
      </article>`
    : "";
  const reservation = descriptor.reservation
    ? `<article class="candidate" data-testid="generation-settlement-reservation" data-state="${escapeAttribute(descriptor.reservation.state)}">
        <h3>Credit reservation</h3>
        <p>Status: ${escapeText(descriptor.reservation.status)}</p>
        <p>Reserved: ${escapeText(String(descriptor.reservation.amountMinor))} ${escapeText(descriptor.reservation.currency)} (minor units)</p>
        <span class="status" data-state="${escapeAttribute(descriptor.reservation.state)}">${escapeText(reservationLabel(descriptor.reservation.state))}</span>
      </article>`
    : "";
  const wallet = descriptor.wallet
    ? `<article class="candidate" data-testid="generation-settlement-wallet" data-state="ready">
        <h3>Credit wallet</h3>
        <p>Balance: ${escapeText(String(descriptor.wallet.balanceMinor))} ${escapeText(descriptor.wallet.currency)} (minor units)</p>
      </article>`
    : "";
  return { banner, media, ledger, reservation, wallet };
}

function mediaLabel(state) {
  const labels = {
    quarantined: "Media quarantined",
    validating: "Validating media",
    clean: "Media validated clean",
    rejected: "Media rejected",
    deleted: "Media deleted"
  };
  return labels[state] || "Unknown";
}

function reservationLabel(state) {
  const labels = {
    active: "Credits reserved",
    captured: "Credits captured",
    released: "Credits released",
    expired: "Reservation expired",
    adjusted: "Reservation adjusted"
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

// Browser glue. Wires the settle form to the generated V0Client. Settlement is a
// billing action, so the workflow never renders an optimistic captured state: it
// shows loading, calls the API, and renders the committed settlement or a calm error.
// Only runs in the browser; the pure functions above are exported for Node tests.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const apiBase = window.location.origin.replace(/:\d+$/, ":3001") + "/api/v0";
  const section = document.querySelector("[data-testid='generation-settlement-contract']");
  let clientModulePromise = null;
  function client(token) {
    clientModulePromise ??= import("/v0-client.mjs");
    return clientModulePromise.then(({ V0Client }) => new V0Client({ baseUrl: apiBase, authToken: token }));
  }

  function render(descriptor) {
    const markup = settlementMarkup(descriptor);
    section.querySelector("[data-testid='generation-settlement-status']")?.replaceWith(createBanner(markup.banner));
    replaceSlot(section, "generation-settlement-media", markup.media);
    replaceSlot(section, "generation-settlement-ledger", markup.ledger);
    replaceSlot(section, "generation-settlement-reservation", markup.reservation);
    replaceSlot(section, "generation-settlement-wallet", markup.wallet);
  }

  function replaceSlot(scope, testId, html) {
    const node = scope.querySelector(`[data-testid='${testId}']`);
    if (html) {
      node?.replaceWith(createFragment(html));
    } else if (node) {
      node.remove();
    }
  }

  async function handle(form) {
    const workspaceId = form.elements.workspaceId.value.trim();
    const jobId = form.elements.jobId.value.trim();
    const idempotencyKey = form.elements.idempotencyKey.value.trim();
    const sessionToken = form.elements.sessionToken.value.trim();
    render(deriveSettlementState({ phase: "loading" }));
    try {
      const v0 = await client(sessionToken);
      const response = await v0.settleGenerationJob(jobId, { workspaceId }, { idempotencyKey });
      if (response.ok) {
        render(deriveSettlementState({ phase: "ready", body: response.body }));
      } else {
        render(deriveSettlementState({ phase: "error", error: response.body }));
      }
    } catch (fetchError) {
      render(deriveSettlementState({ phase: "error", error: { detail: fetchError.message } }));
    }
  }

  document.querySelector("[data-testid='generation-settle-form']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handle(event.currentTarget);
  });

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
