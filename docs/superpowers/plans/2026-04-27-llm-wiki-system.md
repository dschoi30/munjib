# LLM Wiki System Implementation Plan

> Publication update (2026-10-09): historical full-text retention instructions below are superseded by the owner-approved private archival and public source-link/summary policy in `docs/runbooks/public-release-readiness.md`. The raw source path now contains a reference note.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a markdown-first LLM wiki system that agents consult before broad repository search.

**Architecture:** The wiki lives as versioned markdown under `wiki/` with immutable source copies under `raw/sources/`. Small TypeScript utilities parse frontmatter, generate `wiki/manifest.json`, lint wiki consistency, and power CLI commands exposed through `pnpm` scripts. The system is import-ready for the app database but does not write PostgreSQL in this phase.

**Tech Stack:** Next.js repo, TypeScript, Node `fs`/`path`, `tsx`, Vitest, markdown frontmatter parsed by local utilities.

---

## File Structure

- Create `lib/wiki/types.ts`: shared wiki page, manifest, lint, and search result types.
- Create `lib/wiki/frontmatter.ts`: parse markdown frontmatter without adding a dependency.
- Create `lib/wiki/files.ts`: list wiki markdown files and read/write wiki paths.
- Create `lib/wiki/manifest.ts`: build manifest entries from wiki page frontmatter.
- Create `lib/wiki/search.ts`: search `wiki/index.md` and `wiki/manifest.json`.
- Create `lib/wiki/log.ts`: parse recent entries from `wiki/log.md`.
- Create `lib/wiki/lint.ts`: validate required frontmatter, manifest consistency, index coverage, wikilinks, and stale pages.
- Create `scripts/wiki/find.ts`: CLI wrapper for wiki search.
- Create `scripts/wiki/log.ts`: CLI wrapper for recent log output.
- Create `scripts/wiki/lint.ts`: CLI wrapper for wiki lint.
- Create `scripts/wiki/manifest.ts`: CLI wrapper for manifest regeneration.
- Create `tests/wiki/manifest.test.ts`: manifest generation tests.
- Create `tests/wiki/search.test.ts`: wiki-first search tests.
- Create `tests/wiki/lint.test.ts`: wiki lint tests.
- Modify `package.json`: add `wiki:find`, `wiki:log`, `wiki:lint`, and `wiki:manifest` scripts.
- Create `raw/sources/llm-wiki.md`: immutable source copy of root `llm-wiki.md`.
- Create seed wiki files under `wiki/`.
- Create `AGENTS.md`: repository operating rule for wiki-first lookup.

## Task 1: Wiki Parsing And Manifest Core

**Files:**
- Create: `lib/wiki/types.ts`
- Create: `lib/wiki/frontmatter.ts`
- Create: `lib/wiki/files.ts`
- Create: `lib/wiki/manifest.ts`
- Test: `tests/wiki/manifest.test.ts`

- [ ] **Step 1: Write the failing manifest test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/wiki/manifest.test.ts`

Expected: FAIL because `@/lib/wiki/manifest` does not exist.

- [ ] **Step 3: Add shared types**

Create `lib/wiki/types.ts`:

```ts
export const WIKI_PAGE_TYPES = [
  "source",
  "concept",
  "entity",
  "workflow",
  "decision",
  "question",
  "index",
  "log",
] as const;

export const WIKI_PAGE_STATUSES = ["active", "stale", "draft", "superseded"] as const;

export type WikiPageType = (typeof WIKI_PAGE_TYPES)[number];
export type WikiPageStatus = (typeof WIKI_PAGE_STATUSES)[number];

export type WikiFrontmatter = {
  id: string;
  title: string;
  type: WikiPageType;
  status: WikiPageStatus;
  summary: string;
  created: string;
  updated: string;
  source_count: number;
  tags: string[];
  links: string[];
};

export type WikiManifestPage = Pick<
  WikiFrontmatter,
  "id" | "title" | "type" | "status" | "summary" | "tags" | "links" | "source_count"
