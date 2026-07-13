import {
  getDocumentAccessForActor,
  resolveActiveDocumentForActor,
  type ActiveResourceDatabase,
} from "@/lib/authorization/active-resources";
import { decideDocumentAcl, type DocumentAclDecision, type DocumentAclOperation } from "@/lib/authorization/document-acl";

/**
 * Single server-side ACL entrypoint. The active-resource resolver runs first;
 * no caller can evaluate the Leaf 6 ACL rows without its proof.
 */
export async function resolveDocumentAclForActor(
  db: ActiveResourceDatabase,
  input: {
    documentId: string;
    actorId: string;
    operation: DocumentAclOperation;
  },
): Promise<DocumentAclDecision> {
  const authority = await resolveActiveDocumentForActor(db, {
    documentId: input.documentId,
    actorId: input.actorId,
    access: input.operation,
  });
  if (!authority) {
    return decideDocumentAcl({
      authority: null,
      documentId: input.documentId,
      actorId: input.actorId,
      operation: input.operation,
      explicitPermissionCount: 0,
      userPermission: null,
    });
  }

  const access = await getDocumentAccessForActor(db, input.documentId, input.actorId);
  return decideDocumentAcl({
    authority,
    documentId: input.documentId,
    actorId: input.actorId,
    operation: input.operation,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });
}
