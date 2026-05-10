# Folder Row Hover Actions Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Notion-style hover actions to folder rows with real document creation, rename, trash, and favorites behavior while removing the always-visible document star.

**Architecture:** Keep persistence changes out of scope. Add thin workspace server actions for folder rename/archive on top of `lib/folders/service.ts`, pass those actions plus the existing document create action into `DocumentNavigation`, and keep document/folder favorites in workspace-scoped `localStorage`. Refactor only the sidebar row rendering needed to support row menus, inline rename, and accessible hover/focus controls.

**Tech Stack:** Next.js App Router server actions, React client components, TypeScript, Tailwind, lucide-react, Vitest/Playwright, existing wiki maintenance CLI.

---

## File Structure

- Modify `app/workspaces/[workspaceSlug]/actions.ts`: import `renameFolder` and `archiveFolder`; add `renameFolderAction` and `archiveFolderAction`.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: bind folder actions, read `folderError` from search params, and pass both into `DocumentList`.
- Modify `components/document-list.tsx`: extend props so `DocumentNavigation` receives `canWrite`, `createAction`, `renameFolderAction`, and `archiveFolderAction`.
- Modify `components/document-navigation.tsx`: replace the document star with document row menus; add folder row hover actions, inline rename, row-level document create forms, typed document/folder favorite state, and favorite folders in the Favorites section.
- Modify `tests/e2e/login.spec.ts`: update favorite interaction from star button to row menu; add smoke coverage for folder row `+`, rename, non-empty trash guard, folder favorite, and no visible star icon.
- Update wiki after implementation: `wiki/Folder Hierarchy Model.md`, `wiki/Document Editing Workflow.md`, `wiki/log.md`, and `wiki/manifest.json`.

## Task 1: Add Folder Mutation Server Actions

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Test: `pnpm exec tsc --noEmit`

- [ ] **Step 1: Import folder service mutations**

In `app/workspaces/[workspaceSlug]/actions.ts`, change:

```ts
import { createFolder } from "@/lib/folders/service";
```

to:

```ts
import { archiveFolder, createFolder, renameFolder } from "@/lib/folders/service";
```

- [ ] **Step 2: Add server actions**

Add these functions immediately after `createFolderAction`:

```ts
export async function renameFolderAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const folderId = String(formData.get("folderId"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(
      `/workspaces/${workspaceSlug}?folder=${folderId}&folderError=${encodeURIComponent(
        "FOLDER_NAME_REQUIRED",
      )}`,
    );
  }
  const folder = await renameFolder({
    folderId,
    actorId: user.id,
    name,
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}?folder=${folder.id}`);
}

