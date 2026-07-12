import {
  constants,
  closeSync,
  fstatSync,
  openSync,
  readSync,
  unlinkSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import { parsePasswordHash } from "../../lib/auth/passwords";
import { prisma } from "../../lib/db/client";

const MAX_INPUT_BYTES = 4096;

export type BootstrapOwnerPayload = {
  email: string;
  displayName: string;
  organizationName: string;
  organizationSlug: string;
  workspaceName: string;
  workspaceSlug: string;
  passwordHash: string;
};

type BootstrapTransaction = {
  user: {
    findUnique?(args: {
      where: { email: string };
      select: { id: true; passwordHash: true };
    }): Promise<{ id: string; passwordHash: string | null } | null>;
    upsert(args: {
      where: { email: string };
      update: { name: string; passwordHash: string; emailVerified: Date };
      create: { email: string; name: string; passwordHash: string; emailVerified: Date };
      select: { id: true; email: true; name: true };
    }): Promise<{ id: string; email: string; name: string }>;
  };
  organization: {
    upsert(args: {
      where: { slug: string };
      update: { name: string };
      create: { name: string; slug: string };
      select: { id: true; slug: true };
    }): Promise<{ id: string; slug: string }>;
  };
  organizationMember: {
    upsert(args: {
      where: { organizationId_userId: { organizationId: string; userId: string } };
      update: { role: "OWNER" };
      create: { organizationId: string; userId: string; role: "OWNER" };
    }): Promise<unknown>;
  };
  workspace: {
    upsert(args: {
      where: { organizationId_slug: { organizationId: string; slug: string } };
      update: { name: string; archivedAt: null };
      create: { organizationId: string; name: string; slug: string };
      select: { id: true; slug: true };
    }): Promise<{ id: string; slug: string }>;
  };
  workspaceMember: {
    upsert(args: {
      where: { workspaceId_userId: { workspaceId: string; userId: string } };
      update: { role: "OWNER" };
      create: { workspaceId: string; userId: string; role: "OWNER" };
    }): Promise<unknown>;
  };
};

export type BootstrapOwnerPrisma = {
  $transaction<T>(callback: (tx: BootstrapTransaction) => Promise<T>): Promise<T>;
};

export type BootstrapOwnerDeps = {
  env: Record<string, string | undefined>;
  uid?: number;
  prisma: BootstrapOwnerPrisma;
  /** Test seam. Production callers should let the command read the file. */
  inputBuffer?: Buffer;
  /** Test seam for same-FD file-read behavior. */
  readInputFile?: (path: string) => Buffer | Uint8Array | string;
  /** Test seam; unlink happens only after the transaction commits. */
  unlink?: (path: string) => void | Promise<void>;
  write?: (line: string) => void;
};

function fail(code: string): never {
  throw new Error(code);
}

function currentUid() {
  return typeof process.geteuid === "function"
    ? process.geteuid()
    : typeof process.getuid === "function"
      ? process.getuid()
      : -1;
}

function assertInputPath(path: string): asserts path is string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/run/secrets/") ||
    path.slice("/run/secrets/".length).length === 0 ||
    path.slice("/run/secrets/".length).includes("/") ||
    path.slice("/run/secrets/".length) === "." ||
    path.slice("/run/secrets/".length) === ".." ||
    path.includes("\u0000")
  ) {
    fail("OWNER_BOOTSTRAP_INPUT_FILE_INVALID");
  }
}

function normalizeOwnerEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    !email ||
    email.length > 320 ||
    /[\u0000-\u001f\u007f]/.test(email) ||
    !email.includes("@")
  ) {
    fail("OWNER_BOOTSTRAP_EMAIL_INVALID");
  }
  return email;
}

function readBoundedInputFile(path: string, expectedUid: number): Buffer {
  assertInputPath(path);

  const fsConstants = constants as typeof constants & { O_CLOEXEC?: number };
  const closeOnExec =
    fsConstants.O_CLOEXEC ?? (process.platform === "darwin" ? 0x01000000 : 0);
  let descriptor: number;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | closeOnExec,
    );
  } catch {
    fail("OWNER_BOOTSTRAP_INPUT_UNAVAILABLE");
  }

  try {
    let stats: ReturnType<typeof fstatSync>;
    try {
      stats = fstatSync(descriptor!);
    } catch {
      fail("OWNER_BOOTSTRAP_INPUT_UNAVAILABLE");
    }
    if (!stats.isFile()) fail("OWNER_BOOTSTRAP_INPUT_NON_REGULAR");
    if (stats.uid !== expectedUid) fail("OWNER_BOOTSTRAP_INPUT_OWNER_INVALID");
    if (stats.nlink !== 1) fail("OWNER_BOOTSTRAP_INPUT_LINK_COUNT_INVALID");
    const permissions = stats.mode & 0o7777;
    if ((permissions & ~0o600) !== 0 || (permissions & 0o400) === 0) {
      fail("OWNER_BOOTSTRAP_INPUT_MODE_INVALID");
    }
    if (!Number.isSafeInteger(stats.size) || stats.size <= 0 || stats.size > MAX_INPUT_BYTES) {
      fail("OWNER_BOOTSTRAP_INPUT_SIZE_INVALID");
    }

    const input = Buffer.alloc(stats.size);
    let offset = 0;
    while (offset < stats.size) {
      let count: number;
      try {
        count = readSync(descriptor!, input, offset, stats.size - offset, null);
      } catch {
        fail("OWNER_BOOTSTRAP_INPUT_SHORT_READ");
      }
      if (count <= 0) fail("OWNER_BOOTSTRAP_INPUT_SHORT_READ");
      offset += count;
    }
    const extra = Buffer.alloc(1);
    let extraCount: number;
    try {
      extraCount = readSync(descriptor!, extra, 0, 1, null);
    } catch {
      fail("OWNER_BOOTSTRAP_INPUT_GROWTH_DETECTED");
    }
    if (extraCount > 0) {
      fail("OWNER_BOOTSTRAP_INPUT_GROWTH_DETECTED");
    }
    return Buffer.from(input);
  } finally {
    closeSync(descriptor!);
  }
}

