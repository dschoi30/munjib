import { expect, it, vi } from "vitest";
import { createPasswordSignup } from "@/lib/auth/provisioning";
import { withPasswordWorkPermit } from "@/lib/auth/password-work-limit";
const hash = vi.hoisted(() => vi.fn().mockResolvedValue("unused-hash"));
vi.mock("@/lib/auth/passwords", () => ({ hashPassword: hash }));
vi.mock("@/lib/db/client", () => ({ prisma: { $transaction: vi.fn() } }));
it("rejects signup before hashing when the shared password work queue is saturated", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const work = Array.from({ length: 10 }, () => withPasswordWorkPermit(() => gate));
  try {
    await expect(createPasswordSignup({ email: "new@example.com", password: "test-password", language: "en" })).rejects.toMatchObject({ code: "PASSWORD_WORK_SATURATED" });
    expect(hash).not.toHaveBeenCalled();
  } finally {
    release();
    await Promise.all(work);
  }
});

it("counts Unicode code points instead of UTF-16 units for the minimum password length", async () => {
  hash.mockClear();
  expect(await createPasswordSignup({ email: "new@example.com", password: "😀😀😀😀", language: "en" })).toEqual({ ok: false, code: "WEAK_PASSWORD" });
  expect(hash).not.toHaveBeenCalled();
});
