# Markdown Import Progress Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-form Markdown import table with a dedicated progress panel that shows sequential per-file import progress.

**Architecture:** Keep `components/workspace-settings-panel.tsx` as the owner of import state, but split the visible states into a compact selection form and a progress panel view. The server action contract stays unchanged; the client calls it once per file to produce observable row-by-row progress.

**Tech Stack:** Next.js App Router client component, React state/hooks, existing server action prop, Vitest, React Testing Library, Tailwind utility classes, lucide-react `X` icon.

---

## File Structure

- Modify `components/workspace-settings-panel.tsx`
  - Add `Queued` status and import run state.
  - Remove selected-file table from the selection form.
  - Add a dedicated progress panel view with top summary and bottom table.
  - Replace batch submit with sequential one-file action calls.
- Modify `tests/components/document-list.test.tsx`
  - Update existing import tests that expect the table inside the settings form.
  - Add tests for the progress panel, icon-only `X` close button, per-file action calls, partial failures, and refresh behavior.
- Modify `wiki/Markdown Import And Clipboard Paste Workflow.md`
  - Update after implementation to mark issue #58 behavior as implemented.
- Modify `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`
  - Keep navigation and chronology aligned with the implementation.

## Task 1: Progress Panel Test Coverage

**Files:**
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Update the existing successful import test to expect a progress panel**

Replace the current `imports selected markdown files without navigation and refreshes the workspace` test with this version:

```tsx
it("opens a markdown import progress panel and imports files one at a time", async () => {
  const importMarkdownAction = vi
    .fn()
    .mockResolvedValueOnce({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    })
    .mockResolvedValueOnce({
      documentIds: ["doc-second"],
      imported: [{ fileName: "second.markdown", documentId: "doc-second" }],
      failed: [],
    });
  renderList({ importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  const importedFile = new File(["# Imported"], "imported.md", { type: "text/markdown" });
  const secondFile = new File(["# Second"], "second.markdown", { type: "text/markdown" });
  fireEvent.change(screen.getByLabelText("Markdown files"), {
    target: {
      files: [importedFile, secondFile],
    },
  });

  expect(screen.queryByRole("table", { name: "Markdown import files" })).toBeNull();
  expect(screen.getByText("2 files selected")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  expect(screen.getByRole("dialog", { name: "Markdown import progress" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Importing 1 / 2");
  expect(screen.getByRole("table", { name: "Markdown import files" })).toBeTruthy();
  expect(screen.getByText("imported.md").parentElement?.textContent).toContain("Importing");
  expect(screen.getByText("second.markdown").parentElement?.textContent).toContain("Queued");

  await waitFor(() => {
    expect(importMarkdownAction).toHaveBeenCalledTimes(2);
  });

  const firstFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
  const secondFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[1][0];
  expect(firstFormData.getAll("markdownFiles")).toEqual([importedFile]);
  expect(secondFormData.getAll("markdownFiles")).toEqual([secondFile]);
  expect(firstFormData.get("folderId")).toBeNull();
  expect(secondFormData.get("folderId")).toBeNull();

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe("Imported 2 Markdown file(s).");
  });
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "Markdown import progress" })).toBeTruthy();
  expect(screen.getAllByText("Imported")).toHaveLength(2);
});
```

- [ ] **Step 2: Update the destination import test to expect one-file action calls**

In `opens the destination picker and imports markdown files into the selected folder`, keep the destination picker setup and replace the final assertion block with:

```tsx
await waitFor(() => {
  expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
});
const submittedFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
expect(submittedFormData.getAll("markdownFiles")).toEqual([importedFile]);
expect(submittedFormData.get("folderId")).toBe("folder-runbooks");
expect(screen.getByRole("dialog", { name: "Markdown import progress" })).toBeTruthy();
expect(screen.getByText("Destination: /engineering/runbooks")).toBeTruthy();
```

- [ ] **Step 3: Update the root destination test to expect the progress panel**

In `omits folderId when importing markdown files to the default root destination`, keep the setup and replace the final assertion block with:

```tsx
await waitFor(() => {
  expect(importMarkdownAction).toHaveBeenCalledWith(expect.any(FormData));
});
const submittedFormData = (importMarkdownAction.mock.calls as unknown as FormData[][])[0][0];
expect(submittedFormData.getAll("markdownFiles")).toEqual([importedFile]);
expect(submittedFormData.get("folderId")).toBeNull();
expect(screen.getByRole("dialog", { name: "Markdown import progress" })).toBeTruthy();
expect(screen.getByText("Destination: /")).toBeTruthy();
```

- [ ] **Step 4: Replace the partial failure test with sequential failure behavior**

Replace `shows partial markdown import failures in the settings panel` with:

```tsx
it("continues importing queued markdown files after one file fails", async () => {
  const importMarkdownAction = vi
    .fn()
    .mockResolvedValueOnce({
      documentIds: ["doc-imported"],
      imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
      failed: [],
    })
    .mockResolvedValueOnce({
      documentIds: [],
      imported: [],
      failed: [{ fileName: "failed.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
    })
    .mockResolvedValueOnce({
      documentIds: ["doc-later"],
      imported: [{ fileName: "later.md", documentId: "doc-later" }],
      failed: [],
    });
  renderList({ importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  fireEvent.change(screen.getByLabelText("Markdown files"), {
    target: {
      files: [
        new File(["# Imported"], "imported.md", { type: "text/markdown" }),
        new File(["nope"], "failed.md", { type: "text/markdown" }),
        new File(["# Later"], "later.md", { type: "text/markdown" }),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  await waitFor(() => {
    expect(importMarkdownAction).toHaveBeenCalledTimes(3);
  });
  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe(
      "Imported 2 file(s). 1 file(s) failed.",
    );
  });
  expect(screen.getByText("imported.md").parentElement?.textContent).toContain("Imported");
  expect(screen.getByText("failed.md").parentElement?.textContent).toContain("Failed");
  expect(screen.getByText("later.md").parentElement?.textContent).toContain("Imported");
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Replace duplicate-name batch mapping test**

Replace `maps mixed duplicate markdown import results to one row per result` with:

```tsx
it("keeps duplicate markdown filenames as independent progress rows", async () => {
  const importMarkdownAction = vi
    .fn()
    .mockResolvedValueOnce({
      documentIds: ["doc-one"],
      imported: [{ fileName: "duplicate.md", documentId: "doc-one" }],
      failed: [],
    })
    .mockResolvedValueOnce({
      documentIds: [],
      imported: [],
      failed: [{ fileName: "duplicate.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
    });
  renderList({ importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  fireEvent.change(screen.getByLabelText("Markdown files"), {
    target: {
      files: [
        new File(["# Imported"], "duplicate.md", { type: "text/markdown" }),
        new File(["nope"], "duplicate.md", { type: "text/markdown" }),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe(
      "Imported 1 file(s). 1 file(s) failed.",
    );
  });

  const duplicateRows = screen
    .getAllByText("duplicate.md")
    .map((fileNameCell) => fileNameCell.parentElement?.textContent ?? "");

  expect(duplicateRows).toHaveLength(2);
  expect(duplicateRows.filter((rowText) => rowText.includes("Imported"))).toHaveLength(1);
  expect(duplicateRows.filter((rowText) => rowText.includes("Failed"))).toHaveLength(1);
});
```

- [ ] **Step 6: Add tests for progress panel close and all-failed refresh behavior**

Add these tests next to the import tests:

```tsx
it("uses an icon-only x button to close the completed import progress panel", async () => {
  const importMarkdownAction = vi.fn(async () => ({
    documentIds: ["doc-imported"],
    imported: [{ fileName: "imported.md", documentId: "doc-imported" }],
    failed: [],
  }));
  renderList({ importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  fireEvent.change(screen.getByLabelText("Markdown files"), {
    target: {
      files: [new File(["# Imported"], "imported.md", { type: "text/markdown" })],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe("Imported 1 Markdown file(s).");
  });

  const closeButton = screen.getByRole("button", { name: "Close import progress" });
  expect(closeButton.textContent).toBe("");
  fireEvent.click(closeButton);

  expect(screen.getByRole("dialog", { name: "Workspace settings" })).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Markdown import progress" })).toBeNull();
});

it("does not refresh the workspace when every markdown import row fails", async () => {
  const importMarkdownAction = vi.fn(async () => ({
    documentIds: [],
    imported: [],
    failed: [{ fileName: "failed.md", error: "MARKDOWN_IMPORT_UNSUPPORTED_FILE" }],
  }));
  renderList({ importMarkdownAction });

  fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
  fireEvent.change(screen.getByLabelText("Markdown files"), {
    target: {
      files: [new File(["nope"], "failed.md", { type: "text/markdown" })],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import Markdown" }));

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBe("Import failed for 1 file(s).");
  });
  expect(screen.getByText("failed.md").parentElement?.textContent).toContain("Failed");
  expect(router.refresh).not.toHaveBeenCalled();
});
```

- [ ] **Step 7: Run tests to verify they fail before implementation**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: failures showing that `Markdown import progress` dialog, new table name, sequential calls, and selected-count UI are not implemented yet.

- [ ] **Step 8: Commit the failing tests if executing with strict TDD checkpointing**

Only commit this task by itself if the execution mode wants failing-test checkpoints. Otherwise leave the changes uncommitted and continue to Task 2.

```bash
git add tests/components/document-list.test.tsx
git commit -m "test: specify markdown import progress panel"
```

## Task 2: Progress Panel UI And State Model

**Files:**
- Modify: `components/workspace-settings-panel.tsx`

- [ ] **Step 1: Expand import row status and add run types**

Replace the `SelectedImportFile` and `ImportStatusMessage` type block with:

```tsx
type ImportFileStatus = "Ready" | "Queued" | "Importing" | "Imported" | "Failed";

type SelectedImportFile = {
  id: string;
  file: File;
  status: ImportFileStatus;
};

type ImportRunStatus = "idle" | "importing" | "completed";

type ImportRun = {
  status: ImportRunStatus;
  files: SelectedImportFile[];
  destinationPath: string;
  destinationFolderId: string | null;
  importedCount: number;
  failedCount: number;
  currentFileName: string | null;
};
```

- [ ] **Step 2: Replace status message state with import run state**

Replace:

```tsx
const [statusMessage, setStatusMessage] = useState<ImportStatusMessage | null>(null);
```

with:

```tsx
const [importRun, setImportRun] = useState<ImportRun | null>(null);
```

Then update `handleSelectedFilesChange` to clear any completed run:

```tsx
const handleSelectedFilesChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(event.target.files ?? []);

  setSelectedFiles(
    files.map((file, index) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
      file,
      status: "Ready",
    })),
  );
  setImportRun(null);
}, []);
```

- [ ] **Step 3: Replace the old submit handler with a sequential submit handler**

Replace `handleImportMarkdown` with:

```tsx
const handleImportMarkdown = useCallback((event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (isSubmitDisabled) return;

  const filesToImport = selectedFiles.map((selectedFile, index) => ({
    ...selectedFile,
    id: `${selectedFile.id}-run-${index}`,
    status: index === 0 ? "Importing" : "Queued",
  })) satisfies SelectedImportFile[];
  const runDestinationFolderId = destinationFolderId;
  const runDestinationPath = destinationPath;

  setIsImporting(true);
  setImportRun({
    status: "importing",
    files: filesToImport,
    destinationPath: runDestinationPath,
    destinationFolderId: runDestinationFolderId,
    importedCount: 0,
    failedCount: 0,
    currentFileName: filesToImport[0]?.file.name ?? null,
  });

  startImportTransition(async () => {
    let importedCount = 0;
    let failedCount = 0;

    for (const fileToImport of filesToImport) {
      setImportRun((current) =>
        current
          ? {
              ...current,
              currentFileName: fileToImport.file.name,
              files: current.files.map((row) =>
                row.id === fileToImport.id ? { ...row, status: "Importing" } : row,
              ),
            }
          : current,
      );

      const formData = new FormData();
      formData.append("markdownFiles", fileToImport.file);
      if (runDestinationFolderId !== null) {
        formData.append("folderId", runDestinationFolderId);
      }

      try {
        const result = await importMarkdownAction(formData);
        const imported = result.imported.length > 0;
        if (imported) {
          importedCount += 1;
        } else {
          failedCount += 1;
        }
        setImportRun((current) =>
          updateImportRunRow(current, fileToImport.id, imported ? "Imported" : "Failed", {
            importedCount,
            failedCount,
          }),
        );
      } catch {
        failedCount += 1;
        setImportRun((current) =>
          updateImportRunRow(current, fileToImport.id, "Failed", {
            importedCount,
            failedCount,
          }),
        );
      }
    }

    setImportRun((current) =>
      current
        ? {
            ...current,
            status: "completed",
            currentFileName: null,
            importedCount,
            failedCount,
          }
        : current,
    );
    if (importedCount > 0) {
      router.refresh();
    }
    setIsImporting(false);
  });
}, [
  destinationFolderId,
  destinationPath,
  importMarkdownAction,
  isSubmitDisabled,
  router,
  selectedFiles,
]);
```

- [ ] **Step 4: Add the row update helper**

Remove the old helpers `countImportResultsByFileName`, `consumeImportStatus`, and `resolveImportStatuses`. Add this helper near `formatFileSize`:

```tsx
function updateImportRunRow(
  current: ImportRun | null,
  rowId: string,
  status: ImportFileStatus,
  counts: { importedCount: number; failedCount: number },
) {
  if (!current) return current;

  return {
    ...current,
    importedCount: counts.importedCount,
    failedCount: counts.failedCount,
    files: current.files.map((row) => (row.id === rowId ? { ...row, status } : row)),
  };
}
```

- [ ] **Step 5: Replace selected-file table in the form with selected count text**

Delete the `{selectedFiles.length > 0 ? <div className="overflow-hidden...">...table...</div> : null}` block inside the form.

Inside the dashed file picker button, replace the second text span:

```tsx
<span className="mt-2 text-sm leading-6 text-slate-600">.md or .markdown</span>
```

with:

```tsx
<span className="mt-2 text-sm leading-6 text-slate-600">
  {selectedFiles.length > 0
    ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
    : ".md or .markdown"}
</span>
```

- [ ] **Step 6: Remove the old panel-local status message block from the form**

Delete the `{statusMessage ? <div role="status"...>...</div> : null}` block. The status live region now belongs in the progress panel.

- [ ] **Step 7: Render the progress panel view**

Immediately before the `<form onSubmit={handleImportMarkdown} className="space-y-4">` line, add:

```tsx
{importRun ? (
  <MarkdownImportProgressPanel
    run={importRun}
    onClose={() => {
      if (!importLocked) setImportRun(null);
    }}
    canClose={!importLocked}
  />
) : null}
```

Then wrap the existing form in a conditional so it only renders when no progress panel is visible:

```tsx
{!importRun ? (
  <form onSubmit={handleImportMarkdown} className="space-y-4">
    ...
  </form>
) : null}
```

- [ ] **Step 8: Add the progress panel component**

Add this component below `WorkspaceSettingsPanel`:

```tsx
function MarkdownImportProgressPanel({
  run,
  onClose,
  canClose,
}: {
  run: ImportRun;
  onClose: () => void;
  canClose: boolean;
}) {
  const totalCount = run.files.length;
  const completedCount = run.importedCount + run.failedCount;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const statusText = importRunStatusText(run, completedCount, totalCount);

  return (
    <section
      role="dialog"
      aria-label="Markdown import progress"
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">Markdown Import</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">Importing files</h3>
          <p className="mt-2 truncate text-sm text-slate-600">
            Destination: {run.destinationPath}
          </p>
        </div>
        <Button
          type="button"
          aria-label="Close import progress"
          onClick={onClose}
          disabled={!canClose}
          className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div role="status" className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-ink">
          <span>{statusText}</span>
          <span className="text-slate-500">{progressPercent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-sky-500 transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {run.currentFileName ? (
          <p className="mt-3 truncate text-sm text-slate-600">
            Current: {run.currentFileName}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 overflow-hidden rounded-md border border-slate-200">
        <div className="max-h-[min(22rem,calc(100vh-24rem))] overflow-y-auto">
          <table aria-label="Markdown import files" className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2">File name</th>
                <th scope="col" className="px-3 py-2">Size</th>
                <th scope="col" className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {run.files.map((selectedFile) => (
                <tr key={selectedFile.id}>
                  <td className="max-w-0 truncate px-3 py-2 font-medium text-ink">
                    {selectedFile.file.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatFileSize(selectedFile.file.size)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {selectedFile.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Add final status text helper**

Add this helper near `updateImportRunRow`:

```tsx
function importRunStatusText(run: ImportRun, completedCount: number, totalCount: number) {
  if (run.status === "importing") {
    return `Importing ${Math.max(completedCount + 1, 1)} / ${totalCount}`;
  }

  if (run.failedCount === 0) {
    return `Imported ${run.importedCount} Markdown file(s).`;
  }

  if (run.importedCount === 0) {
    return `Import failed for ${run.failedCount} file(s).`;
  }

  return `Imported ${run.importedCount} file(s). ${run.failedCount} file(s) failed.`;
}
```

- [ ] **Step 10: Run component tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: all component tests pass.

- [ ] **Step 11: Commit UI implementation**

```bash
git add components/workspace-settings-panel.tsx tests/components/document-list.test.tsx
git commit -m "feat: show markdown import progress panel"
```

## Task 3: Verification, Wiki Sync, And PR

**Files:**
- Modify: `wiki/Markdown Import And Clipboard Paste Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Update Markdown import workflow wiki**

In `wiki/Markdown Import And Clipboard Paste Workflow.md`, change the issue #58 section from planned wording to implemented wording. The updated section should include:

```markdown
Issue #58 refines multiple Markdown import progress. Existing settings Import form now handles file selection, destination path, and starting the import run. The full selected-file table is shown in a separate Markdown import progress panel after import starts.

Implemented behavior:

- Progress panel top area shows destination, completed/total count, progress bar, current file, and final summary.
- Progress panel bottom area shows the file table.
- Progress panel close control uses the existing icon-only `X` button pattern.
- Interactive progress uses client-side sequential per-file import calls.
- Each file row moves through `Queued`, `Importing`, `Imported`, or `Failed`.
- A failed file does not stop later queued files from importing.
- `router.refresh()` runs once after the run when at least one document was imported.
```

- [ ] **Step 4: Update index status board**

In `wiki/index.md`, update the issue #58 sentence so it describes implemented behavior, not only a design:

```markdown
Issue #58 moves multiple Markdown import progress into a separate progress panel with a top progress summary, bottom file table, icon-only `X` close control, and client-side sequential per-file imports for row status updates.
```

- [ ] **Step 5: Append wiki log entry**

Append a new entry near the top of `wiki/log.md`:

```markdown
## 2026-05-24T18:45:00+09:00 - feature

- Result: Issue #58 Markdown import progress panel을 구현했다.
- Coverage: Existing settings Import form은 file selection과 destination/start command만 담당하고, import 시작 후 별도 progress panel이 진행 요약과 file table을 표시한다. Progress panel은 icon-only `X` close control을 사용하며, client-side sequential per-file import loop로 row status를 즉시 갱신한다. 실패 row가 있어도 queued file import는 계속 진행하고, 문서가 하나 이상 생성된 경우 `router.refresh()`를 한 번 호출한다.
- Pages: [[Markdown Import And Clipboard Paste Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/workspace-settings-panel.tsx`, `tests/components/document-list.test.tsx`, `docs/superpowers/specs/2026-05-24-markdown-import-progress-panel-design.md`, `docs/superpowers/plans/2026-05-24-markdown-import-progress-panel.md`.
- Verification: `pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts`, `pnpm exec tsc --noEmit`.
```

- [ ] **Step 6: Run wiki maintenance commands**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: wiki manifest updates, lint passes, sync check reports source and wiki maintenance changes.

- [ ] **Step 7: Commit final implementation and wiki updates**

```bash
git add components/workspace-settings-panel.tsx tests/components/document-list.test.tsx wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "feat: refine markdown import progress"
```

- [ ] **Step 8: Push and create PR**

Run:

```bash
git push -u origin issue-58-improve-markdown-import-progress-and-layout
gh pr create --title "Refine markdown import progress" --body "## Summary
- move selected-file progress into a dedicated Markdown import progress panel
- import Markdown files sequentially so row status updates during the run
- keep the existing import destination flow and refresh the workspace once after successful imports

## Tests
- pnpm exec vitest run tests/components/document-list.test.tsx tests/workspace-actions.test.ts
- pnpm exec tsc --noEmit"
```

- [ ] **Step 9: Request review and inspect PR feedback**

Run:

```bash
gh pr ready
gh pr checks
```

Then wait at least 5 minutes and inspect reviews, unresolved threads, inline comments, and checks. If there is actionable feedback, fix it on the same branch, rerun verification and wiki sync, commit, push, and repeat the review check.
