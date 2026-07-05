"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export default function LoginRedirectPage() {
  const { language, isHydrated, t } = useI18n();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;
    const params = new URLSearchParams(window.location.search);
    const callbackUrl = params.get("callbackUrl");

    async function resolveRedirect() {
      try {
        const response = await fetch("/api/auth/landing", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ language, callbackUrl }),
        });
        if (!response.ok) throw new Error("landing failed");
        const result = (await response.json()) as { redirectPath?: string };
        window.location.assign(result.redirectPath ?? "/login");
      } catch {
        setFailed(true);
      }
    }

    void resolveRedirect();
  }, [isHydrated, language]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center shadow-card">
        <p className="text-sm text-ink-muted">
          {failed ? t("login.redirectFailed") : t("login.redirecting")}
        </p>
      </div>
    </main>
  );
}
