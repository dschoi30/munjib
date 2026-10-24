import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";
import { slugifyTitle } from "@/lib/text/slug";
import { parseWikiLinks } from "@/lib/wiki-links/parser";
import { createWikiLinkTargetResolver } from "@/lib/wiki-links/resolve";

export type KnowledgeGraphNodeKind = "document" | "tag" | "wiki";
export type KnowledgeGraphLinkKind = "wiki" | "tag";

export type KnowledgeGraphDocumentInput = {
  contentMarkdown?: string;
  id: string;
  title: string;
  path: string;
};

export type KnowledgeGraphLinkInput = {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string | null;
  targetTitleRaw: string;
  isBroken: boolean;
  isAmbiguous: boolean;
};

export type KnowledgeGraphTagInput = {
  documentId: string;
  tag: {
    name: string;
    normalizedName: string;
  };
};

export type KnowledgeGraphInput = {
  documents: KnowledgeGraphDocumentInput[];
  links: KnowledgeGraphLinkInput[];
  tags: KnowledgeGraphTagInput[];
};

export type KnowledgeGraphDocumentNode = Omit<KnowledgeGraphDocumentInput, "contentMarkdown" | "id"> & {
  id: string;
  kind: "document";
  label: string;
  documentId: string;
};

export type KnowledgeGraphTagNode = {
  id: string;
  kind: "tag";
  label: string;
  name: string;
  normalizedName: string;
};

export type KnowledgeGraphWikiNode = {
  id: string;
  kind: "wiki";
  label: string;
  targetTitleRaw: string;
  state: "broken" | "ambiguous";
};

export type KnowledgeGraphNode =
  | KnowledgeGraphDocumentNode
  | KnowledgeGraphTagNode
  | KnowledgeGraphWikiNode;

export type KnowledgeGraphLink = {
  id: string;
  source: string;
  target: string;
  kind: KnowledgeGraphLinkKind;
};

export type KnowledgeGraphData = {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
};

export type KnowledgeGraphFilters = {
  orphans: boolean;
  tag: boolean;
};

export type KnowledgeGraphFocus = {
  focusedNodeIds: Set<string>;
  focusedLinkIds: Set<string>;
};

export function documentNodeId(documentId: string) {
  return `document:${documentId}`;
}

export function buildKnowledgeGraph(input: KnowledgeGraphInput): KnowledgeGraphData {
  const nodesById = new Map<string, KnowledgeGraphNode>();
  const links: KnowledgeGraphLink[] = [];
  const readableDocumentIds = new Set(input.documents.map((document) => document.id));
  const resolveTarget = createWikiLinkTargetResolver(input.documents.map((document) => ({
    id: document.id,
    path: document.path,
    title: document.title,
  })));
  const wikiLinksByKey = new Map<string, KnowledgeGraphLink>();
  const unresolvedWikiNodesById = new Map<string, KnowledgeGraphWikiNode>();

  for (const document of input.documents) {
    nodesById.set(documentNodeId(document.id), {
      id: documentNodeId(document.id),
      kind: "document",
      label: document.title,
      documentId: document.id,
      title: document.title,
      path: document.path,
    });
  }

  const addWikiEdge = (link: {
    edgeId: string;
    sourceDocumentId: string;
    targetDocumentId: string | null;
    targetTitleRaw: string;
    isBroken: boolean;
    isAmbiguous: boolean;
  }) => {
    if (!readableDocumentIds.has(link.sourceDocumentId)) {
      return;
    }

    const source = documentNodeId(link.sourceDocumentId);
    let target: string;

    if (link.targetDocumentId && readableDocumentIds.has(link.targetDocumentId)) {
      target = documentNodeId(link.targetDocumentId);
    } else {
      const state = link.isAmbiguous ? "ambiguous" : "broken";
      target = wikiNodeId(state, link.targetTitleRaw);
      unresolvedWikiNodesById.set(target, {
        id: target,
        kind: "wiki",
        label: link.targetTitleRaw,
        targetTitleRaw: link.targetTitleRaw,
        state,
      });
    }

    const key = `${source}->${target}`;
    if (!wikiLinksByKey.has(key)) {
      wikiLinksByKey.set(key, {
        id: link.edgeId,
        source,
        target,
        kind: "wiki",
      });
    }
  };

  for (const link of input.links) {
    addWikiEdge({ ...link, edgeId: `wiki:${link.id}` });
  }

  for (const document of input.documents) {
    const scannableMarkdown = stripDocumentFrontmatter(document.contentMarkdown ?? "");
    if (!scannableMarkdown.includes("[[")) {
      continue;
    }

    for (const link of parseWikiLinks(scannableMarkdown)) {
      const resolved = resolveTarget(link.targetTitleRaw);
      const syntheticTargetId = resolved.targetDocumentId
        ? documentNodeId(resolved.targetDocumentId)
        : wikiNodeId(resolved.isAmbiguous ? "ambiguous" : "broken", link.targetTitleRaw);
      addWikiEdge({
        edgeId: `wiki:${document.id}:${syntheticTargetId}`,
        sourceDocumentId: document.id,
        targetDocumentId: resolved.targetDocumentId,
        targetTitleRaw: link.targetTitleRaw,
        isBroken: resolved.isBroken,
        isAmbiguous: resolved.isAmbiguous,
      });
    }
  }

  for (const node of unresolvedWikiNodesById.values()) {
    addNode(nodesById, node);
  }
  links.push(...wikiLinksByKey.values());

  for (const tag of input.tags) {
    if (!readableDocumentIds.has(tag.documentId)) {
      continue;
    }

    const target = tagNodeId(tag.tag.normalizedName);
    addNode(nodesById, {
      id: target,
      kind: "tag",
      label: `#${tag.tag.name}`,
      name: tag.tag.name,
      normalizedName: tag.tag.normalizedName,
    });
    links.push({
      id: `tag:${tag.documentId}:${tag.tag.normalizedName}`,
      source: documentNodeId(tag.documentId),
      target,
      kind: "tag",
    });
  }

  return {
    nodes: Array.from(nodesById.values()).sort(compareNodes),
    links: links.sort(compareLinks),
  };
}

