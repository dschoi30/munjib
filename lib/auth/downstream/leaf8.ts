import type { AuthDownstreamHooks } from "@/lib/auth/downstream/contract";

export const leaf8AuthHooks: Pick<AuthDownstreamHooks, "guardOAuthIdentity"> = Object.freeze({
  guardOAuthIdentity({ account, profile }) {
    if (
      account?.provider !== "google" ||
      typeof account.providerAccountId !== "string" ||
      account.providerAccountId.length === 0 ||
      profile?.email_verified !== true
    ) {
      return null;
    }
    return Object.freeze({
      provider: "google" as const,
      providerAccountId: account.providerAccountId,
      verifiedEmail: profile.email ?? null,
    });
  },
});
