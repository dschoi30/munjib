import type { Adapter } from "next-auth/adapters";
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
 * delegate. Candidate hooks are intentionally closed in Leaf 1.
 */
export function closedSignupAdapter(
  delegate: Adapter,
  candidatePersistence: Pick<
    AuthDownstreamHooks,
    "createCandidateUser" | "linkCandidateAccount"
  >,
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
      const handled = await candidatePersistence.linkCandidateAccount(minimal);
      if (!handled) throw closedError();
      return handled.result;
    },
  };
}
