import type { GoogleAccountIdentity, GoogleProfileIdentity } from "@/lib/auth/google-existing-account";
import type { AdapterAccount, AdapterUser } from "next-auth/adapters";
import { leaf2AuthHooks } from "@/lib/auth/downstream/leaf2";
import { leaf4AuthHooks } from "@/lib/auth/downstream/leaf4";
import { leaf7AuthHooks } from "@/lib/auth/downstream/leaf7";
import { leaf8AuthHooks } from "@/lib/auth/downstream/leaf8";
import type { DurableAuthState, DurableAuthStateInput } from "@/lib/auth/durable-auth-state";

export type DurableAuthSurface =
  | "PASSWORD"
  | "GOOGLE_EXISTING"
  | "JWT"
  | "SESSION"
  | "PROVISIONING";

export type AuthDownstreamHooks = Readonly<{
  assertDurableAuthState(input: DurableAuthStateInput): Promise<DurableAuthState | void> | DurableAuthState | void;
  admitPasswordCredentials(input: { userId: string; email: string }): Promise<boolean> | boolean;
  guardOAuthStart(input: { provider: "google" }): Promise<boolean> | boolean;
  reduceSessionImage(input: { userId: string; databaseValue: unknown }): Promise<string | null> | string | null;
  guardOAuthIdentity(input: {
    account: GoogleAccountIdentity | null | undefined;
    profile: GoogleProfileIdentity | null | undefined;
  }): Promise<unknown> | unknown;
  authorizeCandidateGoogle(input: {
    guardedIdentity: unknown;
    account: GoogleAccountIdentity;
    profile: GoogleProfileIdentity;
  }): Promise<boolean> | boolean;
  resolveJwtClaims(input: Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
  resolveSessionOutput(input: { userId: string }): Promise<void> | void;
  recordAuthMutation(input: { userId: string; mutation: string }): Promise<void> | void;
  createCandidateUser(input: { email?: string | null }): Promise<
    { user: AdapterUser } | null
  >;
  linkCandidateAccount(input: ReturnType<typeof import("@/lib/auth/minimal-google-account")["minimalGoogleAccountData"]>): Promise<
    { result: AdapterAccount } | null
  >;
}>;

export function freezeAuthDownstreamHooks(hooks: AuthDownstreamHooks): AuthDownstreamHooks {
  return Object.freeze({ ...hooks });
}

export const defaultAuthDownstreamHooks = freezeAuthDownstreamHooks({
  assertDurableAuthState: leaf2AuthHooks.assertDurableAuthState,
  admitPasswordCredentials() {
    return true;
  },
  guardOAuthStart() {
    return true;
  },
  reduceSessionImage: leaf4AuthHooks.reduceSessionImage,
  guardOAuthIdentity: leaf8AuthHooks.guardOAuthIdentity,
  authorizeCandidateGoogle: leaf7AuthHooks.authorizeCandidateGoogle,
  createCandidateUser: leaf7AuthHooks.createCandidateUser,
  linkCandidateAccount: leaf7AuthHooks.linkCandidateAccount,
  resolveJwtClaims(input: Record<string, unknown>) {
    return input;
  },
  resolveSessionOutput() {
    // Reserved for an authoritative session-state resolver.
  },
  recordAuthMutation() {
    // Reserved for a future auth mutation journal.
  },
});

export const authDownstreamHooks = defaultAuthDownstreamHooks;
