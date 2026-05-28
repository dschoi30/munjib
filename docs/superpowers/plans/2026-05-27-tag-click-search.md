# Tag Click Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Obsidian-style `tag:#name` search and make Properties/preview tags open the existing sidebar Search panel.

**Architecture:** AppShell will own a small client-side tag-search request context so the center editor can request a sidebar search without URL state or server mutation. DocumentList will subscribe to that request, switch to the existing Search panel, and set the literal query. DocumentNavigation will parse `tag:` queries and filter against normalized tag names included in each DocumentListItem.

**Tech Stack:** Next.js App Router, React context/hooks, Prisma DocumentTag data, Vitest + Testing Library, existing wiki sync tooling.

---

## File Structure

- `components/app-shell.tsx`: add `useTagSearch()` context with `requestTagSearch(tagName)` and a latest request value.
- `components/document-list.tsx`: add document tag data to `DocumentListItem`, subscribe to tag-search requests, and open Search with `tag:#name`.
- `components/document-navigation.tsx`: parse tag search queries and filter documents by exact normalized tag.
- `components/document-editor/document-properties.tsx`: render frontmatter tag chips as buttons that call `requestTagSearch`.
- `components/document-editor/markdown-preview.tsx`: render preview body `#tag` as clickable inline buttons that call `requestTagSearch`.
- `app/workspaces/[workspaceSlug]/page.tsx`: fetch readable document tags and pass normalized names to the document list.
- `tests/components/document-list.test.tsx`: cover typed tag query and AppShell request integration.
- `tests/components/document-editor-preview.test.tsx`: cover Properties and preview tag click behavior.
- `docs/superpowers/plans/2026-05-27-tag-click-search.md`: this plan.

## Task 1: Tag Search Request Context

