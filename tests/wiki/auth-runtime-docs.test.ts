import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readWiki = (name: string) =>
  readFileSync(path.join(root, "wiki", name), "utf8").toLowerCase();

describe("auth runtime durable documentation", () => {
  it("documents both password signup and unlinked OAuth as closed", () => {
    const auth = readWiki("Auth And Permissions Workflow.md");
    expect(auth).toContain("password signup");
    expect(auth).toContain("unlinked oauth");
    expect(auth).toMatch(/zero new\s+user\/account rows/);
    expect(auth).toContain("canonical internal attachment url");
  });

  it("routes the production-like browser oracle through local and CI workflows", () => {
    expect(readWiki("Local Development Workflow.md")).toContain("auth-runtime");
    expect(readWiki("CI CD And Monitoring Workflow.md")).toContain("auth-runtime");
  });
});