export async function archiveFolderAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const folderId = String(formData.get("folderId"));

  try {
    await archiveFolder({
      folderId,
      actorId: user.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FOLDER_ACTION_FAILED";
    revalidatePath(`/workspaces/${workspaceSlug}`);
    redirect(
      `/workspaces/${workspaceSlug}?folder=${folderId}&folderError=${encodeURIComponent(message)}`,
    );
  }

  revalidatePath(`/workspaces/${workspaceSlug}`);
  redirect(`/workspaces/${workspaceSlug}`);
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add 'app/workspaces/[workspaceSlug]/actions.ts'
git commit -m "feat: add folder row mutation actions"
```

## Task 2: Thread Actions And Error State Into Sidebar

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `components/document-list.tsx`
- Test: `pnpm exec tsc --noEmit`

- [ ] **Step 1: Import new actions in page**

In `app/workspaces/[workspaceSlug]/page.tsx`, extend the local actions import:

```ts
import {
  archiveFolderAction,
  createFolderAction,
  createDocumentAction,
  createCommentAction,
  createDocumentFromBrokenLinkAction,
  renameFolderAction,
  restoreDocumentVersionAction,
  updateDocumentAction,
  uploadDocumentAttachmentAction,
} from "./actions";
```

- [ ] **Step 2: Accept folderError search param**

Change the page props type:

```ts
searchParams: Promise<{ document?: string; folder?: string; q?: string; folderError?: string }>;
```

Change the destructuring:

```ts
const {
  document: selectedDocumentId,
  folder: selectedFolderIdParam,
  q,
  folderError,
} = await searchParams;
```

- [ ] **Step 3: Bind folder actions**

After existing action bindings, add:

```ts
const renameFolder = renameFolderAction.bind(null, workspaceSlug);
const archiveFolder = archiveFolderAction.bind(null, workspaceSlug);
```

- [ ] **Step 4: Pass sidebar action props**

In the `DocumentList` JSX, add:

```tsx
renameFolderAction={renameFolder}
archiveFolderAction={archiveFolder}
folderError={folderError ?? ""}
```

- [ ] **Step 5: Extend `DocumentList` props**

In `components/document-list.tsx`, extend the function props:

```ts
  renameFolderAction,
  archiveFolderAction,
  folderError,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
  renameFolderAction: (formData: FormData) => Promise<void>;
  archiveFolderAction: (formData: FormData) => Promise<void>;
  selectedFolderId: string | null;
  searchQuery: string;
  folderError: string;
}) {
```

- [ ] **Step 6: Pass props into `DocumentNavigation`**

Update `DocumentNavigation` usage:

```tsx
<DocumentNavigation
  workspaceSlug={workspaceSlug}
  folders={folders}
  documents={documents}
  canWrite={canWrite}
  createAction={createAction}
  renameFolderAction={renameFolderAction}
  archiveFolderAction={archiveFolderAction}
  selectedFolderId={selectedFolderId}
  searchQuery={searchQuery}
  folderError={folderError}
/>
```

- [ ] **Step 7: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: FAIL until `DocumentNavigation` accepts the new props. Do not commit this task until Task 3 completes the receiving side.

## Task 3: Refactor Favorites State And Document Row Menu

**Files:**
- Modify: `components/document-navigation.tsx`
- Test: `tests/e2e/login.spec.ts`

- [ ] **Step 1: Update imports**

In `components/document-navigation.tsx`, replace:

```ts
import { ChevronDown, ChevronRight, Search, Star } from "lucide-react";
```

with:

```ts
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
```

- [ ] **Step 2: Extend `DocumentNavigation` props**

Change the function signature and type block to include the new props:

```ts
export function DocumentNavigation({
  workspaceSlug,
  folders,
  documents,
  canWrite,
  createAction,
  renameFolderAction,
  archiveFolderAction,
  selectedFolderId,
  searchQuery,
  folderError,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  renameFolderAction: (formData: FormData) => Promise<void>;
  archiveFolderAction: (formData: FormData) => Promise<void>;
  selectedFolderId: string | null;
  searchQuery: string;
  folderError: string;
}) {
```

- [ ] **Step 3: Replace favorite state**

Replace:

```ts
const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
```

with:

```ts
type FavoriteState = {
  documents: string[];
  folders: string[];
};

const emptyFavorites: FavoriteState = { documents: [], folders: [] };

const [favoriteIds, setFavoriteIds] = useState<FavoriteState>(emptyFavorites);
const [openMenuId, setOpenMenuId] = useState<string | null>(null);
const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
```

Place `type FavoriteState` and `emptyFavorites` above `export function DocumentNavigation`.

- [ ] **Step 4: Update localStorage read**

Replace the existing favorites loading effect with:

```ts
useEffect(() => {
  try {
    const raw = window.localStorage.getItem(`munjib:favorites:${workspaceSlug}`);
    if (!raw) {
      setFavoriteIds(emptyFavorites);
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      setFavoriteIds({ documents: parsed.filter((id) => typeof id === "string"), folders: [] });
      return;
    }
    if (parsed && typeof parsed === "object") {
      const value = parsed as Partial<FavoriteState>;
      setFavoriteIds({
        documents: Array.isArray(value.documents)
          ? value.documents.filter((id): id is string => typeof id === "string")
          : [],
        folders: Array.isArray(value.folders)
          ? value.folders.filter((id): id is string => typeof id === "string")
          : [],
      });
      return;
    }
    setFavoriteIds(emptyFavorites);
  } catch {
    setFavoriteIds(emptyFavorites);
  }
}, [workspaceSlug]);
```

- [ ] **Step 5: Update derived favorites and toggles**

Replace:

```ts
const favoriteDocuments = documents.filter((document) => favoriteIds.includes(document.id));
const recentDocuments = documents.slice(0, 5);
```

with:

```ts
const favoriteDocuments = documents.filter((document) => favoriteIds.documents.includes(document.id));
const favoriteFolders = folders.filter((folder) => favoriteIds.folders.includes(folder.id));
const recentDocuments = documents
  .filter((document) => !favoriteIds.documents.includes(document.id))
  .slice(0, 5);
```

Replace `toggleFavorite` with:

```ts
function toggleDocumentFavorite(documentId: string) {
  setFavoriteIds((current) => ({
    ...current,
    documents: current.documents.includes(documentId)
      ? current.documents.filter((favoriteId) => favoriteId !== documentId)
      : [...current.documents, documentId],
  }));
}

function toggleFolderFavorite(folderId: string) {
  setFavoriteIds((current) => ({
    ...current,
    folders: current.folders.includes(folderId)
      ? current.folders.filter((favoriteId) => favoriteId !== folderId)
      : [...current.folders, folderId],
  }));
}
```

- [ ] **Step 6: Keep localStorage writes typed**

Keep the existing write effect, but confirm it serializes the typed object:

```ts
useEffect(() => {
  window.localStorage.setItem(`munjib:favorites:${workspaceSlug}`, JSON.stringify(favoriteIds));
}, [favoriteIds, workspaceSlug]);
```

- [ ] **Step 7: Update all document row call sites**

Every `DocumentLinkRow` call passes:

```tsx
favoriteIds={favoriteIds.documents}
openMenuId={openMenuId}
onOpenMenu={setOpenMenuId}
onToggleFavorite={toggleDocumentFavorite}
```

- [ ] **Step 8: Replace `DocumentLinkRow` with menu version**

Replace the full `DocumentLinkRow` function with:

```tsx
function DocumentLinkRow({
  workspaceSlug,
  document,
  favoriteIds,
  searchQuery,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
}: {
  workspaceSlug: string;
  document: DocumentListItem;
  favoriteIds: string[];
  searchQuery: string;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
}) {
  const isFavorite = favoriteIds.includes(document.id);
  const menuId = `document:${document.id}`;
  const isMenuOpen = openMenuId === menuId;

  return (
    <div className="group relative flex items-start gap-1 rounded-md hover:bg-muted focus-within:bg-muted">
      <Link
        href={`/workspaces/${workspaceSlug}?document=${document.id}${
          searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""
        }`}
        className="min-w-0 flex-1 px-2 py-2 text-sm"
      >
        <span className="block truncate">{documentDisplayLabel(document)}</span>
        {searchQuery ? (
          <span className="mt-1 block truncate text-xs text-slate-500">{document.path}</span>
        ) : null}
      </Link>
      <button
        type="button"
        aria-label={`Open actions for ${document.title}`}
        aria-expanded={isMenuOpen}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenMenu(isMenuOpen ? null : menuId);
        }}
        className="mt-1 rounded p-1 text-slate-400 opacity-0 hover:bg-white hover:text-ink focus:opacity-100 group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {isMenuOpen ? (
        <div
          role="menu"
          className="absolute right-1 top-8 z-20 w-44 rounded-md border border-border bg-white p-1 text-sm shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleFavorite(document.id);
              onOpenMenu(null);
            }}
            className="w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 9: Update e2e favorite interaction**