> & {
  path: string;
  searchPriority: number;
};

export type WikiManifest = {
  version: 1;
  updated: string;
  pages: WikiManifestPage[];
};
```

- [ ] **Step 4: Add frontmatter parser**

Create `lib/wiki/frontmatter.ts` with a strict parser for scalar values and indented string arrays:

```ts
import { WIKI_PAGE_STATUSES, WIKI_PAGE_TYPES, type WikiFrontmatter } from "./types";

export type ParsedWikiMarkdown = {
  frontmatter: WikiFrontmatter;
  body: string;
};

export function parseWikiMarkdown(markdown: string, filePath: string): ParsedWikiMarkdown {
  if (!markdown.startsWith("---\n")) {
    throw new Error(`${filePath}: missing frontmatter`);
  }

  const end = markdown.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`${filePath}: unterminated frontmatter`);
  }

  const raw = markdown.slice(4, end).trimEnd();
  const body = markdown.slice(end + 5).replace(/^\n/, "");
  const data = parseSimpleYaml(raw);
  const frontmatter = normalizeFrontmatter(data, filePath);

  return { frontmatter, body };
}

function parseSimpleYaml(raw: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const lines = raw.split("\n");
  let activeArray: string | undefined;

  for (const line of lines) {
    if (line.trim() === "") continue;
    const arrayItem = line.match(/^  - (.*)$/);
    if (arrayItem && activeArray) {
      const existing = result[activeArray];
      result[activeArray] = [...(Array.isArray(existing) ? existing : []), unquote(arrayItem[1] ?? "")];
      continue;
    }

    const keyValue = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!keyValue) {
      throw new Error(`invalid frontmatter line: ${line}`);
    }

    const key = keyValue[1] ?? "";
    const value = (keyValue[2] ?? "").trim();
    if (value === "") {
      result[key] = [];
      activeArray = key;
    } else {
      result[key] = unquote(value);
      activeArray = undefined;
    }
  }

  return result;
}

function normalizeFrontmatter(data: Record<string, string | string[]>, filePath: string): WikiFrontmatter {
  const required = ["id", "title", "type", "status", "summary", "created", "updated", "source_count", "tags", "links"];
  for (const field of required) {
    if (!(field in data)) {
      throw new Error(`${filePath}: missing required frontmatter field ${field}`);
    }
  }

  const type = scalar(data.type);
  const status = scalar(data.status);
  if (!WIKI_PAGE_TYPES.includes(type as never)) {
    throw new Error(`${filePath}: invalid wiki type ${type}`);
  }
  if (!WIKI_PAGE_STATUSES.includes(status as never)) {
    throw new Error(`${filePath}: invalid wiki status ${status}`);
  }

  return {
    id: scalar(data.id),
    title: scalar(data.title),
    type: type as WikiFrontmatter["type"],
    status: status as WikiFrontmatter["status"],
    summary: scalar(data.summary),
    created: scalar(data.created),
    updated: scalar(data.updated),
    source_count: Number.parseInt(scalar(data.source_count), 10),
    tags: array(data.tags),
    links: array(data.links),
  };
}

function scalar(value: string | string[] | undefined): string {
  if (typeof value !== "string") return "";
  return value;
}

function array(value: string | string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value;
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
```

- [ ] **Step 5: Add file listing and manifest builder**

Create `lib/wiki/files.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function listWikiMarkdownFiles(rootDir: string): Promise<string[]> {
  const wikiRoot = path.join(rootDir, "wiki");
  const files = await walk(wikiRoot);
  return files
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.relative(rootDir, file).split(path.sep).join("/"))
    .sort();
}

export async function readWorkspaceFile(rootDir: string, relativePath: string): Promise<string> {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
    }),
  );
  return files.flat();
}
```

Create `lib/wiki/manifest.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listWikiMarkdownFiles, readWorkspaceFile } from "./files";
import { parseWikiMarkdown } from "./frontmatter";
import type { WikiManifest, WikiManifestPage } from "./types";

