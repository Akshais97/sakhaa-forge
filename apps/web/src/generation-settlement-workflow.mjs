import { banner, escapeHtml, renderBanner } from "./workflow-markup-utils.mjs";

export function reservationState(reservation) {
  return ["active", "captured", "released", "expired", "adjusted"].includes(reservation?.status) ? reservation.status : "unknown";
}

export function settlementOutcome(body) {
  return ["captured", "released"].includes(body?.outcome) ? body.outcome : "unknown";
}

export function classifySettlementError(error) {
  return {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    GENERATION_JOB_NOT_SUBMITTABLE: "not-submittable",
    PROVIDER_COST_EXCEEDS_AUTHORIZATION: "cost-exceeds",
    ASSET_MEDIA_MALFORMED: "media-malformed",
    DEPENDENCY_UNAVAILABLE: "dependency-unavailable",
    IDEMPOTENCY_KEY_REQUIRED: "idempotency-required"
  }[error?.code] ?? "error";
}

export function deriveSettlementState(input = {}) {
  if (input.phase === "loading") return { banner: banner("loading", "Settling generation."), outcome: "unknown", replay: false, media: null, ledger: null, reservation: null, wallet: null };
  if (input.phase === "error") return { banner: banner(classifySettlementError(input.error), "Generation settlement is not available."), outcome: "unknown", replay: false, media: null, ledger: null, reservation: null, wallet: null };
  if (input.phase !== "ready" || !input.body) return { banner: banner("empty", "No settlement loaded."), outcome: "unknown", replay: false, media: null, ledger: null, reservation: null, wallet: null };
  const outcome = settlementOutcome(input.body);
  const media = input.body.artifact ? { artifact: { state: String(input.body.artifact.status ?? "").toLowerCase() }, segment: input.body.segment ? { providerReference: "retained" } : null } : null;
  return {
    banner: banner(outcome, input.body.replay ? "Generation was already settled." : `Generation credits ${outcome}.`),
    outcome,
    replay: Boolean(input.body.replay),
    media,
    ledger: input.body.ledgerEntry,
    reservation: input.body.reservation ? { ...input.body.reservation, state: reservationState(input.body.reservation) } : null,
    wallet: input.body.wallet ?? null
  };
}

export function settlementMarkup(descriptor) {
  return {
    banner: renderBanner("generation-settlement-status", descriptor.banner),
    media: descriptor.media ? `<section data-testid="generation-settlement-media" data-state="${escapeHtml(descriptor.media.artifact.state)}">Provider reference: retained</section>` : "",
    ledger: descriptor.ledger ? `<section data-testid="generation-settlement-ledger" data-state="${escapeHtml(String(descriptor.ledger.type ?? "").toLowerCase())}">${escapeHtml(descriptor.ledger.type)}</section>` : "",
    reservation: descriptor.reservation ? `<section data-testid="generation-settlement-reservation" data-state="${escapeHtml(descriptor.reservation.state)}">${escapeHtml(descriptor.reservation.state)}</section>` : "",
    wallet: descriptor.wallet ? `<section data-testid="generation-settlement-wallet">Wallet retained</section>` : ""
  };
}
