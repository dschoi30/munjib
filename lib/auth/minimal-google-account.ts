import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";

type AdapterCreateUserInput = Parameters<NonNullable<Adapter["createUser"]>>[0];
type AdapterLinkAccountInput = Parameters<NonNullable<Adapter["linkAccount"]>>[0];
type AdapterUnlinkAccountInput = Parameters<NonNullable<Adapter["unlinkAccount"]>>[0];

export type MinimalGoogleAccount = {
  userId: string;
  type: "oauth";
  provider: "google";
  providerAccountId: string;
};

export function minimalGoogleAccountData(input: {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
}): MinimalGoogleAccount {
  if (
    input.provider !== "google" ||
    input.type !== "oauth" ||
    typeof input.userId !== "string" ||
    input.userId.length === 0 ||
    typeof input.providerAccountId !== "string" ||
    input.providerAccountId.length === 0
  ) {
    throw new Error("GOOGLE_ACCOUNT_IDENTITY_INVALID");
  }
  return {
    userId: input.userId,
    type: "oauth",
    provider: "google",
    providerAccountId: input.providerAccountId,
  };
}

function normalizedEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("GOOGLE_USER_EMAIL_INVALID");
  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("GOOGLE_USER_EMAIL_INVALID");
  return email;
}

/**
 * Explicitly wraps a NextAuth adapter without spreading provider payloads or
 * exposing account refresh/update methods.
 */
export function minimalGooglePersistenceAdapter(delegate: Adapter): Adapter {
  const adapter: Adapter = {
    getUser: delegate.getUser,
    getUserByEmail: delegate.getUserByEmail,
    getUserByAccount: delegate.getUserByAccount,
    createSession: delegate.createSession,
    getSessionAndUser: delegate.getSessionAndUser,
    updateSession: delegate.updateSession,
    deleteSession: delegate.deleteSession,
    createVerificationToken: delegate.createVerificationToken,
    useVerificationToken: delegate.useVerificationToken,
    async createUser(user: AdapterCreateUserInput): Promise<AdapterUser> {
      if (!delegate.createUser) throw new Error("AUTH_ADAPTER_CREATE_USER_UNAVAILABLE");
      return delegate.createUser({
        email: normalizedEmail(user.email),
        name: null,
        emailVerified: null,
        image: null,
      } as never);
    },
    async linkAccount(account: AdapterLinkAccountInput): Promise<AdapterAccount | null | undefined> {
      if (!delegate.linkAccount) throw new Error("AUTH_ADAPTER_LINK_ACCOUNT_UNAVAILABLE");
      return (await delegate.linkAccount(minimalGoogleAccountData(account) as never)) as
        | AdapterAccount
        | null
        | undefined;
    },
    async updateUser(user): Promise<AdapterUser> {
      if (!delegate.getUser) throw new Error("AUTH_ADAPTER_GET_USER_UNAVAILABLE");
      const current = await delegate.getUser(user.id);
      if (!current) throw new Error("AUTH_USER_NOT_FOUND");
      return current;
    },
    async unlinkAccount(account: AdapterUnlinkAccountInput): Promise<AdapterAccount | undefined> {
      if (!delegate.unlinkAccount) return undefined;
      return (await delegate.unlinkAccount({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      } as never)) as AdapterAccount | undefined;
    },
    async deleteUser(userId) {
      if (!delegate.deleteUser) return undefined;
      const result = await delegate.deleteUser(userId);
      return result ?? undefined;
    },
  };
  return adapter;
}
