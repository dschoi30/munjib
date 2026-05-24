# Multiple Markdown File Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a workspace settings Markdown import flow that imports multiple selected files into a chosen folder path while keeping the current route and showing panel-centered progress/result feedback.

**Architecture:** Keep the feature inside the existing workspace settings Import panel and existing server action. `importMarkdownDocumentAction()` becomes a batch-compatible action that accepts repeated `markdownFiles`, optional `folderId`, and the existing single `markdownFile` fallback. `WorkspaceSettingsPanel` owns selected-file table state, destination folder state, popup state, local status message, and calls `router.refresh()` without navigation.

**Tech Stack:** Next.js App Router server actions, React client component state, Vitest, React Testing Library, Tailwind CSS, existing Prisma document service.

---

## File Structure

- Modify `app/workspaces/[workspaceSlug]/actions.ts`
  - Expand `importMarkdownDocumentAction()` from single-file return to batch result.
  - Read `markdownFiles` first, then fallback to `markdownFile`.
  - Pass optional `folderId` to every `createDocument()` call.
  - Revalidate once per batch.
- Modify `components/document-list.tsx`
  - Update `importMarkdownAction` prop type.
  - Pass `folders` into `WorkspaceSettingsPanel`.
  - Replace default visible file input with a hidden multi-file input and clickable import area.
  - Add selected-file table, destination path button, folder tree popup, local centered status message, and no-navigation submit.
- Modify `tests/workspace-actions.test.ts`
  - Update the old single import test for the new batch result.
  - Add multi-file, destination folder, root fallback, partial failure, and missing-file tests.
- Modify `tests/components/document-list.test.tsx`
  - Update base import mock return shape.
  - Replace old navigation import test with no-navigation refresh behavior.
  - Add selected files table, repeated `markdownFiles`, destination picker, panel status, partial failure, and read-only coverage.
- Modify wiki files after implementation:
  - `wiki/Markdown Import And Clipboard Paste Workflow.md`
  - `wiki/index.md`
  - `wiki/log.md`
  - `wiki/manifest.json`

## Types Used Across Tasks

Use these local exported or inline types consistently:

```ts
type MarkdownImportFileResult = {
  fileName: string;
  documentId?: string;
  error?: string;
};

type MarkdownImportActionResult = {
  documentIds: string[];
  imported: Array<{ fileName: string; documentId: string }>;
  failed: Array<{ fileName: string; error: string }>;
};
```

The final component may keep these types in `components/document-list.tsx`; the server action return type can be inferred.

### Task 1: Server Action Batch Import

**Files:**
- Modify: `tests/workspace-actions.test.ts`
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`

- [ ] **Step 1: Update the existing single-file import test for the new result**

Replace the body of `test("importMarkdownDocumentAction returns the created document without redirect", ...)` in `tests/workspace-actions.test.ts` with:

```ts
mocks.isSupportedMarkdownImportFile.mockReturnValue(true);
mocks.deriveMarkdownImportTitle.mockReturnValue("Imported");
mocks.createDocument.mockResolvedValue({ id: "doc-imported" });
const { importMarkdownDocumentAction } = await import(
  "@/app/workspaces/[workspaceSlug]/actions"
);
const formData = new FormData();
formData.set("markdownFile", new File(["# Imported"], "imported.md", {
  type: "text/markdown",
}));

const result = await importMarkdownDocumentAction("company-handbook", formData);

