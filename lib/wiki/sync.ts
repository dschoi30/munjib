import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildWikiManifest } from "./manifest";
import type { WikiManifestPage } from "./types";

const execFileAsync = promisify(execFile);

const SOURCE_DIFF_FILTER = "--diff-filter=ACMRD";
const WIKI_PATHS = ["wiki/", "AGENTS.md"];
const IGNORED_PATHS = [".next/", ".worktrees/", "node_modules/", "coverage/", "test-results/", "playwright-report/"];

export type WikiSyncMode = "working-tree" | "staged" | "since";

export type WikiSyncOptions = {
  rootDir?: string;
  mode?: WikiSyncMode;
  since?: string;
};

export type WikiSyncPlan = {
  changedFiles: string[];
  sourceFiles: string[];
  wikiFiles: string[];
  candidatePages: WikiManifestPage[];
  required: boolean;
  wikiTouched: boolean;
  message: string;
};

export async function buildWikiSyncPlan(options: WikiSyncOptions = {}): Promise<WikiSyncPlan> {
  const rootDir = options.rootDir ?? process.cwd();
  const changedFiles = await listChangedFiles(rootDir, options);
  const sourceFiles = changedFiles.filter((file) => shouldConsiderSourceFile(file));
  const wikiFiles = changedFiles.filter((file) => isWikiMaintenanceFile(file));
  const manifest = await buildWikiManifest(rootDir);
  const candidatePages = selectCandidatePages(sourceFiles, manifest.pages);
  const required = sourceFiles.length > 0;
  const wikiTouched = wikiFiles.length > 0;

  return {
    changedFiles,
    sourceFiles,
    wikiFiles,
    candidatePages,
    required,
    wikiTouched,
    message: syncMessage({ required, wikiTouched, candidatePages }),
  };
}

export function renderWikiSyncPlan(plan: WikiSyncPlan): string {
  const lines = [
    "# Wiki Sync Plan",
    "",
    plan.message,
    "",
    "## Changed source files",
    ...renderList(plan.sourceFiles),
    "",
    "## Wiki maintenance files already changed",
    ...renderList(plan.wikiFiles),
    "",
    "## Candidate wiki pages to review",
    ...renderCandidatePages(plan.candidatePages),
    "",
    "## Required workflow",
    "",
    "1. Read the candidate wiki pages before broad source search.",
    "2. Update affected wiki pages with durable project knowledge from the changed files.",
    "3. Update `wiki/index.md` and `wiki/log.md` when the navigation or timeline changed.",
    "4. Run `pnpm wiki:manifest` and `pnpm wiki:lint` before committing.",
  ];

  return `${lines.join("\n")}\n`;
}

export async function checkWikiSync(options: WikiSyncOptions = {}): Promise<WikiSyncPlan> {
  const plan = await buildWikiSyncPlan(options);
  if (plan.required && !plan.wikiTouched) {
    throw new WikiSyncRequiredError(plan);
  }
  return plan;
}

export class WikiSyncRequiredError extends Error {
  constructor(readonly plan: WikiSyncPlan) {
    super(plan.message);
    this.name = "WikiSyncRequiredError";
  }
}

export async function listChangedFiles(rootDir: string, options: WikiSyncOptions = {}): Promise<string[]> {
  const mode = options.mode ?? "working-tree";
  if (mode === "staged") {
    return gitChangedFiles(rootDir, ["diff", "--cached", "--name-only", SOURCE_DIFF_FILTER]);
  }
  if (mode === "since") {
    const since = options.since ?? "HEAD~1";
    return gitChangedFiles(rootDir, ["diff", "--name-only", SOURCE_DIFF_FILTER, `${since}..HEAD`]);
  }

  const staged = await gitChangedFiles(rootDir, ["diff", "--cached", "--name-only", SOURCE_DIFF_FILTER]);
  const unstaged = await gitChangedFiles(rootDir, ["diff", "--name-only", SOURCE_DIFF_FILTER]);
  const untracked = await gitChangedFiles(rootDir, ["ls-files", "--others", "--exclude-standard"]);
  return uniqueSorted([...staged, ...unstaged, ...untracked]);
}

export function selectCandidatePages(sourceFiles: string[], pages: WikiManifestPage[]): WikiManifestPage[] {
  const scored = new Map<string, { page: WikiManifestPage; score: number }>();

  for (const file of sourceFiles) {
    for (const rule of PAGE_RULES) {
      if (!rule.matches(file)) continue;
      for (const title of rule.titles) {
        const page = pages.find((candidate) => candidate.title === title);
        if (!page) continue;
        const existing = scored.get(page.path);
        scored.set(page.path, { page, score: (existing?.score ?? 0) + rule.weight });
      }
    }
  }

  if (scored.size === 0 && sourceFiles.length > 0) {
    addFallbackPage(scored, pages, "Wiki Index", 1);
    addFallbackPage(scored, pages, "Project PRD", 1);
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path))
    .map((entry) => entry.page);
}

