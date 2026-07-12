import { LoginForm } from "@/app/login/login-form";
import {
  resolveDevLoginEnabled,
  resolveGoogleAuthCredentials,
  resolveTrialLoginEnabled,
} from "@/lib/auth/config";

// The form reflects a runtime env gate, so avoid baking it into a static route.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-6">
      <LoginForm
        isDevLoginEnabled={resolveDevLoginEnabled()}
        isGoogleLoginEnabled={resolveGoogleAuthCredentials() !== null}
        isTrialLoginEnabled={resolveTrialLoginEnabled()}
        isSignupEnabled={false}
      />
    </main>
  );
}
