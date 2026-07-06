import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/passwords";
import { parseLanguage, type Language } from "@/lib/i18n/language";
import { ensureWorkspaceLaunchMemberships } from "@/lib/workspaces/membership-bootstrap";

const minPasswordLength = 8;
const defaultWorkspaceNames = {
  en: "My Workspace",
  ko: "내 워크스페이스",
} as const satisfies Record<Language, string>;

type WorkspaceRef = {
  workspaceId: string;
  workspaceSlug: string;
};

type ProvisioningTx = {
  user: {
    findMany: Parameters<typeof ensureWorkspaceLaunchMemberships>[0]["user"]["findMany"];
    findUnique?: (args: unknown) => Promise<unknown>;
    create?: (args: unknown) => Promise<unknown>;
  };
  organization: {
    upsert(args: {
      where: { slug: string };
      update: Record<string, never>;
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
      update: Record<string, never>;
      create: { organizationId: string; name: string; slug: string };
      select: { id: true; slug: true };
    }): Promise<{ id: string; slug: string }>;
  };
  workspaceMember: Parameters<typeof ensureWorkspaceLaunchMemberships>[0]["workspaceMember"] & {
    findFirst(args: unknown): Promise<{ workspace: { id?: string; slug: string } } | null>;
  };
};

type RedirectTx = {
  workspaceMember: {
    findFirst(args: unknown): Promise<{ workspace: { slug: string } } | null>;
  };
};

export type SignupResult =
  | { ok: true; email: string; redirectPath: string }
  | { ok: false; code: "EMAIL_IN_USE" | "INVALID_EMAIL" | "WEAK_PASSWORD" };

export function defaultWorkspaceNameForLanguage(language: Language) {
  return defaultWorkspaceNames[language];
}

export async function createPasswordSignup(input: {
  email: unknown;
  password: unknown;
  language: unknown;
}): Promise<SignupResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, code: "INVALID_EMAIL" };
  if (typeof input.password !== "string" || input.password.length < minPasswordLength) {
    return { ok: false, code: "WEAK_PASSWORD" };
  }
  const language = parseLanguage(input.language) ?? "en";
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) return { ok: false, code: "EMAIL_IN_USE" } as const;

    const name = deriveNameFromEmail(email);
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerified: new Date(),
      },
      select: { id: true, email: true, name: true },
    });
    const workspace = await ensureDefaultWorkspaceForUser(tx as unknown as ProvisioningTx, {
      userId: user.id,
      email: user.email,
      name: user.name,
      language,
    });

    return {
      ok: true,
      email,
      redirectPath: `/workspaces/${workspace.workspaceSlug}`,
    } as const;
  });
}

export async function ensureDefaultWorkspaceForUser(
  tx: ProvisioningTx,
  input: { userId: string; email: string; name: string | null; language: Language },
): Promise<WorkspaceRef> {
  const existingMembership = await tx.workspaceMember.findFirst({
    where: {
      userId: input.userId,
      workspace: { archivedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: { workspace: { select: { id: true, slug: true } } },
  });
  if (existingMembership?.workspace) {
    return {
      workspaceId: existingMembership.workspace.id ?? "",
      workspaceSlug: existingMembership.workspace.slug,
    };
  }

  const suffix = slugSuffixForUser(input.userId);
  const organizationSlug = `personal-${suffix}`;
  const workspaceSlug = `my-workspace-${suffix}`;
  const organization = await tx.organization.upsert({
    where: { slug: organizationSlug },
    update: {},
    create: {
      name: input.name?.trim() || deriveNameFromEmail(input.email),
      slug: organizationSlug,
    },
    select: { id: true, slug: true },
  });
  await tx.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: input.userId,
      },
    },
    update: { role: "OWNER" },
    create: { organizationId: organization.id, userId: input.userId, role: "OWNER" },
  });
  const workspace = await tx.workspace.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: workspaceSlug,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: defaultWorkspaceNameForLanguage(input.language),
      slug: workspaceSlug,
    },
    select: { id: true, slug: true },
  });

  await ensureWorkspaceLaunchMemberships(
    tx as unknown as Parameters<typeof ensureWorkspaceLaunchMemberships>[0],
    workspace.id,
    {
      userId: input.userId,
      role: "OWNER",
    },
  );

  return { workspaceId: workspace.id, workspaceSlug: workspace.slug };
}

export function sanitizePostAuthCallbackPath(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = new URL(value, "https://munjib.local");
    if (parsed.origin !== "https://munjib.local") return null;
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!path.startsWith("/workspaces/")) return null;
    return path;
  } catch {
    return null;
  }
}

export async function resolveAccessibleWorkspaceRedirect(
  tx: RedirectTx,
  input: { userId: string; callbackPath?: string | null },
) {
  const callbackPath = sanitizePostAuthCallbackPath(input.callbackPath);
  const callbackWorkspaceSlug = callbackPath?.match(/^\/workspaces\/([^/?#]+)/)?.[1];
  if (callbackWorkspaceSlug) {
    const membership = await tx.workspaceMember.findFirst({
      where: {
        userId: input.userId,
        workspace: {
          slug: decodeURIComponent(callbackWorkspaceSlug),
          archivedAt: null,
        },
      },
      select: { workspace: { select: { slug: true } } },
    });
    if (membership) return callbackPath;
  }

  const firstMembership = await tx.workspaceMember.findFirst({
    where: {
      userId: input.userId,
      workspace: { archivedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: { workspace: { select: { slug: true } } },
  });
  return firstMembership ? `/workspaces/${firstMembership.workspace.slug}` : "/login";
}

export async function ensureCurrentUserWorkspaceAndRedirect(input: {
  userId: string;
  language: Language;
  callbackPath?: string | null;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return "/login";
  await prisma.$transaction(async (tx) => {
    await ensureDefaultWorkspaceForUser(tx as unknown as ProvisioningTx, {
      userId: user.id,
      email: user.email,
      name: user.name,
      language: input.language,
    });
  });
  return resolveAccessibleWorkspaceRedirect(prisma as unknown as RedirectTx, {
    userId: user.id,
    callbackPath: input.callbackPath,
  });
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function deriveNameFromEmail(email: string) {
  const localPart = email.split("@")[0]?.trim();
  return localPart ? localPart.replace(/[._-]+/g, " ") : "Munjib User";
}

function slugSuffixForUser(userId: string) {
  const suffix = userId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-24);
  return suffix || "user";
}
