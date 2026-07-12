import { prisma } from "@/lib/db/client";

export type GoogleAccountIdentity = {
  provider?: string | null;
  providerAccountId?: string | null;
};

export type GoogleProfileIdentity = {
  email?: string | null;
  email_verified?: boolean;
};

const accountIdentitySelect = {
  userId: true,
  access_token: true,
  refresh_token: true,
  id_token: true,
  session_state: true,
  scope: true,
  token_type: true,
  expires_at: true,
} as const;

function hasGoogleIdentity(account: GoogleAccountIdentity | null | undefined): account is {
  provider: "google";
  providerAccountId: string;
} {
  return (
    account?.provider === "google" &&
    typeof account.providerAccountId === "string" &&
    account.providerAccountId.length > 0
  );
}

export async function authorizeExistingGoogleAccount(input: {
  account: GoogleAccountIdentity | null | undefined;
  profile: GoogleProfileIdentity | null | undefined;
}): Promise<boolean> {
  if (!hasGoogleIdentity(input.account) || input.profile?.email_verified !== true) {
    return false;
  }

  const linked = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: input.account.providerAccountId,
      },
    },
    select: accountIdentitySelect,
  });

  return Boolean(
    linked &&
      linked.access_token === null &&
      linked.refresh_token === null &&
      linked.id_token === null &&
      linked.session_state === null &&
      linked.scope === null &&
      linked.token_type === null &&
      linked.expires_at === null,
  );
}

/** Separate no-row query used before a candidate hook can be considered. */
export async function isGoogleProviderAccountUnclaimed(
  account: GoogleAccountIdentity | null | undefined,
): Promise<boolean> {
  if (!hasGoogleIdentity(account)) return false;
  const existing = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: account.providerAccountId,
      },
    },
    select: { id: true },
  });
  return existing === null;
}
