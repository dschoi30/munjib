import { resolvePublicSignupEnabled } from "@/lib/auth/signup-policy";
import { LoginForm } from "@/app/login/login-form";
import { LandingPage } from "@/components/landing-page";
import {
  resolveDevLoginEnabled,
  resolveGoogleAuthCredentials,
  resolveTrialLoginEnabled,
  resolveTrialTurnstileSiteKey,
} from "@/lib/auth/config";
import { ensureCurrentUserWorkspaceAndRedirect } from "@/lib/auth/provisioning";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(
      await ensureCurrentUserWorkspaceAndRedirect({
        userId: user.id,
        language: "en",
      }),
    );
  }

  return (
    <LandingPage
      loginForm={<LoginForm
        isDevLoginEnabled={resolveDevLoginEnabled()}
        isGoogleLoginEnabled={resolveGoogleAuthCredentials() !== null}
        isTrialLoginEnabled={resolveTrialLoginEnabled()}
        trialTurnstileSiteKey={resolveTrialTurnstileSiteKey()}
        isSignupEnabled={resolvePublicSignupEnabled()}
      />}
    />
  );
}
