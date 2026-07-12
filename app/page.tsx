import { LoginForm } from "@/app/login/login-form";
import { resolveDevLoginEnabled, resolveGoogleAuthCredentials } from "@/lib/auth/config";
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
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-6">
      <LoginForm
        isDevLoginEnabled={resolveDevLoginEnabled()}
        isGoogleLoginEnabled={resolveGoogleAuthCredentials() !== null}
        isSignupEnabled={false}
      />
    </main>
  );
}
