"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n/messages";

const developmentUsers = ["owner@example.com", "editor@example.com", "viewer@example.com"];
const defaultPostLoginCallbackUrl = "/workspaces/company-handbook";

type LoginFormProps = {
  callbackUrl?: string;
};

function resolveAppLocalRedirectPath(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function resolvePostSignInRedirectUrl(resultUrl: string, callbackUrl: string) {
  // NextAuth can return an absolute URL based on NEXTAUTH_URL; keep app-local callbacks on the browser origin.
  return (
    resolveAppLocalRedirectPath(resultUrl) ??
    resolveAppLocalRedirectPath(callbackUrl) ??
    defaultPostLoginCallbackUrl
  );
}

export function LoginForm({ callbackUrl = defaultPostLoginCallbackUrl }: LoginFormProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("owner@example.com");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    setIsSubmitting(true);
    const safeCallbackUrl = resolveAppLocalRedirectPath(callbackUrl) ?? defaultPostLoginCallbackUrl;
    const result = await signIn("credentials", {
      email,
      redirect: false,
      callbackUrl: safeCallbackUrl,
    });

    if (result?.url) {
      window.location.assign(resolvePostSignInRedirectUrl(result.url, safeCallbackUrl));
      return;
    }

    setErrorKey(
      result?.error === "CredentialsSignin"
        ? "login.error.credentials"
        : "login.error.generic",
    );
    setIsSubmitting(false);
  }

  async function clearSession() {
    setErrorKey(null);
    await signOut({ redirect: false });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-ink">{t("login.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {t("login.description")}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2">
        {developmentUsers.map((userEmail) => (
          <button
            key={userEmail}
            type="button"
            onClick={() => setEmail(userEmail)}
            className="rounded-md border border-border px-3 py-2 text-left text-sm text-slate-700 hover:bg-muted"
          >
            {userEmail}
          </button>
        ))}
      </div>
      <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="email">
        {t("login.email")}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? t("login.signingIn") : t("login.signIn")}
      </button>
      <button
        type="button"
        onClick={clearSession}
        className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-muted"
      >
        {t("login.clearSession")}
      </button>
      {errorKey ? <p className="mt-3 text-sm text-red-600">{t(errorKey)}</p> : null}
    </form>
  );
}
