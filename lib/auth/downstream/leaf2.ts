import type { AuthDownstreamHooks } from "@/lib/auth/downstream/contract";

export const leaf2AuthHooks: Pick<AuthDownstreamHooks, "assertDurableAuthState"> = Object.freeze({
  assertDurableAuthState() {
    // Reserved for a future durable authDisabledAt check. Leaf 1 owns the call order.
  },
});
