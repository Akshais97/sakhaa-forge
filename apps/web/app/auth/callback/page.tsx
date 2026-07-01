import { PublicScreen } from "../../public-screen";

export default function AuthCallbackPage() {
  return (
    <PublicScreen
      eyebrow="Auth callback"
      title="Processing Sakhaa Forge sign-in"
      body="The callback route exchanges provider response data and then replaces navigation with the permitted workspace route. Malformed or expired responses stay bounded here."
      primaryLabel="Return to product entry"
      secondary="No provider payload is rendered."
    />
  );
}
