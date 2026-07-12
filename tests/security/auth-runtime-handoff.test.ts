import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Leaf 1 handoff", () => {
  it("pins closed password and unlinked OAuth invariants for later leaves", () => {
    const handoff = [
      "wiki/Auth And Permissions Workflow.md",
      "wiki/CI CD And Monitoring Workflow.md",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(handoff).toContain("exact linked Google Account");
    expect(handoff).toContain("zero User or Account creation");
    expect(handoff).toContain("AUTH_OAUTH_ACCOUNT_REVOKED");
    expect(handoff).toContain("canonical scrypt v1");
    expect(handoff).toContain("external profile image");
    expect(handoff).toContain("Leaf 2");
    expect(handoff).toContain("Leaf 13");
  });
});
