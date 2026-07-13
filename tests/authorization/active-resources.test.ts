import { describe, expect, it } from "vitest";
import {
  resolveActiveDocumentForActor,
  resolveActiveWorkspaceForActor,
  resolveActiveWorkspaceForActorForUpdate,
} from "@/lib/authorization/active-resources";
import { resolveDocumentAclForActor } from "@/lib/authorization/document-acl-entrypoint";

describe("active-resource resolver boundary", () => {
  it("fails closed while the canonical database-time membership authority is unavailable", async () => {
    await expect(
      resolveActiveWorkspaceForActor({} as never, {
        workspaceSlug: "workspace-slug",
        actorId: "actor-id",
      }),
    ).rejects.toThrow("ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE");
    await expect(
      resolveActiveWorkspaceForActorForUpdate({} as never, {
        workspaceId: "workspace-id",
        actorId: "actor-id",
      }),
    ).rejects.toThrow("ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE");
    await expect(
      resolveActiveDocumentForActor({} as never, {
        documentId: "document-id",
        actorId: "actor-id",
        access: "read",
      }),
    ).rejects.toThrow("ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE");
  });

  it("runs active-resource authority before any Leaf 6 ACL decision", async () => {
    await expect(
      resolveDocumentAclForActor({} as never, {
        documentId: "document-id",
        actorId: "actor-id",
        operation: "read",
      }),
    ).rejects.toThrow("ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE");
  });
});
