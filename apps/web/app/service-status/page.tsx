import { PublicScreen } from "../public-screen";

export default function ServiceStatusPage() {
  return (
    <PublicScreen
      eyebrow="Service status"
      title="Sakhaa Forge service status"
      body="This public-safe screen shows sanitised readiness and dependency health only. Secrets, provider payloads and internal credentials are never rendered."
      primaryLabel="Return to product entry"
      secondary="Healthy, degraded and unavailable states share one safe format."
    />
  );
}
