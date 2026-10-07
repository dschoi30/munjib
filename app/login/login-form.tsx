"use client";

import { signIn, signOut } from "next-auth/react";
import { Compass, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  readBrowserOrigin,
  resolveAppLocalRedirectPath,
  resolveAuthClientRedirectPath,
} from "@/lib/auth/client-redirects";
import type { MessageKey } from "@/lib/i18n/messages";
import { requestTurnstileToken } from "@/lib/auth/turnstile-client";

const developmentUsers = ["owner@example.com", "editor@example.com", "viewer@example.com"];
const defaultPostLoginCallbackUrl = "/workspaces/company-handbook";

type LoginFormProps = {
  callbackUrl?: string;
  isDevLoginEnabled?: boolean;
  isGoogleLoginEnabled?: boolean;
  isTrialLoginEnabled?: boolean;
  isSignupEnabled?: boolean;
  trialTurnstileSiteKey?: string;
  requestTrialChallengeToken?: (siteKey: string) => Promise<string>;
};

type AuthMode = "signin" | "signup";
type AuthAction = "password" | "signup" | "google" | "trial" | "dev" | null;

function buildPostAuthCallbackUrl(callbackUrl: string) {
  const origin = readBrowserOrigin();
  const safeCallbackUrl =
    (origin ? resolveAppLocalRedirectPath(callbackUrl, origin) : null) ??
    defaultPostLoginCallbackUrl;
  return `/login/redirect?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`;
}

function resolvePostSignInRedirectUrl(resultUrl: string, callbackUrl: string) {
  // NextAuth can return an absolute URL based on NEXTAUTH_URL; keep app-local callbacks on the browser origin.
  const origin = readBrowserOrigin();
  return (
    (origin ? resolveAuthClientRedirectPath(resultUrl, callbackUrl, origin) : null) ??
    buildPostAuthCallbackUrl(defaultPostLoginCallbackUrl)
  );
}

