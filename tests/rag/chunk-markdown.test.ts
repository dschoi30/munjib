import { createHash } from "node:crypto";
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
    expect(chunks[0]).toEqual(
      expect.objectContaining({
        contentHash: createHash("sha256").update("# Intro\n\nHello").digest("hex"),
        tokenCount: 3,
      }),
    );
  });

  it("keeps meaningful trailing hashes in heading paths", () => {
    const chunks = chunkMarkdownDocument({
      documentTitle: "Languages",
      contentMarkdown: "# C#\n\nCompiler notes\n\n## Operators ###\n\nDetails",
      maxTokens: 40,
      overlapTokens: 8,
    });

    expect(chunks.map((chunk) => chunk.headingPath)).toEqual(["C#", "C# > Operators"]);
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

    const tableBlock = ["| Key | Value |", "| --- | --- |", "| A | B |"].join("\n");
    const codeBlock = ["```ts", "const value = true;", "```"].join("\n");
    const tableChunk = chunks.find((chunk) => chunk.content.includes("| Key | Value |"));
    const codeChunk = chunks.find((chunk) => chunk.content.includes("const value = true;"));

    expect(tableChunk?.content).toContain(tableBlock);
    expect(codeChunk?.content).toContain(codeBlock);
    expect(codeChunk?.content.match(/```/g)).toHaveLength(2);
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

  it("keeps overlap when splitting at markdown block boundaries", () => {
    const chunks = chunkMarkdownDocument({
      documentTitle: "Blocks",
      contentMarkdown: [
        "# Blocks",
        "",
        "alpha beta gamma delta",
        "",
        "epsilon zeta eta theta",
        "",
        "iota kappa lambda mu",
      ].join("\n"),
      maxTokens: 8,
      overlapTokens: 3,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.content).toContain("beta gamma delta");
    expect(chunks[1]?.content).toContain("epsilon zeta eta theta");
  });

  it("splits oversized markdown tables with a bounded fallback", () => {
    const chunks = chunkMarkdownDocument({
      documentTitle: "Big table",
      contentMarkdown: [
        "# Big table",
        "",
        "| Key | Value |",
        "| --- | --- |",
        ...Array.from({ length: 8 }, (_, index) => `| key${index} | value${index} |`),
      ].join("\n"),
      maxTokens: 18,
      overlapTokens: 3,
    });

    const tableChunks = chunks.filter((chunk) => chunk.content.includes("| Key | Value |"));
    expect(tableChunks.length).toBeGreaterThan(1);
    expect(tableChunks.every((chunk) => chunk.tokenCount <= 18)).toBe(true);
    expect(tableChunks.every((chunk) => chunk.content.includes("| --- | --- |"))).toBe(true);
  });

  it("splits oversized fenced code blocks with a bounded fallback", () => {
    const chunks = chunkMarkdownDocument({
      documentTitle: "Big code",
      contentMarkdown: [
        "# Big code",
        "",
        "```ts",
        ...Array.from({ length: 12 }, (_, index) => `const value${index} = ${index};`),
        "```",
      ].join("\n"),
      maxTokens: 18,
      overlapTokens: 3,
    });

    const codeChunks = chunks.filter((chunk) => chunk.content.includes("const value"));
    expect(codeChunks.length).toBeGreaterThan(1);
    expect(codeChunks.every((chunk) => chunk.tokenCount <= 18)).toBe(true);
    expect(codeChunks.every((chunk) => chunk.content.startsWith("```ts"))).toBe(true);
    expect(codeChunks.every((chunk) => chunk.content.endsWith("```"))).toBe(true);
  });
});