function addFallbackPage(
  scored: Map<string, { page: WikiManifestPage; score: number }>,
  pages: WikiManifestPage[],
  title: string,
  score: number,
) {
  const page = pages.find((candidate) => candidate.title === title);
  if (page) scored.set(page.path, { page, score });
}

function syncMessage(plan: Pick<WikiSyncPlan, "required" | "wikiTouched" | "candidatePages">): string {
  if (!plan.required) return "No source changes were detected; wiki sync is not required.";
  if (plan.wikiTouched) return "Source changes and wiki maintenance changes were both detected.";
  const targets = plan.candidatePages.map((page) => page.title).join(", ") || "wiki/index.md";
  return `Source changes were detected without wiki maintenance changes. Review and update: ${targets}.`;
}

function renderList(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- \`${item}\``) : ["- None"];
}

function renderCandidatePages(pages: WikiManifestPage[]): string[] {
  if (pages.length === 0) return ["- None"];
  return pages.map((page) => `- [[${page.title}]] - \`${page.path}\`: ${page.summary}`);
}

function shouldConsiderSourceFile(file: string): boolean {
  if (isIgnored(file)) return false;
  if (isWikiMaintenanceFile(file)) return false;
  if (file.startsWith("raw/sources/")) return false;
  return CODE_OR_DOC_EXTENSIONS.some((extension) => file.endsWith(extension)) || ROOT_KNOWLEDGE_FILES.has(file);
}

function isWikiMaintenanceFile(file: string): boolean {
  return WIKI_PATHS.some((prefix) => file === prefix.replace(/\/$/, "") || file.startsWith(prefix));
}

function isIgnored(file: string): boolean {
  return IGNORED_PATHS.some((prefix) => file.startsWith(prefix));
}

async function gitChangedFiles(rootDir: string, args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: rootDir });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueSorted(files: string[]): string[] {
  return [...new Set(files)].sort();
}

type PageRule = {
  titles: string[];
  weight: number;
  matches: (file: string) => boolean;
};

const CODE_OR_DOC_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".sql",
  ".prisma",
  ".yml",
  ".yaml",
];

const ROOT_KNOWLEDGE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "next.config.ts",
  "prisma/schema.prisma",
  "prd.md",
  "llm-wiki.md",
]);

const PAGE_RULES: PageRule[] = [
  {
    titles: ["Wiki Schema", "Local Development Workflow"],
    weight: 10,
    matches: (file) => file.startsWith("lib/wiki/") || file.startsWith("scripts/wiki/") || file === "llm-wiki.md",
  },
  {
    titles: ["Wiki Links And Backlinks", "Document Editing Workflow"],
    weight: 10,
    matches: (file) => file.startsWith("lib/wiki-links/") || file.startsWith("tests/wiki-links/"),
  },
  {
    titles: ["Document Editing Workflow", "Document Knowledge Model"],
    weight: 8,
    matches: (file) =>
      file.startsWith("lib/documents/") ||
      file.startsWith("components/document-") ||
      file.startsWith("app/workspaces/"),
  },
  {
    titles: ["Auth And Permissions Workflow", "Document Knowledge Model"],
    weight: 8,
    matches: (file) =>
      file.includes("auth") ||
      file.startsWith("lib/permissions/") ||
      file.startsWith("tests/permissions/") ||
      file === "middleware.ts",
  },
  {
    titles: ["Local Development Workflow"],
    weight: 8,
    matches: (file) =>
      file === "package.json" ||
      file === "pnpm-lock.yaml" ||
      file === "next.config.ts" ||
      file.startsWith(".github/") ||
      file.startsWith("tests/e2e/") ||
      file.startsWith("prisma/"),
  },
  {
    titles: ["Document Knowledge Model", "Next.js Prisma Monolith"],
    weight: 8,
    matches: (file) => file === "prisma/schema.prisma" || file.startsWith("lib/attachments/"),
  },
  {
    titles: ["Project PRD", "Munjib"],
    weight: 6,
    matches: (file) => file === "prd.md" || file.startsWith("docs/"),
  },
  {
    titles: ["Wiki Index"],
    weight: 2,
    matches: (file) => file.endsWith(".md") || file.startsWith("components/") || file.startsWith("app/"),
  },
];
