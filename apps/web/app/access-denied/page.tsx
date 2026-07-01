import { PublicScreen } from "../public-screen";

export default function AccessDeniedPage() {
  return (
    <PublicScreen
      eyebrow="Workspace access"
      title="No permitted Sakhaa Forge workspace"
      body="Your account is authenticated, but no permitted workspace is available. This surface avoids exposing protected workspace details."
      primaryLabel="Return to product entry"
      secondary="Access can be restored by an Owner or Admin."
    />
  );
}