expect(mocks.createDocument).toHaveBeenCalledWith({
  workspaceSlug: "company-handbook",
  actorId: "user-1",
  folderId: null,
  title: "Imported",
  contentMarkdown: "# Imported",
});
expect(result).toEqual({
  documentIds: ["doc-imported"],
  imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
  failed: [],
});
expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
expect(mocks.redirect).not.toHaveBeenCalled();
```

- [ ] **Step 2: Add server action tests for batch destination and partial failure**

Add these tests after the updated single-file import test:

```ts
test("importMarkdownDocumentAction imports multiple markdown files into a selected folder", async () => {
  mocks.isSupportedMarkdownImportFile.mockReturnValue(true);
  mocks.deriveMarkdownImportTitle
    .mockReturnValueOnce("First")
    .mockReturnValueOnce("Second");
  mocks.createDocument
    .mockResolvedValueOnce({ id: "doc-first" })
    .mockResolvedValueOnce({ id: "doc-second" });
  const { importMarkdownDocumentAction } = await import(
    "@/app/workspaces/[workspaceSlug]/actions"
  );
  const formData = new FormData();
  formData.append("markdownFiles", new File(["# First"], "first.md", {
    type: "text/markdown",
  }));
  formData.append("markdownFiles", new File(["# Second"], "second.markdown", {
    type: "text/markdown",
  }));
  formData.set("folderId", "folder-engineering");

  const result = await importMarkdownDocumentAction("company-handbook", formData);

  expect(mocks.createDocument).toHaveBeenNthCalledWith(1, {
    workspaceSlug: "company-handbook",
    actorId: "user-1",
    folderId: "folder-engineering",
    title: "First",
    contentMarkdown: "# First",
  });
  expect(mocks.createDocument).toHaveBeenNthCalledWith(2, {
    workspaceSlug: "company-handbook",
    actorId: "user-1",
    folderId: "folder-engineering",
    title: "Second",
    contentMarkdown: "# Second",
  });
  expect(result).toEqual({
    documentIds: ["doc-first", "doc-second"],
    imported: [
      { fileName: "first.md", documentId: "doc-first" },
      { fileName: "second.markdown", documentId: "doc-second" },
    ],
    failed: [],
  });
  expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
});

test("importMarkdownDocumentAction imports to root when folderId is missing", async () => {
  mocks.isSupportedMarkdownImportFile.mockReturnValue(true);
  mocks.deriveMarkdownImportTitle.mockReturnValue("Root Import");
  mocks.createDocument.mockResolvedValue({ id: "doc-root" });
  const { importMarkdownDocumentAction } = await import(
    "@/app/workspaces/[workspaceSlug]/actions"
  );
  const formData = new FormData();
  formData.append("markdownFiles", new File(["# Root"], "root.md", {
    type: "text/markdown",
  }));

  await importMarkdownDocumentAction("company-handbook", formData);

  expect(mocks.createDocument).toHaveBeenCalledWith(expect.objectContaining({
    folderId: null,
  }));
});

