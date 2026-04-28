import { DocumentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";
import { markdownToPlainText } from "@/lib/text/plain-text";
import { slugifyTitle } from "@/lib/text/slug";
import type {
  ArchiveDocumentInput,
  CreateDocumentFromBrokenLinkInput,
  CreateDocumentInput,
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

  return { document, workspace: document.workspace, role };
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
  title: string,
  excludeDocumentId?: string,
) {
  const baseSlug = slugifyTitle(title);
  const existingDocuments = await tx.document.findMany({
    where: {
      workspaceId,
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
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("workspaceId") &&
    error.meta.target.includes("slug")
  );
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
    title: string;
    contentMarkdown: string;
    changeSummary: string;
  },
) {
  const slug = await nextAvailableDocumentSlug(tx, input.workspaceId, input.title);
  const contentText = markdownToPlainText(input.contentMarkdown);

  const document = await tx.document.create({
    data: {
      workspaceId: input.workspaceId,
      title: input.title,
      slug,
      path: `/${slug}`,
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
      title: input.title,
      contentMarkdown: input.contentMarkdown,
      changeSummary: "Initial version",
    });

    await reconcileDocumentLinks(tx, {
      workspaceId: workspace.id,
      sourceDocumentId: document.id,
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
  const { document, workspace, role } = await getDocumentMembership(
    input.documentId,
    input.actorId,
  );
  assertCanWriteWorkspace(role);

  const contentText = markdownToPlainText(input.contentMarkdown);

  return runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
    const slug = await nextAvailableDocumentSlug(tx, workspace.id, input.title, document.id);
    const updated = await tx.document.update({
      where: { id: document.id },
      data: {
        title: input.title,
        slug,
        path: `/${slug}`,
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
  const { document, workspace, role } = await getDocumentMembership(
    input.documentId,
    input.actorId,
  );
  assertCanWriteWorkspace(role);

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

  const contentMarkdown = `# ${link.targetTitleRaw}\n\nCreated from broken link.`;

  return runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
    const document = await createDocumentWithInitialVersion(tx, {
      workspaceId: link.workspaceId,
      actorId: input.actorId,
      title: link.targetTitleRaw,
      contentMarkdown,
      changeSummary: "Created from broken wiki link",
    });

    await repairBrokenLinksForTarget(tx, {
      workspaceId: link.workspaceId,
      targetDocumentId: document.id,
      targetTitle: link.targetTitleRaw,
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