**Files:**
- Modify: `components/app-shell.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Write the failing AppShell integration test**

Add a test component in `tests/components/document-list.test.tsx`:

```tsx
import { AppShell, useTagSearch } from "@/components/app-shell";
```

```tsx
function TagSearchRequester({ tag }: { tag: string }) {
  const tagSearch = useTagSearch();
  return (
    <button type="button" onClick={() => tagSearch?.requestTagSearch(tag)}>
      Search tag
    </button>
  );
}
```

Add this test:

```tsx
it("opens sidebar search with a literal tag query from AppShell tag search requests", () => {
  render(
    <AppShell
      left={<DocumentList {...baseProps} />}
      center={<TagSearchRequester tag="LangChain" />}
      right={<div />}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

  expect(screen.getByLabelText("Search documents")).toHaveValue("tag:#LangChain");
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run tests/components/document-list.test.tsx -t "opens sidebar search with a literal tag query"`

Expected: FAIL because `useTagSearch` does not exist.

- [ ] **Step 3: Implement the context**

In `components/app-shell.tsx`, add:

```tsx
type TagSearchRequest = {
  tagName: string;
  token: number;
};

type TagSearchControls = {
  latestTagSearchRequest: TagSearchRequest | null;
  requestTagSearch: (tagName: string) => void;
};

const TagSearchContext = createContext<TagSearchControls | null>(null);

export function useTagSearch() {
  return useContext(TagSearchContext);
}
```

Inside `AppShell`, add:

```tsx
const [latestTagSearchRequest, setLatestTagSearchRequest] =
  useState<TagSearchRequest | null>(null);
const tagSearchControls = useMemo<TagSearchControls>(
  () => ({
    latestTagSearchRequest,
    requestTagSearch: (tagName) => {
      setLatestTagSearchRequest({ tagName, token: Date.now() });
    },
  }),
  [latestTagSearchRequest],
);
```

Wrap the existing `main` with:

```tsx
<TagSearchContext.Provider value={tagSearchControls}>
  <main>...</main>
</TagSearchContext.Provider>
```

- [ ] **Step 4: Subscribe DocumentList to requests**

In `components/document-list.tsx`, import `useEffect` and `useTagSearch`, then add:

```tsx
const tagSearch = useTagSearch();

useEffect(() => {
  const request = tagSearch?.latestTagSearchRequest;
  if (!request) return;

  setSettingsOpen(false);
  setActivePanel("search");
  setSearchQuery(`tag:#${request.tagName.replace(/^#/, "")}`);
  clearGraphRoute();
}, [clearGraphRoute, tagSearch?.latestTagSearchRequest]);
```

- [ ] **Step 5: Run the test**

Run: `pnpm exec vitest run tests/components/document-list.test.tsx -t "opens sidebar search with a literal tag query"`

Expected: PASS.

## Task 2: Typed Tag Query Filtering

**Files:**
- Modify: `components/document-list.tsx`
- Modify: `components/document-navigation.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Write failing search tests**

Extend `baseProps.documents` fixtures with tag names:

```tsx
tagNames: ["welcome", "langchain"],
```

for `Welcome`, and:

```tsx
tagNames: ["engineering"],
```

for `Engineering Runbook`.

Add tests:

```tsx
it("filters search results with exact case-insensitive tag queries", () => {
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  fireEvent.change(screen.getByLabelText("Search documents"), {
    target: { value: "tag:#LANGCHAIN" },
  });

  expect(screen.getByText("1 result")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Welcome/ })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Engineering Runbook/ })).toBeNull();
});

it("does not partially match tag queries", () => {
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  fireEvent.change(screen.getByLabelText("Search documents"), {
    target: { value: "tag:#lang" },
  });

  expect(screen.getByText("0 results")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Welcome/ })).toBeNull();
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run tests/components/document-list.test.tsx -t "tag queries"`

Expected: FAIL because document items do not have tag names and search does not parse `tag:`.

- [ ] **Step 3: Add document tag shape**

In `components/document-list.tsx`:

```ts
export type DocumentListItem = {
  id: string;
  folderId: string | null;
  title: string;
  path: string;
  contentText: string;
  tagNames: string[];
  canWrite: boolean;
};
```

- [ ] **Step 4: Implement tag query filtering**

In `components/document-navigation.tsx`, add:

```ts
function parseTagSearchQuery(query: string) {
  const trimmed = query.trim();
  const match = trimmed.match(/^tag:\s*#?(.+)$/i);
  if (!match) return null;

  const tagName = normalizeTagName(match[1] ?? "");
  return tagName.length > 0 ? tagName : "";
}

function normalizeTagName(tagName: string) {
  return tagName.trim().replace(/^#/, "").toLowerCase();
}
```

Then update `searchResults`:

```ts
const trimmedQuery = searchQuery.trim();
const tagQuery = parseTagSearchQuery(trimmedQuery);
if (tagQuery !== null) {
  if (!tagQuery) return [];
  return documents.filter((document) =>
    document.tagNames.some((tagName) => normalizeTagName(tagName) === tagQuery),
  );
}
const query = trimmedQuery.toLowerCase();
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/components/document-list.test.tsx -t "tag queries|opens the workspace search"`

Expected: PASS.

## Task 3: Server Data Wiring

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Test: `pnpm exec tsc --noEmit`

- [ ] **Step 1: Fetch readable document tags**

In `app/workspaces/[workspaceSlug]/page.tsx`, add a non-graph `documentTagsForList` query after `readableDocumentIdList` is available:

```ts
const documentTagsForList = readableDocumentIdList.length > 0
  ? await prisma.documentTag.findMany({
      where: { documentId: { in: readableDocumentIdList } },
      select: {
        documentId: true,
        tag: { select: { normalizedName: true } },
      },
      orderBy: [{ documentId: "asc" }, { id: "asc" }],
    })
  : [];
```

Build a map:

```ts
const tagNamesByDocumentId = new Map<string, string[]>();
for (const documentTag of documentTagsForList) {
  const tagNames = tagNamesByDocumentId.get(documentTag.documentId) ?? [];
  tagNames.push(documentTag.tag.normalizedName);
  tagNamesByDocumentId.set(documentTag.documentId, tagNames);
}
```

- [ ] **Step 2: Pass tag names to DocumentList**

In the `documents={readableDocuments.map(...)}` mapping:

```ts
tagNames: tagNamesByDocumentId.get(document.id) ?? [],
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

## Task 4: Clickable Properties Tags

**Files:**
- Modify: `components/document-editor/document-properties.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Write failing Properties click test**

Import `AppShell` and add a test receiver:

```tsx
function TagSearchReceiver() {
  const tagSearch = useTagSearch();
  return <span data-testid="tag-search-request">{tagSearch?.latestTagSearchRequest?.tagName ?? ""}</span>;
}
```

Add test:

```tsx
it("requests sidebar tag search when a frontmatter tag chip is clicked", () => {
  render(
    <AppShell
      left={<TagSearchReceiver />}
      center={
        <DocumentViewModeProvider>
          <DocumentEditor
            {...baseProps}
            document={{ id: "doc-1", title: "Tagged", contentMarkdown: "---\ntags:\n  - LangChain\n---\n\nBody" }}
            properties={[{ id: "property-tags", key: "tags", valueJson: ["LangChain"] }]}
          />
        </DocumentViewModeProvider>
      }
      right={<div />}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Search tag #LangChain" }));

  expect(screen.getByTestId("tag-search-request").textContent).toBe("LangChain");
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "frontmatter tag chip"`

Expected: FAIL because tags render as spans.

- [ ] **Step 3: Implement clickable tag chips**

In `components/document-editor/document-properties.tsx`, import `useTagSearch`, call it in `TagsPropertyRow`, and render:

```tsx
<button
  key={tag}
  type="button"
  onClick={() => tagSearch?.requestTagSearch(tag)}
  className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-600 hover:bg-violet-100 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
  aria-label={`Search tag #${tag}`}
>
  #{tag}
</button>
```

- [ ] **Step 4: Run focused editor tests**

Run: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "DocumentEditor properties|frontmatter tag chip"`

Expected: PASS.

## Task 5: Clickable Preview Body Tags

**Files:**
- Modify: `components/document-editor/markdown-preview.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Write failing preview click test**

Add:

```tsx
it("requests sidebar tag search when a preview body tag is clicked", () => {
  render(
    <AppShell
      left={<TagSearchReceiver />}
      center={
        <DocumentViewModeProvider>
          <DocumentEditor
            {...baseProps}
            document={{ id: "doc-1", title: "Tagged", contentMarkdown: "Use #LangChain today" }}
          />
        </DocumentViewModeProvider>
      }
      right={<div />}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Search tag #LangChain" }));

  expect(screen.getByTestId("tag-search-request").textContent).toBe("LangChain");
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "preview body tag"`

Expected: FAIL because body tags render as plain text.

- [ ] **Step 3: Add preview tag rendering**

In `components/document-editor/markdown-preview.tsx`, add a helper that wraps body tag tokens outside links/code by transforming text children in paragraph/list nodes. Keep it narrowly scoped to plain text children:

```tsx
function renderTagSearchText(text: string, requestTagSearch?: (tagName: string) => void) {
  const parts: React.ReactNode[] = [];
  const pattern = /(^|[\s([>])#([A-Za-z0-9][A-Za-z0-9_-]*)\b/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = match[1] ?? "";
    const tagName = match[2] ?? "";
    const tagStart = index + prefix.length;
    parts.push(text.slice(lastIndex, tagStart));
    parts.push(
      <button
        key={`${tagName}-${tagStart}`}
        type="button"
        onClick={() => requestTagSearch?.(tagName)}
        className="rounded px-0.5 text-violet-600 underline underline-offset-2 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
        aria-label={`Search tag #${tagName}`}
      >
        #{tagName}
      </button>,
    );
    lastIndex = tagStart + tagName.length + 1;
  }

  parts.push(text.slice(lastIndex));
  return parts;
}
```

Use it in ReactMarkdown components for `p` and `li` by recursively mapping plain string children only.

- [ ] **Step 4: Run focused editor tests**

Run: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "preview body tag|frontmatter tag chip|renders only frontmatter tags"`

Expected: PASS.

## Task 6: Wiki, Verification, Commit, PR Loop

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/Munjib.md`
- Modify: `wiki/Project PRD.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update wiki implementation entries**

Update `wiki/Document Editing Workflow.md`, `wiki/Munjib.md`, `wiki/Project PRD.md`, `wiki/index.md`, and `wiki/log.md` so they state that Issue #71 implements `tag:#name` exact search, Properties frontmatter tag click search, and preview body tag click search. Keep the existing statement that Properties tags are frontmatter-only and body-only tags are not rendered in the Properties row.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx
pnpm exec tsc --noEmit
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: all commands PASS.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add app/workspaces/[workspaceSlug]/page.tsx components/app-shell.tsx components/document-list.tsx components/document-navigation.tsx components/document-editor/document-properties.tsx components/document-editor/markdown-preview.tsx tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx wiki/Document\ Editing\ Workflow.md wiki/Munjib.md wiki/Project\ PRD.md wiki/index.md wiki/log.md wiki/manifest.json docs/superpowers/plans/2026-05-27-tag-click-search.md
git commit -m "feat: add tag click search"
```

- [ ] **Step 4: Push and open PR**

Run:

```bash
git push -u origin issue-71-tag-click-search
gh pr create --draft --title "Add tag click search" --body "Closes #71"
gh pr ready
```

- [ ] **Step 5: Review loop**

Wait at least 5 minutes, then run:

```bash
gh pr checks
gh pr view --json reviewDecision,reviews,comments,url
```

If review feedback or failing checks are actionable, fix them on this branch and repeat verification, commit, push, and review inspection.
