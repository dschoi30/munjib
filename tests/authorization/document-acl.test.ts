import { describe, expect, it } from "vitest";
import { decideDocumentAcl } from "@/lib/authorization/document-acl";

describe("Leaf 6 document ACL decision contract", () => {
  it("denies when the active-resource authority proof is absent", () => {
    expect(
      decideDocumentAcl({
        authority: null,
        operation: "read",
        explicitPermissionCount: 0,
        userPermission: null,
      }),
    ).toEqual({
      allowed: false,
      reason: "ACTIVE_RESOURCE_AUTHORITY_REQUIRED",
      effectivePermission: null,
    });
  });

  it("requires the authority proof to match the requested actor and document", () => {
    expect(
      decideDocumentAcl({
        authority: {
          kind: "active-document",
          authorityVersion: 1,
          documentId: "document-id",
          workspaceId: "workspace-id",
          actorId: "different-actor",
          workspaceRole: "EDITOR",
        } as never,
        documentId: "document-id",
        actorId: "actor-id",
        operation: "read",
        explicitPermissionCount: 0,
        userPermission: null,
      }),
    ).toMatchObject({
      allowed: false,
      reason: "ACTIVE_RESOURCE_AUTHORITY_REQUIRED",
    });
  });

  it("rejects a structurally matching but unbranded authority object", () => {
    expect(
      decideDocumentAcl({
        authority: {
          kind: "active-document",
          authorityVersion: 1,
          documentId: "document-id",
          workspaceId: "workspace-id",
          actorId: "actor-id",
          workspaceRole: "EDITOR",
        } as never,
        documentId: "document-id",
        actorId: "actor-id",
        operation: "read",
        explicitPermissionCount: 0,
        userPermission: null,
      }),
    ).toEqual({
      allowed: false,
      reason: "ACTIVE_RESOURCE_AUTHORITY_REQUIRED",
      effectivePermission: null,
    });
  });

});
