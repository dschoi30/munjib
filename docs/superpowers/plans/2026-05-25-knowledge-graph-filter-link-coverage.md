# Knowledge Graph Filter And Link Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine workspace graph controls and make graph wiki links come from the full markdown document while preserving frontmatter-only Properties/backlink behavior.

**Architecture:** Move wiki-link target resolution into a reusable pure helper, then let `lib/knowledge-graph/model.ts` build graph-only wiki edges from persisted frontmatter links plus full-markdown scanned links. The React graph view keeps wiki edges always visible, exposes only Tags and Orphans filters, removes property rendering, and keeps focus styling color-only.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma DTOs, Vitest, React Testing Library, `react-force-graph-2d`, existing wiki maintenance CLI.

---

## File Structure

- Create `lib/wiki-links/resolve.ts`: pure target resolution helper shared by reconciliation and graph construction.
- Modify `lib/wiki-links/reconcile.ts`: call `resolveWikiLinkTarget()` from the new helper; keep DB persistence behavior unchanged.
- Modify `lib/knowledge-graph/model.ts`: remove visible property graph output, add full-markdown wiki link scanning, dedupe persisted/scanned wiki links, and replace filters with `tag` and `orphans`.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: include `contentMarkdown` in graph document inputs and stop loading graph properties.
- Modify `components/knowledge-graph-view.tsx`: filters UI, collapsed Display/Forces defaults, slider ranges, link width focus behavior, and type updates.
- Modify tests in `tests/wiki-links/reconcile.test.ts`, `tests/knowledge-graph/model.test.ts`, and `tests/components/knowledge-graph-view.test.tsx`.
- Modify wiki pages after implementation: `wiki/Document Knowledge Model.md`, `wiki/Wiki Links And Backlinks.md`, `wiki/Document Editing Workflow.md`, `wiki/index.md`, `wiki/log.md`, then regenerate `wiki/manifest.json`.

## Task 1: Share Wiki Link Target Resolution

**Files:**
- Create: `lib/wiki-links/resolve.ts`
- Modify: `lib/wiki-links/reconcile.ts`
- Test: `tests/wiki-links/reconcile.test.ts`

- [ ] **Step 1: Write a failing helper-level import regression test through existing reconcile coverage**

Add this test near the underscore/path-qualified tests in `tests/wiki-links/reconcile.test.ts`:

```ts
it("continues to resolve path-qualified links after moving target resolution to a shared helper", async () => {
  const fixture = await createWorkspaceFixture();
  const folder = await createFolder({
    workspaceId: fixture.workspace.id,
    name: "Operations",
    createdById: fixture.user.id,
  });
  const target = await createDocument({
    workspaceId: fixture.workspace.id,
    title: "Incident Runbook",
    contentMarkdown: "",
    folderId: folder.id,
    createdById: fixture.user.id,
  });
  const source = await createDocument({
    workspaceId: fixture.workspace.id,
    title: "Source",
    contentMarkdown: "---\nlinks:\n  - \"[[Operations/Incident Runbook]]\"\n---\n",
    createdById: fixture.user.id,
  });

  const panels = await getDocumentLinkPanels(source.id, fixture.user.id);

  expect(panels.outgoing).toEqual([
    expect.objectContaining({
      documentId: target.id,
      title: "Incident Runbook",
    }),
  ]);
});
```

- [ ] **Step 2: Run the focused reconcile test and confirm current behavior still passes before refactor**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts
```

Expected: PASS if local Postgres is available. If Postgres is unavailable, start the project Postgres using the established local workflow before continuing.

- [ ] **Step 3: Create the pure resolution helper**

Create `lib/wiki-links/resolve.ts`:

```ts
import {
  pathQualifiedCandidateToTitleLookupKey,
  pathQualifiedTargetToLookupDocumentPath,
  pathQualifiedTargetToTitleLookupKey,
  wikiLinkTargetToLookupKey,
} from "@/lib/wiki-links/targets";

export type WikiLinkTargetCandidate = {
  id: string;
  path: string;
  title: string;
};

