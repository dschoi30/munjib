import { describe, expect, it } from "vitest";
import { chunkMarkdownDocument } from "@/lib/rag/chunk-markdown";

describe("chunkMarkdownDocument", () => {
  it("strips frontmatter and keeps heading paths", () => {
    const chunks = chunkMarkdownDocument({
      documentTitle: "Runbook",
      contentMarkdown: "---\ntags:\n  - ops\n---\n\n# Intro\n\nHello\n\n## Steps\n\nDo work",
      maxTokens: 40,
      overlapTokens: 8,
    });

    expect(chunks).toEqual([
      expect.objectContaining({
        chunkIndex: 0,
        headingPath: "Intro",
        content: "# Intro\n\nHello",
      }),
      expect.objectContaining({
        chunkIndex: 1,
        headingPath: "Intro > Steps",
        content: "## Steps\n\nDo work",
      }),
    ]);
    expect(chunks[0]?.content).not.toContain("tags:");
  });

  it("does not split inside fenced code blocks or markdown tables", () => {
    const markdown = [
      "# Reference",
      "",
      "| Key | Value |",
      "| --- | --- |",
      "| A | B |",
      "",
      "```ts",
      "const value = true;",
      "```",
    ].join("\n");

    const chunks = chunkMarkdownDocument({
      documentTitle: "Reference",
      contentMarkdown: markdown,
      maxTokens: 18,
      overlapTokens: 4,
    });

    expect(chunks.map((chunk) => chunk.content).join("\n\n")).toContain("| A | B |");
    expect(chunks.map((chunk) => chunk.content).join("\n\n")).toContain("const value = true;");
  });

  it("splits long sections with overlap", () => {
    const chunks = chunkMarkdownDocument({
      documentTitle: "Long",
      contentMarkdown: `# Long\n\n${Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ")}`,
      maxTokens: 30,
      overlapTokens: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.content).toContain("word25");
  });
});