export async function buildWikiManifest(rootDir = process.cwd(), updated = today()): Promise<WikiManifest> {
  const pages = await Promise.all(
    (await listWikiMarkdownFiles(rootDir)).map(async (relativePath): Promise<WikiManifestPage> => {
      const markdown = await readWorkspaceFile(rootDir, relativePath);
      const { frontmatter } = parseWikiMarkdown(markdown, relativePath);
      return {
        id: frontmatter.id,
        path: relativePath,
        title: frontmatter.title,
        type: frontmatter.type,
        status: frontmatter.status,
        summary: frontmatter.summary,
        tags: frontmatter.tags,
        links: frontmatter.links,
        source_count: frontmatter.source_count,
        searchPriority: searchPriorityFor(relativePath, frontmatter.type),
      };
    }),
  );

  return { version: 1, updated, pages: pages.sort((a, b) => a.path.localeCompare(b.path)) };
}

export async function writeWikiManifest(rootDir: string, manifest: WikiManifest): Promise<void> {
  await mkdir(path.join(rootDir, "wiki"), { recursive: true });
  await writeFile(path.join(rootDir, "wiki", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function searchPriorityFor(relativePath: string, type: string): number {
  if (relativePath === "wiki/index.md") return 5;
  if (relativePath === "wiki/log.md") return 1;
  if (type === "concept" || type === "workflow") return 50;
  if (type === "decision") return 40;
  return 30;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 6: Run manifest tests**

Run: `pnpm exec vitest run tests/wiki/manifest.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/wiki/types.ts lib/wiki/frontmatter.ts lib/wiki/files.ts lib/wiki/manifest.ts tests/wiki/manifest.test.ts
git commit -m "feat: add wiki manifest core"
```

## Task 2: Wiki Search And Log CLI

**Files:**
- Create: `lib/wiki/search.ts`
- Create: `lib/wiki/log.ts`
- Create: `scripts/wiki/find.ts`
- Create: `scripts/wiki/log.ts`
- Test: `tests/wiki/search.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing search tests**

Create `tests/wiki/search.test.ts`:

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { searchWiki } from "@/lib/wiki/search";
import { readRecentWikiLogEntries } from "@/lib/wiki/log";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/wiki/search.test.ts`

Expected: FAIL because `@/lib/wiki/search` and `@/lib/wiki/log` do not exist.

- [ ] **Step 3: Implement search and log utilities**

Create `lib/wiki/search.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WikiManifest, WikiManifestPage } from "./types";

export type WikiSearchResult = Pick<WikiManifestPage, "path" | "title" | "type" | "status" | "summary"> & {
  score: number;
};

export async function searchWiki(query: string, rootDir = process.cwd()): Promise<WikiSearchResult[]> {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const [indexText, manifest] = await Promise.all([
    readOptional(path.join(rootDir, "wiki", "index.md")),
    readManifest(rootDir),
  ]);

  return manifest.pages
    .map((page) => ({ page, score: scorePage(page, indexText, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path))
    .map(({ page, score }) => ({
      path: page.path,
      title: page.title,
      type: page.type,
      status: page.status,
      summary: page.summary,
      score,
    }));
}

async function readManifest(rootDir: string): Promise<WikiManifest> {
  const raw = await readFile(path.join(rootDir, "wiki", "manifest.json"), "utf8");
  return JSON.parse(raw) as WikiManifest;
}

async function readOptional(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function scorePage(page: WikiManifestPage, indexText: string, normalizedQuery: string): number {
  const haystacks = [
    page.title,
    page.path,
    page.summary,
    page.type,
    page.status,
    ...page.tags,
    indexText.includes(page.title) ? page.title : "",
  ].map(normalize);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;
  const matches = tokens.filter((token) => haystacks.some((haystack) => haystack.includes(token))).length;
  return matches === tokens.length ? matches * 10 + page.searchPriority : 0;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim();
}
```

Create `lib/wiki/log.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readRecentWikiLogEntries(rootDir = process.cwd(), count = 10): Promise<string[]> {
  const log = await readFile(path.join(rootDir, "wiki", "log.md"), "utf8");
  return log
    .split(/\n(?=## \d{4}-\d{2}-\d{2}T)/)
    .filter((entry) => entry.startsWith("## "))
    .map((entry) => entry.trim())
    .reverse()
    .slice(0, count);
}
```

- [ ] **Step 4: Add CLI wrappers and package scripts**

Create `scripts/wiki/find.ts`:

```ts
import { searchWiki } from "@/lib/wiki/search";

const query = process.argv.slice(2).join(" ").trim();
const results = await searchWiki(query);

if (results.length === 0) {
  console.log("wiki miss, use rg next");
  process.exit(0);
}

for (const result of results) {
  console.log(`${result.path} | ${result.title} | ${result.type} | ${result.status}`);
  console.log(result.summary);
}
```

Create `scripts/wiki/log.ts`:

```ts
import { readRecentWikiLogEntries } from "@/lib/wiki/log";

const count = Number.parseInt(process.argv[2] ?? "10", 10);
const entries = await readRecentWikiLogEntries(process.cwd(), Number.isFinite(count) ? count : 10);
console.log(entries.join("\n\n"));
```

Modify `package.json` scripts:

```json
"wiki:find": "tsx scripts/wiki/find.ts",
"wiki:log": "tsx scripts/wiki/log.ts",
"wiki:lint": "tsx scripts/wiki/lint.ts",
"wiki:manifest": "tsx scripts/wiki/manifest.ts"
```

- [ ] **Step 5: Run search tests**

Run: `pnpm exec vitest run tests/wiki/search.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/wiki/search.ts lib/wiki/log.ts scripts/wiki/find.ts scripts/wiki/log.ts tests/wiki/search.test.ts package.json
git commit -m "feat: add wiki search and log commands"
```

## Task 3: Wiki Lint And Manifest CLI

**Files:**
- Create: `lib/wiki/lint.ts`
- Create: `scripts/wiki/lint.ts`
- Create: `scripts/wiki/manifest.ts`
- Test: `tests/wiki/lint.test.ts`

- [ ] **Step 1: Write failing lint tests**

Create `tests/wiki/lint.test.ts`:

```ts
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
    await writeFile(path.join(tempRoot, "wiki", "manifest.json"), JSON.stringify({ version: 1, updated: "2026-04-27", pages: [] }));

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/wiki/lint.test.ts`

Expected: FAIL because `@/lib/wiki/lint` does not exist.

- [ ] **Step 3: Implement linter**

Create `lib/wiki/lint.ts`:

```ts
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { listWikiMarkdownFiles, readWorkspaceFile } from "./files";
import { parseWikiMarkdown } from "./frontmatter";
import type { WikiManifest } from "./types";

export type WikiLintResult = {
  errors: string[];
  warnings: string[];
};

export async function lintWiki(rootDir = process.cwd()): Promise<WikiLintResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files = await listWikiMarkdownFiles(rootDir);
  const titleByFile = new Map<string, string>();

  for (const file of files) {
    try {
      const parsed = parseWikiMarkdown(await readWorkspaceFile(rootDir, file), file);
      titleByFile.set(file, parsed.frontmatter.title);
      if (parsed.frontmatter.status === "stale") {
        warnings.push(`${file}: status is stale`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${file}: unknown parse error`);
    }
  }

  const manifest = await readManifest(rootDir, errors);
  if (manifest) {
    await validateManifestFiles(rootDir, manifest, errors);
    validateDuplicateIds(manifest, errors);
    validateIndexCoverage(rootDir, manifest, warnings);
  }

  await validateWikiLinks(rootDir, files, titleByFile, warnings);

  return { errors, warnings };
}

