import { LoginForm } from "@/app/login/login-form";
import { resolveDevLoginEnabled } from "@/lib/auth/config";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-6">
      <LoginForm isDevLoginEnabled={resolveDevLoginEnabled()} />
    </main>
  );
}
