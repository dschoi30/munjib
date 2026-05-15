"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  filterKnowledgeGraph,
  getKnowledgeGraphFocus,
  type KnowledgeGraphData,
  type KnowledgeGraphFilters,
  type KnowledgeGraphLink,
  type KnowledgeGraphLinkKind,
  type KnowledgeGraphNode,
} from "@/lib/knowledge-graph/model";
import { cn } from "@/lib/utils";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

type ForceGraph2DProps = Record<string, unknown>;
type ForceGraphNode = KnowledgeGraphNode & {
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
  x?: number;
  y?: number;
};
type ForceGraphLink = Omit<KnowledgeGraphLink, "source" | "target"> & {
  source: ForceGraphNode | string;
  sourceId: string;
  target: ForceGraphNode | string;
  targetId: string;
};
type ForceGraphData = {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
};
type ForceGraphForce = {
  distance?: (value: number) => unknown;
  strength?: (value: number) => unknown;
};
type ForceGraphApi = {
  d3Force?: (name: string, force?: CenterGravityForce | null) => ForceGraphForce | ForceGraphApi | undefined;
  d3ReheatSimulation?: () => void;
  resumeAnimation?: () => void;
};
type CenterGravityForce = {
  (alpha: number): void;
  initialize: (nodes: ForceGraphNode[]) => void;
};
type GraphDisplaySettings = {
  arrows: boolean;
  linkThickness: number;
  nodeSize: number;
  textFadeThreshold: number;
};
type GraphForceSettings = {
  center: number;
  link: number;
  linkDistance: number;
  repel: number;
};

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as ComponentType<ForceGraph2DProps>;

const DEFAULT_FILTERS: KnowledgeGraphFilters = {
  wiki: true,
  tag: true,
  property: true,
};

const NODE_COLORS: Record<KnowledgeGraphNode["kind"], string> = {
  document: "#64748b",
  wiki: "#8b5cf6",
  tag: "#f59e0b",
  property: "#38bdf8",
};

const SELECTED_DOCUMENT_COLOR = "#a78bfa";
const DIMMED_NODE_ALPHA = "88";
const DIMMED_LINK_ALPHA = "44";
const LINK_COLOR = "#94a3b8";
const FOCUSED_LINK_COLOR = "#64748b";

const DEFAULT_DISPLAY_SETTINGS: GraphDisplaySettings = {
  arrows: false,
  linkThickness: 1,
  nodeSize: 5,
  textFadeThreshold: 1,
};

const DEFAULT_FORCE_SETTINGS: GraphForceSettings = {
  center: 0.3,
  link: 0.4,
  linkDistance: 80,
  repel: -120,
};

const FILTER_OPTIONS: Array<{
  key: KnowledgeGraphLinkKind;
  label: string;
}> = [
  { key: "wiki", label: "Wiki links" },
  { key: "tag", label: "Tags" },
  { key: "property", label: "Properties" },
];

