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
