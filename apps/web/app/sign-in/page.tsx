import { PublicScreen } from "../public-screen";

export default function SignInPage() {
  return (
    <PublicScreen
      eyebrow="Supabase sign-in"
      title="Sign in to Sakhaa Forge"
      body="Use your workspace account to continue. Provider failure, expired callback and success redirect states are handled by the authentication contract."
      primaryLabel="Return to product entry"
      secondary="Signed-out access only."
    />
  );
}
