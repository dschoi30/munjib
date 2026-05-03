import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import {
  assertCanReadDocument,
  assertCanWriteDocument,
  highestPermissionLevel,
} from "@/lib/permissions/document";
import { assertCanReadWorkspace } from "@/lib/permissions/workspace";

export type CreateCommentInput = {
  documentId: string;
  actorId: string;
  body: string;
};

export async function createComment(input: CreateCommentInput) {
  const body = input.body.trim();
  if (!body) throw new Error("COMMENT_BODY_REQUIRED");

  const { document, role, access } = await getReadableDocument(input.documentId, input.actorId);
  assertCanWriteDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

  const comment = await prisma.comment.create({
    data: {
      documentId: document.id,
      userId: input.actorId,
      body,
    },
  });

  await writeAuditLog(prisma, {
    organizationId: document.workspace.organizationId,
    actorId: input.actorId,
    action: "comment.created",
    resourceType: "comment",
    resourceId: comment.id,
    metadata: { documentId: document.id },
  });

  return comment;
}

async function getReadableDocument(documentId: string, actorId: string) {
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
  assertCanReadDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });

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