export function LoginForm({
  callbackUrl = defaultPostLoginCallbackUrl,
  isDevLoginEnabled = true,
  isGoogleLoginEnabled = true,
  isTrialLoginEnabled = true,
  isSignupEnabled = false,
  trialTurnstileSiteKey,
  requestTrialChallengeToken = requestTurnstileToken,
}: LoginFormProps) {
  const { language, isHydrated, t } = useI18n();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [activeAction, setActiveAction] = useState<AuthAction>(null);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [statusKey, setStatusKey] = useState<MessageKey | null>(null);

  if (!isHydrated) return <LoginFormSkeleton />;

  const postAuthCallbackUrl = buildPostAuthCallbackUrl(callbackUrl);
  const isSubmitting = activeAction !== null;
  const isSignupMode = isSignupEnabled && mode === "signup";

  async function onPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    setStatusKey(null);

    if (isSignupMode) {
      await createAccountAndSignIn(postAuthCallbackUrl);
      return;
    }

    setActiveAction("password");
    const result = await signIn("password", {
      email,
      password,
      redirect: false,
      callbackUrl: postAuthCallbackUrl,
    });

    if (result?.url) {
      window.location.assign(resolvePostSignInRedirectUrl(result.url, postAuthCallbackUrl));
      return;
    }

    setErrorKey(
      result?.error === "CredentialsSignin"
        ? "login.error.credentials"
        : "login.error.generic",
    );
    setActiveAction(null);
  }

  async function createAccountAndSignIn(postSignupCallbackUrl: string) {
    setActiveAction("signup");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, language }),
      });
      const result = (await response.json()) as { ok?: boolean; code?: string };
      if (!response.ok || !result.ok) {
        setErrorKey(resolveSignupErrorKey(result.code));
        setActiveAction(null);
        return;
      }
    } catch {
      setErrorKey("login.error.signupGeneric");
      setActiveAction(null);
      return;
    }

    setActiveAction("password");
    const result = await signIn("password", {
      email,
      password,
      redirect: false,
      callbackUrl: postSignupCallbackUrl,
    });
    if (result?.url) {
      window.location.assign(resolvePostSignInRedirectUrl(result.url, postSignupCallbackUrl));
      return;
    }
    setErrorKey("login.error.generic");
    setActiveAction(null);
  }

  async function onGoogleSignIn() {
    setErrorKey(null);
    setStatusKey(null);
    if (!isGoogleLoginEnabled) {
      setStatusKey("login.googleUnavailable");
      return;
    }
    setActiveAction("google");
    const result = await signIn("google", { callbackUrl: postAuthCallbackUrl });
    if (!result?.url) setActiveAction(null);
  }

  async function onTrialSignIn() {
    setErrorKey(null);
    setStatusKey(null);
    if (!isTrialLoginEnabled) return;
    setActiveAction("trial");
    try {
      const response = await fetch("/api/trial/entitlement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const result: unknown = await response.json();
      let entryPath = readTrialEntryPath(result);
      let entitlementAccepted = response.ok;
      if (!entryPath && readChallengeRequired(result)) {
        if (!trialTurnstileSiteKey) throw new Error("TURNSTILE_SITE_KEY_UNAVAILABLE");
        setStatusKey("login.trialChallenge");
        const challengeToken = await requestTrialChallengeToken(trialTurnstileSiteKey);
        const challengeResponse = await fetch("/api/trial/entitlement", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ challengeToken }),
        });
        const challengeResult: unknown = await challengeResponse.json();
        entitlementAccepted = challengeResponse.ok;
        entryPath = entitlementAccepted ? readTrialEntryPath(challengeResult) : null;
      }
      if (entitlementAccepted && entryPath) {
        window.location.assign(entryPath);
        return;
      }
    } catch {
      // Trial capability and edge evidence are fail-closed by the entitlement route.
    }
    setErrorKey("login.error.generic");
    setActiveAction(null);
  }

  async function onDevSignIn(userEmail: string) {
    if (!isDevLoginEnabled) return;
    setErrorKey(null);
    setStatusKey(null);
    setActiveAction("dev");
    const result = await signIn("development-login", {
      email: userEmail,
      redirect: false,
      callbackUrl: postAuthCallbackUrl,
    });
    if (result?.url) {
      window.location.assign(resolvePostSignInRedirectUrl(result.url, postAuthCallbackUrl));
      return;
    }
    setErrorKey("login.error.credentials");
    setActiveAction(null);
  }

  async function clearSession() {
    setErrorKey(null);
    setStatusKey(null);
    await signOut({ redirect: false });
  }

  return (
    <div className="w-full max-w-[420px] sm:-translate-y-3">
      <section className="rounded-xl border border-border bg-surface px-7 py-7 shadow-card">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight text-ink">
            {isSignupMode ? t("login.signupTitle") : t("login.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {isSignupMode ? t("login.signupDescription") : t("login.description")}
          </p>
        </div>

        {!isSignupMode && isGoogleLoginEnabled ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={onGoogleSignIn}
              aria-busy={activeAction === "google"}
              disabled={isSubmitting}
              className="mt-5 h-10 w-full border-border bg-surface text-sm font-medium text-ink shadow-none hover:bg-surface-muted"
            >
              <GoogleMark />
              {t("login.google")}
            </Button>

            <div className="my-4 flex items-center gap-3 text-xs text-ink-muted">
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              <span>{t("login.or")}</span>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
          </>
        ) : null}

        <form onSubmit={onPasswordSubmit} className={isSignupMode ? "mt-5 space-y-3" : "space-y-3"}>
          <div>
            <label className="block text-sm font-medium text-ink" htmlFor="email">
              {t("login.email")}
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              autoComplete="email"
              placeholder="owner@example.com"
              className="mt-2 h-10 rounded-md text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-ink" htmlFor="password">
                {t("login.password")}
              </label>
              {!isSignupMode ? (
                <button
                  type="button"
                  disabled
                  title={t("login.passwordResetUnavailable")}
                  className="cursor-not-allowed text-sm font-medium text-ink-muted opacity-50"
                >
                  {t("login.forgotPassword")}
                </button>
              ) : null}
            </div>
            <div className="relative mt-2">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                autoComplete={isSignupMode ? "new-password" : "current-password"}
                placeholder="••••••••••"
                className="h-10 rounded-md pr-11 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                disabled={isSubmitting}
                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            aria-busy={activeAction === "password" || activeAction === "signup"}
            disabled={isSubmitting}
            className="h-10 w-full rounded-md bg-[#161616] text-sm font-semibold text-white hover:bg-black"
          >
            {buttonLabel({
              mode,
              activeAction,
              signIn: t("login.signIn"),
              signingIn: t("login.signingIn"),
              createAccount: t("login.createAccount"),
              creatingAccount: t("login.creatingAccount"),
            })}
          </Button>
        </form>

        {isSignupEnabled ? (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm text-ink-muted">
            <span>{isSignupMode ? t("login.hasAccount") : t("login.noAccount")}</span>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setMode((current) => (current === "signin" ? "signup" : "signin"));
                setErrorKey(null);
                setStatusKey(null);
              }}
              className="font-medium text-[#174a76] hover:text-[#123a5e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSignupMode ? t("login.backToSignIn") : t("login.createOne")}
            </button>
          </div>
        ) : null}

        <div className="my-4 h-px bg-border" aria-hidden="true" />

        {isTrialLoginEnabled ? (
          <button
            type="button"
            onClick={onTrialSignIn}
            disabled={isSubmitting}
            aria-busy={activeAction === "trial"}
            aria-label={`${t("login.trial")} ${t("login.noSignup")}`}
            className="flex w-full items-center gap-3 rounded-md px-7 py-1 text-left transition-colors duration-fast hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-ink-muted text-ink-muted">
              <Compass className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-ink">
              {t("login.trial")}
            </span>
            <span className="shrink-0 rounded-full border border-border bg-surface px-3 py-0.5 text-xs font-medium text-ink-muted">
              {t("login.noSignup")}
            </span>
          </button>
        ) : null}

        {errorKey ? <p className="mt-4 text-sm text-danger">{t(errorKey)}</p> : null}
        {statusKey ? <p className="mt-4 text-sm text-ink-muted">{t(statusKey)}</p> : null}
      </section>

      {isDevLoginEnabled ? (
        <section className="mt-3 rounded-lg border border-dashed border-border bg-surface/80 p-4">
          <p className="text-sm font-medium text-ink">{t("login.devTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">{t("login.devDescription")}</p>
          <div className="mt-3 grid gap-2">
            {developmentUsers.map((userEmail) => (
              <Button
                key={userEmail}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onDevSignIn(userEmail)}
                disabled={isSubmitting}
                className="justify-start bg-surface text-xs"
              >
                {t("login.devSignIn", { email: userEmail })}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearSession}
            disabled={isSubmitting}
            className="mt-2 w-full text-xs"
          >
            {t("login.clearSession")}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function readTrialEntryPath(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entry = (value as Record<string, unknown>).entry;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const path = (entry as Record<string, unknown>).path;
  return typeof path === "string" && /^\/trial\/workspaces\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)
    ? path
    : null;
}

function readChallengeRequired(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { challengeRequired?: unknown }).challengeRequired === true);
}

function resolveSignupErrorKey(code: string | undefined): MessageKey {
  if (code === "EMAIL_IN_USE") return "login.error.emailInUse";
  if (code === "WEAK_PASSWORD") return "login.error.weakPassword";
  return "login.error.signupGeneric";
}

function buttonLabel(input: {
  mode: AuthMode;
  activeAction: AuthAction;
  signIn: string;
  signingIn: string;
  createAccount: string;
  creatingAccount: string;
}) {
  if (input.mode === "signup") {
    return input.activeAction === "signup" ? input.creatingAccount : input.createAccount;
  }
  return input.activeAction === "password" ? input.signingIn : input.signIn;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path
        fill="#4285f4"
        d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.2-.9 2.2-1.9 2.9v2.4h3.1c1.8-1.7 3-4.1 3-7z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-3.9H3.4v2.5C5 19.9 8.3 22 12 22z"
      />
      <path
        fill="#fbbc05"
        d="M6.6 14.3c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V8H3.4C2.8 9.3 2.4 10.6 2.4 12s.3 2.7 1 4z"
      />
      <path
        fill="#ea4335"
        d="M12 5.8c1.4 0 2.7.5 3.7 1.5l2.8-2.8C16.8 2.9 14.6 2 12 2 8.3 2 5 4.1 3.4 7.2l3.2 2.5c.8-2.2 2.9-3.9 5.4-3.9z"
      />
    </svg>
  );
}

function LoginFormSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="w-full max-w-[420px] rounded-xl border border-border bg-surface px-7 py-7 shadow-card"
    >
      <div className="h-7 w-44 rounded-md munjib-skeleton" />
      <div className="mt-3 h-4 w-60 rounded-md munjib-skeleton" />
      <div className="mt-5 h-10 rounded-md munjib-skeleton" />
      <div className="my-4 h-px bg-border" />
      <div className="h-4 w-12 rounded-md munjib-skeleton" />
      <div className="mt-2 h-10 rounded-md munjib-skeleton" />
      <div className="mt-3 flex items-center justify-between">
        <div className="h-4 w-20 rounded-md munjib-skeleton" />
        <div className="h-4 w-28 rounded-md munjib-skeleton" />
      </div>
      <div className="mt-2 h-10 rounded-md munjib-skeleton" />
      <div className="mt-3 h-10 rounded-md munjib-skeleton" />
      <div className="mx-auto mt-3 h-4 w-48 rounded-md munjib-skeleton" />
      <div className="my-4 h-px bg-border" />
      <div className="h-8 rounded-lg munjib-skeleton" />
    </section>
  );
}