export function KnowledgeGraphView({
  workspaceSlug,
  graph,
  selectedDocumentId,
}: {
  workspaceSlug: string;
  graph: KnowledgeGraphData;
  selectedDocumentId: string | null;
}) {
  const router = useRouter();
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const forceGraphRef = useRef<ForceGraphApi | null>(null);
  const renderedNodesRef = useRef(new Map<string, ForceGraphNode>());
  const renderedLinksRef = useRef(new Map<string, ForceGraphLink>());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [displayOpen, setDisplayOpen] = useState(true);
  const [forcesOpen, setForcesOpen] = useState(true);
  const [filters, setFilters] = useState<KnowledgeGraphFilters>(DEFAULT_FILTERS);
  const [display, setDisplay] = useState<GraphDisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [forces, setForces] = useState<GraphForceSettings>(DEFAULT_FORCE_SETTINGS);
  const [forceGraphReadyVersion, setForceGraphReadyVersion] = useState(0);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const nodeColorsRgb = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(NODE_COLORS).map(([kind, color]) => [kind, hexToRgb(color)]),
      ) as Record<KnowledgeGraphNode["kind"], { b: number; g: number; r: number }>,
    [],
  );

  const selectedFocus = useMemo(
    () => getKnowledgeGraphFocus(graph, selectedDocumentId),
    [graph, selectedDocumentId],
  );
  const hoveredFocus = useMemo(
    () => getKnowledgeGraphNodeFocus(graph, hoveredNodeId),
    [graph, hoveredNodeId],
  );
  const activeFocus = hoveredFocus.focusedNodeIds.size > 0 ? hoveredFocus : selectedFocus;
  const visibleGraph = useMemo(() => filterKnowledgeGraph(graph, filters), [filters, graph]);
  const renderedGraph = useMemo<ForceGraphData>(() => {
    const nodes = visibleGraph.nodes.map((node) => {
      const existing = renderedNodesRef.current.get(node.id);

      if (existing) {
        Object.assign(existing, node);
        return existing;
      }

      const created = { ...node };
      renderedNodesRef.current.set(node.id, created);
      return created;
    });

    const links = visibleGraph.links.map((link) => {
      const existing = renderedLinksRef.current.get(link.id);

      if (existing) {
        const endpointsChanged =
          existing.sourceId !== link.source || existing.targetId !== link.target;

        existing.kind = link.kind;
        existing.sourceId = link.source;
        existing.targetId = link.target;

        if (endpointsChanged) {
          existing.source = link.source;
          existing.target = link.target;
        }

        return existing;
      }

      const created: ForceGraphLink = {
        ...link,
        sourceId: link.source,
        targetId: link.target,
      };
      renderedLinksRef.current.set(link.id, created);
      return created;
    });

    return { nodes, links };
  }, [visibleGraph]);
  const hasFocus = activeFocus.focusedNodeIds.size > 0;

  useEffect(() => {
    const element = graphContainerRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      setDimensions({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          measure();
          return;
        }

        setDimensions({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      });
      observer.observe(element);

      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const setForceGraphApi = useCallback((api: ForceGraphApi | null) => {
    if (forceGraphRef.current === api) {
      return;
    }

    forceGraphRef.current = api;
    setForceGraphReadyVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const graphApi = forceGraphRef.current;
    if (!graphApi?.d3Force) {
      return;
    }

    graphApi.d3Force("munjib-center", createCenterGravityForce(forces.center));
    (graphApi.d3Force("charge") as ForceGraphForce | undefined)?.strength?.(forces.repel);
    (graphApi.d3Force("link") as ForceGraphForce | undefined)?.strength?.(forces.link);
    (graphApi.d3Force("link") as ForceGraphForce | undefined)?.distance?.(forces.linkDistance);
    graphApi.d3ReheatSimulation?.();
  }, [forceGraphReadyVersion, forces]);

  useEffect(() => {
    forceGraphRef.current?.resumeAnimation?.();
  }, [display]);

  const toggleFilter = useCallback((key: KnowledgeGraphLinkKind) => {
    setFilters((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const updateDisplay = useCallback(<Key extends keyof GraphDisplaySettings>(
    key: Key,
    value: GraphDisplaySettings[Key],
  ) => {
    setDisplay((current) => ({ ...current, [key]: value }));
  }, []);

  const updateForce = useCallback(<Key extends keyof GraphForceSettings>(
    key: Key,
    value: GraphForceSettings[Key],
  ) => {
    setForces((current) => ({ ...current, [key]: value }));
  }, []);

  const routeDocumentNode = useCallback(
    (node: ForceGraphNode) => {
      if (node.kind !== "document") {
        return;
      }

      router.push(workspaceDocumentHref({ workspaceSlug, documentId: node.documentId }));
    },
    [router, workspaceSlug],
  );

  if (graph.nodes.length === 0) {
    return (
      <section
        data-testid="knowledge-graph-view"
        className="flex h-full min-h-0 items-center justify-center bg-white text-sm text-slate-500"
      >
        No graph data available.
      </section>
    );
  }

  return (
    <section
      data-testid="knowledge-graph-view"
      className="relative h-full min-h-0 overflow-hidden bg-white text-slate-900"
    >
      <div ref={graphContainerRef} className="absolute inset-0 h-full min-h-0 w-full">
        <ForceGraph2D
          ref={setForceGraphApi}
          graphData={renderedGraph}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#ffffff"
          nodeLabel={(node: ForceGraphNode) => node.label}
          nodeRelSize={display.nodeSize}
          nodeColor={(node: ForceGraphNode) => {
            if (
              node.kind === "document" &&
              node.documentId === selectedDocumentId &&
              (!hoveredNodeId || activeFocus.focusedNodeIds.has(node.id))
            ) {
              return SELECTED_DOCUMENT_COLOR;
            }

            const color = NODE_COLORS[node.kind];
            return hasFocus && !activeFocus.focusedNodeIds.has(node.id)
              ? `${color}${DIMMED_NODE_ALPHA}`
              : color;
          }}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(
            node: ForceGraphNode,
            context: CanvasRenderingContext2D,
            globalScale: number,
          ) => {
            if (typeof node.x !== "number" || typeof node.y !== "number") {
              return;
            }

            const label = node.label;
            const fontSize = 12 / globalScale;
            const alpha = globalScale / display.textFadeThreshold;
            if (alpha < 0.1) {
              return;
            }

            const rgb = nodeColorsRgb[node.kind];

            context.font = `${fontSize}px sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, alpha).toFixed(2)})`;
            context.fillText(label, node.x, node.y);
          }}
          linkColor={(link: ForceGraphLink) => {
            if (!hasFocus) {
              return LINK_COLOR;
            }

            return activeFocus.focusedLinkIds.has(link.id)
              ? FOCUSED_LINK_COLOR
              : `${LINK_COLOR}${DIMMED_LINK_ALPHA}`;
          }}
          linkWidth={(link: ForceGraphLink) =>
            activeFocus.focusedLinkIds.has(link.id)
              ? display.linkThickness + 1.5
              : display.linkThickness
          }
          linkDirectionalArrowLength={display.arrows ? 4 : 0}
          linkDirectionalArrowRelPos={1}
          onNodeClick={routeDocumentNode}
          onNodeHover={(node: ForceGraphNode | null) => setHoveredNodeId(node?.id ?? null)}
          enableNodeDrag
          cooldownTicks={80}
        />
      </div>

      <div className="pointer-events-none absolute left-4 top-4 w-56">
        <div className="pointer-events-auto rounded-md border border-zinc-800 bg-zinc-900/95 p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Filters</h2>
            <Button
              type="button"
              className="h-7 bg-zinc-800 px-2 text-xs text-zinc-100 hover:bg-zinc-700"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              {filtersOpen ? "Close filters" : "Open filters"}
            </Button>
          </div>

          {filtersOpen ? (
            <div className="mt-3 space-y-2">
              {FILTER_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className={cn(
                    "flex items-center gap-2 text-sm text-zinc-300",
                    "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-violet-500"
                    checked={filters[option.key]}
                    onChange={() => toggleFilter(option.key)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          ) : null}

          <GraphControlSection
            title="Display"
            open={displayOpen}
            onToggle={() => setDisplayOpen((current) => !current)}
          >
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
              <span>Arrows</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-violet-500"
                checked={display.arrows}
                onChange={(event) => updateDisplay("arrows", event.currentTarget.checked)}
              />
            </label>
            <RangeControl
              label="Text fade threshold"
              max={3}
              min={0.5}
              step={0.1}
              value={display.textFadeThreshold}
              onChange={(value) => updateDisplay("textFadeThreshold", value)}
            />
            <RangeControl
              label="Node size"
              max={12}
              min={2}
              step={1}
              value={display.nodeSize}
              onChange={(value) => updateDisplay("nodeSize", value)}
            />
            <RangeControl
              label="Link thickness"
              max={6}
              min={0.5}
              step={0.5}
              value={display.linkThickness}
              onChange={(value) => updateDisplay("linkThickness", value)}
            />
          </GraphControlSection>

          <GraphControlSection
            title="Forces"
            open={forcesOpen}
            onToggle={() => setForcesOpen((current) => !current)}
          >
            <RangeControl
              label="Center force"
              max={1}
              min={0}
              step={0.1}
              value={forces.center}
              onChange={(value) => updateForce("center", value)}
            />
            <RangeControl
              label="Repel force"
              max={-20}
              min={-300}
              step={10}
              value={forces.repel}
              onChange={(value) => updateForce("repel", value)}
            />
            <RangeControl
              label="Link force"
              max={1}
              min={0}
              step={0.1}
              value={forces.link}
              onChange={(value) => updateForce("link", value)}
            />
            <RangeControl
              label="Link distance"
              max={180}
              min={20}
              step={10}
              value={forces.linkDistance}
              onChange={(value) => updateForce("linkDistance", value)}
            />
          </GraphControlSection>
        </div>
      </div>
    </section>
  );
}

function GraphControlSection({
  children,
  onToggle,
  open,
  title,
}: {
  children: React.ReactNode;
  onToggle: () => void;
  open: boolean;
  title: string;
}) {
  const action = open ? "Collapse" : "Expand";

  return (
    <div className="mt-4 border-t border-zinc-800 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <Button
          type="button"
          aria-label={`${action} ${title.toLowerCase()}`}
          className="h-7 bg-zinc-800 px-2 text-xs text-zinc-100 hover:bg-zinc-700"
          onClick={onToggle}
        >
          {open ? "Close" : "Open"}
        </Button>
      </div>
      {open ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  );
}

function RangeControl({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="tabular-nums text-xs text-zinc-500">{value}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        className="mt-2 h-1 w-full accent-violet-500"
        max={max}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    b: value & 255,
    g: (value >> 8) & 255,
    r: (value >> 16) & 255,
  };
}

function createCenterGravityForce(strength: number): CenterGravityForce {
  let nodes: ForceGraphNode[] = [];

  const force = ((alpha: number) => {
    if (strength === 0) {
      return;
    }

    for (const node of nodes) {
      const x = typeof node.x === "number" ? node.x : 0;
      const y = typeof node.y === "number" ? node.y : 0;
      node.vx = (node.vx ?? 0) + (0 - x) * strength * alpha;
      node.vy = (node.vy ?? 0) + (0 - y) * strength * alpha;
    }
  }) as CenterGravityForce;

  force.initialize = (nextNodes: ForceGraphNode[]) => {
    nodes = nextNodes;
  };

  return force;
}

function getKnowledgeGraphNodeFocus(
  graph: KnowledgeGraphData,
  nodeId: string | null,
) {
  const focusedNodeIds = new Set<string>();
  const focusedLinkIds = new Set<string>();

  if (!nodeId || !graph.nodes.some((node) => node.id === nodeId)) {
    return { focusedNodeIds, focusedLinkIds };
  }

  focusedNodeIds.add(nodeId);

  for (const link of graph.links) {
    if (link.source !== nodeId && link.target !== nodeId) {
      continue;
    }

    focusedLinkIds.add(link.id);
    focusedNodeIds.add(link.source);
    focusedNodeIds.add(link.target);
  }

  return { focusedNodeIds, focusedLinkIds };
}