async function readManifest(rootDir: string, errors: string[]): Promise<WikiManifest | undefined> {
  try {
    return JSON.parse(await readFile(path.join(rootDir, "wiki", "manifest.json"), "utf8")) as WikiManifest;
  } catch {
    errors.push("wiki/manifest.json: missing or invalid manifest");
    return undefined;
  }
}

async function validateManifestFiles(rootDir: string, manifest: WikiManifest, errors: string[]) {
  for (const page of manifest.pages) {
    try {
      await access(path.join(rootDir, page.path));
    } catch {
      errors.push(`wiki/manifest.json: missing file ${page.path}`);
    }
  }
}

function validateDuplicateIds(manifest: WikiManifest, errors: string[]) {
  const seen = new Set<string>();
  for (const page of manifest.pages) {
    if (seen.has(page.id)) {
      errors.push(`wiki/manifest.json: duplicate id ${page.id}`);
    }
    seen.add(page.id);
  }
}

async function validateIndexCoverage(rootDir: string, manifest: WikiManifest, warnings: string[]) {
  const index = await readFile(path.join(rootDir, "wiki", "index.md"), "utf8").catch(() => "");
  for (const page of manifest.pages) {
    if (page.path === "wiki/index.md" || page.path === "wiki/log.md") continue;
    if (!index.includes(page.title) && !index.includes(page.path)) {
      warnings.push(`${page.path}: missing from wiki/index.md`);
    }
  }
}

