# Knowledge Graph Display And Force Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Obsidian-like Display and Forces controls to `KnowledgeGraphView`, with neutral gray graph links, hover neighborhood focus, and full-height graph layout.

**Architecture:** Keep settings local to `KnowledgeGraphView`. Display settings feed `ForceGraph2D` props and node canvas label rendering. Force settings are applied through a `ForceGraph2D` ref using `d3Force` when the graph instance is available.

**Tech Stack:** Next.js client component, React state/effects, `react-force-graph-2d`, Vitest, Testing Library, native checkbox/range inputs styled with Tailwind.

---

### Task 1: Display Controls And Neutral Links

**Files:**
- Modify: `components/knowledge-graph-view.tsx`
- Modify: `tests/components/knowledge-graph-view.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that render `KnowledgeGraphView`, assert `Display` controls are visible, verify link colors are neutral gray, and verify `Arrows`, `Node size`, `Link thickness`, and `Text fade threshold` update ForceGraph props or label drawing. Include a redraw regression where `Text fade threshold` changes after force controls have updated.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`

Expected: tests fail because the controls and neutral link behavior do not exist yet.

- [ ] **Step 3: Implement minimal display state and props**

Add local display state, display controls, neutral link color constants, `linkDirectionalArrowLength`, `nodeRelSize`, `linkWidth`, and `nodeCanvasObject` label rendering. Display changes resume the graph animation loop so cooled canvases repaint custom labels.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`

Expected: all graph component tests pass.

### Task 2: Force Controls

**Files:**
- Modify: `components/knowledge-graph-view.tsx`
- Modify: `tests/components/knowledge-graph-view.test.tsx`

- [ ] **Step 1: Write failing tests**

Add a mock graph ref with `d3Force` handlers and verify `Center force`, `Repel force`, `Link force`, and `Link distance` inputs update the expected force methods. Include a late-ref test where the dynamic graph ref is unavailable on first render and becomes available on rerender.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`

Expected: tests fail because force controls and ref application do not exist.

- [ ] **Step 3: Implement force state and ref effect**

Add force control state, range inputs, a callback graph ref, and an effect that registers `d3Force("munjib-center", forceFn)` and updates `d3Force("charge")` and `d3Force("link")` when supported. The callback ref increments a readiness version so defaults are applied after dynamic mount.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`

Expected: all graph component tests pass.

### Task 3: Wiki And Verification

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update wiki**

Record Issue #36 graph display/force controls in `Document Editing Workflow` and append a `wiki/log.md` entry.

- [ ] **Step 2: Run verification**

Run:
- `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`
- `pnpm exec tsc --noEmit`
- `pnpm wiki:manifest`
- `pnpm wiki:lint`
- `pnpm wiki:sync-check --staged`

Expected: all commands pass.

### Task 4: Full-Height Graph And Hover Focus

**Files:**
- Modify: `components/workspace-center-shell.tsx`
- Modify: `components/knowledge-graph-view.tsx`
- Modify: `tests/components/workspace-center-shell.test.tsx`
- Modify: `tests/components/knowledge-graph-view.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests proving graph mode removes editor padding/scroll from the workspace center content area and that hovering a node highlights the hovered node's 1-hop neighborhood instead of the selected document neighborhood.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx tests/components/workspace-center-shell.test.tsx`

Expected: tests fail before implementation because graph mode still uses editor padding and hover focus is not wired.

- [ ] **Step 3: Implement layout and hover focus**

Change `WorkspaceCenterShell` to use `overflow-hidden p-0` in graph mode, change `KnowledgeGraphView` to use `h-full min-h-0` with a white canvas background matching `DocumentToolbar`, and add `onNodeHover` state that computes a hovered node 1-hop focus set.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx tests/components/workspace-center-shell.test.tsx`

Expected: all focused tests pass.