export type ResolvedWikiLinkTarget = {
  isAmbiguous: boolean;
  isBroken: boolean;
  targetDocumentId: string | null;
};

export function resolveWikiLinkTarget(
  targets: WikiLinkTargetCandidate[],
  targetTitleRaw: string,
): ResolvedWikiLinkTarget {
  if (targetTitleRaw.includes("/")) {
    const targetPath = pathQualifiedTargetToLookupDocumentPath(targetTitleRaw);
    const target = targets.find((candidate) => candidate.path === targetPath);
    if (target) {
      return { targetDocumentId: target.id, isBroken: false, isAmbiguous: false };
    }

    const targetLookupKey = pathQualifiedTargetToTitleLookupKey(targetTitleRaw);
    const pathTitleMatches = targets.filter(
      (candidate) => pathQualifiedCandidateToTitleLookupKey(candidate) === targetLookupKey,
    );
    if (pathTitleMatches.length === 1) {
      return {
        targetDocumentId: pathTitleMatches[0]?.id ?? null,
        isBroken: false,
        isAmbiguous: false,
      };
    }
    if (pathTitleMatches.length > 1) {
      return { targetDocumentId: null, isBroken: false, isAmbiguous: true };
    }
  }

  const targetSlug = wikiLinkTargetToLookupKey(targetTitleRaw);
  const matches = targets.filter(
    (candidate) => wikiLinkTargetToLookupKey(candidate.title) === targetSlug,
  );
  if (matches.length === 1) {
    return { targetDocumentId: matches[0]?.id ?? null, isBroken: false, isAmbiguous: false };
  }
  if (matches.length > 1) {
    return { targetDocumentId: null, isBroken: false, isAmbiguous: true };
  }

  return { targetDocumentId: null, isBroken: true, isAmbiguous: false };
}
```

- [ ] **Step 4: Update reconciliation to use the helper**

In `lib/wiki-links/reconcile.ts`, remove the target imports and local `resolveLinkTarget()` function. Add:

```ts
import { resolveWikiLinkTarget } from "@/lib/wiki-links/resolve";
```

Change the createMany mapping to:

```ts
const resolved = resolveWikiLinkTarget(targets, link.targetTitleRaw);
```

- [ ] **Step 5: Run reconcile tests**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/wiki-links/resolve.ts lib/wiki-links/reconcile.ts tests/wiki-links/reconcile.test.ts
git commit -m "refactor: share wiki link target resolution"
```

## Task 2: Build Full-Markdown Graph Wiki Links And Remove Property Graph Output

**Files:**
- Modify: `lib/knowledge-graph/model.ts`
- Test: `tests/knowledge-graph/model.test.ts`

- [ ] **Step 1: Replace model fixture expectations with the new graph contract**

Update the fixture in `tests/knowledge-graph/model.test.ts` so documents include `contentMarkdown` and properties are no longer expected:

```ts
const fixture: KnowledgeGraphInput = {
  documents: [
    {
      id: "doc-1",
      title: "Welcome",
      path: "/welcome",
      contentMarkdown: "See [[Engineering Runbook]] and [[Missing Runbook]].",
    },
    {
      id: "doc-2",
      title: "Engineering Runbook",
      path: "/engineering-runbook",
      contentMarkdown: "",
    },
    {
      id: "doc-3",
      title: "Orphan",
      path: "/orphan",
      contentMarkdown: "",
    },
  ],
  links: [
    {
      id: "link-1",
      sourceDocumentId: "doc-1",
      targetDocumentId: "doc-2",
      targetTitleRaw: "Engineering Runbook",
      isBroken: false,
      isAmbiguous: false,
    },
  ],
  tags: [{ documentId: "doc-1", tag: { name: "Design", normalizedName: "design" } }],
};
```

Remove `properties` from the fixture and from expectations.

- [ ] **Step 2: Add failing tests for scanned markdown links, dedupe, property removal, and orphan filtering**

Add or replace tests in `tests/knowledge-graph/model.test.ts`:

```ts
it("builds graph wiki links from full document markdown", () => {
  const graph = buildKnowledgeGraph(fixture);

  expect(graph.links).toEqual(
    expect.arrayContaining([
      {
        id: "wiki:doc-1:document:doc-2",
        source: "document:doc-1",
        target: "document:doc-2",
        kind: "wiki",
      },
      {
        id: "wiki:doc-1:wiki:broken:missing-runbook",
        source: "document:doc-1",
        target: "wiki:broken:missing-runbook",
        kind: "wiki",
      },
    ]),
  );
});

it("deduplicates persisted and scanned wiki links", () => {
  const graph = buildKnowledgeGraph(fixture);

  expect(graph.links.filter((link) => link.target === "document:doc-2")).toHaveLength(1);
});

it("does not emit property graph nodes or links", () => {
  const graph = buildKnowledgeGraph({
    ...fixture,
    properties: [
      { documentId: "doc-1", key: "status", valueJson: "active", valueType: "string" },
    ],
  } as KnowledgeGraphInput & {
    properties: Array<{ documentId: string; key: string; valueJson: unknown; valueType: string }>;
  });

  expect(graph.nodes.some((node) => node.kind === "property")).toBe(false);
  expect(graph.links.some((link) => link.kind === "property")).toBe(false);
});

it("always keeps wiki links and filters tags and orphan document nodes", () => {
  const graph = buildKnowledgeGraph(fixture);
  const filtered = filterKnowledgeGraph(graph, { tag: false, orphans: false });

  expect(filtered.links.map((link) => link.kind)).toEqual(["wiki", "wiki"]);
  expect(filtered.nodes.map((node) => node.id).sort()).toEqual([
    "document:doc-1",
    "document:doc-2",
    "wiki:broken:missing-runbook",
  ]);
});
```

- [ ] **Step 3: Run model tests and confirm failure**

Run:

```bash
pnpm exec vitest run tests/knowledge-graph/model.test.ts
```

Expected: FAIL with TypeScript/runtime errors around `contentMarkdown`, old property kind expectations, or filter shape.

- [ ] **Step 4: Update graph model types and imports**

In `lib/knowledge-graph/model.ts`, add:

```ts
import { parseWikiLinks } from "@/lib/wiki-links/parser";
import { resolveWikiLinkTarget } from "@/lib/wiki-links/resolve";
```

Change types:

```ts
export type KnowledgeGraphNodeKind = "document" | "tag" | "wiki";
export type KnowledgeGraphLinkKind = "wiki" | "tag";

export type KnowledgeGraphDocumentInput = {
  contentMarkdown?: string;
  id: string;
  title: string;
  path: string;
};

export type KnowledgeGraphInput = {
  documents: KnowledgeGraphDocumentInput[];
  links: KnowledgeGraphLinkInput[];
  tags: KnowledgeGraphTagInput[];
};

export type KnowledgeGraphFilters = {
  orphans: boolean;
  tag: boolean;
};
```

Remove `KnowledgeGraphPropertyInput`, `KnowledgeGraphPropertyNode`, property union entries, `propertyNodeId()`, `scalarPropertyValue()`, and `isCanonicalPropertyKey()`.

- [ ] **Step 5: Add merged wiki link collection**

In `buildKnowledgeGraph()`, replace the direct `for (const link of input.links)` wiki loop with:

```ts
const targetCandidates = input.documents.map((document) => ({
  id: document.id,
  path: document.path,
  title: document.title,
}));
const wikiLinksByKey = new Map<string, KnowledgeGraphLink>();
const unresolvedWikiNodesById = new Map<string, KnowledgeGraphWikiNode>();

const addWikiEdge = (inputLink: {
  sourceDocumentId: string;
  targetDocumentId: string | null;
  targetTitleRaw: string;
  isBroken: boolean;
  isAmbiguous: boolean;
}) => {
  if (!readableDocumentIds.has(inputLink.sourceDocumentId)) {
    return;
  }

  const source = documentNodeId(inputLink.sourceDocumentId);
  let target: string;
  if (inputLink.targetDocumentId && readableDocumentIds.has(inputLink.targetDocumentId)) {
    target = documentNodeId(inputLink.targetDocumentId);
  } else {
    const state = inputLink.isAmbiguous ? "ambiguous" : "broken";
    target = wikiNodeId(state, inputLink.targetTitleRaw);
    unresolvedWikiNodesById.set(target, {
      id: target,
      kind: "wiki",
      label: inputLink.targetTitleRaw,
      targetTitleRaw: inputLink.targetTitleRaw,
      state,
    });
  }

  const key = `${source}->${target}`;
  if (!wikiLinksByKey.has(key)) {
    wikiLinksByKey.set(key, {
      id: `wiki:${inputLink.sourceDocumentId}:${target}`,
      source,
      target,
      kind: "wiki",
    });
  }
};

for (const link of input.links) {
  addWikiEdge(link);
}

for (const document of input.documents) {
  for (const parsed of parseWikiLinks(document.contentMarkdown ?? "")) {
    const resolved = resolveWikiLinkTarget(targetCandidates, parsed.targetTitleRaw);
    addWikiEdge({
      sourceDocumentId: document.id,
      targetDocumentId: resolved.targetDocumentId,
      targetTitleRaw: parsed.targetTitleRaw,
      isBroken: resolved.isBroken,
      isAmbiguous: resolved.isAmbiguous,
    });
  }
}

for (const node of unresolvedWikiNodesById.values()) {
  addNode(nodesById, node);
}
links.push(...wikiLinksByKey.values());
```

- [ ] **Step 6: Remove property loop and update filter logic**

Delete the `for (const property of input.properties)` loop.

Replace `filterKnowledgeGraph()` with:

```ts
export function filterKnowledgeGraph(
  graph: KnowledgeGraphData,
  filters: KnowledgeGraphFilters,
): KnowledgeGraphData {
  const links = graph.links.filter((link) => link.kind === "wiki" || filters.tag);
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
```

- [ ] **Step 7: Run model tests**

Run:

```bash
pnpm exec vitest run tests/knowledge-graph/model.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/knowledge-graph/model.ts tests/knowledge-graph/model.test.ts
git commit -m "feat: build graph links from full markdown"
```

## Task 3: Wire Graph Page Data To Full Markdown Inputs

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Test: `tests/knowledge-graph/model.test.ts` and TypeScript

- [ ] **Step 1: Update page graph data loading**

In `app/workspaces/[workspaceSlug]/page.tsx`, change:

```ts
const [graphLinks, graphTags, graphProperties] = isGraphView
```

to:

```ts
const [graphLinks, graphTags] = isGraphView
```

Remove the `prisma.documentProperty.findMany()` graph query and change the fallback tuple from `[[], [], []]` to `[[], []]`.

Change graph documents mapping to include markdown:

```ts
documents: readableDocuments.map((document) => ({
  id: document.id,
  title: document.title,
  path: document.path,
  contentMarkdown: document.contentMarkdown,
})),
links: graphLinks,
tags: graphTags,
```

Remove `properties: graphProperties`.

- [ ] **Step 2: Run TypeScript and model tests**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run tests/knowledge-graph/model.test.ts
```

Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add app/workspaces/[workspaceSlug]/page.tsx
git commit -m "feat: pass markdown content to graph model"
```

## Task 4: Update Graph View Controls And Focus Link Width

**Files:**
- Modify: `components/knowledge-graph-view.tsx`
- Test: `tests/components/knowledge-graph-view.test.tsx`

- [ ] **Step 1: Update component tests for controls**

In `tests/components/knowledge-graph-view.test.tsx`, update the settings test expectations:

```ts
expect(screen.getByText("Filters")).toBeTruthy();
expect(screen.queryByLabelText("Wiki links")).toBeNull();
expect(screen.getByLabelText("Tags")).toBeTruthy();
expect(screen.getByLabelText("Orphans")).toBeTruthy();
expect(screen.queryByLabelText("Properties")).toBeNull();
expect(screen.getByRole("button", { name: "Expand display" })).toBeTruthy();
expect(screen.getByRole("button", { name: "Expand forces" })).toBeTruthy();
```