export function getKnowledgeGraphFocus(
  graph: KnowledgeGraphData,
  selectedDocumentId: string | null | undefined,
): KnowledgeGraphFocus {
  const focusedNodeIds = new Set<string>();
  const focusedLinkIds = new Set<string>();

  if (!selectedDocumentId) {
    return { focusedNodeIds, focusedLinkIds };
  }

  const selectedNodeId = documentNodeId(selectedDocumentId);
  focusedNodeIds.add(selectedNodeId);

  for (const link of graph.links) {
    if (link.source !== selectedNodeId && link.target !== selectedNodeId) {
      continue;
    }

    focusedLinkIds.add(link.id);
    focusedNodeIds.add(link.source);
    focusedNodeIds.add(link.target);
  }

  return { focusedNodeIds, focusedLinkIds };
}

export function filterKnowledgeGraph(
  graph: KnowledgeGraphData,
  filters: KnowledgeGraphFilters,
): KnowledgeGraphData {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const links = graph.links.filter((link) => {
    const sourceNode = nodesById.get(link.source);
    const targetNode = nodesById.get(link.target);
    if (!sourceNode || !targetNode) {
      return false;
    }

    if (link.kind === "tag") {
      return filters.tag;
    }

    if (link.kind !== "wiki") {
      return false;
    }

    return sourceNode.kind === "document" && targetNode.kind === "document";
  });
  const connectedNodeIds = new Set<string>();

  for (const link of links) {
    connectedNodeIds.add(link.source);
    connectedNodeIds.add(link.target);
  }

  return {
    nodes: graph.nodes.filter((node) => {
      if (node.kind !== "document") {
        return connectedNodeIds.has(node.id);
      }

      return filters.orphans || connectedNodeIds.has(node.id);
    }),
    links,
  };
}

function addNode(nodesById: Map<string, KnowledgeGraphNode>, node: KnowledgeGraphNode) {
  if (!nodesById.has(node.id)) {
    nodesById.set(node.id, node);
  }
}

function tagNodeId(normalizedName: string) {
  return `tag:${normalizedName}`;
}

function wikiNodeId(state: "broken" | "ambiguous", targetTitleRaw: string) {
  return `wiki:${state}:${idComponent(targetTitleRaw)}`;
}

function idComponent(value: string) {
  const slug = slugifyTitle(value);
  const normalizedAsciiValue = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug !== "untitled" && slug === normalizedAsciiValue) {
    return slug;
  }

  return `raw:${encodeURIComponent(value)}`;
}

function compareNodes(a: KnowledgeGraphNode, b: KnowledgeGraphNode) {
  return a.id.localeCompare(b.id);
}

function compareLinks(a: KnowledgeGraphLink, b: KnowledgeGraphLink) {
  return (
    a.id.localeCompare(b.id) ||
    a.source.localeCompare(b.source) ||
    a.target.localeCompare(b.target) ||
    a.kind.localeCompare(b.kind)
  );
}
