import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/log";
import { reconcileDocumentMetadata } from "@/lib/document-metadata/reconcile";
import { prisma } from "@/lib/db/client";
import {
  assertCanReadDocument,
  assertCanWriteDocument,
  highestPermissionLevel,
} from "@/lib/permissions/document";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";
import { scheduleSavedDocumentIndex } from "@/lib/rag/index-document";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { markdownToPlainText } from "@/lib/text/plain-text";
import { reconcileDocumentLinks } from "@/lib/wiki-links/reconcile";
import { resolveAttachmentStoragePath } from "@/lib/attachments/storage-key";

const maxAttachmentBytes = 5 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

function logAttachmentRagIndexFailure(documentId: string, error: unknown) {
  console.error("Failed to refresh attachment RAG index", { documentId, error });
}

export type UploadDocumentAttachmentInput = {
  documentId: string;
  actorId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export async function uploadDocumentAttachment(input: UploadDocumentAttachmentInput) {
  if (input.bytes.byteLength === 0) throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_EMPTY);
  if (input.bytes.byteLength > maxAttachmentBytes) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_TOO_LARGE);
  }
  if (!allowedMimeTypes.has(input.mimeType)) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
  }

  const { document, role, access } = await getWritableDocument(input.documentId, input.actorId);
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  const safeFileName = sanitizeFileName(input.fileName);
  const storageKey = `${document.workspaceId}/${randomUUID()}-${safeFileName.replace(/[^A-Za-z0-9._-]/g, "-")}`;
  const absolutePath = attachmentPath(storageKey, document.workspaceId);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.bytes);

  try {
    const attachment = await prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          documentId: document.id,
          fileName: safeFileName,
          mimeType: input.mimeType,
          size: input.bytes.byteLength,
          storageKey,
          uploadedById: input.actorId,
        },
      });

      const markdownLink = input.mimeType.startsWith("image/")
        ? `![${safeFileName}](/api/attachments/${attachment.id})`
        : `[${safeFileName}](/api/attachments/${attachment.id})`;
      const contentMarkdown = appendMarkdownLink(document.contentMarkdown, markdownLink);
      const updated = await tx.document.update({
        where: { id: document.id },
        data: {
          contentMarkdown,
          contentText: markdownToPlainText(contentMarkdown),
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
          changeSummary: "Uploaded attachment",
        },
      });

      await reconcileDocumentLinks(tx, {
        workspaceId: document.workspaceId,
        sourceDocumentId: updated.id,
        contentMarkdown: updated.contentMarkdown,
      });
      await reconcileDocumentMetadata(tx, {
        workspaceId: document.workspaceId,
        documentId: updated.id,
        contentMarkdown: updated.contentMarkdown,
      });

      await writeAuditLog(tx, {
        organizationId: document.workspace.organizationId,
        actorId: input.actorId,
        action: "document.updated",
        resourceType: "document",
        resourceId: updated.id,
        metadata: { title: updated.title, previousTitle: document.title },
      });
      await writeAuditLog(tx, {
        organizationId: document.workspace.organizationId,
        actorId: input.actorId,
        action: "attachment.uploaded",
        resourceType: "attachment",
        resourceId: attachment.id,
        metadata: {
          documentId: document.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
        },
      });

      return attachment;
    });

    scheduleSavedDocumentIndex({
      documentId: document.id,
      logger: logAttachmentRagIndexFailure,
    });
    return attachment;
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}

export async function uploadPastedDocumentImageAttachment(input: UploadDocumentAttachmentInput) {
  if (input.bytes.byteLength === 0) throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_EMPTY);
  if (input.bytes.byteLength > maxAttachmentBytes) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_TOO_LARGE);
  }
  if (!isAllowedPastedImageMimeType(input.mimeType)) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_MIME_TYPE_FORBIDDEN);
  }

  const { document, role, access } = await getWritableDocument(input.documentId, input.actorId);
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  const safeFileName = sanitizePastedImageFileName(input.fileName, input.mimeType);
  const storageKey = `${document.workspaceId}/${randomUUID()}-${safeFileName.replace(/[^A-Za-z0-9._-]/g, "-")}`;
  const absolutePath = attachmentPath(storageKey, document.workspaceId);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.bytes);

  try {
    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          documentId: document.id,
          fileName: safeFileName,
          mimeType: input.mimeType,
          size: input.bytes.byteLength,
          storageKey,
          uploadedById: input.actorId,
        },
      });

      await writeAuditLog(tx, {
        organizationId: document.workspace.organizationId,
        actorId: input.actorId,
        action: "attachment.uploaded",
        resourceType: "attachment",
        resourceId: created.id,
        metadata: {
          documentId: document.id,
          fileName: created.fileName,
          mimeType: created.mimeType,
          size: created.size,
          source: "clipboard-paste",
        },
      });

      return created;
    });

    return {
      ...attachment,
      markdown: imageMarkdownLink(attachment.fileName, attachment.id),
    };
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}

export async function getReadableAttachment(attachmentId: string, actorId: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      document: {
        include: {
          workspace: {
            include: {
              members: { where: { userId: actorId }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!attachment) throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND);
  const role = attachment.document.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  const access = await getDocumentAccess(attachment.documentId, actorId);
  assertCanReadDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  try {
    return {
      attachment,
      bytes: await readFile(attachmentPath(attachment.storageKey, attachment.document.workspaceId)),
    };
  } catch (error) {
    if (isMissingAttachmentFileError(error)) {
      throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND);
    }
    throw error;
  }
}

async function getWritableDocument(documentId: string, actorId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      workspace: {
        include: {
          organization: true,
          members: { where: { userId: actorId }, take: 1 },
        },
      },
    },
  });

  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  const role = document.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  const access = await getDocumentAccess(document.id, actorId);

  return { document, role, access };
}

async function getDocumentAccess(documentId: string, actorId: string) {
  const [explicitPermissionCount, userPermissions] = await Promise.all([
    prisma.permission.count({ where: { resourceType: "DOCUMENT", resourceId: documentId } }),
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

function attachmentPath(storageKey: string, workspaceId: string) {
  try {
    return resolveAttachmentStoragePath(
      path.join(process.cwd(), "storage", "attachments"),
      storageKey,
      workspaceId,
    );
  } catch {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_STORAGE_KEY_INVALID);
  }
}

function isMissingAttachmentFileError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName).normalize("NFC").replace(/[^\p{L}\p{N}._-]/gu, "-");
  return baseName || "attachment";
}

function isAllowedPastedImageMimeType(mimeType: string) {
  return (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/gif" ||
    mimeType === "image/webp"
  );
}

function sanitizePastedImageFileName(fileName: string, mimeType: string) {
  const safeFileName = sanitizeFileName(fileName);
  if (safeFileName !== "attachment") return safeFileName;

  return `pasted-image.${extensionForImageMimeType(mimeType)}`;
}

function extensionForImageMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function imageMarkdownLink(fileName: string, attachmentId: string) {
  return `![${fileName}](/api/attachments/${attachmentId})`;
}

function appendMarkdownLink(markdown: string, link: string) {
  const trimmed = markdown.trimEnd();
  return trimmed ? `${trimmed}\n\n${link}` : link;
}