async function validateWikiLinks(rootDir: string, files: string[], titleByFile: Map<string, string>, warnings: string[]) {
  const knownTitles = new Set([...titleByFile.values()]);
  for (const file of files) {
    const markdown = await readWorkspaceFile(rootDir, file).catch(() => "");
    for (const match of markdown.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const target = (match[1] ?? "").split("|")[0]?.trim() ?? "";
      if (target && !knownTitles.has(target)) {
        warnings.push(`${file}: unresolved wiki link [[${target}]]`);
      }
    }
  }
}
```

- [ ] **Step 4: Add CLI wrappers**

Create `scripts/wiki/lint.ts`:

```ts
import { lintWiki } from "@/lib/wiki/lint";

const result = await lintWiki();

for (const warning of result.warnings) {
  console.warn(`WARN ${warning}`);
}

for (const error of result.errors) {
  console.error(`ERROR ${error}`);
}

if (result.errors.length > 0) {
  process.exit(1);
}
```

Create `scripts/wiki/manifest.ts`:

```ts
import { buildWikiManifest, writeWikiManifest } from "@/lib/wiki/manifest";

const manifest = await buildWikiManifest();
await writeWikiManifest(process.cwd(), manifest);
console.log(`wrote wiki/manifest.json with ${manifest.pages.length} pages`);
```

- [ ] **Step 5: Run lint tests**

Run: `pnpm exec vitest run tests/wiki/lint.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/wiki/lint.ts scripts/wiki/lint.ts scripts/wiki/manifest.ts tests/wiki/lint.test.ts
git commit -m "feat: add wiki lint and manifest commands"
```

## Task 4: Seed Wiki Content And Agent Rules

**Files:**
- Create: `raw/sources/llm-wiki.md`
- Create: `wiki/sources/llm-wiki.md`
- Create: `wiki/concepts/llm-wiki.md`
- Create: `wiki/concepts/persistent-wiki.md`
- Create: `wiki/workflows/wiki-first-lookup.md`
- Create: `wiki/workflows/source-ingest.md`
- Create: `wiki/workflows/wiki-lint.md`
- Create: `wiki/decisions/hybrid-markdown-first.md`
- Create: `wiki/index.md`
- Create: `wiki/log.md`
- Create: `wiki/schema.md`
- Create: `wiki/manifest.json`
- Create: `AGENTS.md`

- [ ] **Step 1: Copy the raw source**

Run: `cp llm-wiki.md raw/sources/llm-wiki.md` after creating `raw/sources/`.

Expected: `raw/sources/llm-wiki.md` exists and root `llm-wiki.md` remains untouched.

- [ ] **Step 2: Create wiki seed pages**

Create the listed wiki markdown files with required frontmatter. Use these exact IDs and titles so lint and search can resolve links:

```text
source-llm-wiki | LLM Wiki Source | source
concept-llm-wiki | LLM Wiki | concept
concept-persistent-wiki | Persistent Wiki | concept
workflow-wiki-first-lookup | Wiki-First Lookup | workflow
workflow-source-ingest | Source Ingest | workflow
workflow-wiki-lint | Wiki Lint | workflow
decision-hybrid-markdown-first | Hybrid Markdown-First Wiki | decision
index-main | Wiki Index | index
log-main | Wiki Log | log
schema-main | Wiki Schema | concept
```

Every page must include `created: 2026-04-27`, `updated: 2026-04-27`, an accurate `source_count`, tags, and Obsidian links only to pages in this list.

- [ ] **Step 3: Add AGENTS.md rule**

Create `AGENTS.md`:

````md
# Repository Agent Rules

## Wiki-First Lookup

Before using broad `rg` to find project knowledge, read `wiki/index.md` or run:

```bash
pnpm wiki:find "<topic>"
```

Read matching wiki pages first. Use `rg` only when the wiki result is missing, stale, too broad, or explicitly points to raw source or code verification.

When durable knowledge is discovered, update the relevant wiki page, `wiki/index.md`, `wiki/manifest.json`, and `wiki/log.md` when appropriate.

Do not modify files under `raw/sources/` as part of wiki maintenance. Treat them as immutable source evidence.
````

- [ ] **Step 4: Generate manifest**

Run: `pnpm wiki:manifest`

Expected: Prints `wrote wiki/manifest.json with 10 pages`.

- [ ] **Step 5: Verify seed lookup and lint**

Run:

```bash
pnpm wiki:find "llm wiki"
pnpm wiki:find "unknown"
pnpm wiki:log 2
pnpm wiki:lint
```

Expected:

```text
wiki/concepts/llm-wiki.md | LLM Wiki | concept | active
Persistent LLM-maintained markdown wiki pattern.
```

Unknown query expected:

```text
wiki miss, use rg next
```

Lint expected: exits 0 with no `ERROR` lines.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md raw wiki
git commit -m "feat: seed llm wiki"
```

