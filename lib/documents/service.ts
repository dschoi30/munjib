import { DocumentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/log";
import { reconcileDocumentMetadata } from "@/lib/document-metadata/reconcile";
import { prisma } from "@/lib/db/client";
import { buildChildPath } from "@/lib/folders/path";
import {
  assertCanReadDocument,
  assertCanWriteDocument,
  highestPermissionLevel,
} from "@/lib/permissions/document";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";
import { markdownToPlainText } from "@/lib/text/plain-text";
import { slugifyTitle } from "@/lib/text/slug";
import type {
  ArchiveDocumentInput,
  CreateDocumentFromBrokenLinkInput,
  CreateDocumentInput,
  MoveDocumentInput,
  RestoreDocumentVersionInput,
  UpdateDocumentInput,
} from "@/lib/documents/types";
import { reconcileDocumentLinks, repairBrokenLinksForTarget } from "@/lib/wiki-links/reconcile";

async function getWorkspaceMembership(workspaceSlug: string, actorId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug },
    include: {
      organization: true,
      members: {
        where: { userId: actorId },
        take: 1,
      },
    },
  });

  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
  const role = workspace.members[0]?.role;
  assertCanReadWorkspace(role);

  return { workspace, role };
}

async function getDocumentMembership(documentId: string, actorId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      workspace: {
        include: {
          organization: true,
          members: {
            where: { userId: actorId },
            take: 1,
          },
        },
      },
    },
  });

  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  const role = document.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  const access = await getUserDocumentAccess(document.id, actorId);
  assertCanReadDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  return { document, workspace: document.workspace, role, access };
}

async function getUserDocumentAccess(documentId: string, actorId: string) {
  const [explicitPermissionCount, userPermissions] = await Promise.all([
    prisma.permission.count({
      where: { resourceType: "DOCUMENT", resourceId: documentId },
    }),
    prisma.permission.findMany({
      where: {
        resourceType: "DOCUMENT",
        resourceId: documentId,
        subjectType: "USER",
        subjectId: actorId,
      },
      select: { permission: true },
    }),
  ]);

  return {
    explicitPermissionCount,
    userPermission: highestPermissionLevel(
      userPermissions.map((permission) => permission.permission),
    ),
  };
}

async function nextVersionNumber(tx: Prisma.TransactionClient, documentId: string) {
  const latest = await tx.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: "desc" },
  });

  return latest ? latest.versionNumber + 1 : 1;
}

async function nextAvailableDocumentSlug(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string | null,
  title: string,
  excludeDocumentId?: string,
) {
  const baseSlug = slugifyTitle(title);
  const existingDocuments = await tx.document.findMany({
    where: {
      workspaceId,
      folderId,
      slug: { startsWith: baseSlug },
      ...(excludeDocumentId ? { id: { not: excludeDocumentId } } : {}),
    },
    select: { slug: true },
  });
  const existingSlugs = new Set(existingDocuments.map((document) => document.slug));

  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

function isDocumentSlugUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target)
  );
}

async function getParentFolderPath(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  folderId: string | null | undefined,
) {
  if (!folderId) return "/";
  const folder = await tx.folder.findFirst({
    where: { id: folderId, workspaceId, status: "ACTIVE" },
    select: { path: true },
  });

  if (!folder) throw new Error("FOLDER_NOT_FOUND");
  return folder.path;
}

async function runWithDocumentSlugRetry<T>(operation: () => Promise<T>) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isDocumentSlugUniqueConstraintError(error) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error("DOCUMENT_SLUG_RETRY_EXHAUSTED");
}

