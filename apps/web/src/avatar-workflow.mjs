// V0-G1 consent-safe avatar selection workflow. Pure, DOM-agnostic state functions
// that are unit-tested in Node, plus a browser glue that wires the generated
// V0Client to the page. Eligibility is server-truth derived from consent fields;
// the workflow only renders it and never fabricates an eligible state. Ineligible
// avatars render as disabled and cannot be selected. There is no V0 public avatar
// mutation endpoint, so selection is a local client-side decision that feeds the
// later generation-estimate step; no optimistic paid/publishing action is taken.
// Browser code never holds database, Redis, provider or secret credentials beyond
// the caller's Supabase JWT. V0Client is imported dynamically inside the browser
// glue so the pure functions below can be imported and tested in Node without a
// browser module resolution.

// Map a server-derived eligibility reason to a stable UI state. The data-state
// attribute is asserted by the e2e suite; reasons are never invented client-side.
export function avatarCardState(avatar) {
  const reason = avatar?.eligibility?.reason;
  if (reason === "eligible") {
    return "ready";
  }
  if (reason === "consent_expired") {
    return "expired";
  }
  if (reason === "consent_revoked") {
    return "revoked";
  }
  if (reason === "consent_required") {
    return "consent-missing";
  }
  if (reason === "service_pending") {
    return "service-pending";
  }
  return "empty";
}

// Honest, calm status label for each eligibility state. Generic avatars are
// labelled by kind, never with performance claims.
export function avatarCardLabel(avatar) {
  const labels = {
    ready: "Eligible",
    expired: "Consent expired",
    revoked: "Consent revoked",
    "consent-missing": "Consent missing",
    "service-pending": "Service pending",
    empty: "Unknown"
  };
  return labels[avatarCardState(avatar)] || "Unknown";
}

// Map a catalogue problem to the workflow banner state. Cross-workspace and
// missing brand profiles hide behind the same blocked state; permission and
// approval problems get their own calm states; anything else is a recoverable
// error.
export function classifyAvatarError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  if (problem.code === "WORKSPACE_ACCESS_DENIED") {
    return "blocked-hidden";
  }
  if (problem.code === "BRAND_PROFILE_NOT_APPROVED") {
    return "blocked-brand";
  }
  if (problem.code === "PERMISSION_DENIED") {
    return "forbidden";
  }
  return "error";
}

// Derive the workflow descriptor from the current phase and API response. The
// descriptor is a plain object so it can be asserted in Node without a DOM; the
// browser glue renders it via avatarCatalogMarkup.
export function deriveAvatarCatalogState({ phase, items = [], error = null, selectedAvatarId = null }) {
  const cards = items.map((avatar) => ({
    id: avatar.id,
    kind: avatar.kind,
    displayName: avatar.displayName,
    likenessScope: avatar.likenessScope,
    voiceScope: avatar.voiceScope,
    serviceFulfillmentState: avatar.serviceFulfillmentState,
    state: avatarCardState(avatar),
    label: avatarCardLabel(avatar),
    eligible: avatar.eligibility?.eligible === true,
    reason: avatar.eligibility?.reason,
    selected: selectedAvatarId === avatar.id
  }));

  let banner = { state: "empty", text: "No avatar catalogue loaded." };
  if (phase === "loading") {
    banner = { state: "loading", text: "Loading the consent-safe avatar catalogue." };
  } else if (phase === "error") {
    banner = { state: classifyAvatarError(error), text: catalogErrorMessage(error) };
  } else if (phase === "ready") {
    const eligibleCount = cards.filter((card) => card.eligible).length;
    banner = {
      state: "ready",
      text: `${eligibleCount} of ${cards.length} avatars are eligible. Ineligible avatars cannot enter a generation estimate or job.`
    };
  } else if (phase === "selected") {
    const selected = cards.find((card) => card.selected) || null;
    banner = {
      state: "success",
      text: selected
        ? `Selected ${selected.displayName} for the next generation step.`
        : "Avatar selected for the next generation step."
    };
  }

  return { phase, banner, avatars: cards };
}

