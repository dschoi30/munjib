import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lintWiki } from "@/lib/wiki/lint";

let root: string | undefined;

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

async function createRoot() {
  root = await mkdtemp(path.join(tmpdir(), "obsidian-wiki-lint-"));
  await mkdir(path.join(root, "wiki", "concepts"), { recursive: true });
  return root;
}

async function writeValidWiki(tempRoot: string) {
  await writeFile(
    path.join(tempRoot, "wiki", "index.md"),
    [
      "---",
      "id: index-main",
      "title: Wiki Index",
      "type: index",
      "status: active",
      "summary: Navigation index for the repository wiki.",
      "created: 2026-04-27",
      "updated: 2026-04-27",
      "source_count: 0",
      "tags:",
      "  - index",
      "links:",
      "  - \"[[LLM Wiki]]\"",
      "---",
      "",
      "# Wiki Index",
      "",
      "- [[LLM Wiki]] - Persistent LLM-maintained markdown wiki pattern.",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempRoot, "wiki", "concepts", "llm-wiki.md"),
    [
      "---",
      "id: concept-llm-wiki",
      "title: LLM Wiki",
      "type: concept",
      "status: active",
      "summary: Persistent LLM-maintained markdown wiki pattern.",
      "created: 2026-04-27",
      "updated: 2026-04-27",
      "source_count: 1",
      "tags:",
      "  - llm-wiki",
      "links:",
      "  - \"[[Wiki Index]]\"",
      "---",
      "",
      "# LLM Wiki",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempRoot, "wiki", "manifest.json"),
    JSON.stringify({
      version: 1,
      updated: "2026-04-27",
      pages: [
        {
          id: "index-main",
          path: "wiki/index.md",
          title: "Wiki Index",
          type: "index",
          status: "active",
          summary: "Navigation index for the repository wiki.",
          tags: ["index"],
          links: ["[[LLM Wiki]]"],
          source_count: 0,
          searchPriority: 5,
        },
        {
          id: "concept-llm-wiki",
          path: "wiki/concepts/llm-wiki.md",
          title: "LLM Wiki",
          type: "concept",
          status: "active",
          summary: "Persistent LLM-maintained markdown wiki pattern.",
          tags: ["llm-wiki"],
          links: ["[[Wiki Index]]"],
          source_count: 1,
          searchPriority: 50,
        },
      ],
    }),
  );
}

describe("wiki lint", () => {
  it("passes a valid seed wiki", async () => {
    const tempRoot = await createRoot();
    await writeValidWiki(tempRoot);

    const result = await lintWiki(tempRoot);

    expect(result.errors).toEqual([]);
  });

  it("fails when required frontmatter is missing", async () => {
    const tempRoot = await createRoot();
    await writeFile(path.join(tempRoot, "wiki", "index.md"), "# Missing frontmatter\n");
    await writeFile(
      path.join(tempRoot, "wiki", "manifest.json"),
      JSON.stringify({ version: 1, updated: "2026-04-27", pages: [] }),
    );

    const result = await lintWiki(tempRoot);

    expect(result.errors).toContain("wiki/index.md: missing frontmatter");
  });

  it("warns for unresolved wiki links", async () => {
    const tempRoot = await createRoot();
    await writeValidWiki(tempRoot);
    await writeFile(
      path.join(tempRoot, "wiki", "concepts", "llm-wiki.md"),
      [
        "---",
        "id: concept-llm-wiki",
        "title: LLM Wiki",
        "type: concept",
        "status: active",
        "summary: Persistent LLM-maintained markdown wiki pattern.",
        "created: 2026-04-27",
        "updated: 2026-04-27",
        "source_count: 1",
        "tags:",
        "  - llm-wiki",
        "links:",
        "  - \"[[Missing Page]]\"",
        "---",
        "",
        "# LLM Wiki",
        "",
        "[[Missing Page]]",
      ].join("\n"),
    );

    const result = await lintWiki(tempRoot);

    expect(result.warnings).toContain("wiki/concepts/llm-wiki.md: unresolved wiki link [[Missing Page]]");
  });

  it("ignores wiki link examples inside fenced code blocks", async () => {
    const tempRoot = await createRoot();
    await writeValidWiki(tempRoot);
    await writeFile(
      path.join(tempRoot, "wiki", "concepts", "llm-wiki.md"),
      [
        "---",
        "id: concept-llm-wiki",
        "title: LLM Wiki",
        "type: concept",
        "status: active",
        "summary: Persistent LLM-maintained markdown wiki pattern.",
        "created: 2026-04-27",
        "updated: 2026-04-27",
        "source_count: 1",
        "tags:",
        "  - llm-wiki",
        "links:",
        "  - \"[[Wiki Index]]\"",
        "---",
        "",
        "# LLM Wiki",
        "",
        "```yaml",
        "links:",
        "  - \"[[Example Page]]\"",
        "```",
      ].join("\n"),
    );

    const result = await lintWiki(tempRoot);

    expect(result.warnings).not.toContain("wiki/concepts/llm-wiki.md: unresolved wiki link [[Example Page]]");
  });

  it("ignores wiki link examples inside inline code", async () => {
    const tempRoot = await createRoot();
    await writeValidWiki(tempRoot);
    await writeFile(
      path.join(tempRoot, "wiki", "concepts", "llm-wiki.md"),
      [
        "---",
        "id: concept-llm-wiki",
        "title: LLM Wiki",
        "type: concept",
        "status: active",
        "summary: Persistent LLM-maintained markdown wiki pattern.",
        "created: 2026-04-27",
        "updated: 2026-04-27",
        "source_count: 1",
        "tags:",
        "  - llm-wiki",
        "links:",
        "  - \"[[Wiki Index]]\"",
        "---",
        "",
        "# LLM Wiki",
        "",
        "Use `[[Example Page]]` for examples.",
      ].join("\n"),
    );

    const result = await lintWiki(tempRoot);

    expect(result.warnings).not.toContain("wiki/concepts/llm-wiki.md: unresolved wiki link [[Example Page]]");
  });
});
