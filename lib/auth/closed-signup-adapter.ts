import { isReservedSignupEmail } from "@/lib/auth/signup-policy";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import type { AuthDownstreamHooks } from "@/lib/auth/downstream/contract";
import { minimalGoogleAccountData } from "@/lib/auth/minimal-google-account";

export const AUTH_SIGNUP_CLOSED = "AUTH_SIGNUP_CLOSED" as const;
type AdapterCreateUserInput = Parameters<NonNullable<Adapter["createUser"]>>[0];
type AdapterLinkAccountInput = Parameters<NonNullable<Adapter["linkAccount"]>>[0];

function closedError(): Error {
  return new Error(AUTH_SIGNUP_CLOSED);
}

/**
 * Guard access-increasing adapter methods before they reach the persistence
 * delegate. Explicit public signup permits the minimal outer adapter to persist.
 */
export function closedSignupAdapter(
  delegate: Adapter,
  candidatePersistence: Pick<
    AuthDownstreamHooks,
    "createCandidateUser" | "linkCandidateAccount"
  >,
  publicSignupEnabled = false,
): Adapter {
  return {
    getUser: delegate.getUser,
    getUserByEmail: delegate.getUserByEmail,
    getUserByAccount: delegate.getUserByAccount,
    updateUser: delegate.updateUser,
    deleteUser: delegate.deleteUser,
    unlinkAccount: delegate.unlinkAccount,
    createSession: delegate.createSession,
    getSessionAndUser: delegate.getSessionAndUser,
    updateSession: delegate.updateSession,
    deleteSession: delegate.deleteSession,
    createVerificationToken: delegate.createVerificationToken,
    useVerificationToken: delegate.useVerificationToken,
    async createUser(user: AdapterCreateUserInput) {
      if (publicSignupEnabled && isReservedSignupEmail(user.email)) throw closedError();
      if (publicSignupEnabled && delegate.createUser) return delegate.createUser({ ...user, name: "Munjib User" } as never);
      const handled = await candidatePersistence.createCandidateUser({
        email: typeof user.email === "string" ? user.email : null,
      });
      if (!handled) throw closedError();
      return handled.user;
    },
    async linkAccount(account: AdapterLinkAccountInput) {
      let minimal;
      try {
        minimal = minimalGoogleAccountData(account);
      } catch {
        // Closed mode emits one stable denial before any delegate or provider
        // payload validation can influence persistence behavior.
        throw closedError();
      }
      if (publicSignupEnabled && delegate.linkAccount) return (await delegate.linkAccount(minimal)) as AdapterAccount | null | undefined;
      const handled = await candidatePersistence.linkCandidateAccount(minimal);
      if (!handled) throw closedError();
      return handled.result;
    },
  };
}
