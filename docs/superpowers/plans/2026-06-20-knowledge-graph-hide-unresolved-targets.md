# Knowledge Graph Hide Unresolved Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default graph view shows actual readable document nodes and resolved document-to-document wiki links, while hiding broken or ambiguous wiki target placeholders.

**Architecture:** Keep `buildKnowledgeGraph()` as the raw graph DTO builder. Tighten `filterKnowledgeGraph()` so the rendered graph drops unresolved `wiki` placeholder edges before connected-node filtering, while preserving `Tags` and `Orphans` behavior. Update model/component tests and wiki documentation to describe the raw DTO versus visible graph boundary.

**Tech Stack:** TypeScript, Next.js App Router, React, Vitest, React Testing Library, repository wiki CLI.

---

## File Structure

- Modify `lib/knowledge-graph/model.ts`: change only `filterKnowledgeGraph()` so visible wiki links require document-node endpoints.
- Modify `tests/knowledge-graph/model.test.ts`: add RED/GREEN coverage for resolved wiki links, broken placeholders, ambiguous placeholders, `Tags`, and `Orphans`.
- Modify `tests/components/knowledge-graph-view.test.tsx`: add renderer-level regression tests and update existing expectations that currently assume unresolved wiki placeholders are visible.
- Modify `wiki/Document Editing Workflow.md`: document that default graph hides unresolved wiki target placeholders.
- Modify `wiki/Wiki Links And Backlinks.md`: document that full-markdown graph scanning still creates raw unresolved target state, but default visible graph hides it.
- Modify `wiki/index.md`, `wiki/log.md`, and `wiki/manifest.json`: update status, chronology, and generated manifest after source changes.

## Task 0: Execution Setup

**Files:**
- Read: `docs/superpowers/specs/2026-06-20-knowledge-graph-hide-unresolved-targets-design.md`
- Read: `lib/knowledge-graph/model.ts`
- Read: `tests/knowledge-graph/model.test.ts`
- Read: `tests/components/knowledge-graph-view.test.tsx`

- [ ] **Step 1: Verify the working tree**

Run:

```bash
git status --short
```

Expected: no unrelated user changes. If this plan file is still uncommitted, keep it and include it in the implementation branch unless the user asks otherwise.

- [ ] **Step 2: Start the issue/branch workflow if still on `main`**

Run:

```bash
pnpm wiki:feature-start "Hide unresolved graph targets in graph view"
```

Expected: GitHub issue is created when CLI auth is available. If current branch is `main`, the command creates and switches to an issue-numbered branch such as `issue-116-hide-unresolved-graph-targets-in-graph-view`. If already on a feature branch, stay there.

- [ ] **Step 3: Re-read the approved design**

Run:

```bash
sed -n '1,220p' docs/superpowers/specs/2026-06-20-knowledge-graph-hide-unresolved-targets-design.md
```

Expected: the design says `buildKnowledgeGraph()` remains the raw DTO builder and `filterKnowledgeGraph()` owns visible graph filtering.

## Task 1: Model Filter TDD

**Files:**
- Modify: `tests/knowledge-graph/model.test.ts`
- Modify: `lib/knowledge-graph/model.ts`

- [ ] **Step 1: Write failing model tests**

In `tests/knowledge-graph/model.test.ts`, replace the existing test named `"always keeps wiki links and filters tags and orphan document nodes"` with these three tests:

```ts
  it("keeps only resolved document-to-document wiki links in the visible graph", () => {
    const graph = buildKnowledgeGraph(fixture);
    const filtered = filterKnowledgeGraph(graph, { tag: false, orphans: false });

    expect(filtered.links).toEqual([
      {
        id: "wiki:link-1",
        source: "document:doc-1",
        target: "document:doc-2",
        kind: "wiki",
      },
    ]);
    expect(filtered.nodes.map((node) => node.id).sort()).toEqual([
      "document:doc-1",
      "document:doc-2",
    ]);
  });

  it("keeps unresolved wiki targets hidden when orphan documents are shown", () => {
    const graph = buildKnowledgeGraph(fixture);
    const filtered = filterKnowledgeGraph(graph, { tag: false, orphans: true });

    expect(filtered.links).toEqual([
      {
        id: "wiki:link-1",
        source: "document:doc-1",
        target: "document:doc-2",
        kind: "wiki",
      },
    ]);
    expect(filtered.nodes.map((node) => node.id).sort()).toEqual([
      "document:doc-1",
      "document:doc-2",
      "document:doc-3",
    ]);
    expect(filtered.nodes.some((node) => node.kind === "wiki")).toBe(false);
  });

  it("filters ambiguous wiki target placeholders from the visible graph", () => {
    const graph = buildKnowledgeGraph({
      documents: [
        {
          id: "doc-1",
          title: "Source",
          path: "/source",
          contentMarkdown: "See [[Runbook]].",
        },
        { id: "doc-2", title: "Runbook", path: "/team-a/runbook", contentMarkdown: "" },
        { id: "doc-3", title: "Runbook", path: "/team-b/runbook", contentMarkdown: "" },
      ],
      links: [],
      tags: [],
    });

    const filtered = filterKnowledgeGraph(graph, { tag: false, orphans: false });

    expect(graph.nodes.some((node) => node.id === "wiki:ambiguous:runbook")).toBe(true);
    expect(graph.links.some((link) => link.target === "wiki:ambiguous:runbook")).toBe(true);
    expect(filtered.nodes).toEqual([]);
    expect(filtered.links).toEqual([]);
  });
```

