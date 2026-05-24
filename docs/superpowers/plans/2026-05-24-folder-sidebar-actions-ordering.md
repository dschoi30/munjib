# Folder Sidebar Actions And Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the workspace sidebar so folder rows sort and create items predictably, show title-only document labels, and move folder-scoped creation into the folder action menu without redirect flicker.

**Architecture:** Keep the existing navigation module split. Put ordering in `components/document-navigation/tree.ts`, keep title-only document labeling in `lib/workspace-tree.ts` and `DocumentLinkRow`, and handle folder-menu creation through async callbacks in `components/document-navigation.tsx`. Preserve top toolbar progressive form behavior by adding a form opt-out flag for menu-scoped server actions.

**Tech Stack:** Next.js App Router server actions, React client components, Vitest, React Testing Library, pnpm wiki maintenance scripts.

---

## File Structure

- Modify `app/workspaces/[workspaceSlug]/actions.ts`: let `createDocumentAction()` and `createFolderAction()` return IDs when `redirect=false`, while preserving existing redirect behavior for normal form submits.
- Modify `components/document-list.tsx`: update create action prop return types to match the new union result.
- Modify `components/document-create-controls.tsx`: keep toolbar forms unchanged, but update prop types.
- Modify `components/document-navigation/types.ts`: add create result and folder menu callback types.
- Modify `components/document-navigation/tree.ts`: implement folder-first, descending title/name ordering with deterministic fallbacks.
- Modify `components/document-navigation/folder-row.tsx`: remove inline `+`; add `Add folder` and `Add document` menu items wired to callbacks.
- Modify `components/document-navigation.tsx`: implement no-flicker folder-menu add callbacks that call server actions with `redirect=false`, close the menu, and navigate/refresh in a transition.
- Modify `components/document-navigation/document-row.tsx`: render visible `document.title` only.
- Modify `lib/workspace-tree.ts`: make `documentDisplayLabel()` title-only and leave path identity to `path` consumers.
- Modify `tests/workspace-tree.test.ts`: update helper expectation for title-only labels.
- Modify `tests/components/document-list.test.tsx`: cover ordering, title-only visible labels, no direct folder `+`, and folder menu add actions.
- Modify `tests/workspace-actions.test.ts`: cover `redirect=false` creation return contracts.
- Modify `wiki/Folder Hierarchy Model.md`, `wiki/log.md`, `wiki/manifest.json`: record the durable sidebar contract change.

---

### Task 1: Server Action Return Contract

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Modify: `tests/workspace-actions.test.ts`

- [ ] **Step 1: Write failing tests for `redirect=false` creation**

Add these tests near the existing create/import tests in `tests/workspace-actions.test.ts`:

```ts
test("createDocumentAction returns a document id instead of redirecting when redirect is false", async () => {
  mocks.createDocument.mockResolvedValue({ id: "doc-created" });
  const { createDocumentAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
  const formData = new FormData();
  formData.set("folderId", "folder-engineering");
  formData.set("redirect", "false");

  const result = await createDocumentAction("company-handbook", formData);

  expect(mocks.createDocument).toHaveBeenCalledWith({
    workspaceSlug: "company-handbook",
    actorId: "user-1",
    folderId: "folder-engineering",
    title: "Untitled",
    contentMarkdown: "",
  });
  expect(result).toEqual({ documentId: "doc-created" });
  expect(mocks.redirect).not.toHaveBeenCalled();
});

test("createFolderAction returns a folder id instead of redirecting when redirect is false", async () => {
  mocks.createFolder.mockResolvedValue({ id: "folder-created" });
  const { createFolderAction } = await import("@/app/workspaces/[workspaceSlug]/actions");
  const formData = new FormData();
  formData.set("parentFolderId", "folder-engineering");
  formData.set("redirect", "false");

  const result = await createFolderAction("company-handbook", formData);

  expect(mocks.createFolder).toHaveBeenCalledWith({
    workspaceSlug: "company-handbook",
    actorId: "user-1",
    parentFolderId: "folder-engineering",
    name: "Untitled folder",
  });
  expect(result).toEqual({ folderId: "folder-created" });
  expect(mocks.redirect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: the new tests fail because both actions currently call `redirect()`.

- [ ] **Step 3: Implement the `redirect=false` branch**

In `app/workspaces/[workspaceSlug]/actions.ts`, change the two create actions to:

```ts
export async function createDocumentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const folderId = String(formData.get("folderId") || "") || null;
  const document = await createDocument({
    workspaceSlug,
    actorId: user.id,
    folderId,
    title: "Untitled",
    contentMarkdown: "",
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  if (formData.get("redirect") === "false") {
    return { documentId: document.id };
  }
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}

export async function createFolderAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const parentFolderId = String(formData.get("parentFolderId") || "") || null;
  const folder = await createFolder({
    workspaceSlug,
    actorId: user.id,
    parentFolderId,
    name: "Untitled folder",
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  if (formData.get("redirect") === "false") {
    return { folderId: folder.id };
  }
  redirect(`/workspaces/${workspaceSlug}?folder=${folder.id}`);
}
```

- [ ] **Step 4: Verify the server action tests pass**

Run:

```bash
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add 'app/workspaces/[workspaceSlug]/actions.ts' tests/workspace-actions.test.ts
git commit -m "feat: support sidebar create action results"
```

---

### Task 2: Tree Ordering And Title-Only Labels

**Files:**
- Modify: `components/document-navigation/tree.ts`
- Modify: `components/document-navigation/document-row.tsx`
- Modify: `lib/workspace-tree.ts`
- Modify: `tests/workspace-tree.test.ts`
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Write failing component and helper tests**

In `tests/workspace-tree.test.ts`, replace the display-label test with:

```ts
it("uses document titles as display labels", () => {
  expect(documentDisplayLabel({ title: "Runbook", path: "/runbook" })).toBe("Runbook");
  expect(documentDisplayLabel({ title: "Runbook", path: "/operations/runbook" })).toBe("Runbook");
});
```

In `tests/components/document-list.test.tsx`, add this test inside `describe("DocumentList", () => { ... })`:

```tsx
it("orders folders before documents and sorts each group by title descending", () => {
  renderList({
    folders: [
      { id: "folder-alpha", parentFolderId: null, name: "Alpha", path: "/alpha" },
      { id: "folder-zulu", parentFolderId: null, name: "Zulu", path: "/zulu" },
    ],
    documents: [
      {
        id: "doc-alpha",
        folderId: null,
        title: "Alpha Doc",
        path: "/alpha-doc",
        contentText: "",
        canWrite: true,
      },
      {
        id: "doc-zulu",
        folderId: null,
        title: "Zulu Doc",
        path: "/zulu-doc",
        contentText: "",
        canWrite: true,
      },
    ],
  });

  const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
  const rowNames = Array.from(
    allDocumentsNav.querySelectorAll("button[aria-expanded], a[href]"),
  ).map((element) => element.textContent?.trim());

  expect(rowNames).toEqual(["Zulu", "Alpha", "Zulu Doc", "Alpha Doc"]);
});

it("shows duplicate document titles without path context in visible rows", () => {
  renderList({
    documents: [
      {
        id: "doc-root-runbook",
        folderId: null,
        title: "Runbook",
        path: "/runbook",
        contentText: "",
        canWrite: true,
      },
      {
        id: "doc-folder-runbook",
        folderId: null,
        title: "Runbook",
        path: "/operations/runbook",
        contentText: "",
        canWrite: true,
      },
    ],
  });

  expect(screen.getAllByRole("link", { name: "Runbook" })).toHaveLength(4);
  expect(screen.queryByText("Runbook · /operations/runbook")).toBeNull();
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx
```

Expected: FAIL on old path-qualified label behavior and path-ascending tree ordering.

- [ ] **Step 3: Implement ordering and title-only labels**

Replace `buildTreeItems()` sorting in `components/document-navigation/tree.ts` with:

```ts
  ].sort(compareTreeRows);
}

function compareTreeRows(left: TreeRow, right: TreeRow) {
  if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;

  const leftLabel = left.kind === "folder" ? left.folder.name : left.document.title;
  const rightLabel = right.kind === "folder" ? right.folder.name : right.document.title;
  const labelComparison = rightLabel.localeCompare(leftLabel, undefined, {
    sensitivity: "base",
  });
  if (labelComparison !== 0) return labelComparison;

  const leftPath = left.kind === "folder" ? left.folder.path : left.document.path;
  const rightPath = right.kind === "folder" ? right.folder.path : right.document.path;
  const pathComparison = leftPath.localeCompare(rightPath);
  if (pathComparison !== 0) return pathComparison;

  const leftId = left.kind === "folder" ? left.folder.id : left.document.id;
  const rightId = right.kind === "folder" ? right.folder.id : right.document.id;
  return leftId.localeCompare(rightId);
}
```

Change `lib/workspace-tree.ts`:

```ts
export function documentDisplayLabel(document: Pick<Document, "title" | "path">) {
  return document.title;
}
```

Change the visible row label in `components/document-navigation/document-row.tsx`:

```tsx
<span className="block truncate">{document.title}</span>
```

Keep this line for action labels, which now also resolve to the document title:

```ts
const displayLabel = documentDisplayLabel(document);
```

- [ ] **Step 4: Verify tests pass**

Run:

```bash
pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add components/document-navigation/tree.ts components/document-navigation/document-row.tsx lib/workspace-tree.ts tests/workspace-tree.test.ts tests/components/document-list.test.tsx
git commit -m "feat: refine sidebar ordering and labels"
```

---

### Task 3: Folder Menu Add Actions Without Inline Plus

**Files:**
- Modify: `components/document-list.tsx`
- Modify: `components/document-create-controls.tsx`
- Modify: `components/document-navigation/types.ts`
- Modify: `components/document-navigation/folder-row.tsx`
- Modify: `components/document-navigation.tsx`
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Write failing tests for folder menu creation**

Add these tests to `tests/components/document-list.test.tsx`:

```tsx
it("moves folder-scoped creation into the folder actions menu", () => {
  renderList();

  expect(screen.queryByRole("button", { name: /New document in Engineering/ })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Open actions for Engineering/ }));

  expect(screen.getByRole("menuitem", { name: "Add folder" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Add document" })).toBeTruthy();
});

it("adds a child folder from the folder actions menu without direct form redirect", async () => {
  const createFolderAction = vi.fn(async () => ({ folderId: "folder-created" }));
  renderList({ createFolderAction });

  fireEvent.click(screen.getByRole("button", { name: /Open actions for Engineering/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add folder" }));

  await waitFor(() => {
    expect(createFolderAction).toHaveBeenCalledWith(expect.any(FormData));
  });
  const submittedFormData = (createFolderAction.mock.calls as unknown as FormData[][])[0][0];
  expect(submittedFormData.get("parentFolderId")).toBe("folder-engineering");
  expect(submittedFormData.get("redirect")).toBe("false");
  expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?folder=folder-created");
});

it("adds a document from the folder actions menu without direct form redirect", async () => {
  const createAction = vi.fn(async () => ({ documentId: "doc-created" }));
  renderList({ createAction });

  fireEvent.click(screen.getByRole("button", { name: /Open actions for Engineering/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add document" }));

  await waitFor(() => {
    expect(createAction).toHaveBeenCalledWith(expect.any(FormData));
  });
  const submittedFormData = (createAction.mock.calls as unknown as FormData[][])[0][0];
  expect(submittedFormData.get("folderId")).toBe("folder-engineering");
  expect(submittedFormData.get("redirect")).toBe("false");
  expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-created");
});
```

- [ ] **Step 2: Run failing component tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: FAIL because the inline `+` still exists and menu add items do not exist.

- [ ] **Step 3: Add shared result/callback types**

In `components/document-navigation/types.ts`, add:

```ts
export type CreateDocumentResult = { documentId: string };
export type CreateFolderResult = { folderId: string };
export type CreateDocumentAction = (formData: FormData) => Promise<CreateDocumentResult | void>;
export type CreateFolderAction = (formData: FormData) => Promise<CreateFolderResult | void>;
export type AddFolderChildHandler = (folderId: string) => void;
export type AddFolderDocumentHandler = (folderId: string) => void;
```

- [ ] **Step 4: Update prop types**

In `components/document-list.tsx`, import the new action types:

```ts
import type {
  CreateDocumentAction,
  CreateFolderAction,
} from "@/components/document-navigation/types";
```

Change prop types:

```ts
  createAction: CreateDocumentAction;
  createFolderAction: CreateFolderAction;
```

In `components/document-create-controls.tsx`, import and use the same types:

```ts
import type {
  CreateDocumentAction,
  CreateFolderAction,
} from "@/components/document-navigation/types";
```

Change prop types:

```ts
  createAction: CreateDocumentAction;
  createFolderAction: CreateFolderAction;
```

In `components/document-navigation.tsx`, import and use `CreateDocumentAction` and `CreateFolderAction` for the component props.

- [ ] **Step 5: Implement client-side add callbacks**

In `components/document-navigation.tsx`, add `createFolderAction` to the props and destructuring. Then add:

```ts
  async function addFolderChild(folderId: string) {
    const formData = new FormData();
    formData.set("parentFolderId", folderId);
    formData.set("redirect", "false");
    const result = await createFolderAction(formData);
    setOpenMenuId(null);
    startTransition(() => {
      if (result?.folderId) {
        router.push(`/workspaces/${workspaceSlug}?folder=${result.folderId}`);
        return;
      }
      router.refresh();
    });
  }

  async function addFolderDocument(folderId: string) {
    const formData = new FormData();
    formData.set("folderId", folderId);
    formData.set("redirect", "false");
    const result = await createAction(formData);
    setOpenMenuId(null);
    startTransition(() => {
      if (result?.documentId) {
        router.push(workspaceDocumentHref({ workspaceSlug, documentId: result.documentId }));
        return;
      }
      router.refresh();
    });
  }
```

Pass `createFolderAction={createFolderAction}` from `DocumentList` to `DocumentNavigation`.

In the `FolderToggleRow` call, remove `createAction={createAction}` and pass:

```tsx
onAddFolder={addFolderChild}
onAddDocument={addFolderDocument}
```

- [ ] **Step 6: Replace inline plus with menu items**

In `components/document-navigation/folder-row.tsx`, remove `Plus` from the icon import:

```ts
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
```

Change props by removing `createAction` and adding:

```ts
onAddFolder: (folderId: string) => void;
onAddDocument: (folderId: string) => void;
```

Remove the inline `<form action={createAction}>...</form>` block.

At the top of the menu content before `Rename`, add:

```tsx
          <button
            type="button"
            role="menuitem"
            disabled={!canWrite}
            onClick={() => onAddFolder(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            Add folder
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canWrite}
            onClick={() => onAddDocument(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            Add document
          </button>
```

- [ ] **Step 7: Verify component tests pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add components/document-list.tsx components/document-create-controls.tsx components/document-navigation.tsx components/document-navigation/types.ts components/document-navigation/folder-row.tsx tests/components/document-list.test.tsx
git commit -m "feat: move folder create actions into menu"
```

---

### Task 4: Wiki Maintenance And Final Verification

**Files:**
- Modify: `wiki/Folder Hierarchy Model.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update the folder hierarchy wiki page**

In `wiki/Folder Hierarchy Model.md`, replace the paragraph that says:

```md
문서 navigation과 quick switcher는 duplicate title을 구분할 수 있도록 `Document.path`를 함께 사용한다. Root title과 path가 일치하는 문서는 title만 표시하고, folder 아래에 같은 title이 있을 수 있는 문서는 `Title · /folder/title` 형태로 context를 보강한다. Sidebar의 `Recents` section은 최대 5개 document만 표시하고, tree depth와 무관하게 동일한 left padding을 사용한다. 전체 tree section은 `Documents` heading 아래에 표시한다.
```

With:

```md
문서 navigation row는 duplicate title이 있어도 화면에는 항상 document `title`만 표시한다. Duplicate title 구분이 필요한 action label이나 내부 identity는 `Document.path`를 사용할 수 있지만, sidebar visible label은 `Title · /folder/title`처럼 path context를 붙이지 않는다. Sidebar tree는 같은 parent 안에서 folder를 document보다 먼저 보여주고, folder name과 document title은 각각 내림차순으로 정렬한다. Sidebar의 `Recents` section은 최대 5개 document만 표시하고, tree depth와 무관하게 동일한 left padding을 사용한다. 전체 tree section은 `Documents` heading 아래에 표시한다.
```

Replace the Issue #26 sentence that says:

```md
Folder row는 `...`와 `+` control을 드러내며, row-level `+` control은 해당 folder 안에 blank document를 생성하고 server-action redirect로 생성된 document를 연다.
```

With:

```md
Folder row는 hover/focus 상태에서 `...` action menu만 드러내며, folder-scoped `Add folder`와 `Add document`는 이 menu 안에서 실행한다. Menu-scoped creation은 server-action redirect 대신 client-side action result와 router navigation/refresh를 사용해 sidebar 깜빡임을 줄인다.
```

Update frontmatter:

```yaml
updated: 2026-05-24
source_count: 33
```

- [ ] **Step 2: Append final wiki log entry**

Add a new top entry to `wiki/log.md`:

```md
## 2026-05-24T13:45:00+09:00 - feature

- Result: Issue #57 folder sidebar action/order refinements를 구현했다.
- Coverage: Sidebar tree는 folder 우선, 같은 kind 안에서는 title/name 내림차순으로 정렬한다. Document row visible label은 path context 없이 title만 표시한다. Folder row hover action은 `...` menu만 노출하고, `Add folder`/`Add document`는 menu-scoped client action result를 사용해 redirect-style 깜빡임을 줄인다.
- Pages: [[Folder Hierarchy Model]], [[log|Wiki Log]].
- Source evidence: `components/document-navigation/tree.ts`, `components/document-navigation/folder-row.tsx`, `components/document-navigation.tsx`, `lib/workspace-tree.ts`, `app/workspaces/[workspaceSlug]/actions.ts`, `tests/components/document-list.test.tsx`, `tests/workspace-actions.test.ts`.
- Verification: `pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.
```

Increase `source_count` in `wiki/log.md` by 1.

- [ ] **Step 3: Run manifest and lint**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: both commands exit 0.

- [ ] **Step 4: Run final verification**

Run:

```bash
pnpm exec vitest run tests/workspace-tree.test.ts tests/components/document-list.test.tsx tests/workspace-actions.test.ts
pnpm exec tsc --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 5: Run staged wiki sync checks**

Run:

```bash
git add 'app/workspaces/[workspaceSlug]/actions.ts' components/document-list.tsx components/document-create-controls.tsx components/document-navigation.tsx components/document-navigation/types.ts components/document-navigation/tree.ts components/document-navigation/folder-row.tsx components/document-navigation/document-row.tsx lib/workspace-tree.ts tests/workspace-tree.test.ts tests/components/document-list.test.tsx tests/workspace-actions.test.ts wiki/Folder\ Hierarchy\ Model.md wiki/log.md wiki/manifest.json
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: sync plan reports source and wiki maintenance changes; lint and sync-check exit 0.

- [ ] **Step 6: Commit Task 4**

```bash
git add wiki/Folder\ Hierarchy\ Model.md wiki/log.md wiki/manifest.json
git commit -m "docs: sync folder sidebar behavior"
```

---

## Self-Review

- Spec coverage: Task 2 covers folder-first/name-desc/document-title-desc ordering and title-only labels. Task 3 covers removing the folder hover `+`, adding menu `Add folder`/`Add document`, and no-flicker client-side creation. Task 4 covers wiki updates.
- Placeholder scan: No placeholder markers, deferred implementation notes, or unspecified test steps remain.
- Type consistency: `CreateDocumentAction`, `CreateFolderAction`, `CreateDocumentResult`, and `CreateFolderResult` are introduced before use. Folder row callbacks receive `folderId: string`, matching `FolderListItem.id`.
