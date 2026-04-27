import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { authOptions } from "@/lib/auth/config";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/workspaces/company-handbook");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-6">
      <LoginForm />
    </main>
  );
}
