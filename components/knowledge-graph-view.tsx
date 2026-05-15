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

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as ComponentType<ForceGraph2DProps>;

const DEFAULT_FILTERS: KnowledgeGraphFilters = {
  wiki: true,
  tag: true,
  property: true,
};

const NODE_COLORS: Record<KnowledgeGraphNode["kind"], string> = {
  document: "#e5e7eb",
  wiki: "#8b5cf6",
  tag: "#f59e0b",
  property: "#38bdf8",
};

const LINK_COLORS: Record<KnowledgeGraphLinkKind, string> = {
  wiki: "#8b5cf6",
  tag: "#f59e0b",
  property: "#38bdf8",
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
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<KnowledgeGraphFilters>(DEFAULT_FILTERS);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const focus = useMemo(
    () => getKnowledgeGraphFocus(graph, selectedDocumentId),
    [graph, selectedDocumentId],
  );
  const visibleGraph = useMemo(() => filterKnowledgeGraph(graph, filters), [filters, graph]);
  const renderedGraph = useMemo(
    () => ({
      nodes: visibleGraph.nodes.map((node) => ({ ...node })),
      links: visibleGraph.links.map((link) => ({ ...link })),
    }),
    [visibleGraph],
  );

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

  const toggleFilter = useCallback((key: KnowledgeGraphLinkKind) => {
    setFilters((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const routeDocumentNode = useCallback(
    (node: KnowledgeGraphNode) => {
      if (node.kind !== "document") {
        return;
      }

      router.push(workspaceDocumentHref({ workspaceSlug, documentId: node.documentId }));
    },
    [router, workspaceSlug],
  );

  if (graph.nodes.length === 0) {
    return (
      <section className="flex min-h-[24rem] items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        No graph data available.
      </section>
    );
  }

  return (
    <section className="relative min-h-[32rem] overflow-hidden bg-zinc-950 text-zinc-100">
      <div ref={graphContainerRef} className="absolute inset-0 h-full min-h-[32rem] w-full">
        <ForceGraph2D
          graphData={renderedGraph}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#18181b"
          nodeLabel={(node: KnowledgeGraphNode) => node.label}
          nodeColor={(node: KnowledgeGraphNode) =>
            node.kind === "document" && node.documentId === selectedDocumentId
              ? "#a78bfa"
              : NODE_COLORS[node.kind]
          }
          linkColor={(link: KnowledgeGraphLink) => LINK_COLORS[link.kind]}
          linkWidth={(link: KnowledgeGraphLink) =>
            focus.focusedLinkIds.has(link.id) ? 2.5 : 1
          }
          onNodeClick={routeDocumentNode}
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
        </div>
      </div>
    </section>
  );
}
