import { describe, expect, it, vi } from "vitest";
import { closedSignupAdapter } from "@/lib/auth/closed-signup-adapter";
import { minimalGooglePersistenceAdapter } from "@/lib/auth/minimal-google-account";
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

it("allows opt-in Google persistence but strips provider credentials and media", async () => {
  const users: unknown[] = [];
  const accounts: unknown[] = [];
  const delegate = {
    async createUser(data: object) { users.push(data); return { id: "new-user", ...data }; },
    async linkAccount(data: object) { accounts.push(data); return data; },
  };
  const adapter = minimalGooglePersistenceAdapter(closedSignupAdapter(delegate as never, leaf7AuthHooks, true));
  await adapter.createUser!({ email: "NEW@example.com", image: "https://provider.example/avatar", name: "Provider Name" } as never);
  await adapter.linkAccount!({ userId: "new-user", type: "oauth", provider: "google", providerAccountId: "new-sub", access_token: "must-not-persist" } as never);
  expect(users).toEqual([{ email: "new@example.com", name: "Munjib User", emailVerified: null, image: null }]);
  expect(accounts).toEqual([{ userId: "new-user", type: "oauth", provider: "google", providerAccountId: "new-sub" }]);
});