Update the close/reopen expectations the same way.

- [ ] **Step 2: Update component tests for display defaults and link width**

In the display controls test, first expand Display:

```ts
fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
```

Expect:

```ts
expect(forceGraphMock.state.latestProps).toMatchObject({
  linkDirectionalArrowLength: 0,
  nodeRelSize: 3,
});
const nodeSizeInput = screen.getByLabelText("Node size");
expect(nodeSizeInput.getAttribute("min")).toBe("1");
expect(nodeSizeInput.getAttribute("max")).toBe("10");
expect(screen.getByLabelText("Link thickness").getAttribute("max")).toBe("5");
```

After changing link thickness to `3`, expect focused and unfocused links to return `3`:

```ts
const linkWidth = forceGraphMock.state.latestProps?.linkWidth as
  | ((link: KnowledgeGraphData["links"][number]) => number)
  | undefined;

expect(linkWidth?.(createGraph().links[0])).toBe(3);
```

- [ ] **Step 3: Update force tests to expand Forces before querying sliders**

At the start of the force control tests, add:

```ts
fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));
```

Use `"Collapse forces"` only after expansion.

- [ ] **Step 4: Run component tests and confirm failure**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
```

Expected: FAIL because the component still exposes old filters, old defaults, and focus link width boost.

- [ ] **Step 5: Update component defaults and filter options**

In `components/knowledge-graph-view.tsx`, change:

```ts
const DEFAULT_FILTERS: KnowledgeGraphFilters = {
  tag: true,
  orphans: true,
};
```

Change display defaults and section state:

```ts
const DEFAULT_DISPLAY_SETTINGS: GraphDisplaySettings = {
  arrows: false,
  linkThickness: 1,
  nodeSize: 3,
  textFadeThreshold: 1,
};
```

```ts
const [displayOpen, setDisplayOpen] = useState(false);
const [forcesOpen, setForcesOpen] = useState(false);
```

Change filter options:

```ts
const FILTER_OPTIONS: Array<{
  key: keyof KnowledgeGraphFilters;
  label: string;
}> = [
  { key: "tag", label: "Tags" },
  { key: "orphans", label: "Orphans" },
];
```

Change `toggleFilter` to:

```ts
const toggleFilter = useCallback((key: keyof KnowledgeGraphFilters) => {
  setFilters((current) => ({ ...current, [key]: !current[key] }));
}, []);
```

- [ ] **Step 6: Update slider ranges and link width**

Change Node size range:

```tsx
<RangeControl
  label="Node size"
  max={10}
  min={1}
  step={1}
  value={display.nodeSize}
  onChange={(value) => updateDisplay("nodeSize", value)}
/>
```

Change Link thickness max:

```tsx
<RangeControl
  label="Link thickness"
  max={5}
  min={0.5}
  step={0.5}
  value={display.linkThickness}
  onChange={(value) => updateDisplay("linkThickness", value)}
/>
```

Replace `linkWidth` with:

```tsx
linkWidth={() => display.linkThickness}
```

- [ ] **Step 7: Run component tests**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/knowledge-graph-view.tsx tests/components/knowledge-graph-view.test.tsx
git commit -m "feat: simplify graph filters and display defaults"
```

## Task 5: Update Wiki Documentation For Implemented Behavior

