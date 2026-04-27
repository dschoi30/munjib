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
