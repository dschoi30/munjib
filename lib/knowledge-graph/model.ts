import { slugifyTitle } from "@/lib/text/slug";

export type KnowledgeGraphNodeKind = "document" | "tag" | "wiki" | "property";
export type KnowledgeGraphLinkKind = "wiki" | "tag" | "property";

export type KnowledgeGraphDocumentInput = {
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

export type KnowledgeGraphPropertyInput = {
  documentId: string;
  key: string;
  valueJson: unknown;
  valueType: string;
};

export type KnowledgeGraphInput = {
  documents: KnowledgeGraphDocumentInput[];
  links: KnowledgeGraphLinkInput[];
  tags: KnowledgeGraphTagInput[];
  properties: KnowledgeGraphPropertyInput[];
};

export type KnowledgeGraphDocumentNode = KnowledgeGraphDocumentInput & {
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

export type KnowledgeGraphPropertyNode = {
  id: string;
  kind: "property";
  label: string;
  key: string;
  value: string | number | boolean;
  valueType: string;
};

export type KnowledgeGraphNode =
  | KnowledgeGraphDocumentNode
  | KnowledgeGraphTagNode
  | KnowledgeGraphWikiNode
  | KnowledgeGraphPropertyNode;

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

export type KnowledgeGraphFilters = Record<KnowledgeGraphLinkKind, boolean>;

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

  for (const document of input.documents) {
    nodesById.set(documentNodeId(document.id), {
      ...document,
      id: documentNodeId(document.id),
      kind: "document",
      label: document.title,
      documentId: document.id,
    });
  }

  for (const link of input.links) {
    if (!readableDocumentIds.has(link.sourceDocumentId)) {
      continue;
    }

    const source = documentNodeId(link.sourceDocumentId);

    if (link.targetDocumentId && readableDocumentIds.has(link.targetDocumentId)) {
      links.push({
        id: `wiki:${link.id}`,
        source,
        target: documentNodeId(link.targetDocumentId),
        kind: "wiki",
      });
      continue;
    }

    const state = link.isAmbiguous ? "ambiguous" : "broken";
    const target = wikiNodeId(state, link.targetTitleRaw);
    addNode(nodesById, {
      id: target,
      kind: "wiki",
      label: link.targetTitleRaw,
      targetTitleRaw: link.targetTitleRaw,
      state,
    });
    links.push({
      id: `wiki:${link.id}`,
      source,
      target,
      kind: "wiki",
    });
  }

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

  for (const property of input.properties) {
    if (!readableDocumentIds.has(property.documentId) || isCanonicalPropertyKey(property.key)) {
      continue;
    }

    const value = scalarPropertyValue(property.valueJson);
    if (value === null) {
      continue;
    }

    const target = propertyNodeId(property.key, value);
    addNode(nodesById, {
      id: target,
      kind: "property",
      label: `${property.key}: ${value}`,
      key: property.key,
      value,
      valueType: property.valueType,
    });
    links.push({
      id: `property:${property.documentId}:${slugifyTitle(property.key)}:${slugifyTitle(String(value))}`,
      source: documentNodeId(property.documentId),
      target,
      kind: "property",
    });
  }

  return {
    nodes: Array.from(nodesById.values()),
    links,
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
  const links = graph.links.filter((link) => filters[link.kind]);
  const connectedNodeIds = new Set<string>();

  for (const link of links) {
    connectedNodeIds.add(link.source);
    connectedNodeIds.add(link.target);
  }

  return {
    nodes: graph.nodes.filter((node) => node.kind === "document" || connectedNodeIds.has(node.id)),
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
  return `wiki:${state}:${slugifyTitle(targetTitleRaw)}`;
}

function propertyNodeId(key: string, value: string | number | boolean) {
  return `property:${slugifyTitle(key)}:${slugifyTitle(String(value))}`;
}

function isCanonicalPropertyKey(key: string) {
  return key === "tags" || key === "links";
}

function scalarPropertyValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return null;
}
