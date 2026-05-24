"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useRef,
  useState,
  useTransition,
} from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type WorkspaceSettingsFolder = {
  id: string;
  path: string;
};

export type MarkdownImportActionResult = {
  documentIds: string[];
  imported: Array<{ fileName: string; documentId: string }>;
  failed: Array<{ fileName: string; error: string }>;
};

type SelectedImportFile = {
  id: string;
  file: File;
  status: "Ready" | "Importing" | "Imported" | "Failed";
};

type ImportStatusMessage = {
  tone: "neutral" | "success" | "error";
  text: string;
};

export function WorkspaceSettingsPanel({
  canWrite,
  folders,
  importMarkdownAction,
  onClose,
}: {
  canWrite: boolean;
  folders: WorkspaceSettingsFolder[];
  importMarkdownAction: (formData: FormData) => Promise<MarkdownImportActionResult>;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportPending, startImportTransition] = useTransition();
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedImportFile[]>([]);
  const [statusMessage, setStatusMessage] = useState<ImportStatusMessage | null>(null);
  const [destinationFolderId, setDestinationFolderId] = useState<string | null>(null);
  const [destinationPickerOpen, setDestinationPickerOpen] = useState(false);
  const importLocked = isImportPending || isImporting;
  const isSubmitDisabled = !canWrite || importLocked || selectedFiles.length === 0;
  const sortedFolders = [...folders].sort((left, right) => left.path.localeCompare(right.path));
  const destinationPath =
    sortedFolders.find((folder) => folder.id === destinationFolderId)?.path ?? "/";

  const handleOpenFilePicker = useCallback(() => {
    if (!canWrite || importLocked) return;
    fileInputRef.current?.click();
  }, [canWrite, importLocked]);

  const handleSelectedFilesChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    setSelectedFiles(
      files.map((file, index) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        file,
        status: "Ready",
      })),
    );
    setStatusMessage(null);
  }, []);

  const handleSelectDestination = useCallback((folderId: string | null) => {
    setDestinationFolderId(folderId);
    setDestinationPickerOpen(false);
  }, []);

  const handleImportMarkdown = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitDisabled) return;

    const filesToImport = selectedFiles;
    setIsImporting(true);
    setStatusMessage({
      tone: "neutral",
      text: `Importing ${filesToImport.length} file(s)...`,
    });
    setSelectedFiles((current) =>
      current.map((selectedFile) => ({ ...selectedFile, status: "Importing" })),
    );

    startImportTransition(async () => {
      const formData = new FormData();
      filesToImport.forEach(({ file }) => {
        formData.append("markdownFiles", file);
      });
      if (destinationFolderId !== null) {
        formData.append("folderId", destinationFolderId);
      }

      try {
        const result = await importMarkdownAction(formData);
        const importedCounts = countImportResultsByFileName(result.imported);
        const failedCounts = countImportResultsByFileName(result.failed);

        setSelectedFiles((current) =>
          current.map((selectedFile) => ({
            ...selectedFile,
            status: consumeImportStatus(selectedFile, importedCounts, failedCounts),
          })),
        );
        setStatusMessage({
          tone: result.failed.length > 0 ? "error" : "success",
          text:
            result.failed.length > 0
              ? `Imported ${result.imported.length} file(s). ${result.failed.length} file(s) failed.`
              : `Imported ${result.imported.length} Markdown file(s).`,
        });
        router.refresh();
      } catch {
        setSelectedFiles((current) =>
          current.map((selectedFile) => ({ ...selectedFile, status: "Failed" })),
        );
        setStatusMessage({
          tone: "error",
          text: `Import failed for ${filesToImport.length} file(s).`,
        });
      } finally {
        setIsImporting(false);
      }
    });
  }, [destinationFolderId, importMarkdownAction, isSubmitDisabled, router, selectedFiles]);

  return (
    <div
      data-testid="workspace-settings-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-6 py-16"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Workspace settings"
        className="grid max-h-[min(42rem,calc(100vh-8rem))] w-full max-w-4xl grid-cols-[13rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <aside className="border-r border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex h-9 items-center">
            <h2 className="text-sm font-semibold text-ink">Settings</h2>
          </div>
          <nav aria-label="Settings menu" className="space-y-1">
            <Button
              type="button"
              aria-label="Import"
              aria-pressed="true"
              className="h-9 w-full justify-start gap-2 bg-slate-200 px-2 text-sm text-ink"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import
            </Button>
          </nav>
        </aside>
        <div className="min-w-0 overflow-y-auto p-8">
          <div className="mb-8 flex items-start gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Workspace</p>
              <h3 className="mt-2 text-2xl font-semibold text-ink">Import your contents</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Markdown files become documents.
              </p>
            </div>
            <Button
              type="button"
              aria-label="Close settings"
              onClick={onClose}
              className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-100 hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <form onSubmit={handleImportMarkdown} className="space-y-4">
            <input
              ref={fileInputRef}
              id="markdownFiles"
              name="markdownFiles"
              type="file"
              aria-label="Markdown files"
              accept=".md,.markdown,text/markdown,text/x-markdown"
              multiple
              tabIndex={-1}
              disabled={!canWrite || importLocked}
              className="sr-only"
              onChange={handleSelectedFilesChange}
            />
            <button
              type="button"
              onClick={handleOpenFilePicker}
              disabled={!canWrite || importLocked}
              className="flex min-h-64 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-sky-400 bg-sky-50/70 px-6 py-8 text-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-8 w-8 text-sky-400" aria-hidden="true" />
              <span className="mt-4 text-base font-semibold text-ink">Markdown files</span>
              <span className="mt-2 text-sm leading-6 text-slate-600">.md or .markdown</span>
            </button>
            {selectedFiles.length > 0 ? (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table aria-label="Selected Markdown files" className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        File name
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Size
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {selectedFiles.map((selectedFile) => (
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
            ) : null}
            {statusMessage ? (
              <div
                role="status"
                className={
                  statusMessage.tone === "error"
                    ? "rounded-md bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700"
                    : statusMessage.tone === "success"
                      ? "rounded-md bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700"
                      : "rounded-md bg-slate-50 px-4 py-3 text-center text-sm font-medium text-slate-700"
                }
              >
                {statusMessage.text}
              </div>
            ) : null}
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)] gap-3">
              <div className="relative min-w-0">
                <button
                  type="button"
                  aria-label={`Import destination: ${destinationPath}`}
                  aria-expanded={destinationPickerOpen}
                  onClick={() => setDestinationPickerOpen((open) => !open)}
                  disabled={!canWrite || importLocked}
                  className="h-10 w-full truncate rounded-md border border-slate-300 bg-white px-3 text-left text-sm font-medium text-ink shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {destinationPath}
                </button>
                {destinationPickerOpen ? (
                  <div className="absolute bottom-12 left-0 z-10 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                    <div role="tree" aria-label="Import destination folders" className="space-y-1">
                      <button
                        type="button"
                        role="treeitem"
                        aria-selected={destinationFolderId === null}
                        onClick={() => handleSelectDestination(null)}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-slate-100 aria-selected:bg-slate-200"
                      >
                        /
                      </button>
                      {sortedFolders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          role="treeitem"
                          aria-selected={destinationFolderId === folder.id}
                          onClick={() => handleSelectDestination(folder.id)}
                          className="block w-full truncate rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-slate-100 aria-selected:bg-slate-200"
                        >
                          {folder.path}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <Button type="submit" disabled={isSubmitDisabled} className="h-10 w-full">
                Import Markdown
              </Button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const kilobytes = size / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function countImportResultsByFileName(results: Array<{ fileName: string }>) {
  const counts = new Map<string, number>();

  results.forEach(({ fileName }) => {
    counts.set(fileName, (counts.get(fileName) ?? 0) + 1);
  });

  return counts;
}

function consumeImportStatus(
  selectedFile: SelectedImportFile,
  importedCounts: Map<string, number>,
  failedCounts: Map<string, number>,
) {
  const fileName = selectedFile.file.name;
  const failedCount = failedCounts.get(fileName) ?? 0;

  if (failedCount > 0) {
    failedCounts.set(fileName, failedCount - 1);
    return "Failed";
  }

  const importedCount = importedCounts.get(fileName) ?? 0;

  if (importedCount > 0) {
    importedCounts.set(fileName, importedCount - 1);
    return "Imported";
  }

  return selectedFile.status;
}
