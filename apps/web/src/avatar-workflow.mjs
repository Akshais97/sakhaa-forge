import { banner, escapeHtml, renderBanner } from "./workflow-markup-utils.mjs";

const REASONS = {
  eligible: ["ready", "Eligible"],
  consent_expired: ["expired", "Consent expired"],
  consent_revoked: ["revoked", "Consent revoked"],
  consent_required: ["consent-missing", "Consent missing"],
  service_pending: ["service-pending", "Service pending"]
};

export function avatarCardState(avatar) {
  return REASONS[avatar?.eligibility?.reason]?.[0] ?? "empty";
}

export function avatarCardLabel(avatar) {
  return REASONS[avatar?.eligibility?.reason]?.[1] ?? "Unavailable";
}

export function classifyAvatarError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    BRAND_PROFILE_NOT_APPROVED: "blocked-brand",
    PERMISSION_DENIED: "forbidden"
  }[error?.code] ?? "error";
}

export function deriveAvatarCatalogState(input = {}) {
  if (input.phase === "loading") return { banner: banner("loading", "Loading avatars."), avatars: [] };
  if (input.phase === "error") {
    const state = classifyAvatarError(input.error);
    return { banner: banner(state, state === "blocked-hidden" ? "We could not find that brand profile in this workspace." : "Avatar catalogue is not available."), avatars: [] };
  }
  if (input.phase === "empty") return { banner: banner("empty", "No avatar catalogue loaded."), avatars: [] };
  const avatars = (input.items ?? []).map((avatar) => {
    const state = avatarCardState(avatar);
    return {
      id: avatar.id,
      displayName: avatar.displayName,
      kind: avatar.kind,
      state,
      label: avatarCardLabel(avatar),
      eligible: state === "ready",
      selected: avatar.id === input.selectedAvatarId
    };
  });
  const eligible = avatars.filter((avatar) => avatar.eligible).length;
  const state = input.phase === "selected" ? "success" : "ready";
  return { banner: banner(state, `${eligible} of ${avatars.length} avatars are eligible.`), avatars };
}

export function avatarCatalogMarkup(descriptor) {
  return {
    banner: renderBanner("avatar-catalog-status", descriptor.banner),
    grid: (descriptor.avatars ?? []).map((avatar) => {
      const disabled = avatar.eligible ? "" : " disabled";
      return `<article data-testid="avatar-card" data-avatar-id="${escapeHtml(avatar.id)}" data-state="${escapeHtml(avatar.state)}"><h3>${escapeHtml(avatar.displayName)}</h3><p>${escapeHtml(avatar.label)}</p><button${disabled}>Select avatar</button></article>`;
    }).join("")
  };
}