Keep the existing `"keeps orphan document nodes when the orphans filter is enabled"` test for now; it should continue to pass after the implementation.

- [ ] **Step 2: Run the model tests and confirm RED**

Run:

```bash
pnpm exec vitest tests/knowledge-graph/model.test.ts --run
```

Expected: FAIL. The first new test should show the current visible graph still includes `wiki:doc-1:wiki:broken:missing-runbook` and `wiki:broken:missing-runbook`.

- [ ] **Step 3: Implement endpoint-aware visible graph filtering**

In `lib/knowledge-graph/model.ts`, replace `filterKnowledgeGraph()` with:

```ts
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
```

Do not change `buildKnowledgeGraph()`.

- [ ] **Step 4: Run the model tests and confirm GREEN**

Run:

```bash
pnpm exec vitest tests/knowledge-graph/model.test.ts --run
```

Expected: PASS for `tests/knowledge-graph/model.test.ts`.

## Task 2: Component Regression Tests

**Files:**
- Modify: `tests/components/knowledge-graph-view.test.tsx`

- [ ] **Step 1: Add a graph fixture with both resolved and unresolved wiki links**

In `tests/components/knowledge-graph-view.test.tsx`, add this helper after `createGraph()`:

```ts
function createWikiGraphWithUnresolvedTarget(): KnowledgeGraphData {
  return {
    nodes: [
      {
        id: "document:doc-1",
        kind: "document",
        label: "Welcome",
        documentId: "doc-1",
        title: "Welcome",
        path: "/welcome",
      },
      {
        id: "document:doc-2",
        kind: "document",
        label: "Runbook",
        documentId: "doc-2",
        title: "Runbook",
        path: "/runbook",
      },
      {
        id: "document:doc-3",
        kind: "document",
        label: "Draft",
        documentId: "doc-3",
        title: "Draft",
        path: "/draft",
      },
      {
        id: "wiki:broken:missing",
        kind: "wiki",
        label: "Missing",
        targetTitleRaw: "Missing",
        state: "broken",
      },
    ],
    links: [
      {
        id: "wiki:doc-1:document:doc-2",
        source: "document:doc-1",
        target: "document:doc-2",
        kind: "wiki",
      },
      {
        id: "wiki:doc-3:wiki:broken:missing",
        source: "document:doc-3",
        target: "wiki:broken:missing",
        kind: "wiki",
      },
    ],
  };
}
```

- [ ] **Step 2: Add RED renderer tests for unresolved placeholder hiding**

In the `KnowledgeGraphView` describe block, near the existing filter tests, add:

```ts
  it("hides unresolved wiki target nodes from the default rendered graph", () => {
    const graph = createWikiGraphWithUnresolvedTarget();
    renderGraph(graph);

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[0], graph.nodes[1]],
      links: [
        {
          ...graph.links[0],
          sourceId: graph.links[0].source,
          targetId: graph.links[0].target,
        },
      ],
    });
  });

  it("keeps unresolved wiki target nodes hidden when Orphans is checked", () => {
    const graph = createWikiGraphWithUnresolvedTarget();
    renderGraph(graph);

    fireEvent.click(screen.getByLabelText("Orphans"));

    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[0], graph.nodes[1], graph.nodes[2]],
      links: [
        {
          ...graph.links[0],
          sourceId: graph.links[0].source,
          targetId: graph.links[0].target,
        },
      ],
    });
  });
```

- [ ] **Step 3: Run the component tests and confirm affected failures**

Run:

```bash
pnpm exec vitest tests/components/knowledge-graph-view.test.tsx --run
```

Expected: FAIL before existing component expectations are updated. Failures should involve tests that still expect `wiki:broken:*` placeholder nodes to be rendered or highlighted.

- [ ] **Step 4: Update selected-document filtered-out focus test**