In `tests/e2e/login.spec.ts`, replace:

```ts
await page.getByRole("button", { name: "Add Welcome to favorites" }).first().click();
```

with:

```ts
await documentList.getByRole("button", { name: "Open actions for Welcome" }).first().click();
await page.getByRole("menuitem", { name: "Add to favorites" }).click();
```

Add after the Favorites assertion:

```ts
await expect(documentList.getByRole("button", { name: "Add Welcome to favorites" })).toHaveCount(0);
```

- [ ] **Step 10: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS after Task 2 and Task 3 compile together.

## Task 4: Add Folder Row Hover Actions And Inline Rename

**Files:**
- Modify: `components/document-navigation.tsx`
- Test: `pnpm exec tsc --noEmit`

- [ ] **Step 1: Pass folder action props from tree rendering**

Update `FolderToggleRow` call inside `renderTreeItems`:

```tsx
<FolderToggleRow
  folder={item.folder}
  expanded={isExpanded}
  selected={item.folder.id === selectedFolderId}
  canWrite={canWrite}
  createAction={createAction}
  renameFolderAction={renameFolderAction}
  archiveFolderAction={archiveFolderAction}
  isFavorite={favoriteIds.folders.includes(item.folder.id)}
  isRenaming={renamingFolderId === item.folder.id}
  openMenuId={openMenuId}
  onOpenMenu={setOpenMenuId}
  onStartRename={() => setRenamingFolderId(item.folder.id)}
  onCancelRename={() => setRenamingFolderId(null)}
  onToggleFavorite={() => toggleFolderFavorite(item.folder.id)}
  onToggle={() => toggleFolder(item.folder.id)}
/>
```

