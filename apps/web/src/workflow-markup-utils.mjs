export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function stableState(value, allowed) {
  const normalized = String(value ?? "").toLowerCase();
  return allowed.includes(normalized) ? normalized : "unknown";
}

export function formatMinor(minor, currency = "INR") {
  const amount = Number.isInteger(minor) ? minor : 0;
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  const major = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");
  return `${sign}${currency} ${major}.${cents}`;
}

export function banner(state, text, extra = {}) {
  return { state, text, ...extra };
}

export function renderBanner(testId, descriptor) {
  const retry = descriptor.retryAfterMs ? ` data-retry-minutes="${Math.ceil(descriptor.retryAfterMs / 60000)}"` : "";
  return `<section data-testid="${testId}" data-state="${escapeHtml(descriptor.state)}"${retry}>${escapeHtml(descriptor.text)}</section>`;
}
