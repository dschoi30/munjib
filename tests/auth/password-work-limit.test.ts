import { afterEach, describe, expect, it } from "vitest";
import {
  PasswordWorkLimitError,
  resetPasswordWorkPermitForTests,
  withPasswordWorkPermit,
} from "@/lib/auth/password-work-limit";

describe("password work permit", () => {
  afterEach(() => resetPasswordWorkPermitForTests());

  it("runs at most two password derivations concurrently", async () => {
    let active = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const work = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
      return true;
    };

    const calls = [1, 2, 3, 4].map(() => withPasswordWorkPermit(work));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(peak).toBe(2);
    release();
    await expect(Promise.all(calls)).resolves.toEqual([true, true, true, true]);
  });

  it("rejects beyond the bounded queue without logging account state", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const active = [1, 2].map(() => withPasswordWorkPermit(() => gate));
    const queued = Array.from({ length: 8 }, () =>
      withPasswordWorkPermit(() => Promise.resolve("queued")),
    );
    const rejected = withPasswordWorkPermit(() => Promise.resolve("overflow"));

    await expect(rejected).rejects.toMatchObject({ code: "PASSWORD_WORK_SATURATED" });
    await expect(rejected).rejects.toBeInstanceOf(PasswordWorkLimitError);
    release();
    await Promise.all(active);
    await expect(Promise.all(queued)).resolves.toHaveLength(8);
  });

  it("releases a permit after failure", async () => {
    await expect(
      withPasswordWorkPermit(async () => {
        throw new Error("derivation failed");
      }),
    ).rejects.toThrow("derivation failed");
    await expect(withPasswordWorkPermit(() => "ok")).resolves.toBe("ok");
  });
});
