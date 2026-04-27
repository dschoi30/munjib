import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildWikiManifest, writeWikiManifest } from "@/lib/wiki/manifest";

let root: string | undefined;

async function createTempWiki() {
  root = await mkdtemp(path.join(tmpdir(), "obsidian-wiki-manifest-"));
  await mkdir(path.join(root, "wiki", "concepts"), { recursive: true });
  await writeFile(
    path.join(root, "wiki", "concepts", "llm-wiki.md"),
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
      "  - \"[[Persistent Wiki]]\"",
      "---",
      "",
      "# LLM Wiki",
    ].join("\n"),
  );
  return root;
}

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

describe("wiki manifest", () => {
  it("builds manifest pages from wiki frontmatter", async () => {
    const tempRoot = await createTempWiki();

    const manifest = await buildWikiManifest(tempRoot, "2026-04-27");

    expect(manifest).toEqual({
      version: 1,
      updated: "2026-04-27",
      pages: [
        {
          id: "concept-llm-wiki",
          path: "wiki/concepts/llm-wiki.md",
          title: "LLM Wiki",
          type: "concept",
          status: "active",
          summary: "Persistent LLM-maintained markdown wiki pattern.",
          tags: ["llm-wiki"],
          links: ["[[Persistent Wiki]]"],
          source_count: 1,
          searchPriority: 50,
        },
      ],
    });
  });

  it("writes a stable manifest json file", async () => {
    const tempRoot = await createTempWiki();

    const manifest = await buildWikiManifest(tempRoot, "2026-04-27");
    await writeWikiManifest(tempRoot, manifest);

    const written = await readFile(path.join(tempRoot, "wiki", "manifest.json"), "utf8");
    expect(JSON.parse(written)).toEqual(manifest);
    expect(written.endsWith("\n")).toBe(true);
  });
});
