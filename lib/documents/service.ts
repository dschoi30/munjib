import { DocumentStatus, type Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";
import { markdownToPlainText } from "@/lib/text/plain-text";
import { slugifyTitle } from "@/lib/text/slug";
import type {
  ArchiveDocumentInput,
  CreateDocumentInput,
  UpdateDocumentInput,
} from "@/lib/documents/types";
import { reconcileDocumentLinks } from "@/lib/wiki-links/reconcile";

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

export async function createDocument(input: CreateDocumentInput) {
  const { workspace, role } = await getWorkspaceMembership(input.workspaceSlug, input.actorId);
  assertCanWriteWorkspace(role);

  const slug = slugifyTitle(input.title);
  const contentText = markdownToPlainText(input.contentMarkdown);

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        workspaceId: workspace.id,
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
        changeSummary: "Initial version",
      },
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
  });
}

export async function updateDocument(input: UpdateDocumentInput) {
  const { document, workspace, role } = await getDocumentMembership(
    input.documentId,
    input.actorId,
  );
  assertCanWriteWorkspace(role);

  const slug = slugifyTitle(input.title);
  const contentText = markdownToPlainText(input.contentMarkdown);

  return prisma.$transaction(async (tx) => {
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
  });
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
