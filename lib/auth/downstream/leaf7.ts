import type { AuthDownstreamHooks } from "@/lib/auth/downstream/contract";

/** Reserved candidate signup/link slot. It is closed until the reviewed invite grant exists. */
export const leaf7AuthHooks: Pick<
  AuthDownstreamHooks,
  "authorizeCandidateGoogle" | "createCandidateUser" | "linkCandidateAccount"
> = Object.freeze({
  authorizeCandidateGoogle() {
    return false;
  },
  async createCandidateUser() {
    return null;
  },
  async linkCandidateAccount() {
    return null;
  },
});
