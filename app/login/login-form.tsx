"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

const developmentUsers = ["owner@example.com", "editor@example.com", "viewer@example.com"];

export function LoginForm() {
  const [email, setEmail] = useState("owner@example.com");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await signIn("credentials", {
      email,
      redirect: false,
      callbackUrl: "/workspaces/company-handbook",
    });

    if (result?.url) {
      window.location.assign(result.url);
      return;
    }

    setError(
      result?.error === "CredentialsSignin"
        ? "No matching development user was found. Run pnpm run db:seed and try one of the listed accounts."
        : "Sign in failed. Clear the local session and try again.",
    );
    setIsSubmitting(false);
  }

  async function clearSession() {
    setError(null);
    await signOut({ redirect: false });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-ink">Development login</h1>
      <p className="mt-2 text-sm text-slate-600">
        Use owner@example.com, editor@example.com, or viewer@example.com.
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
        Email
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
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
      <button
        type="button"
        onClick={clearSession}
        className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-muted"
      >
        Clear local session
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
