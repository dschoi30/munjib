import { describe, expect, it } from "vitest";
import {
  assertCanManageWorkspace,
  canManageWorkspace,
  canReadWorkspace,
  canWriteWorkspace,
} from "@/lib/permissions/workspace";

describe("workspace permissions", () => {
  it.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const)(
    "allows %s to read",
    (role) => {
      expect(canReadWorkspace(role)).toBe(true);
    },
  );

  it.each(["OWNER", "ADMIN", "EDITOR"] as const)("allows %s to write", (role) => {
    expect(canWriteWorkspace(role)).toBe(true);
  });

  it("does not allow viewer to write", () => {
    expect(canWriteWorkspace("VIEWER")).toBe(false);
  });

  it.each(["OWNER", "ADMIN"] as const)("allows %s to manage", (role) => {
    expect(canManageWorkspace(role)).toBe(true);
  });

  it.each(["EDITOR", "VIEWER"] as const)("does not allow %s to manage", (role) => {
    expect(canManageWorkspace(role)).toBe(false);
  });

  it.each(["OWNER", "ADMIN"] as const)("does not throw when %s manages", (role) => {
    expect(() => assertCanManageWorkspace(role)).not.toThrow();
  });

  it.each(["EDITOR", "VIEWER", null, undefined] as const)(
    "throws when %s manages",
    (role) => {
      expect(() => assertCanManageWorkspace(role)).toThrow("WORKSPACE_MANAGE_FORBIDDEN");
    },
  );
});
