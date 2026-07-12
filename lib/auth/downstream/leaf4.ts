import type { AuthDownstreamHooks } from "@/lib/auth/downstream/contract";

export const leaf4AuthHooks: Pick<AuthDownstreamHooks, "reduceSessionImage"> = Object.freeze({
  reduceSessionImage() {
    return null;
  },
});
