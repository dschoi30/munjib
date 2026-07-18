import { describe, expect, it, vi } from "vitest";
import { closedSignupAdapter } from "@/lib/auth/closed-signup-adapter";
import { leaf7AuthHooks } from "@/lib/auth/downstream/leaf7";

describe("closed signup adapter", () => {
  it("rejects createUser and a new Google link before delegate persistence", async () => {
    const delegate = { createUser: vi.fn(), linkAccount: vi.fn() };
    const adapter = closedSignupAdapter(delegate as never, leaf7AuthHooks);
    await expect(adapter.createUser?.({ email: "new@example.test" } as never)).rejects.toThrow(
      "AUTH_SIGNUP_CLOSED",
    );
    await expect(
      adapter.linkAccount?.({
        userId: "user-1",
        type: "oauth",
        provider: "google",
        providerAccountId: "unlinked-subject",
      } as never),
    ).rejects.toThrow("AUTH_SIGNUP_CLOSED");
    expect(delegate.createUser).not.toHaveBeenCalled();
    expect(delegate.linkAccount).not.toHaveBeenCalled();
  });
});