async function createDocumentWithInitialVersion(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    actorId: string;
    folderId?: string | null;
    title: string;
    contentMarkdown: string;
    changeSummary: string;
  },
) {
  const folderId = input.folderId ?? null;
  const slug = await nextAvailableDocumentSlug(tx, input.workspaceId, folderId, input.title);
  const parentPath = await getParentFolderPath(tx, input.workspaceId, folderId);
  const contentText = markdownToPlainText(input.contentMarkdown);

  const document = await tx.document.create({
    data: {
      workspaceId: input.workspaceId,
      folderId,
      title: input.title,
      slug,
      path: buildChildPath(parentPath, slug),
      contentMarkdown: input.contentMarkdown,
      contentText,
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });

  await tx.documentVersion.create({
    data: {
      documentId: document.id,
      versionNumber: 1,
      title: document.title,
      contentMarkdown: document.contentMarkdown,
      createdById: input.actorId,
      changeSummary: input.changeSummary,
    },
  });

  return document;
}

export async function createDocument(input: CreateDocumentInput) {
  const { workspace, role } = await getWorkspaceMembership(input.workspaceSlug, input.actorId);
  assertCanWriteWorkspace(role);

  return runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
    const document = await createDocumentWithInitialVersion(tx, {
      workspaceId: workspace.id,
      actorId: input.actorId,
      folderId: input.folderId ?? null,
      title: input.title,
      contentMarkdown: input.contentMarkdown,
      changeSummary: "Initial version",
    });

    await reconcileDocumentLinks(tx, {
      workspaceId: workspace.id,
      sourceDocumentId: document.id,
      contentMarkdown: document.contentMarkdown,
    });
    await reconcileDocumentMetadata(tx, {
      workspaceId: workspace.id,
      documentId: document.id,
      contentMarkdown: document.contentMarkdown,
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.created",
      resourceType: "document",
      resourceId: document.id,
      metadata: { title: document.title, slug: document.slug },
    });

    return document;
  }));
}

export async function updateDocument(input: UpdateDocumentInput) {
  const { document, workspace, role, access } = await getDocumentMembership(
    input.documentId,
    input.actorId,
  );
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  const contentText = markdownToPlainText(input.contentMarkdown);

  return runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
    const slug = await nextAvailableDocumentSlug(
      tx,
      workspace.id,
      document.folderId,
      input.title,
      document.id,
    );
    const parentPath = await getParentFolderPath(tx, workspace.id, document.folderId);
    const updated = await tx.document.update({
      where: { id: document.id },
      data: {
        title: input.title,
        slug,
        path: buildChildPath(parentPath, slug),
        contentMarkdown: input.contentMarkdown,
        contentText,
        updatedById: input.actorId,
      },
    });

    await tx.documentVersion.create({
      data: {
        documentId: updated.id,
        versionNumber: await nextVersionNumber(tx, updated.id),
        title: updated.title,
        contentMarkdown: updated.contentMarkdown,
        createdById: input.actorId,
        changeSummary: "Updated document",
      },
    });

    await reconcileDocumentLinks(tx, {
      workspaceId: workspace.id,
      sourceDocumentId: updated.id,
      contentMarkdown: updated.contentMarkdown,
    });
    await reconcileDocumentMetadata(tx, {
      workspaceId: workspace.id,
      documentId: updated.id,
      contentMarkdown: updated.contentMarkdown,
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.updated",
      resourceType: "document",
      resourceId: updated.id,
      metadata: { title: updated.title, previousTitle: document.title },
    });

    return updated;
  }));
}

export async function archiveDocument(input: ArchiveDocumentInput) {
  const { document, workspace, role, access } = await getDocumentMembership(
    input.documentId,
    input.actorId,
  );
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  return prisma.$transaction(async (tx) => {
    const archived = await tx.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedById: input.actorId,
      },
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.archived",
      resourceType: "document",
      resourceId: archived.id,
      metadata: { title: archived.title },
    });

    return archived;
  });
}

