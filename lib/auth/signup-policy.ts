import { launchAccountSeeds } from "@/lib/auth/launch-accounts";

/** Explicit opt-in; unset or malformed values keep public account creation closed. */
export function resolvePublicSignupEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.MUNJIB_PUBLIC_SIGNUP_ENABLED === "true";
}

/** Public registration must not claim the legacy automatically privileged identities. */
export function isReservedSignupEmail(value: unknown): boolean {
  return typeof value === "string" && launchAccountSeeds.some(
    account => account.email === value.trim().toLowerCase(),
  );
}