test("importMarkdownDocumentAction reports unsupported files while importing valid files", async () => {
  mocks.isSupportedMarkdownImportFile
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);
  mocks.deriveMarkdownImportTitle.mockReturnValue("Valid");
  mocks.createDocument.mockResolvedValue({ id: "doc-valid" });
  const { importMarkdownDocumentAction } = await import(
    "@/app/workspaces/[workspaceSlug]/actions"
  );
  const formData = new FormData();
  formData.append("markdownFiles", new File(["# Valid"], "valid.md", {
    type: "text/markdown",
  }));
  formData.append("markdownFiles", new File(["nope"], "notes.txt", {
    type: "text/plain",
  }));

  const result = await importMarkdownDocumentAction("company-handbook", formData);

  expect(mocks.createDocument).toHaveBeenCalledTimes(1);
  expect(result).toEqual({
    documentIds: ["doc-valid"],
    imported: [{ fileName: "valid.md", documentId: "doc-valid" }],
    failed: [{ fileName: "notes.txt", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
  });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspaces/company-handbook");
});
```

- [ ] **Step 3: Run action tests and confirm failure**

Run:

```bash
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected now: failures around `{ documentId }` return shape, missing `folderId`, and unsupported multi-file behavior.

- [ ] **Step 4: Implement batch import in `actions.ts`**

Replace the body of `importMarkdownDocumentAction()` with:

```ts
export async function importMarkdownDocumentAction(workspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const files = markdownImportFilesFromFormData(formData);
  const folderId = String(formData.get("folderId") || "") || null;

  if (files.length === 0) {
    throw new Error(SERVICE_ERROR_CODES.MARKDOWN_IMPORT_FILE_REQUIRED);
  }

  const imported: Array<{ fileName: string; documentId: string }> = [];
  const failed: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    if (!isSupportedMarkdownImportFile(file)) {
      failed.push({
        fileName: file.name,
        error: file.size === 0
          ? SERVICE_ERROR_CODES.MARKDOWN_IMPORT_FILE_REQUIRED
          : SERVICE_ERROR_CODES.MARKDOWN_IMPORT_UNSUPPORTED_FILE,
      });
      continue;
    }

    const contentMarkdown = await file.text();
    const document = await createDocument({
      workspaceSlug,
      actorId: user.id,
      folderId,
      title: deriveMarkdownImportTitle({ fileName: file.name, contentMarkdown }),
      contentMarkdown,
    });
    imported.push({ fileName: file.name, documentId: document.id });
  }

  revalidatePath(`/workspaces/${workspaceSlug}`);
  return {
    documentIds: imported.map((item) => item.documentId),
    imported,
    failed,
  };
}
```

Add this helper below `importMarkdownDocumentAction()`:

```ts
function markdownImportFilesFromFormData(formData: FormData) {
  const batchFiles = formData
    .getAll("markdownFiles")
    .filter((value): value is File => value instanceof File);
  if (batchFiles.length > 0) return batchFiles;

  const singleFile = formData.get("markdownFile");
  return singleFile instanceof File ? [singleFile] : [];
}
```

- [ ] **Step 5: Run action tests and confirm pass**

Run:

```bash
pnpm exec vitest run tests/workspace-actions.test.ts
```

Expected: all tests in `tests/workspace-actions.test.ts` pass.

- [ ] **Step 6: Commit server action work**

```bash
git add app/workspaces/[workspaceSlug]/actions.ts tests/workspace-actions.test.ts
git commit -m "feat: import multiple markdown files"
```

### Task 2: Settings Panel Batch UI and No-Navigation Submit

**Files:**
- Modify: `tests/components/document-list.test.tsx`
- Modify: `components/document-list.tsx`

- [ ] **Step 1: Update test mock return type**

In `tests/components/document-list.test.tsx`, change `baseProps.importMarkdownAction` to:

```ts
importMarkdownAction: async () => ({
  documentIds: ["doc-imported"],
  imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
  failed: [],
}),
```

- [ ] **Step 2: Replace the old navigation import test**

Replace `it("navigates to imported markdown documents from the client without server redirect", ...)` with:

```ts
it("imports selected markdown files without navigating away from the current document", async () => {
  const importMarkdownAction = vi.fn(async () => ({
    documentIds: ["doc-one", "doc-two"],
    imported: [
      { fileName: "one.md", documentId: "doc-one" },
      { fileName: "two.md", documentId: "doc-two" },
    ],
    failed: [],
  }));
  renderList({ importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  const fileInput = screen.getByLabelText("Markdown files") as HTMLInputElement;
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File(["# One"], "one.md", { type: "text/markdown" }),
        new File(["# Two"], "two.md", { type: "text/markdown" }),
      ],
    },
  });

  expect(screen.getByRole("table", { name: "Selected Markdown files" })).toBeTruthy();
  expect(screen.getByText("one.md")).toBeTruthy();
  expect(screen.getByText("two.md")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  await waitFor(() => {
    expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
  });
  const submitted = importMarkdownAction.mock.calls[0]?.[0] as FormData;
  expect(submitted.getAll("markdownFiles")).toHaveLength(2);
  expect(submitted.get("folderId")).toBeNull();
  await waitFor(() => {
    expect(router.refresh).toHaveBeenCalled();
  });
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
  expect(screen.getByText("Imported 2 Markdown files.")).toBeTruthy();
});
```

- [ ] **Step 3: Add partial failure UI test**

Add:

```ts
it("shows panel-centered partial failure status and failed row state", async () => {
  const importMarkdownAction = vi.fn(async () => ({
    documentIds: ["doc-valid"],
    imported: [{ fileName: "valid.md", documentId: "doc-valid" }],
    failed: [{ fileName: "broken.txt", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
  }));
  renderList({ importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  fireEvent.change(screen.getByLabelText("Markdown files"), {
    target: {
      files: [
        new File(["# Valid"], "valid.md", { type: "text/markdown" }),
        new File(["broken"], "broken.txt", { type: "text/plain" }),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  expect(screen.getByRole("status")).toHaveTextContent("Importing 2 files...");
  await waitFor(() => {
    expect(screen.getByText("Imported 1 file. 1 file failed.")).toBeTruthy();
  });
  expect(screen.getByText("valid.md").closest("tr")).toHaveTextContent("Imported");
  expect(screen.getByText("broken.txt").closest("tr")).toHaveTextContent("Failed");
});
```

- [ ] **Step 4: Run component tests and confirm failure**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected now: failures for label `Markdown files`, multi-file table, no-navigation behavior, and status UI.

- [ ] **Step 5: Implement component types and state**

In `components/document-list.tsx`, update the imports:

```ts
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, FileText, Loader2, Settings, Upload, X, XCircle } from "lucide-react";
```

Add types near the list item types:

```ts
type MarkdownImportActionResult = {
  documentIds: string[];
  imported: Array<{ fileName: string; documentId: string }>;
  failed: Array<{ fileName: string; error: string }>;
};

type SelectedImportFile = {
  key: string;
  file: File;
  status: "ready" | "importing" | "imported" | "failed";
};

type ImportStatusMessage = {
  tone: "progress" | "success" | "error";
  text: string;
} | null;
```

Change both `importMarkdownAction` prop types from:

```ts
importMarkdownAction: (formData: FormData) => Promise<{ documentId: string }>;
```

to:

```ts
importMarkdownAction: (formData: FormData) => Promise<MarkdownImportActionResult>;
```

Pass folders into `WorkspaceSettingsPanel`:

```tsx
<WorkspaceSettingsPanel
  workspaceSlug={workspaceSlug}
  folders={folders}
  canWrite={canWrite}
  importMarkdownAction={importMarkdownAction}
  onClose={() => setSettingsOpen(false)}
/>
```

- [ ] **Step 6: Replace submit handler and file input UI**

Inside `WorkspaceSettingsPanel`, add these state values:

```ts
const fileInputRef = useRef<HTMLInputElement | null>(null);
const [selectedFiles, setSelectedFiles] = useState<SelectedImportFile[]>([]);
const [importStatus, setImportStatus] = useState<ImportStatusMessage>(null);
```

Use this file change handler:

```ts
const handleFileSelection = useCallback((files: FileList | null) => {
  const nextFiles = Array.from(files ?? []).map((file, index) => ({
    key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
    file,
    status: "ready" as const,
  }));
  setSelectedFiles(nextFiles);
  setImportStatus(null);
}, []);
```

Replace `handleImportMarkdown` with:

```ts
const handleImportMarkdown = useCallback((event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (selectedFiles.length === 0 || isImportPending) return;

  const formData = new FormData();
  for (const item of selectedFiles) {
    formData.append("markdownFiles", item.file);
  }

  setSelectedFiles((current) => current.map((item) => ({ ...item, status: "importing" })));
  setImportStatus({
    tone: "progress",
    text: `Importing ${selectedFiles.length} ${selectedFiles.length === 1 ? "file" : "files"}...`,
  });

  startImportTransition(async () => {
    try {
      const result = await importMarkdownAction(formData);
      const importedNames = new Set(result.imported.map((item) => item.fileName));
      const failedNames = new Set(result.failed.map((item) => item.fileName));
      setSelectedFiles((current) => current.map((item) => ({
        ...item,
        status: failedNames.has(item.file.name)
          ? "failed"
          : importedNames.has(item.file.name)
            ? "imported"
            : item.status,
      })));
      const importedCount = result.imported.length;
      const failedCount = result.failed.length;
      setImportStatus({
        tone: failedCount > 0 ? "error" : "success",
        text: failedCount > 0
          ? `Imported ${importedCount} ${importedCount === 1 ? "file" : "files"}. ${failedCount} ${failedCount === 1 ? "file" : "files"} failed.`
          : `Imported ${importedCount} Markdown ${importedCount === 1 ? "file" : "files"}.`,
      });
      router.refresh();
    } catch {
      setSelectedFiles((current) => current.map((item) => ({ ...item, status: "failed" })));
      setImportStatus({
        tone: "error",
        text: `Import failed for ${selectedFiles.length} ${selectedFiles.length === 1 ? "file" : "files"}.`,
      });
    }
  });
}, [importMarkdownAction, isImportPending, router, selectedFiles]);
```

Change the `<form>` to `onSubmit={handleImportMarkdown}` and use a hidden input:

```tsx
<input
  ref={fileInputRef}
  id="markdownFiles"
  name="markdownFiles"
  type="file"
  aria-label="Markdown files"
  accept=".md,.markdown,text/markdown,text/x-markdown"
  multiple
  disabled={!canWrite || isImportPending}
  className="sr-only"
  onChange={(event) => handleFileSelection(event.currentTarget.files)}
/>
```

Render `importStatus` before the form area:

```tsx
{importStatus ? (
  <div
    role="status"
    className="mx-auto mb-4 flex max-w-md items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-ink shadow-lg"
  >
    {importStatus.tone === "progress" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
    {importStatus.tone === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : null}
    {importStatus.tone === "error" ? <XCircle className="h-4 w-4 text-rose-600" aria-hidden="true" /> : null}
    <span>{importStatus.text}</span>
  </div>
) : null}
```

Make the dashed area click the input:

```tsx
<button
  type="button"
  onClick={() => fileInputRef.current?.click()}
  disabled={!canWrite || isImportPending}
  className="flex min-h-64 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-sky-400 bg-sky-50/70 px-6 py-8 text-center disabled:cursor-not-allowed disabled:opacity-60"
>
  {selectedFiles.length === 0 ? (
    <>
      <FileText className="h-8 w-8 text-sky-400" aria-hidden="true" />
      <span className="mt-4 text-base font-semibold text-ink">Markdown files</span>
      <span className="mt-2 text-sm leading-6 text-slate-600">.md or .markdown</span>
    </>
  ) : (
    <SelectedMarkdownFilesTable files={selectedFiles} />
  )}
</button>
```

Add `SelectedMarkdownFilesTable` below `WorkspaceSettingsPanel`:

```tsx
function SelectedMarkdownFilesTable({ files }: { files: SelectedImportFile[] }) {
  return (
    <div className="w-full overflow-hidden rounded-md border border-slate-200 bg-white text-left">
      <table className="w-full text-sm" aria-label="Selected Markdown files">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">File name</th>
            <th className="w-24 px-3 py-2 font-medium">Size</th>
            <th className="w-24 px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {files.map((item) => (
            <tr key={item.key}>
              <td className="max-w-0 truncate px-3 py-2 text-ink">{item.file.name}</td>
              <td className="px-3 py-2 text-slate-600">{formatFileSize(item.file.size)}</td>
              <td className="px-3 py-2 text-slate-600">{statusLabel(item.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusLabel(status: SelectedImportFile["status"]) {
  if (status === "ready") return "Ready";
  if (status === "importing") return "Importing";
  if (status === "imported") return "Imported";
  return "Failed";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
```

Disable submit if no files:

```tsx
<Button
  type="submit"
  disabled={!canWrite || isImportPending || selectedFiles.length === 0}
  className="h-10 w-full"
>
  Import Markdown
</Button>
```

- [ ] **Step 7: Run component tests and confirm pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: `tests/components/document-list.test.tsx` passes.

- [ ] **Step 8: Commit UI batch import work**

```bash
git add components/document-list.tsx tests/components/document-list.test.tsx
git commit -m "feat: show multiple markdown import selection"
```

### Task 3: Destination Path Picker

**Files:**
- Modify: `tests/components/document-list.test.tsx`
- Modify: `components/document-list.tsx`

- [ ] **Step 1: Add folder fixtures in component tests**

Add this helper near `baseProps`:

```ts
const folderFixtures = [
  {
    id: "folder-engineering",
    parentFolderId: null,
    name: "Engineering",
    path: "/engineering",
  },
  {
    id: "folder-runbooks",
    parentFolderId: "folder-engineering",
    name: "Runbooks",
    path: "/engineering/runbooks",
  },
];
```

- [ ] **Step 2: Add destination path picker test**

Add:

```ts
it("chooses an import destination from a folder tree popup", async () => {
  const importMarkdownAction = vi.fn(async () => ({
    documentIds: ["doc-runbook"],
    imported: [{ fileName: "runbook.md", documentId: "doc-runbook" }],
    failed: [],
  }));
  renderList({ folders: folderFixtures, importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  expect(screen.getByRole("button", { name: "Import destination" })).toHaveTextContent("/");

  fireEvent.click(screen.getByRole("button", { name: "Import destination" }));
  expect(screen.getByRole("tree", { name: "Import destination folders" })).toBeTruthy();
  fireEvent.click(screen.getByRole("treeitem", { name: "/engineering/runbooks" }));

  expect(screen.getByRole("button", { name: "Import destination" })).toHaveTextContent(
    "/engineering/runbooks",
  );

  fireEvent.change(screen.getByLabelText("Markdown files"), {
    target: {
      files: [new File(["# Runbook"], "runbook.md", { type: "text/markdown" })],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  await waitFor(() => {
    expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
  });
  const submitted = importMarkdownAction.mock.calls[0]?.[0] as FormData;
  expect(submitted.get("folderId")).toBe("folder-runbooks");
});
```

- [ ] **Step 3: Add root reset test**

Add:

```ts
it("keeps root as the default import destination", async () => {
  const importMarkdownAction = vi.fn(async () => ({
    documentIds: ["doc-root"],
    imported: [{ fileName: "root.md", documentId: "doc-root" }],
    failed: [],
  }));
  renderList({ folders: folderFixtures, importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  fireEvent.change(screen.getByLabelText("Markdown files"), {
    target: {
      files: [new File(["# Root"], "root.md", { type: "text/markdown" })],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  await waitFor(() => {
    expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
  });
  const submitted = importMarkdownAction.mock.calls[0]?.[0] as FormData;
  expect(submitted.get("folderId")).toBeNull();
});
```

- [ ] **Step 4: Run component tests and confirm failure**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected now: failures for missing import destination button/tree.

- [ ] **Step 5: Implement destination picker state**

In `WorkspaceSettingsPanel`, accept `folders`:

```ts
folders,
```

and add prop type:

```ts
folders: FolderListItem[];
```

Add state:

```ts
const [destinationFolderId, setDestinationFolderId] = useState<string | null>(null);
const [destinationPickerOpen, setDestinationPickerOpen] = useState(false);
const destinationPath = useMemo(() => {
  if (!destinationFolderId) return "/";
  return folders.find((folder) => folder.id === destinationFolderId)?.path ?? "/";
}, [destinationFolderId, folders]);
```

In `handleImportMarkdown`, before setting progress, append selected folder:

```ts
if (destinationFolderId) {
  formData.set("folderId", destinationFolderId);
}
```

Add `destinationFolderId` to the callback dependency array.

- [ ] **Step 6: Implement destination row and popup tree**

Replace the single full-width submit button area with:

```tsx
<div className="relative grid grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)] gap-3">
  <button
    type="button"
    aria-label="Import destination"
    onClick={() => setDestinationPickerOpen((open) => !open)}
    disabled={!canWrite || isImportPending}
    className="flex h-10 min-w-0 items-center rounded-md border border-slate-300 bg-white px-3 text-left text-sm text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
  >
    <span className="truncate">{destinationPath}</span>
  </button>
  <Button
    type="submit"
    disabled={!canWrite || isImportPending || selectedFiles.length === 0}
    className="h-10 w-full"
  >
    Import Markdown
  </Button>
  {destinationPickerOpen ? (
    <ImportDestinationTree
      folders={folders}
      selectedFolderId={destinationFolderId}
      onSelect={(folderId) => {
        setDestinationFolderId(folderId);
        setDestinationPickerOpen(false);
      }}
    />
  ) : null}
</div>
```

Add this component below `SelectedMarkdownFilesTable`:

```tsx
function ImportDestinationTree({
  folders,
  selectedFolderId,
  onSelect,
}: {
  folders: FolderListItem[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}) {
  const sortedFolders = [...folders].sort((left, right) => left.path.localeCompare(right.path));

  return (
    <div className="absolute bottom-12 left-0 z-10 max-h-72 w-2/3 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-sm shadow-xl">
      <div role="tree" aria-label="Import destination folders" className="space-y-1">
        <button
          type="button"
          role="treeitem"
          aria-selected={selectedFolderId === null}
          onClick={() => onSelect(null)}
          className="flex h-8 w-full items-center rounded px-2 text-left text-ink hover:bg-slate-100 aria-selected:bg-slate-200"
        >
          /
        </button>
        {sortedFolders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            role="treeitem"
            aria-selected={selectedFolderId === folder.id}
            onClick={() => onSelect(folder.id)}
            className="flex h-8 w-full items-center rounded px-2 text-left text-ink hover:bg-slate-100 aria-selected:bg-slate-200"
            style={{ paddingLeft: `${Math.max(folder.path.split("/").length - 2, 0) * 16 + 8}px` }}
          >
            <span className="truncate">{folder.path}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run component tests and confirm pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: all component tests pass.

- [ ] **Step 8: Commit destination picker work**

```bash
git add components/document-list.tsx tests/components/document-list.test.tsx
git commit -m "feat: choose markdown import destination"
```

### Task 4: Wiki, Full Verification, and PR

**Files:**
- Modify: `wiki/Markdown Import And Clipboard Paste Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update workflow wiki**

In `wiki/Markdown Import And Clipboard Paste Workflow.md`, update the planned section to implemented language:

```md
## Multiple-file Markdown import

Issue #55 extends the workspace settings Import form to accept multiple Markdown files. The form hides the browser-default file input, opens the file picker from the dashed import area, and renders the selected files in a table with per-file status.

The submit row contains a bordered destination path control and a narrower Import button. The destination defaults to workspace root (`/`). Clicking the path opens a tree popup with root and workspace folders. The selected folder id is sent as `folderId`; root sends no folder id and creates root-level documents.

The server action accepts repeated `markdownFiles` fields and a legacy single `markdownFile` fallback. It imports valid Markdown files, reports unsupported or empty files in the batch `failed` result, revalidates the workspace once, and returns imported document ids without redirecting. The client keeps the settings panel open, calls `router.refresh()`, and shows panel-centered progress, success, or partial failure status.
```

- [ ] **Step 2: Update wiki index and log**

Update `wiki/index.md` status board to say Issue #55 is implemented, not only designed.

Add a top log entry to `wiki/log.md`:

```md
## 2026-05-24T<current-time>+09:00 - feature

- Result: Issue #55 multiple Markdown file import를 구현했다.
- Coverage: Workspace settings Import form은 multiple file selection, selected file table, root-default destination picker, folder tree popup, panel-centered status message, partial success batch result, current-route 유지 refresh를 제공한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/document-list.tsx`, `app/workspaces/[workspaceSlug]/actions.ts`, `tests/components/document-list.test.tsx`, `tests/workspace-actions.test.ts`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.
```

- [ ] **Step 3: Run focused verification**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts
```

Expected: both suites pass.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 5: Run wiki maintenance checks**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: all commands pass.

- [ ] **Step 6: Commit final implementation and wiki updates**

```bash
git add app/workspaces/[workspaceSlug]/actions.ts components/document-list.tsx tests/workspace-actions.test.ts tests/components/document-list.test.tsx wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "feat: support multiple markdown imports"
```

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin issue-55-multiple-markdown-file-import
gh pr create --base main --head issue-55-multiple-markdown-file-import --title "Support multiple Markdown imports" --body "Closes #55."
gh pr ready
```

Expected: PR is open and ready for review. If `gh pr ready` reports the PR is already ready, continue.

- [ ] **Step 8: Wait and inspect PR feedback**

Wait at least 5 minutes, then run:

```bash
gh pr checks --watch
gh pr view --json reviewDecision,mergeStateStatus,statusCheckRollup,latestReviews,comments,url,isDraft,headRefOid,state
gh api graphql -f query='query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:80){nodes{isResolved isOutdated comments(first:10){nodes{author{login} body path line originalLine}}}}}}}' -F owner=dschoi30 -F repo=munjib -F number="$(gh pr view --json number -q .number)"
```

Expected: no failing checks and no current unresolved actionable review threads. If feedback appears, fix it on the same branch and repeat focused verification, wiki checks, commit, push, wait, and inspect again.

## Self-Review

- Spec coverage: Tasks cover batch import, hidden multi-file input, table display, no navigation, panel-centered status, partial failure, destination path default root, tree popup folder selection, server `folderId`, tests, wiki, PR workflow.
- Placeholder scan: No unfinished markers or unspecified "add tests" steps remain. Concrete test code and implementation snippets are included for each behavior.
- Type consistency: `MarkdownImportActionResult`, `SelectedImportFile`, `folderId`, `markdownFiles`, `router.refresh()`, and row status names are consistent across tasks.
