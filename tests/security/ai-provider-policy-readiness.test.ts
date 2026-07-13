import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Issue #164 AI provider policy readiness", () => {
  it("records the current gap and dependency gate without activation", () => {
    const runbook = read("docs/runbooks/ai-provider-policy-readiness.md");

    expect(runbook).toContain("Issue #164");
    expect(runbook).toContain("public-safe readiness handoff");
    expect(runbook).toContain("operator-owned model allowlist");
    expect(runbook).toContain("destination/egress allowlist");
    expect(runbook).toContain("Issue #139");
    expect(runbook).toContain("Issue #163");
    expect(runbook).toContain("Issue #160");
    expect(runbook).toContain("Issue #184 and Issue #185");
    expect(runbook).toContain("documentation-only");
    expect(runbook).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(runbook).not.toMatch(/https?:\/\/[^\s)]+@/);
  });

  it("keeps provider credentials and destinations out of both AI request routes", () => {
    const askRoute = read("app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts");
    const workspaceRoute = read("app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts");

    for (const source of [askRoute, workspaceRoute]) {
      expect(source).toContain("validateChatProvider");
      expect(source).toContain("validateChatModelId");
      expect(source).not.toContain("body.baseUrl");
      expect(source).not.toContain("body.apiKey");
      expect(source).not.toContain("body.embeddingProvider");
      expect(source).not.toContain("body.embeddingModel");
    }
  });
});
