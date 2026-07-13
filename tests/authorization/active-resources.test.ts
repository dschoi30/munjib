import { describe, expect, it } from "vitest";
import {
  resolveActiveDocumentForActor,
  resolveActiveWorkspaceForActor,
  resolveActiveWorkspaceForActorForUpdate,
} from "@/lib/authorization/active-resources";

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
});
