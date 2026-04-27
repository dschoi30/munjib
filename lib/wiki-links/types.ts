export type LinkedDocumentSummary = {
  id: string;
  title: string;
  slug: string;
};

export type OutgoingWikiLink = {
  id: string;
  targetTitleRaw: string;
  alias: string | null;
  isBroken: boolean;
  targetDocument: LinkedDocumentSummary | null;
};

export type BacklinkSummary = {
  id: string;
  sourceDocument: LinkedDocumentSummary;
};

export type BrokenWikiLink = {
  id: string;
  targetTitleRaw: string;
  alias: string | null;
};

export type DocumentLinkPanels = {
  outgoing: OutgoingWikiLink[];
  backlinks: BacklinkSummary[];
  brokenLinks: BrokenWikiLink[];
};
