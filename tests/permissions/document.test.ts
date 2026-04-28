import { describe, expect, it } from "vitest";
import { canReadDocument, canWriteDocument, highestPermissionLevel } from "@/lib/permissions/document";

describe("document permissions", () => {
  it("uses workspace access when a document has no explicit permissions", () => {
    expect(
      canReadDocument({
        workspaceRole: "VIEWER",
        explicitPermissionCount: 0,
        userPermission: null,
      }),
    ).toBe(true);
    expect(
      canWriteDocument({
        workspaceRole: "EDITOR",
        explicitPermissionCount: 0,
        userPermission: null,
      }),
    ).toBe(true);
  });

  it("restricts explicit documents to users with enough permission", () => {
    expect(
      canReadDocument({
        workspaceRole: "EDITOR",
        explicitPermissionCount: 1,
        userPermission: null,
      }),
    ).toBe(false);
    expect(
      canWriteDocument({
        workspaceRole: "EDITOR",
        explicitPermissionCount: 1,
        userPermission: "READ",
      }),
    ).toBe(false);
    expect(
      canWriteDocument({
        workspaceRole: "EDITOR",
        explicitPermissionCount: 1,
        userPermission: "WRITE",
      }),
    ).toBe(true);
  });

  it("lets workspace managers access explicit documents", () => {
    expect(
      canWriteDocument({
        workspaceRole: "ADMIN",
        explicitPermissionCount: 1,
        userPermission: null,
      }),
    ).toBe(true);
  });

  it("selects the highest user permission", () => {
    expect(highestPermissionLevel(["READ", "MANAGE", "WRITE"])).toBe("MANAGE");
  });
});
