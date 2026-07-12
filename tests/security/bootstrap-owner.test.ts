import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/passwords";
import { runBootstrapOwner } from "@/scripts/security/bootstrap-owner";
import type { BootstrapOwnerPrisma } from "@/scripts/security/bootstrap-owner";

function createTransactionMock() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "owner-user", email: "owner@example.com", name: "Owner" }),
    },
    organization: {
      upsert: vi.fn().mockResolvedValue({ id: "owner-org", slug: "munjib" }),
    },
    organizationMember: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    workspace: {
      upsert: vi.fn().mockResolvedValue({ id: "owner-workspace", slug: "handbook" }),
    },
    workspaceMember: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("owner bootstrap", () => {
  it("creates exactly one owner graph in one transaction and consumes immutable input", async () => {
    const passwordHash = await hashPassword("operator-password");
    const input = Buffer.from(
      JSON.stringify({
        email: "owner@example.com",
        displayName: "Owner",
        organizationName: "Munjib",
        organizationSlug: "munjib",
        workspaceName: "Handbook",
        workspaceSlug: "handbook",
        passwordHash,
      }),
    );
    const originalInput = Buffer.from(input);
    const tx = createTransactionMock();
    const transaction = vi.fn(
      async (callback: (value: ReturnType<typeof createTransactionMock>) => unknown) =>
        callback(tx),
    );
    const unlink = vi.fn();
    const write = vi.fn();

    await runBootstrapOwner({
      env: {
        MUNJIB_OWNER_BOOTSTRAP_ENABLED: "true",
        MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE: "/run/secrets/munjib_owner_bootstrap",
      },
      uid: 0,
      inputBuffer: input,
      prisma: {
        $transaction: transaction as unknown as BootstrapOwnerPrisma["$transaction"],
      },
      unlink,
      write,
    });

    expect(input).toEqual(originalInput);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.upsert).toHaveBeenCalledTimes(1);
    expect(tx.organization.upsert).toHaveBeenCalledTimes(1);
    expect(tx.organizationMember.upsert).toHaveBeenCalledTimes(1);
    expect(tx.workspace.upsert).toHaveBeenCalledTimes(1);
    expect(tx.workspaceMember.upsert).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledWith("/run/secrets/munjib_owner_bootstrap");
    expect(write).toHaveBeenCalledWith("OWNER_BOOTSTRAP_OK");
  });

  it("rejects a legacy or malformed password envelope before a transaction", async () => {
    const tx = createTransactionMock();
    const transaction = vi.fn(
      async (callback: (value: ReturnType<typeof createTransactionMock>) => unknown) =>
        callback(tx),
    );
    await expect(
      runBootstrapOwner({
        env: {
          MUNJIB_OWNER_BOOTSTRAP_ENABLED: "true",
          MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE: "/run/secrets/munjib_owner_bootstrap",
        },
        uid: 0,
        inputBuffer: Buffer.from(
          JSON.stringify({
            email: "owner@example.com",
            displayName: "Owner",
            organizationName: "Munjib",
            organizationSlug: "munjib",
            workspaceName: "Handbook",
            workspaceSlug: "handbook",
            passwordHash: "scrypt:legacy:legacy",
          }),
        ),
        prisma: {
          $transaction: transaction as unknown as BootstrapOwnerPrisma["$transaction"],
        },
      }),
    ).rejects.toThrow("OWNER_BOOTSTRAP_PASSWORD_HASH_INVALID");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("normalizes the bootstrap owner email before the transaction upsert", async () => {
    const passwordHash = await hashPassword("operator-password");
    const tx = createTransactionMock();
    const transaction = vi.fn(
      async (callback: (value: ReturnType<typeof createTransactionMock>) => unknown) => callback(tx),
    );

    await runBootstrapOwner({
      env: {
        MUNJIB_OWNER_BOOTSTRAP_ENABLED: "true",
        MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE: "/run/secrets/munjib_owner_bootstrap",
      },
      uid: 0,
      inputBuffer: Buffer.from(JSON.stringify({
        email: " Owner@Example.COM ",
        displayName: "Owner",
        organizationName: "Munjib",
        organizationSlug: "munjib",
        workspaceName: "Handbook",
        workspaceSlug: "handbook",
        passwordHash,
      })),
      prisma: {
        $transaction: transaction as unknown as BootstrapOwnerPrisma["$transaction"],
      },
      unlink: vi.fn(),
    });

    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
      select: { id: true, passwordHash: true },
    });
    expect(tx.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: "owner@example.com" },
      create: expect.objectContaining({ email: "owner@example.com" }),
    }));
  });

  it("requires the root uid and explicit one-shot flag before reading or writing", async () => {
    const readInputFile = vi.fn();
    const transaction = vi.fn();
    const base = {
      env: {
        MUNJIB_OWNER_BOOTSTRAP_ENABLED: "true",
        MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE: "/run/secrets/munjib_owner_bootstrap",
      },
      inputBuffer: Buffer.from("{}"),
      readInputFile,
      prisma: { $transaction: transaction } as unknown as BootstrapOwnerPrisma,
    };

    await expect(runBootstrapOwner({ ...base, uid: 1000 })).rejects.toThrow(
      "OWNER_BOOTSTRAP_ROOT_REQUIRED",
    );
    expect(readInputFile).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();

    await expect(
      runBootstrapOwner({
        ...base,
        uid: 0,
        env: {
          MUNJIB_OWNER_BOOTSTRAP_ENABLED: "false",
          MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE: "/run/secrets/munjib_owner_bootstrap",
        },
      }),
    ).rejects.toThrow("OWNER_BOOTSTRAP_DISABLED");

    await expect(
      runBootstrapOwner({
        ...base,
        uid: 0,
        env: {
          MUNJIB_OWNER_BOOTSTRAP_ENABLED: "true",
          MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE: "/tmp/owner-bootstrap",
        },
      }),
    ).rejects.toThrow("OWNER_BOOTSTRAP_INPUT_FILE_INVALID");
  });

  it("does not unlink the operator input when the transaction fails", async () => {
    const passwordHash = await hashPassword("operator-password");
    const tx = createTransactionMock();
    const transaction = vi.fn().mockRejectedValue(new Error("transaction failed"));
    const unlink = vi.fn();
    await expect(
      runBootstrapOwner({
        env: {
          MUNJIB_OWNER_BOOTSTRAP_ENABLED: "true",
          MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE: "/run/secrets/munjib_owner_bootstrap",
        },
        uid: 0,
        inputBuffer: Buffer.from(
          JSON.stringify({
            email: "owner@example.com",
            displayName: "Owner",
            organizationName: "Munjib",
            organizationSlug: "munjib",
            workspaceName: "Handbook",
            workspaceSlug: "handbook",
            passwordHash,
          }),
        ),
        prisma: {
          $transaction: transaction as unknown as BootstrapOwnerPrisma["$transaction"],
        },
        unlink,
      }),
    ).rejects.toThrow("transaction failed");
    expect(unlink).not.toHaveBeenCalled();
    expect(tx.user.upsert).not.toHaveBeenCalled();
  });
});
