import { randomUUID } from "node:crypto";
import type { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import type { Language } from "@/lib/i18n/language";
import {
  assertCanManageWorkspace,
  canWriteWorkspace,
} from "@/lib/permissions/workspace";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { ensureWorkspaceLaunchMemberships } from "@/lib/workspaces/membership-bootstrap";

export type ReadableWorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

export async function listReadableWorkspacesForUser(
  actorId: string,
): Promise<ReadableWorkspaceSummary[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId: actorId,
      workspace: { archivedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    role: membership.role,
  }));
}

export async function createWorkspace(input: {
  actorId: string;
  currentWorkspaceSlug: string;
  name: string;
  language: Language;
}) {
  const name = normalizeWorkspaceName(input.name);
  if (!name) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NAME_REQUIRED);
  }

  const currentWorkspace = await findActiveWorkspaceForActor({
    actorId: input.actorId,
    workspaceSlug: input.currentWorkspaceSlug,
  });
  const role = currentWorkspace.members[0]?.role;
  if (!canWriteWorkspace(role)) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_CREATE_FORBIDDEN);
  }

  const slug = uniqueWorkspaceSlug(name);
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name,
        slug: `workspace-${slug}`,
      },
      select: { id: true },
    });
    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: input.actorId,
        role: "OWNER",
      },
    });
    const workspace = await tx.workspace.create({
      data: {
        organizationId: organization.id,
        name,
        slug,
      },
      select: { id: true, name: true, slug: true },
    });
    await ensureWorkspaceLaunchMemberships(
      tx as unknown as Parameters<typeof ensureWorkspaceLaunchMemberships>[0],
      workspace.id,
      {
        userId: input.actorId,
        role: "OWNER",
      },
    );

    return workspace;
  });
}

export async function renameWorkspace(input: {
  workspaceSlug: string;
  actorId: string;
  name: string;
}) {
  const name = normalizeWorkspaceName(input.name);
  if (!name) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NAME_REQUIRED);
  }

  const workspace = await findActiveWorkspaceForActor(input);
  try {
    assertCanManageWorkspace(workspace.members[0]?.role);
  } catch (error) {
    if (error instanceof Error && error.message === "WORKSPACE_MANAGE_FORBIDDEN") {
      throw new Error(SERVICE_ERROR_CODES.WORKSPACE_MANAGE_FORBIDDEN);
    }
    throw error;
  }

  return prisma.workspace.update({
    where: { id: workspace.id },
    data: { name },
    select: { id: true, name: true, slug: true },
  });
}

export async function archiveWorkspace(input: {
  workspaceSlug: string;
  actorId: string;
}) {
  const workspace = await findActiveWorkspaceForActor(input);
  try {
    assertCanManageWorkspace(workspace.members[0]?.role);
  } catch (error) {
    if (error instanceof Error && error.message === "WORKSPACE_MANAGE_FORBIDDEN") {
      throw new Error(SERVICE_ERROR_CODES.WORKSPACE_MANAGE_FORBIDDEN);
    }
    throw error;
  }

  const fallback = await prisma.workspaceMember.findFirst({
    where: {
      userId: input.actorId,
      workspaceId: { not: workspace.id },
      workspace: { archivedAt: null },
    },
    orderBy: { createdAt: "asc" },
    select: { workspace: { select: { slug: true } } },
  });
  if (!fallback) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_ARCHIVE_LAST_ACTIVE);
  }

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { archivedAt: new Date() },
  });

  return {
    archivedWorkspaceSlug: workspace.slug,
    fallbackWorkspaceSlug: fallback.workspace.slug,
  };
}

async function findActiveWorkspaceForActor(input: {
  actorId: string;
  workspaceSlug: string;
}) {
  const workspaces = await prisma.workspace.findMany({
    where: {
      slug: input.workspaceSlug,
      archivedAt: null,
      members: {
        some: {
          userId: input.actorId,
        },
      },
    },
    include: {
      members: {
        where: { userId: input.actorId },
        take: 1,
      },
    },
    take: 2,
  });

  if (workspaces.length === 0) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }
  if (workspaces.length > 1) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_SLUG_AMBIGUOUS);
  }

  return workspaces[0];
}

function normalizeWorkspaceName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function uniqueWorkspaceSlug(name: string) {
  const baseSlug = slugifyWorkspaceName(name);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${baseSlug}-${suffix}`;
}

function slugifyWorkspaceName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "workspace";
}