**Files:**
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/Wiki Links And Backlinks.md`
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update durable graph model documentation**

In `wiki/Document Knowledge Model.md`, update the "Workspace knowledge graph DTO" section to say:

```md
Issue #65 keeps `DocumentLink` storage frontmatter-driven for Properties/backlinks, but graph DTO construction additionally scans readable active documents' full `contentMarkdown` for `[[...]]` wiki links. The graph DTO renders document/tag/wiki nodes and wiki/tag edges; property graph nodes and property edges are no longer part of the visible graph contract.
```

- [ ] **Step 2: Update wiki-link semantics documentation**

In `wiki/Wiki Links And Backlinks.md`, update the graph paragraph to say:

```md
Issue #65 widens workspace graph view link coverage beyond persisted `DocumentLink` rows. Properties Links row and backlinks remain frontmatter `links:` based, but graph view also scans full document markdown for `[[...]]` links, resolves them with the same folder-aware and underscore-aware target matching rules, deduplicates repeated source-target edges, and renders unresolved graph-only targets as broken or ambiguous wiki nodes.
```

- [ ] **Step 3: Update workflow UI documentation**

In `wiki/Document Editing Workflow.md`, update the graph settings paragraph to include:

```md
Issue #65 simplifies graph filters to `Tags` and `Orphans`; wiki links are always applied and property graph rendering is removed. `Display` and `Forces` start collapsed, node size defaults to `3` with range `1..10`, link thickness is capped at `5`, and hover/selected focus changes color/alpha without changing link width.
```

- [ ] **Step 4: Update index and log**

In `wiki/index.md`, change the Issue #65 status text from planned to implemented.

Add a top `wiki/log.md` entry:

```md
## 2026-05-25T00:30:00+09:00 - implementation

- Result: Issue #65 knowledge graph filter/link coverage refinement was implemented.
- Coverage: Graph view scans full document markdown for wiki links while keeping Properties Links/backlinks frontmatter-driven, removes property graph rendering, keeps wiki edges always visible, adds Tags/Orphans filters, starts Display/Forces collapsed, adjusts node/link ranges, and keeps focus link width constant.
- Pages: [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #65, `docs/superpowers/specs/2026-05-25-knowledge-graph-filter-link-coverage-design.md`, `docs/superpowers/plans/2026-05-25-knowledge-graph-filter-link-coverage.md`, `lib/wiki-links/resolve.ts`, `lib/knowledge-graph/model.ts`, `components/knowledge-graph-view.tsx`, `app/workspaces/[workspaceSlug]/page.tsx`.
- Verification: Run the final verification commands listed in Task 6 after implementation.
```

- [ ] **Step 5: Regenerate manifest and lint wiki**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add wiki/Document\ Knowledge\ Model.md wiki/Wiki\ Links\ And\ Backlinks.md wiki/Document\ Editing\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "docs: update knowledge graph wiki behavior"
```

## Task 6: Final Verification And PR Workflow

**Files:**
- No planned source edits unless verification fails.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run wiki-link regression tests**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm exec vitest run tests/wiki-links/reconcile.test.ts
```

Expected: PASS. If local Postgres is unavailable, start it using the repo local development workflow and rerun.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run wiki commit checks**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: PASS. If no files are staged at this point, run `git status --short` and stage only the intended implementation/wiki changes before `wiki:sync-plan --staged` and `wiki:sync-check --staged`.

- [ ] **Step 5: Push and create PR**

Run:

```bash
git status --short
git push -u origin issue-65-refine-knowledge-graph-filters-and-wiki-link-coverage
gh pr create --draft --title "Refine knowledge graph filters and wiki link coverage" --body "Closes #65"
gh pr ready
```

Expected: branch pushed, PR created, PR marked ready.

- [ ] **Step 6: Wait and check review/CI**

Wait at least 5 minutes, then run:

```bash
gh pr view --json number,url,reviewDecision,reviewRequests,reviews,statusCheckRollup
gh pr checks
```

Expected: report current review and CI/check status. If there is actionable review feedback or a failing check, fix it on this branch, rerun relevant verification, commit, push, and repeat the review check.

## Self-Review

- Spec coverage: All eight requested UI/model changes are covered by Tasks 2-4, full-markdown graph link coverage is covered by Tasks 1-3, wiki updates by Task 5, and final PR workflow by Task 6.
- Placeholder scan: No `TBD`, `TODO`, or vague "add tests" instructions remain.
- Type consistency: `KnowledgeGraphFilters` is consistently `{ tag: boolean; orphans: boolean }`; visible link kinds are consistently `wiki | tag`; property graph output is removed from the visible contract.
