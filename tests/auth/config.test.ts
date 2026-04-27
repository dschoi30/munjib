import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth/config";

describe("authOptions", () => {
  it("uses a stable development secret for JWT sessions", () => {
    expect(authOptions.secret).toBe("obsidian-clone-development-secret");
  });

  it("uses an app-specific session cookie name", () => {
    expect(authOptions.cookies?.sessionToken?.name).toBe("obsidian-clone.session-token");
  });
});