In the test named `"does not dim visible wiki-linked nodes when the selected document is filtered out"`, replace the graph fixture and expectations with this resolved document-to-document version:

```ts
    const graph: KnowledgeGraphData = {
      nodes: [
        {
          id: "document:doc-1",
          kind: "document",
          label: "Tagged",
          documentId: "doc-1",
          title: "Tagged",
          path: "/tagged",
        },
        {
          id: "tag:hidden",
          kind: "tag",
          label: "#Hidden",
          name: "Hidden",
          normalizedName: "hidden",
        },
        {
          id: "document:doc-2",
          kind: "document",
          label: "Linked",
          documentId: "doc-2",
          title: "Linked",
          path: "/linked",
        },
        {
          id: "document:doc-3",
          kind: "document",
          label: "Neighbor",
          documentId: "doc-3",
          title: "Neighbor",
          path: "/neighbor",
        },
      ],
      links: [
        {
          id: "tag:doc-1:hidden",
          source: "document:doc-1",
          target: "tag:hidden",
          kind: "tag",
        },
        {
          id: "wiki:doc-2:document:doc-3",
          source: "document:doc-2",
          target: "document:doc-3",
          kind: "wiki",
        },
      ],
    };
```

Replace the rendered graph expectation in that test with:

```ts
    expect(forceGraphMock.state.latestProps?.graphData).toEqual({
      nodes: [graph.nodes[2], graph.nodes[3]],
      links: [
        {
          ...graph.links[1],
          sourceId: graph.links[1].source,
          targetId: graph.links[1].target,
        },
      ],
    });
```

Replace the color expectations in that test with:

```ts
    expect(nodeColor?.(graph.nodes[2])).toBe("#64748b");
    expect(nodeColor?.(graph.nodes[3])).toBe("#64748b");
    expect(linkColor?.(graph.links[1])).toBe("#94a3b8");
```

- [ ] **Step 5: Update initial zoom test to use a resolved wiki link**

In the test named `"sets the initial graph zoom around the selected document once after coordinates are ready"`, replace the graph fixture with:

```ts
    const graph: KnowledgeGraphData = {
      nodes: [
        {
          id: "document:doc-1",
          kind: "document",
          label: "Welcome",
          documentId: "doc-1",
          title: "Welcome",
          path: "/welcome",
        },
        {
          id: "document:doc-2",
          kind: "document",
          label: "Runbook",
          documentId: "doc-2",
          title: "Runbook",
          path: "/runbook",
        },
      ],
      links: [
        {
          id: "wiki:doc-1:document:doc-2",
          source: "document:doc-1",
          target: "document:doc-2",
          kind: "wiki",
        },
      ],
    };
```

Keep the rest of the test unchanged.

- [ ] **Step 6: Update hovered-neighborhood test to use a resolved wiki neighbor**

In the test named `"uses the hovered node neighborhood as the active highlight region"`, replace the extra unresolved wiki node with a document node:

```ts
        {
          id: "document:doc-3",
          kind: "document",
          label: "Neighbor",
          documentId: "doc-3",
          title: "Neighbor",
          path: "/neighbor",
        },
```

Replace the extra link with:

```ts
        {
          id: "wiki:doc-2:document:doc-3",
          source: "document:doc-2",
          target: "document:doc-3",
          kind: "wiki",
        },
```

Keep the hover call targeting `graph.nodes[3]`. Keep the final expectations that assert the hovered neighborhood is highlighted, but make sure any expected wiki-node purple color is replaced by document-node slate color:

```ts
    expect(nodeColor?.(graph.nodes[2])).toBe("#64748b");
    expect(nodeColor?.(graph.nodes[3])).toBe("#64748b");
```

- [ ] **Step 7: Run component tests and confirm GREEN**

Run:

```bash
pnpm exec vitest tests/components/knowledge-graph-view.test.tsx --run
```

Expected: PASS for `tests/components/knowledge-graph-view.test.tsx`.

## Task 3: Wiki Maintenance

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/Wiki Links And Backlinks.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update graph behavior in Document Editing Workflow**

In `wiki/Document Editing Workflow.md`, in the Issue #65/#67 graph paragraph, add this sentence after the sentence about `Tags` and `Orphans` filters:

```md
Default visible graph rendering keeps only actual readable document nodes connected by resolved document-to-document wiki edges; broken or ambiguous wiki target placeholders can exist in the raw graph DTO but are hidden from the graph canvas, and `Orphans` only restores isolated document nodes.
```

- [ ] **Step 2: Update graph link semantics in Wiki Links And Backlinks**

In `wiki/Wiki Links And Backlinks.md`, replace the final sentence of the graph view paragraph that currently says broken or ambiguous links connect to raw wiki value nodes with:

```md
Resolved graph wiki links render from source document node to readable target document node. Broken or ambiguous links are still represented as unresolved placeholder state in the raw graph DTO for model completeness, but the default visible graph filters those placeholder nodes and edges out so non-document values do not appear as graph nodes.
```

- [ ] **Step 3: Update the index status note**

In `wiki/index.md`, extend the `Graph 후속 구현` status bullet with this implementation sentence:

```md
The 2026-06-20 follow-up implements the visible graph contract: unresolved broken/ambiguous wiki target placeholders remain raw DTO state but are filtered out of the rendered graph, while `Orphans` continues to show only isolated document nodes.
```

- [ ] **Step 4: Add a wiki log entry**

At the top of `wiki/log.md`, add:

```md
## 2026-06-20T12:45:10+0900 - graph unresolved target visibility implementation

- Result: Default graph view now hides broken/ambiguous unresolved wiki target placeholders so non-document values are not rendered as graph nodes.
- Coverage: `filterKnowledgeGraph()` keeps wiki links only when both endpoints are actual document nodes, keeps tag edges only when `Tags` is enabled, and keeps isolated document nodes only when `Orphans` is enabled. `buildKnowledgeGraph()` remains the raw graph DTO builder and can still represent unresolved placeholder state for tests/model completeness.
- Pages: [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: user-reported default graph issue, `lib/knowledge-graph/model.ts`, `tests/knowledge-graph/model.test.ts`, `tests/components/knowledge-graph-view.test.tsx`, `docs/superpowers/specs/2026-06-20-knowledge-graph-hide-unresolved-targets-design.md`.
- Verification: `pnpm exec vitest tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx --run`, `pnpm exec tsc --noEmit --pretty false`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.
```

Use the actual timestamp from:

```bash
date '+%Y-%m-%dT%H:%M:%S%z'
```

- [ ] **Step 5: Regenerate wiki manifest**

Run:

```bash
pnpm wiki:manifest
```

Expected: `wiki/manifest.json` is rewritten successfully.

## Task 4: Verification, Commit, PR, and Review Loop

**Files:**
- Verify: `lib/knowledge-graph/model.ts`
- Verify: `tests/knowledge-graph/model.test.ts`
- Verify: `tests/components/knowledge-graph-view.test.tsx`
- Verify: `wiki/Document Editing Workflow.md`
- Verify: `wiki/Wiki Links And Backlinks.md`
- Verify: `wiki/index.md`
- Verify: `wiki/log.md`
- Verify: `wiki/manifest.json`

- [ ] **Step 1: Run focused graph tests**

Run:

```bash
pnpm exec vitest tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx --run
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS with no type errors.

- [ ] **Step 3: Stage intended files and run wiki workflow**

Run:

```bash
git add lib/knowledge-graph/model.ts tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx wiki/Document\ Editing\ Workflow.md wiki/Wiki\ Links\ And\ Backlinks.md wiki/index.md wiki/log.md wiki/manifest.json docs/superpowers/plans/2026-06-20-knowledge-graph-hide-unresolved-targets.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json wiki/Document\ Editing\ Workflow.md wiki/Wiki\ Links\ And\ Backlinks.md wiki/index.md wiki/log.md
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: `wiki:sync-check --staged` reports source and wiki maintenance changes. `wiki:lint` may continue to warn about the existing `wiki/designs/sidebar.md` pasted image unresolved link; no new warnings should be introduced.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --check
git diff --cached --check
git status --short
git diff -- lib/knowledge-graph/model.ts tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx
git diff --cached -- lib/knowledge-graph/model.ts tests/knowledge-graph/model.test.ts tests/components/knowledge-graph-view.test.tsx
```

Expected: no whitespace errors. Diff shows `buildKnowledgeGraph()` unchanged and `filterKnowledgeGraph()` updated.

- [ ] **Step 5: Commit**

Run:

```bash
git commit -m "Hide unresolved graph target nodes"
```

Expected: commit succeeds. Pre-commit runs `wiki:sync-check --staged` and `wiki:lint`.

- [ ] **Step 6: Push and open PR**

Run:

```bash
git push -u origin HEAD
gh pr create --fill --draft
gh pr ready
```

Expected: branch is pushed, PR is created, and PR is marked ready for review.

- [ ] **Step 7: Wait and inspect PR review/CI status**

Run:

```bash
sleep 300
gh pr checks
gh pr view --json number,reviewDecision,statusCheckRollup,url
```

Expected: report CI/check state and review decision. If checks fail or actionable review comments appear, fix them on the same branch, rerun focused tests plus wiki workflow, commit, push, wait again, and re-check.
