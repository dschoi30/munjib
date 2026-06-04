import { DocumentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { buildChildPath } from "@/lib/folders/path";
import type {
  ArchiveFolderInput,
  CreateFolderInput,
  MoveFolderInput,
  RenameFolderInput,
} from "@/lib/folders/types";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { slugifyTitle } from "@/lib/text/slug";

async function getWorkspaceForWrite(workspaceSlug: string, actorId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug },
    include: {
      organization: true,
      members: { where: { userId: actorId }, take: 1 },
    },
  });

  if (!workspace) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  const role = workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  assertCanWriteWorkspace(role);
  return { workspace };
}

async function getFolderForWrite(folderId: string, actorId: string) {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      workspace: {
        include: {
          organization: true,
          members: { where: { userId: actorId }, take: 1 },
        },
      },
    },
  });

  if (!folder) throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_FOUND);
  const role = folder.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  assertCanWriteWorkspace(role);
  return { folder, workspace: folder.workspace };
}

async function nextAvailableFolderSlug(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  parentFolderId: string | null,
  name: string,
  excludeFolderId?: string,
) {
  const baseSlug = slugifyTitle(name);
  const siblings = await tx.folder.findMany({
    where: {
      workspaceId,
      parentFolderId,
      slug: { startsWith: baseSlug },
      ...(excludeFolderId ? { id: { not: excludeFolderId } } : {}),
    },
    select: { slug: true },
  });
  const existingSlugs = new Set(siblings.map((folder) => folder.slug));

  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

async function getParentFolderPath(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string | null,
) {
  if (!folderId) return "/";
  const folder = await tx.folder.findFirst({
    where: { id: folderId, workspaceId, status: DocumentStatus.ACTIVE },
    select: { path: true },
  });

  if (!folder) throw new Error(SERVICE_ERROR_CODES.PARENT_FOLDER_NOT_FOUND);
  return folder.path;
}

async function updateDescendantPaths(tx: Prisma.TransactionClient, folderId: string) {
  const folder = await tx.folder.findUniqueOrThrow({
    where: { id: folderId },
    include: {
      childFolders: true,
      documents: true,
    },
  });

  for (const document of folder.documents) {
    await tx.document.update({
      where: { id: document.id },
      data: { path: buildChildPath(folder.path, document.slug) },
    });
  }

  for (const child of folder.childFolders) {
    const childPath = buildChildPath(folder.path, child.slug);
    await tx.folder.update({
      where: { id: child.id },
      data: { path: childPath },
    });
    await updateDescendantPaths(tx, child.id);
  }
}

async function isDescendant(
  tx: Prisma.TransactionClient,
  folderId: string,
  possibleDescendantId: string,
) {
  let current = await tx.folder.findUnique({
    where: { id: possibleDescendantId },
    select: { parentFolderId: true },
  });

  while (current?.parentFolderId) {
    if (current.parentFolderId === folderId) return true;
    current = await tx.folder.findUnique({
      where: { id: current.parentFolderId },
      select: { parentFolderId: true },
    });
  }

  return false;
}

async function getActiveDescendantFolderIds(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string,
) {
  const descendantFolderIds: string[] = [];
  let parentFolderIds = [folderId];

  while (parentFolderIds.length > 0) {
    const childFolders = await tx.folder.findMany({
      where: {
        workspaceId,
        parentFolderId: { in: parentFolderIds },
        status: DocumentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const childFolderIds = childFolders.map((childFolder) => childFolder.id);

    descendantFolderIds.push(...childFolderIds);
    parentFolderIds = childFolderIds;
  }

  return descendantFolderIds;
}

export async function createFolder(input: CreateFolderInput) {
  const { workspace } = await getWorkspaceForWrite(input.workspaceSlug, input.actorId);

  return prisma.$transaction(async (tx) => {
    const slug = await nextAvailableFolderSlug(tx, workspace.id, input.parentFolderId, input.name);
    const parentPath = await getParentFolderPath(tx, workspace.id, input.parentFolderId);
    const folder = await tx.folder.create({
      data: {
        workspaceId: workspace.id,
        parentFolderId: input.parentFolderId,
        name: input.name,
        slug,
        path: buildChildPath(parentPath, slug),
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.created",
      resourceType: "folder",
      resourceId: folder.id,
      metadata: { name: folder.name, path: folder.path },
    });

    return folder;
  });
}

export async function renameFolder(input: RenameFolderInput) {
  const { folder, workspace } = await getFolderForWrite(input.folderId, input.actorId);

  return prisma.$transaction(async (tx) => {
    const slug = await nextAvailableFolderSlug(
      tx,
      folder.workspaceId,
      folder.parentFolderId,
      input.name,
      folder.id,
    );
    const parentPath = await getParentFolderPath(tx, folder.workspaceId, folder.parentFolderId);
    const previousPath = folder.path;
    const updated = await tx.folder.update({
      where: { id: folder.id },
      data: {
        name: input.name,
        slug,
        path: buildChildPath(parentPath, slug),
        updatedById: input.actorId,
      },
    });

    await updateDescendantPaths(tx, updated.id);
    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.renamed",
      resourceType: "folder",
      resourceId: updated.id,
      metadata: { previousPath, path: updated.path },
    });

    return updated;
  });
}

export async function moveFolder(input: MoveFolderInput) {
  const { folder, workspace } = await getFolderForWrite(input.folderId, input.actorId);

  return prisma.$transaction(async (tx) => {
    if (input.parentFolderId === folder.id) {
      throw new Error(SERVICE_ERROR_CODES.FOLDER_MOVE_CYCLE);
    }
    if (input.parentFolderId && (await isDescendant(tx, folder.id, input.parentFolderId))) {
      throw new Error(SERVICE_ERROR_CODES.FOLDER_MOVE_CYCLE);
    }

    const parentPath = await getParentFolderPath(tx, folder.workspaceId, input.parentFolderId);
    const slug = await nextAvailableFolderSlug(
      tx,
      folder.workspaceId,
      input.parentFolderId,
      folder.name,
      folder.id,
    );
    const previousPath = folder.path;
    const updated = await tx.folder.update({
      where: { id: folder.id },
      data: {
        parentFolderId: input.parentFolderId,
        slug,
        path: buildChildPath(parentPath, slug),
        updatedById: input.actorId,
      },
    });

    await updateDescendantPaths(tx, updated.id);
    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.moved",
      resourceType: "folder",
      resourceId: updated.id,
      metadata: { previousPath, path: updated.path },
    });

    return updated;
  });
}

export async function archiveFolder(input: ArchiveFolderInput) {
  const { folder, workspace } = await getFolderForWrite(input.folderId, input.actorId);

  if (!input.cascade) {
    const [childFolderCount, childDocumentCount] = await Promise.all([
      prisma.folder.count({
        where: { parentFolderId: folder.id, status: DocumentStatus.ACTIVE },
      }),
      prisma.document.count({
        where: { folderId: folder.id, status: DocumentStatus.ACTIVE },
      }),
    ]);

    if (childFolderCount > 0 || childDocumentCount > 0) {
      throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_EMPTY);
    }
  }

  return prisma.$transaction(async (tx) => {
    const descendantFolderIds = input.cascade
      ? await getActiveDescendantFolderIds(tx, folder.workspaceId, folder.id)
      : [];
    const archivedFolderIds = [folder.id, ...descendantFolderIds];
    const descendantDocuments = await tx.document.findMany({
      where: {
        workspaceId: folder.workspaceId,
        folderId: { in: archivedFolderIds },
        status: DocumentStatus.ACTIVE,
      },
      select: { id: true },
    });
    const descendantDocumentIds = descendantDocuments.map((document) => document.id);
    const archivedAt = new Date();

    if (descendantDocumentIds.length > 0) {
      await tx.document.updateMany({
        where: {
          id: { in: descendantDocumentIds },
          status: DocumentStatus.ACTIVE,
        },
        data: {
          status: DocumentStatus.ARCHIVED,
          archivedAt,
          updatedById: input.actorId,
        },
      });
    }

    if (descendantFolderIds.length > 0) {
      await tx.folder.updateMany({
        where: {
          id: { in: descendantFolderIds },
          status: DocumentStatus.ACTIVE,
        },
        data: {
          status: DocumentStatus.ARCHIVED,
          archivedAt,
          updatedById: input.actorId,
        },
      });
    }

    const archived = await tx.folder.update({
      where: { id: folder.id },
      data: {
        status: DocumentStatus.ARCHIVED,
        archivedAt,
        updatedById: input.actorId,
      },
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "folder.archived",
      resourceType: "folder",
      resourceId: archived.id,
      metadata: {
        path: archived.path,
        descendantFolderCount: descendantFolderIds.length,
        descendantDocumentCount: descendantDocumentIds.length,
      },
    });

    return archived;
  });
}