function catalogErrorMessage(error) {
  if (!error) {
    return "Could not load the avatar catalogue. Try again.";
  }
  if (error.code === "WORKSPACE_ACCESS_DENIED") {
    return "We could not find that brand profile in this workspace.";
  }
  if (error.code === "BRAND_PROFILE_NOT_APPROVED") {
    return "Approve the current brand profile before selecting an avatar.";
  }
  if (error.code === "PERMISSION_DENIED") {
    return "Your role cannot manage avatar consent.";
  }
  return error.detail || "Could not load the avatar catalogue. Try again.";
}

// Render the descriptor as HTML for the page. The status banner and each avatar
// card carry data-state attributes so the e2e suite can assert empty/loading/
// ready/expired/revoked/consent-missing/service-pending/forbidden states.
export function avatarCatalogMarkup(descriptor) {
  const banner = `<p class="status workflow-status" data-testid="avatar-catalog-status" data-state="${escapeAttribute(descriptor.banner.state)}">${escapeText(descriptor.banner.text)}</p>`;
  const cards = descriptor.avatars
    .map((card) => {
      const disabled = card.eligible ? "" : "disabled";
      const selected = card.selected ? "data-selected=\"true\"" : "";
      return `<article class="candidate" data-testid="avatar-card" data-avatar-id="${escapeAttribute(card.id)}" data-state="${escapeAttribute(card.state)}" ${selected}>
        <h3>${escapeText(card.displayName)}</h3>
        <p>Kind: ${escapeText(card.kind)}</p>
        <p>Likeness: ${escapeText(card.likenessScope)} · Voice: ${escapeText(card.voiceScope)}</p>
        <p>Fulfillment: ${escapeText(card.serviceFulfillmentState)}</p>
        <span class="status" data-state="${escapeAttribute(card.state)}">${escapeText(card.label)}</span>
        <button type="button" data-testid="avatar-select" data-avatar-id="${escapeAttribute(card.id)}" ${disabled}>Select avatar</button>
      </article>`;
    })
    .join("");
  const grid = `<div class="candidate-grid" data-testid="avatar-catalog-grid">${cards}</div>`;
  return { banner, grid };
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

// Browser glue. Wires the form + catalogue grid to the generated V0Client. Only
// runs in the browser; the pure functions above are exported for Node tests.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const apiBase = window.location.origin.replace(/:\d+$/, ":3001") + "/api/v0";
  const form = document.querySelector("[data-testid='avatar-catalog-form']");
  const section = document.querySelector("[data-testid='avatar-catalog-contract']");
  let current = null;
  let clientModulePromise = null;
  function client() {
    const sessionToken = form.elements.sessionToken.value.trim();
    clientModulePromise ??= import("/v0-client.mjs");
    return clientModulePromise.then(({ V0Client }) => new V0Client({ baseUrl: apiBase, authToken: sessionToken }));
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const workspaceId = form.elements.workspaceId.value.trim();
    const brandProfileId = form.elements.brandProfileId.value.trim();
    render(deriveAvatarCatalogState({ phase: "loading" }));
    try {
      const v0 = await client();
      const response = await v0.listAvatars({ workspaceId, brandProfileId, limit: 50 });
      if (response.status === 200) {
        current = { workspaceId, brandProfileId, items: response.body.items };
        render(deriveAvatarCatalogState({ phase: "ready", items: current.items }));
      } else {
        render(deriveAvatarCatalogState({ phase: "error", error: response.body }));
      }
    } catch (fetchError) {
      render(deriveAvatarCatalogState({ phase: "error", error: { detail: fetchError.message } }));
    }
  });

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!target || !target.matches?.("[data-testid='avatar-select']") || target.disabled) {
      return;
    }
    if (!current) {
      return;
    }
    const avatarId = target.getAttribute("data-avatar-id");
    const avatar = current.items.find((item) => item.id === avatarId);
    if (!avatar || avatar.eligibility?.eligible !== true) {
      return;
    }
    // Selection is a local client-side decision for the next generation step;
    // there is no V0 avatar mutation endpoint, so no irreversible call is made.
    current.selectedAvatarId = avatarId;
    render(deriveAvatarCatalogState({ phase: "selected", items: current.items, selectedAvatarId: avatarId }));
  });

  function render(descriptor) {
    const markup = avatarCatalogMarkup(descriptor);
    section.querySelector("[data-testid='avatar-catalog-status']")?.replaceWith(createBanner(markup.banner));
    section.querySelector("[data-testid='avatar-catalog-grid']")?.replaceWith(createFragment(markup.grid));
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