export async function restoreDocumentVersion(input: RestoreDocumentVersionInput) {
  const version = await prisma.documentVersion.findUnique({
    where: { id: input.versionId },
    include: {
      document: {
        include: {
          workspace: {
            include: {
              organization: true,
              members: { where: { userId: input.actorId }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!version) throw new Error("DOCUMENT_VERSION_NOT_FOUND");

  const role = version.document.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  const access = await getUserDocumentAccess(version.document.id, input.actorId);
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  const contentText = markdownToPlainText(version.contentMarkdown);

  return runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
    const slug = await nextAvailableDocumentSlug(
      tx,
      version.document.workspaceId,
      version.document.folderId,
      version.title,
      version.document.id,
    );
    const parentPath = await getParentFolderPath(
      tx,
      version.document.workspaceId,
      version.document.folderId,
    );
    const restored = await tx.document.update({
      where: { id: version.document.id },
      data: {
        title: version.title,
        slug,
        path: buildChildPath(parentPath, slug),
        contentMarkdown: version.contentMarkdown,
        contentText,
        updatedById: input.actorId,
      },
    });

    await tx.documentVersion.create({
      data: {
        documentId: restored.id,
        versionNumber: await nextVersionNumber(tx, restored.id),
        title: restored.title,
        contentMarkdown: restored.contentMarkdown,
        createdById: input.actorId,
        changeSummary: `Restored version ${version.versionNumber}`,
      },
    });

    await reconcileDocumentLinks(tx, {
      workspaceId: version.document.workspaceId,
      sourceDocumentId: restored.id,
      contentMarkdown: restored.contentMarkdown,
    });
    await reconcileDocumentMetadata(tx, {
      workspaceId: version.document.workspaceId,
      documentId: restored.id,
      contentMarkdown: restored.contentMarkdown,
    });

    await writeAuditLog(tx, {
      organizationId: version.document.workspace.organizationId,
      actorId: input.actorId,
      action: "document.version_restored",
      resourceType: "document",
      resourceId: restored.id,
      metadata: {
        title: restored.title,
        restoredVersionNumber: version.versionNumber,
        restoredVersionId: version.id,
      },
    });

    return restored;
  }));
}

export async function createDocumentFromBrokenLink(input: CreateDocumentFromBrokenLinkInput) {
  const link = await prisma.documentLink.findUnique({
    where: { id: input.linkId },
    include: {
      workspace: {
        include: {
          organization: true,
          members: { where: { userId: input.actorId }, take: 1 },
        },
      },
    },
  });

  if (!link) throw new Error("DOCUMENT_LINK_NOT_FOUND");
  const role = link.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  assertCanWriteWorkspace(role);

  const contentMarkdown = "";

  return runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
    const document = await createDocumentWithInitialVersion(tx, {
      workspaceId: link.workspaceId,
      actorId: input.actorId,
      folderId: null,
      title: link.targetTitleRaw,
      contentMarkdown,
      changeSummary: "Created from broken wiki link",
    });

    await repairBrokenLinksForTarget(tx, {
      workspaceId: link.workspaceId,
      targetDocumentId: document.id,
      targetTitle: link.targetTitleRaw,
    });
    await reconcileDocumentMetadata(tx, {
      workspaceId: link.workspaceId,
      documentId: document.id,
      contentMarkdown: document.contentMarkdown,
    });

    await writeAuditLog(tx, {
      organizationId: link.workspace.organizationId,
      actorId: input.actorId,
      action: "document.created_from_broken_link",
      resourceType: "document",
      resourceId: document.id,
      metadata: { title: document.title, repairedLinkId: link.id },
    });

    return document;
  }));
}

export async function moveDocument(input: MoveDocumentInput) {
  const { document, workspace, role, access } = await getDocumentMembership(
    input.documentId,
    input.actorId,
  );
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  return runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
    const slug = await nextAvailableDocumentSlug(
      tx,
      workspace.id,
      input.folderId,
      document.title,
      document.id,
    );
    const parentPath = await getParentFolderPath(tx, workspace.id, input.folderId);
    const previousPath = document.path;
    const moved = await tx.document.update({
      where: { id: document.id },
      data: {
        folderId: input.folderId,
        slug,
        path: buildChildPath(parentPath, slug),
        updatedById: input.actorId,
      },
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.moved",
      resourceType: "document",
      resourceId: moved.id,
      metadata: { title: moved.title, previousPath, path: moved.path },
    });

    return moved;
  }));
}
