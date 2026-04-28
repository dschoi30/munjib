import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { updateDocument } from "@/lib/documents/service";
import {
  assertCanReadDocument,
  assertCanWriteDocument,
  highestPermissionLevel,
} from "@/lib/permissions/document";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";

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

export type UploadDocumentAttachmentInput = {
  documentId: string;
  actorId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export async function uploadDocumentAttachment(input: UploadDocumentAttachmentInput) {
  if (input.bytes.byteLength === 0) throw new Error("ATTACHMENT_EMPTY");
  if (input.bytes.byteLength > maxAttachmentBytes) throw new Error("ATTACHMENT_TOO_LARGE");
  if (!allowedMimeTypes.has(input.mimeType)) throw new Error("ATTACHMENT_MIME_TYPE_FORBIDDEN");

  const { document, role, access } = await getWritableDocument(input.documentId, input.actorId);
  assertCanWriteWorkspace(role);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  const safeFileName = sanitizeFileName(input.fileName);
  const storageKey = `${document.workspaceId}/${randomUUID()}-${safeFileName}`;
  const absolutePath = attachmentPath(storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.bytes);

  const attachment = await prisma.attachment.create({
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
  await updateDocument({
    documentId: document.id,
    actorId: input.actorId,
    title: document.title,
    contentMarkdown: appendMarkdownLink(document.contentMarkdown, markdownLink),
  });

  await writeAuditLog(prisma, {
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

  if (!attachment) throw new Error("ATTACHMENT_NOT_FOUND");
  const role = attachment.document.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  const access = await getDocumentAccess(attachment.documentId, actorId);
  assertCanReadDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  return {
    attachment,
    bytes: await readFile(attachmentPath(attachment.storageKey)),
  };
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

function attachmentPath(storageKey: string) {
  return path.join(process.cwd(), "storage", "attachments", storageKey);
}

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, "-");
  return baseName || "attachment";
}

function appendMarkdownLink(markdown: string, link: string) {
  const trimmed = markdown.trimEnd();
  return trimmed ? `${trimmed}\n\n${link}` : link;
}
