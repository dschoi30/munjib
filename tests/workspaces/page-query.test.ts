import { describe, expect, it } from "vitest";
import { buildWorkspacePageWhere } from "@/lib/workspaces/page-query";

describe("workspace page query", () => {
  it("scopes slug lookup to active workspaces the actor belongs to", () => {
    expect(buildWorkspacePageWhere({ workspaceSlug: "engineering", actorId: "user-1" })).toEqual({
      slug: "engineering",
      archivedAt: null,
      members: {
        some: { userId: "user-1" },
      },
    });
  });
});
