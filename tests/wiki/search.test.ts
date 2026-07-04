import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readRecentWikiLogEntries } from "@/lib/wiki/log";
import { searchWiki } from "@/lib/wiki/search";

let root: string | undefined;

async function createTempWiki() {
  root = await mkdtemp(path.join(tmpdir(), "obsidian-wiki-search-"));
  await mkdir(path.join(root, "wiki"), { recursive: true });
  await writeFile(
    path.join(root, "wiki", "index.md"),
    "# Wiki Index\n\n## Concepts\n\n- [[LLM Wiki]] - Persistent LLM-maintained markdown wiki pattern.\n",
  );
  await writeFile(
    path.join(root, "wiki", "manifest.json"),
    JSON.stringify({
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
          tags: ["llm-wiki", "knowledge-management"],
          links: ["[[Persistent Wiki]]"],
          source_count: 1,
          searchPriority: 50,
        },
      ],
    }),
  );
  await writeFile(
    path.join(root, "wiki", "log.md"),
    [
      "# Wiki Log",
      "",
      "## 2026-04-27T09:00:00+09:00 - ingest",
      "",
      "- Source: raw/sources/llm-wiki.md",
      "- Result: Seeded wiki.",
      "",
      "## 2026-04-27T10:00:00+09:00 - query",
      "",
      "- Query: llm wiki",
      "- Result: Found concept page.",
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

describe("wiki search", () => {
  it("finds matching manifest pages for llm wiki", async () => {
    const tempRoot = await createTempWiki();

    const results = await searchWiki("llm wiki", tempRoot);

    expect(results[0]).toMatchObject({
      path: "wiki/concepts/llm-wiki.md",
      title: "LLM Wiki",
      type: "concept",
      status: "active",
      summary: "Persistent LLM-maintained markdown wiki pattern.",
    });
  });

  it("returns no results for unknown queries", async () => {
    const tempRoot = await createTempWiki();

    await expect(searchWiki("unknown", tempRoot)).resolves.toEqual([]);
  });

  it("reads recent log entries newest first", async () => {
    const tempRoot = await createTempWiki();

    const entries = await readRecentWikiLogEntries(tempRoot, 1);

    expect(entries).toEqual([
      "## 2026-04-27T10:00:00+09:00 - query\n\n- Query: llm wiki\n- Result: Found concept page.",
    ]);
  });

  it("sorts recent log entries by timestamp instead of file position", async () => {
    const tempRoot = await createTempWiki();
    await writeFile(
      path.join(tempRoot, "wiki", "log.md"),
      [
        "# Wiki Log",
        "",
        "## 2026-07-04T17:42:00+0900 - review follow-up",
        "",
        "- Result: Latest entry.",
        "",
        "## 2026-04-29T00:00:00+09:00 - rewrite",
        "",
        "- Result: Old rewrite.",
        "",
        "## 2026-07-03T01:06:24+0900 - deployment fix",
        "",
        "- Result: Previous entry.",
      ].join("\n"),
    );

    const entries = await readRecentWikiLogEntries(tempRoot, 2);

    expect(entries).toEqual([
      "## 2026-07-04T17:42:00+0900 - review follow-up\n\n- Result: Latest entry.",
      "## 2026-07-03T01:06:24+0900 - deployment fix\n\n- Result: Previous entry.",
    ]);
  });
});