function decodePayload(input: Buffer): BootstrapOwnerPayload {
  if (!Buffer.isBuffer(input) || input.length === 0 || input.length > MAX_INPUT_BYTES) {
    fail("OWNER_BOOTSTRAP_INPUT_INVALID");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.toString("utf8"));
  } catch {
    fail("OWNER_BOOTSTRAP_INPUT_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("OWNER_BOOTSTRAP_INPUT_INVALID");
  }

  const value = parsed as Record<string, unknown>;
  const fields = [
    "email",
    "displayName",
    "organizationName",
    "organizationSlug",
    "workspaceName",
    "workspaceSlug",
    "passwordHash",
  ] as const;
  for (const field of fields) {
    if (typeof value[field] !== "string" || value[field].trim() === "") {
      fail("OWNER_BOOTSTRAP_INPUT_INVALID");
    }
  }

  const passwordHash = value.passwordHash as string;
  if (parsePasswordHash(passwordHash)?.format !== "v1") {
    fail("OWNER_BOOTSTRAP_PASSWORD_HASH_INVALID");
  }

  return {
    email: normalizeOwnerEmail(value.email as string),
    displayName: value.displayName as string,
    organizationName: value.organizationName as string,
    organizationSlug: value.organizationSlug as string,
    workspaceName: value.workspaceName as string,
    workspaceSlug: value.workspaceSlug as string,
    passwordHash,
  };
}

async function persistOwner(
  tx: BootstrapTransaction,
  payload: BootstrapOwnerPayload,
): Promise<void> {
  if (tx.user.findUnique) {
    const existing = await tx.user.findUnique({
      where: { email: payload.email },
      select: { id: true, passwordHash: true },
    });
    if (existing?.passwordHash && parsePasswordHash(existing.passwordHash)?.format !== "v1") {
      fail("OWNER_BOOTSTRAP_EXISTING_HASH_INVALID");
    }
  }
  const now = new Date();
  const owner = await tx.user.upsert({
    where: { email: payload.email },
    update: {
      name: payload.displayName,
      passwordHash: payload.passwordHash,
      emailVerified: now,
    },
    create: {
      email: payload.email,
      name: payload.displayName,
      passwordHash: payload.passwordHash,
      emailVerified: now,
    },
    select: { id: true, email: true, name: true },
  });
  const organization = await tx.organization.upsert({
    where: { slug: payload.organizationSlug },
    update: { name: payload.organizationName },
    create: { name: payload.organizationName, slug: payload.organizationSlug },
    select: { id: true, slug: true },
  });
  await tx.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: owner.id,
      },
    },
    update: { role: "OWNER" },
    create: { organizationId: organization.id, userId: owner.id, role: "OWNER" },
  });
  const workspace = await tx.workspace.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: payload.workspaceSlug,
      },
    },
    update: { name: payload.workspaceName, archivedAt: null },
    create: {
      organizationId: organization.id,
      name: payload.workspaceName,
      slug: payload.workspaceSlug,
    },
    select: { id: true, slug: true },
  });
  await tx.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: owner.id,
      },
    },
    update: { role: "OWNER" },
    create: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" },
  });
}

export async function runBootstrapOwner(input: BootstrapOwnerDeps): Promise<void> {
  if (input.env.MUNJIB_OWNER_BOOTSTRAP_ENABLED !== "true") {
    fail("OWNER_BOOTSTRAP_DISABLED");
  }
  if ((input.uid ?? currentUid()) !== 0) {
    fail("OWNER_BOOTSTRAP_ROOT_REQUIRED");
  }
  const inputPath = input.env.MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE;
  if (!inputPath) fail("OWNER_BOOTSTRAP_INPUT_FILE_REQUIRED");
  assertInputPath(inputPath);

  const immutableInput = Buffer.from(
    input.inputBuffer ??
      (input.readInputFile
        ? input.readInputFile(inputPath)
        : readBoundedInputFile(inputPath, 0)),
  );
  const payload = decodePayload(immutableInput);

  await input.prisma.$transaction(async (tx) => persistOwner(tx, payload));
  if (input.unlink) await input.unlink(inputPath);
  else unlinkSync(inputPath);
  (input.write ?? console.log)("OWNER_BOOTSTRAP_OK");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void (async () => {
    try {
      await runBootstrapOwner({ env: process.env, prisma });
    } catch (error) {
      console.error(error instanceof Error ? error.message : "OWNER_BOOTSTRAP_FAILED");
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
