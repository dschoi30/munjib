"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Bot, FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type ClientRagChatProvider,
  RAG_CHAT_MODEL_PRESETS,
  readStoredChatModel,
  resetStoredChatModel,
  validateChatModelId,
  writeStoredChatModel,
} from "@/lib/rag/client-model-settings";

type WorkspaceSettingsFolder = {
  id: string;
  path: string;
};

export type MarkdownImportActionResult = {
  documentIds: string[];
  imported: Array<{ fileName: string; documentId: string }>;
  failed: Array<{ fileName: string; error: string }>;
};

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

type SettingsSection = "import" | "ai";

export function WorkspaceSettingsPanel({
  canWrite,
  defaultChatModel,
  defaultChatProvider,
  folders,
  importMarkdownAction,
  onClose,
  workspaceSlug,
}: {
  canWrite: boolean;
  defaultChatModel: string;
  defaultChatProvider: ClientRagChatProvider;
  folders: WorkspaceSettingsFolder[];
  importMarkdownAction: (formData: FormData) => Promise<MarkdownImportActionResult>;
  onClose: () => void;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("import");
  const [customModel, setCustomModel] = useState("");
  const [isImportPending, startImportTransition] = useTransition();
  const [isImporting, setIsImporting] = useState(false);
  const [modelStatus, setModelStatus] = useState<string | null>(null);
  const [saveVersion, setSaveVersion] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<SelectedImportFile[]>([]);
  const [importRun, setImportRun] = useState<ImportRun | null>(null);
  const [destinationFolderId, setDestinationFolderId] = useState<string | null>(null);
  const [destinationPickerOpen, setDestinationPickerOpen] = useState(false);
  const storedChatModel = useMemo(
    () => readStoredChatModel(workspaceSlug, defaultChatProvider),
    [defaultChatProvider, saveVersion, workspaceSlug],
  );
  const effectiveChatModel = storedChatModel ?? defaultChatModel;
  const importLocked = isImportPending || isImporting;
  const isImportActive = isImporting || importRun?.status === "importing";
  const isSubmitDisabled = !canWrite || importLocked || selectedFiles.length === 0;
  const sortedFolders = useMemo(
    () => [...folders].sort((left, right) => left.path.localeCompare(right.path)),
    [folders],
  );
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
    setImportRun(null);
  }, []);

  const handleSelectDestination = useCallback((folderId: string | null) => {
    setDestinationFolderId(folderId);
    setDestinationPickerOpen(false);
  }, []);

  const handleSavePresetModel = useCallback(
    (modelId: string) => {
      const result = writeStoredChatModel(workspaceSlug, modelId, defaultChatProvider);
      if (!result.ok) {
        setModelStatus("Enter a valid model id.");
        return;
      }

      if (result.stored) {
        setSaveVersion((version) => version + 1);
      }
      setModelStatus(
        result.stored ? `Saved model: ${result.value}` : "Model setting could not be saved.",
      );
    },
    [defaultChatProvider, workspaceSlug],
  );

  const handleSaveCustomModel = useCallback(() => {
    const validation = validateChatModelId(customModel, defaultChatProvider);
    if (!validation.ok) {
      setModelStatus("Enter a valid model id.");
      return;
    }

    const result = writeStoredChatModel(workspaceSlug, validation.value, defaultChatProvider);
    if (result.ok) {
      setCustomModel(result.value);
      if (result.stored) {
        setSaveVersion((version) => version + 1);
      }
      setModelStatus(
        result.stored ? `Saved model: ${result.value}` : "Model setting could not be saved.",
      );
      return;
    }

    setModelStatus("Enter a valid model id.");
  }, [customModel, defaultChatProvider, workspaceSlug]);

  const handleResetModel = useCallback(() => {
    const reset = resetStoredChatModel(workspaceSlug);
    if (reset) {
      setSaveVersion((version) => version + 1);
    }
    setModelStatus(
      reset
        ? `Using server default: ${defaultChatModel}`
        : "Model setting could not be reset.",
    );
  }, [defaultChatModel, workspaceSlug]);

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

  return (
    <div
      data-testid="workspace-settings-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-6 py-16"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isImportActive) onClose();
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
              aria-pressed={activeSection === "import"}
              onClick={() => setActiveSection("import")}
              className={settingsNavButtonClassName(activeSection === "import")}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import
            </Button>
            <Button
              type="button"
              aria-label="AI"
              aria-pressed={activeSection === "ai"}
              onClick={() => setActiveSection("ai")}
              className={settingsNavButtonClassName(activeSection === "ai")}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              AI
            </Button>
          </nav>
        </aside>
        <div className="min-w-0 overflow-y-auto p-8">
          {activeSection === "import" ? (
            <>
              <div className="mb-8 flex items-start gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Workspace</p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">
                    Import your contents
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Markdown files become documents.
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label="Close settings"
                  onClick={() => {
                    if (!isImportActive) onClose();
                  }}
                  disabled={isImportActive}
                  className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {importRun ? (
                <MarkdownImportProgressPanel
                  run={importRun}
                  onClose={() => {
                    if (!isImportActive) setImportRun(null);
                  }}
                  canClose={!isImportActive}
                />
              ) : null}
              {!importRun ? (
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
                    <span className="mt-4 text-base font-semibold text-ink">
                      Markdown files
                    </span>
                    <span className="mt-2 text-sm leading-6 text-slate-600">
                      {selectedFiles.length > 0
                        ? `${selectedFiles.length} file${
                            selectedFiles.length === 1 ? "" : "s"
                          } selected`
                        : ".md or .markdown"}
                    </span>
                  </button>
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
                          <div
                            role="tree"
                            aria-label="Import destination folders"
                            className="space-y-1"
                          >
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
              ) : null}
            </>
          ) : (
            <section aria-label="AI model settings" className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Workspace</p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">AI model</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Credentials stay on the server.
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label="Close settings"
                  onClick={() => {
                    if (!isImportActive) onClose();
                  }}
                  disabled={isImportActive}
                  className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[0.68rem] font-medium uppercase tracking-wide text-slate-500">
                  {storedChatModel ? "Browser override" : "Server default"}
                </p>
                <p className="mt-2 break-all text-sm font-semibold text-ink">
                  {effectiveChatModel}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-ink">Presets</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {RAG_CHAT_MODEL_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      aria-label={`Use ${preset.label}`}
                      onClick={() => handleSavePresetModel(preset.id)}
                      className="h-auto justify-start border border-slate-200 bg-white px-3 py-2 text-left text-ink hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{preset.label}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="customChatModel"
                  className="text-sm font-semibold text-ink"
                >
                  Custom model id
                </label>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <input
                    id="customChatModel"
                    value={customModel}
                    onChange={(event) => setCustomModel(event.target.value)}
                    className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                  <Button type="button" onClick={handleSaveCustomModel} className="h-10">
                    Save custom model
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleResetModel}
                  className="h-10 border border-slate-200 bg-white text-ink hover:bg-slate-50"
                >
                  Reset model
                </Button>
                {modelStatus ? (
                  <p role="status" className="text-sm font-medium text-slate-700">
                    {modelStatus}
                  </p>
                ) : null}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

function settingsNavButtonClassName(isActive: boolean) {
  return [
    "h-9 w-full justify-start gap-2 px-2 text-sm",
    isActive
      ? "bg-slate-200 text-ink"
      : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-ink",
  ].join(" ");
}

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
      role="region"
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

      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-ink">
          <span role="status">{statusText}</span>
          <span className="text-slate-500">{progressPercent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-sky-500 transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {run.currentFileName ? (
          <p className="mt-3 truncate text-sm text-slate-600">Current: {run.currentFileName}</p>
        ) : null}
      </div>

      <div className="min-h-0 overflow-hidden rounded-md border border-slate-200">
        <div className="max-h-[min(22rem,calc(100vh-24rem))] overflow-y-auto">
          <table
            aria-label="Markdown import files"
            className="w-full table-fixed text-left text-sm"
          >
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th scope="col" className="w-[60%] px-3 py-2">
                  File name
                </th>
                <th scope="col" className="w-24 px-3 py-2">
                  Size
                </th>
                <th scope="col" className="w-24 px-3 py-2">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {run.files.map((selectedFile) => (
                <tr key={selectedFile.id}>
                  <td className="px-3 py-2 font-medium text-ink">
                    <span className="block truncate">{selectedFile.file.name}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatFileSize(selectedFile.file.size)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{selectedFile.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const kilobytes = size / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

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

function importRunStatusText(run: ImportRun, completedCount: number, totalCount: number) {
  if (run.status === "importing") {
    return `Importing ${Math.min(completedCount + 1, totalCount)} / ${totalCount}`;
  }

  if (run.failedCount === 0) {
    return `Imported ${run.importedCount} Markdown file(s).`;
  }

  if (run.importedCount === 0) {
    return `Import failed for ${run.failedCount} file(s).`;
  }

  return `Imported ${run.importedCount} file(s). ${run.failedCount} file(s) failed.`;
}
