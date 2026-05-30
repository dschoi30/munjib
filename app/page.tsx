import { LoginForm } from "@/app/login/login-form";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/workspaces/company-handbook");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-6">
      <LoginForm />
    </main>
  );
}