- [ ] **Step 2: Replace `FolderToggleRow`**

Replace the full `FolderToggleRow` function with:

```tsx
function FolderToggleRow({
  folder,
  expanded,
  selected,
  canWrite,
  createAction,
  renameFolderAction,
  archiveFolderAction,
  isFavorite,
  isRenaming,
  openMenuId,
  onOpenMenu,
  onStartRename,
  onCancelRename,
  onToggleFavorite,
  onToggle,
}: {
  folder: FolderListItem;
  expanded: boolean;
  selected: boolean;
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  renameFolderAction: (formData: FormData) => Promise<void>;
  archiveFolderAction: (formData: FormData) => Promise<void>;
  isFavorite: boolean;
  isRenaming: boolean;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onToggleFavorite: () => void;
  onToggle: () => void;
}) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const menuId = `folder:${folder.id}`;
  const isMenuOpen = openMenuId === menuId;

  if (isRenaming) {
    return (
      <form action={renameFolderAction} className="flex w-full items-center gap-1 rounded-md bg-muted px-2 py-1">
        <input type="hidden" name="folderId" value={folder.id} />
        <label className="sr-only" htmlFor={`rename-folder-${folder.id}`}>
          Rename {folder.name}
        </label>
        <input
          id={`rename-folder-${folder.id}`}
          name="name"
          defaultValue={folder.name}
          autoFocus
          required
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelRename();
            }
          }}
          className="min-w-0 flex-1 rounded border border-border bg-white px-2 py-1 text-sm outline-none focus:border-ink"
        />
        <button type="submit" className="rounded px-2 py-1 text-xs font-medium hover:bg-white">
          Rename
        </button>
      </form>
    );
  }

  return (
    <div
      className={
        selected
          ? "group relative flex w-full items-center gap-1 rounded-md bg-white px-2 py-1 text-sm font-medium shadow-sm focus-within:bg-muted"
          : "group relative flex w-full items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-muted focus-within:bg-muted"
      }
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left"
      >
        <ChevronIcon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="min-w-0 truncate">{folder.name}</span>
      </button>
      {canWrite ? (
        <form action={createAction} className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <input type="hidden" name="folderId" value={folder.id} />
          <input type="hidden" name="template" value="blank" />
          <button
            type="submit"
            aria-label={`New document in ${folder.name}`}
            className="rounded p-1 text-slate-500 hover:bg-white hover:text-ink"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      ) : null}
      <button
        type="button"
        aria-label={`Open actions for ${folder.name}`}
        aria-expanded={isMenuOpen}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenMenu(isMenuOpen ? null : menuId);
        }}
        className="rounded p-1 text-slate-500 opacity-0 hover:bg-white hover:text-ink focus:opacity-100 group-hover:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {isMenuOpen ? (
        <div
          role="menu"
          className="absolute right-1 top-8 z-20 w-44 rounded-md border border-border bg-white p-1 text-sm font-normal shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canWrite}
            onClick={() => {
              onOpenMenu(null);
              onStartRename();
            }}
            className="w-full rounded px-2 py-1.5 text-left hover:bg-muted disabled:text-slate-400"
          >
            Rename
          </button>
          <form action={archiveFolderAction}>
            <input type="hidden" name="folderId" value={folder.id} />
            <button
              type="submit"
              role="menuitem"
              disabled={!canWrite}
              className="w-full rounded px-2 py-1.5 text-left hover:bg-muted disabled:text-slate-400"
            >
              Move to trash
            </button>
          </form>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleFavorite();
              onOpenMenu(null);
            }}
            className="w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Close menus on Escape**

In the global keydown effect, replace:

```ts
if (event.key === "Escape") setIsSwitcherOpen(false);
```

with:

```ts
if (event.key === "Escape") {
  setIsSwitcherOpen(false);
  setOpenMenuId(null);
  setRenamingFolderId(null);
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS after Tasks 2-4 compile together.

- [ ] **Step 5: Commit**

Run:

```bash
git add components/document-navigation.tsx components/document-list.tsx 'app/workspaces/[workspaceSlug]/page.tsx'
git commit -m "feat: add folder row action menus"
```

## Task 5: Render Favorite Folders And Error Feedback

**Files:**
- Modify: `components/document-navigation.tsx`
- Test: `pnpm exec tsc --noEmit`

- [ ] **Step 1: Add favorite folder rendering before favorite documents**

Replace the Favorites block:

```tsx
{favoriteDocuments.length > 0 ? (
  <DocumentSection
    title="Favorites"
    workspaceSlug={workspaceSlug}
    documents={favoriteDocuments}
    favoriteIds={favoriteIds.documents}
    searchQuery={searchQuery}
    openMenuId={openMenuId}
    onOpenMenu={setOpenMenuId}
    onToggleFavorite={toggleDocumentFavorite}
  />
) : null}
```

with:

```tsx
{favoriteDocuments.length > 0 || favoriteFolders.length > 0 ? (
  <section className="mb-4">
    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Favorites</p>
    <div className="space-y-1">
      {favoriteFolders.map((folder) => (
        <Link
          key={`favorite-folder-${folder.id}`}
          href={`/workspaces/${workspaceSlug}?folder=${folder.id}`}
          className="block truncate rounded-md px-2 py-2 text-sm hover:bg-muted"
        >
          {folder.name}
        </Link>
      ))}
      {favoriteDocuments.map((document) => (
        <DocumentLinkRow
          key={`favorite-document-${document.id}`}
          workspaceSlug={workspaceSlug}
          document={document}
          favoriteIds={favoriteIds.documents}
          searchQuery={searchQuery}
          openMenuId={openMenuId}
          onOpenMenu={setOpenMenuId}
          onToggleFavorite={toggleDocumentFavorite}
        />
      ))}
    </div>
  </section>
) : null}
```

- [ ] **Step 2: Update `DocumentSection` signature**

Add `openMenuId` and `onOpenMenu` to `DocumentSection` props and pass them into `DocumentLinkRow`:

```tsx
function DocumentSection({
  title,
  workspaceSlug,
  documents,
  favoriteIds,
  searchQuery,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
}: {
  title: string;
  workspaceSlug: string;
  documents: DocumentListItem[];
  favoriteIds: string[];
  searchQuery: string;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
}) {
```

Inside its map, include:

```tsx
openMenuId={openMenuId}
onOpenMenu={onOpenMenu}
```

- [ ] **Step 3: Add folder error message**

Just before `<nav className="space-y-1" ...>`, add:

```tsx
{folderError ? (
  <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
    {folderError === "FOLDER_NOT_EMPTY"
      ? "Empty this folder before moving it to trash."
      : folderError === "FOLDER_NAME_REQUIRED"
        ? "Folder name is required."
      : "The folder action could not be completed."}
  </p>
) : null}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add components/document-navigation.tsx
git commit -m "feat: show folder favorites and action errors"
```

## Task 6: Add Playwright Smoke Coverage

**Files:**
- Modify: `tests/e2e/login.spec.ts`
- Test: `pnpm run test:e2e`

- [ ] **Step 1: Update document favorite smoke**

Ensure the test uses:

```ts
await documentList.getByRole("button", { name: "Open actions for Welcome" }).first().click();
await page.getByRole("menuitem", { name: "Add to favorites" }).click();
await expect(page.getByText("Favorites")).toBeVisible();
await expect(documentList.getByRole("button", { name: "Add Welcome to favorites" })).toHaveCount(0);
```

- [ ] **Step 2: Add row-level folder interactions after New folder assertion**

After:

```ts
await expect(page.getByText(/^\/untitled-folder(?:-\d+)?$/)).toBeVisible();
```

add:

```ts
const folderName = await page.getByRole("heading", { name: /^Untitled folder/ }).textContent();
expect(folderName).toBeTruthy();
const folderLabel = folderName ?? "Untitled folder";
await documentList.getByRole("button", { name: `Open actions for ${folderLabel}` }).click();
await page.getByRole("menuitem", { name: "Add to favorites" }).click();
await expect(documentList.getByRole("link", { name: folderLabel }).first()).toBeVisible();

await documentList.getByRole("button", { name: `Open actions for ${folderLabel}` }).click();
await page.getByRole("menuitem", { name: "Rename" }).click();
await page.getByLabel(`Rename ${folderLabel}`).fill("Product Notes");
await page.getByRole("button", { name: "Rename" }).click();
await expect(page.getByRole("heading", { name: "Product Notes" })).toBeVisible();

await documentList.getByRole("button", { name: "New document in Product Notes" }).click();
await expect(page.locator("[name='title']")).toHaveValue("Untitled");
await documentList.getByRole("link", { name: "Product Notes" }).first().click();
```

- [ ] **Step 3: Add non-empty trash guard**

After selecting `Product Notes`, add:

```ts
await documentList.getByRole("button", { name: "Open actions for Product Notes" }).click();
await page.getByRole("menuitem", { name: "Move to trash" }).click();
await expect(page.getByText("Empty this folder before moving it to trash.")).toBeVisible();
```

- [ ] **Step 4: Run e2e**

Run:

```bash
pnpm run test:e2e
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/e2e/login.spec.ts
git commit -m "test: cover folder row actions"
```

## Task 7: Wiki Maintenance And Final Verification

**Files:**
- Modify: `wiki/Folder Hierarchy Model.md`
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update `wiki/Folder Hierarchy Model.md`**

Add to the `## Workspace tree UI` section:

```md
Issue #26 refines folder row interactions. Folder rows highlight on hover/focus and reveal `...` and `+` controls. The `+` control creates a blank document inside that folder. The `...` menu exposes Rename, Move to trash, and Add to favorites. Rename and trash use the existing folder service mutations, while folder favorites remain workspace-scoped browser state.
```

- [ ] **Step 2: Update `wiki/Document Editing Workflow.md`**

Add a short sidebar navigation note in the navigation/create section:

```md
Sidebar favorites are managed through row-level `...` menus rather than an always-visible star icon. Document favorites and folder favorites are stored in workspace-scoped localStorage; favorite folders open the folder detail view and favorite documents open the editor.
```

- [ ] **Step 3: Add wiki log entry**

Add a new entry at the top of `wiki/log.md`:

```md
## 2026-05-05T23:59:00+09:00 - implementation

- Result: Issue #26 folder row hover actions menu를 구현했다.
- Coverage: folder row hover/focus highlight, `...` menu, row-level `+` document creation, inline folder rename, non-empty folder trash guard feedback, folder favorites, document favorite menu migration, always-visible star icon removal.
- Pages: [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #26, `components/document-navigation.tsx`, `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec tsc --noEmit`, `pnpm run test:e2e`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.
```

Increment `source_count` by 1 if the page frontmatter is still manually maintained.

- [ ] **Step 4: Regenerate manifest**

Run:

```bash
pnpm wiki:manifest
```

Expected: `wiki/manifest.json` is updated or remains unchanged with no error.

- [ ] **Step 5: Run wiki checks**

Run:

```bash
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: both PASS.

- [ ] **Step 6: Run final code checks**

Run:

```bash
pnpm exec tsc --noEmit
pnpm run test:e2e
```

Expected: both PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add wiki/Folder\ Hierarchy\ Model.md wiki/Document\ Editing\ Workflow.md wiki/log.md wiki/manifest.json
git commit -m "docs: update wiki for folder row actions"
```

## Task 8: Branch Finish

**Files:**
- No source edits.

- [ ] **Step 1: Inspect final status**

Run:

```bash
git status --short --branch
git log --oneline --decorate -n 8
```

Expected: clean working tree on `issue-26-folder-row-hover-actions-menu`, with commits for actions, UI, tests, and wiki updates.

- [ ] **Step 2: Run final local smoke in browser**

Run:

```bash
pnpm run dev
```

Expected: Next.js serves the app locally. Open the printed localhost URL at `/workspaces/company-handbook` and manually verify hover, menu, rename, trash guard, and favorites.

- [ ] **Step 3: Report completion**

Summarize:

```md
Implemented #26 on `issue-26-folder-row-hover-actions-menu`.
Verified with `pnpm exec tsc --noEmit`, `pnpm run test:e2e`, `pnpm wiki:manifest`, `pnpm wiki:lint`, and `pnpm wiki:sync-check --staged`.
```