## Task 5: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused wiki tests**

Run: `pnpm exec vitest run tests/wiki/manifest.test.ts tests/wiki/search.test.ts tests/wiki/lint.test.ts`

Expected: PASS.

- [ ] **Step 2: Run all unit tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run wiki commands**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:find "llm wiki"
pnpm wiki:find "unknown"
pnpm wiki:log 5
```

Expected: manifest rewrites cleanly, lint exits 0, known query returns `wiki/concepts/llm-wiki.md`, unknown query prints `wiki miss, use rg next`, and log prints recent entries.

- [ ] **Step 4: Check working tree**

Run: `git status --short`

Expected: only intentionally untracked root source/reference files remain, such as root `llm-wiki.md`, `prd.md`, and `obsidian-analysis-report.md`, unless the user asks to track them.

- [ ] **Step 5: Commit verification fixes if needed**

If verification required code or content fixes, commit them:

```bash
git add docs/superpowers/plans/2026-04-27-llm-wiki-system.md lib/wiki scripts/wiki tests/wiki package.json AGENTS.md raw wiki
git commit -m "fix: stabilize wiki tooling"
```

If no fixes were needed, do not create an empty commit.

## Spec Coverage Review

- Directory structure: Task 4 creates `raw/` and `wiki/` structure.
- Agent lookup rule: Task 4 creates `AGENTS.md`.
- Page schema: Task 1 parser enforces required fields, Task 4 seed pages use the schema.
- Manifest: Task 1 builds/writes manifest, Task 3 exposes `pnpm wiki:manifest`, Task 4 generates seed manifest.
- CLI commands: Task 2 and Task 3 create all four scripts and package scripts.
- Seed content: Task 4 creates the approved seed pages from `llm-wiki.md`.
- Lint behavior: Task 3 implements hard errors and warnings.
- Tests: Tasks 1, 2, 3, and 5 cover manifest, find, miss, lint failure, lint success, and no PostgreSQL dependency.

No spec requirements are intentionally omitted.
