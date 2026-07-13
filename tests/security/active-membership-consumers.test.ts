import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolveActiveWorkspaceMembership } from "@/lib/workspaces/active-membership";

describe("active membership consumer contract", () => {
  it("requires the canonical two-argument resolver and never adds a membership fallback", async () => {
    const source = await readFile("lib/authorization/active-resources.ts", "utf8");
    expect(source).toContain("resolveActiveWorkspaceMembership");
    expect(source).not.toMatch(/workspaceMember\.(findUnique|findFirst|findMany)/);
    expect(source).not.toMatch(/members:\s*\{\s*some/);
    expect(source).not.toMatch(/resolve_active_workspace_membership\s*\([^,]+,[^)]*,/);
  });

  it("fails closed instead of treating the legacy WorkspaceMember row as authority", async () => {
    await expect(
      resolveActiveWorkspaceMembership({} as never, {
        workspaceId: "workspace-id",
        userId: "actor-id",
      }),
    ).rejects.toThrow("ACTIVE_MEMBERSHIP_AUTHORITY_UNAVAILABLE");
  });
});
