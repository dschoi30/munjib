"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Bot, Clock3, FileText, Languages, Upload, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { LANGUAGE_OPTIONS, languageLabel } from "@/lib/i18n/language";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  ARCHIVED_DOCUMENT_RETENTION_POLICIES,
  type ArchivedDocumentRetentionPolicyValue,
} from "@/lib/workspaces/retention-policy";
import {
  type ChatModelSetting,
  type ClientRagChatProvider,
  type ClientRagChatProviderAvailability,
  type ChatModelValidationError,
  INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR,
  RAG_CHAT_PROVIDER_OPTIONS,
  addStoredCustomChatModel,
  availableChatModelSetting,
  firstAvailableChatProvider,
  getRagChatModelPresets,
  getRagChatProviderResetDefault,
  readStoredChatModelSetting,
  readStoredCustomChatModels,
  validateChatModelSetting,
  writeStoredChatModelSetting,
} from "@/lib/rag/client-model-settings";

type TranslationParams = Record<string, string | number>;
type Translate = (key: MessageKey, params?: TranslationParams) => string;
type StatusMessage =
  | {
      key: Exclude<MessageKey, "settings.retention.saved">;
      params?: TranslationParams;
    }
  | {
      key: "settings.retention.saved";
      retentionPolicy: ArchivedDocumentRetentionPolicyValue;
    };

type WorkspaceSettingsFolder = {
  id: string;
  path: string;
  displayPath?: string;
};

export type MarkdownImportActionResult = {
  documentIds: string[];
  imported: Array<{ fileName: string; documentId: string }>;
  failed: Array<{ fileName: string; error: string }>;
};

export type RetentionPolicyActionResult = {
  archivedDocumentRetentionPolicy?: ArchivedDocumentRetentionPolicyValue;
  error?: string;
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

type SettingsSection = "import" | "ai" | "retention" | "language";

const retentionPolicyMessageKeys = {
  NEVER: "settings.retention.policy.NEVER",
  DAYS_7: "settings.retention.policy.DAYS_7",
  DAYS_30: "settings.retention.policy.DAYS_30",
  DAYS_90: "settings.retention.policy.DAYS_90",
} satisfies Record<ArchivedDocumentRetentionPolicyValue, MessageKey>;

export function WorkspaceSettingsPanel({
  canWrite,
  defaultChatModel,
  defaultChatProvider,
  availableChatProviders,
  folders,
  importMarkdownAction,
  archivedDocumentRetentionPolicy,
  updateRetentionPolicyAction,
  onClose,
  workspaceSlug,
}: {
  canWrite: boolean;
  defaultChatModel: string;
  defaultChatProvider: ClientRagChatProvider;
  availableChatProviders: ClientRagChatProviderAvailability;
  folders: WorkspaceSettingsFolder[];
  importMarkdownAction: (formData: FormData) => Promise<MarkdownImportActionResult>;
  archivedDocumentRetentionPolicy: ArchivedDocumentRetentionPolicyValue;
  updateRetentionPolicyAction: (formData: FormData) => Promise<RetentionPolicyActionResult>;
  onClose: () => void;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const { language, setLanguage, t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("import");
  const [draftLanguage, setDraftLanguage] = useState(language);
  const [languageStatus, setLanguageStatus] = useState<"saved" | "storageFailed" | null>(null);
  const [customModel, setCustomModel] = useState("");
  const [selectedChatProvider, setSelectedChatProvider] = useState<ClientRagChatProvider>(() => {
    const fallbackProvider = firstAvailableChatProvider(
      availableChatProviders,
      defaultChatProvider,
    );
    return (
      availableChatModelSetting(
        readStoredChatModelSetting(workspaceSlug, fallbackProvider),
        availableChatProviders,
      )?.chatProvider ?? fallbackProvider
    );
  });
  const [isImportPending, startImportTransition] = useTransition();
  const [isImporting, setIsImporting] = useState(false);
  const [modelStatus, setModelStatus] = useState<StatusMessage | null>(null);
  const [saveVersion, setSaveVersion] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<SelectedImportFile[]>([]);
  const [selectedRetentionPolicy, setSelectedRetentionPolicy] =
    useState<ArchivedDocumentRetentionPolicyValue>(archivedDocumentRetentionPolicy);
  const [retentionStatus, setRetentionStatus] = useState<StatusMessage | null>(null);
  const [importRun, setImportRun] = useState<ImportRun | null>(null);
  const [destinationFolderId, setDestinationFolderId] = useState<string | null>(null);
  const [destinationPickerOpen, setDestinationPickerOpen] = useState(false);
  const [isRetentionPending, startRetentionTransition] = useTransition();
  const fallbackChatProvider = useMemo(
    () => firstAvailableChatProvider(availableChatProviders, defaultChatProvider),
    [availableChatProviders, defaultChatProvider],
  );
  const availableProviderOptions = useMemo(
    () => RAG_CHAT_PROVIDER_OPTIONS.filter((provider) => availableChatProviders[provider.id]),
    [availableChatProviders],
  );
  const storedChatModel = useMemo(
    () =>
      availableChatModelSetting(
        readStoredChatModelSetting(workspaceSlug, fallbackChatProvider),
        availableChatProviders,
      ),
    [availableChatProviders, fallbackChatProvider, saveVersion, workspaceSlug],
  );
  const customChatModels = useMemo(
    () => readStoredCustomChatModels(workspaceSlug),
    [saveVersion, workspaceSlug],
  );
  const visiblePresetModels = useMemo(
    () => getRagChatModelPresets(selectedChatProvider),
    [selectedChatProvider],
  );
  const visibleCustomChatModels = useMemo(
    () =>
      customChatModels.filter((setting) => setting.chatProvider === selectedChatProvider),
    [customChatModels, selectedChatProvider],
  );
  const effectiveChatProvider = storedChatModel?.chatProvider ?? fallbackChatProvider;
  const effectiveChatModel = storedChatModel?.chatModel ?? defaultChatModel;

  useEffect(() => {
    if (!availableChatProviders[selectedChatProvider]) {
      setSelectedChatProvider(fallbackChatProvider);
    }
  }, [availableChatProviders, fallbackChatProvider, selectedChatProvider]);
  const importLocked = isImportPending || isImporting;
  const isImportActive = isImporting || importRun?.status === "importing";
  const isSubmitDisabled = !canWrite || importLocked || selectedFiles.length === 0;
  const hasLanguageDraftChange = draftLanguage !== language;
  const sortedFolders = useMemo(
    () => [...folders].sort((left, right) => left.path.localeCompare(right.path)),
    [folders],
  );
  const destinationFolder = sortedFolders.find((folder) => folder.id === destinationFolderId);
  const destinationPath = destinationFolder?.displayPath ?? destinationFolder?.path ?? "/";

  useEffect(() => {
    setDraftLanguage(language);
  }, [language]);

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

  const handleSaveLanguage = useCallback(() => {
    const result = setLanguage(draftLanguage);
    setLanguageStatus(result.stored ? "saved" : "storageFailed");
  }, [draftLanguage, setLanguage]);

  const handleCancelLanguage = useCallback(() => {
    setDraftLanguage(language);
    setLanguageStatus(null);
  }, [language]);

  const handleSavePresetModel = useCallback(
    (setting: ChatModelSetting) => {
      const result = writeStoredChatModelSetting(workspaceSlug, setting);
      if (!result.ok) {
        setModelStatus(chatModelErrorMessage(result.error));
        return;
      }

      if (result.stored) {
        setSelectedChatProvider(result.value.chatProvider);
        setSaveVersion((version) => version + 1);
      }
      setModelStatus(
        result.stored
          ? { key: "settings.ai.savedModel", params: { model: result.value.chatModel } }
          : { key: "settings.ai.modelSaveFailed" },
      );
    },
    [workspaceSlug],
  );

  const handleSaveCustomModel = useCallback(() => {
    const validation = validateChatModelSetting({
      chatProvider: selectedChatProvider,
      chatModel: customModel,
    });
    if (!validation.ok) {
      setModelStatus(chatModelErrorMessage(validation.error));
      return;
    }

    const result = writeStoredChatModelSetting(workspaceSlug, validation.value);
    if (result.ok) {
      setCustomModel(result.value.chatModel);
      setSelectedChatProvider(result.value.chatProvider);
      if (result.stored) {
        addStoredCustomChatModel(workspaceSlug, result.value);
        setSaveVersion((version) => version + 1);
      }
      setModelStatus(
        result.stored
          ? { key: "settings.ai.savedModel", params: { model: result.value.chatModel } }
          : { key: "settings.ai.modelSaveFailed" },
      );
      return;
    }

    setModelStatus(chatModelErrorMessage(result.error));
  }, [customModel, selectedChatProvider, workspaceSlug]);

  const handleResetModel = useCallback(() => {
    const resetDefault = getRagChatProviderResetDefault(selectedChatProvider);
    const result = writeStoredChatModelSetting(workspaceSlug, resetDefault);
    if (!result.ok) {
      setModelStatus(chatModelErrorMessage(result.error));
      return;
    }

    if (result.stored) {
      setSelectedChatProvider(result.value.chatProvider);
      setCustomModel("");
      setSaveVersion((version) => version + 1);
    }
    setModelStatus(
      result.stored
        ? { key: "settings.ai.resetModelStatus", params: { model: result.value.chatModel } }
        : { key: "settings.ai.modelResetFailed" },
    );
  }, [selectedChatProvider, workspaceSlug]);

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

  const handleSaveRetentionPolicy = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || isRetentionPending) return;

    const formData = new FormData(event.currentTarget);
    startRetentionTransition(async () => {
      const result = await updateRetentionPolicyAction(formData);
      if (result.error || !result.archivedDocumentRetentionPolicy) {
        setRetentionStatus({ key: "settings.retention.invalid" });
        return;
      }

      setSelectedRetentionPolicy(result.archivedDocumentRetentionPolicy);
      setRetentionStatus({
        key: "settings.retention.saved",
        retentionPolicy: result.archivedDocumentRetentionPolicy,
      });
    });
  }, [canWrite, isRetentionPending, updateRetentionPolicyAction]);

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
        aria-label={t("settings.dialogLabel")}
        className="grid h-[80vh] max-h-[80vh] w-full max-w-4xl grid-cols-[13rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <aside className="border-r border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex h-9 items-center">
            <h2 className="text-sm font-semibold text-ink">{t("settings.title")}</h2>
          </div>
          <nav aria-label={t("settings.menu")} className="space-y-1">
            <Button
              type="button"
              aria-label={t("settings.import.nav")}
              aria-pressed={activeSection === "import"}
              onClick={() => setActiveSection("import")}
              className={settingsNavButtonClassName(activeSection === "import")}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {t("settings.import.nav")}
            </Button>
            <Button
              type="button"
              aria-label={t("settings.ai.nav")}
              aria-pressed={activeSection === "ai"}
              onClick={() => setActiveSection("ai")}
              className={settingsNavButtonClassName(activeSection === "ai")}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              {t("settings.ai.nav")}
            </Button>
            <Button
              type="button"
              aria-label={t("settings.retention.nav")}
              aria-pressed={activeSection === "retention"}
              onClick={() => setActiveSection("retention")}
              className={settingsNavButtonClassName(activeSection === "retention")}
            >
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {t("settings.retention.nav")}
            </Button>
            <Button
              type="button"
              aria-label={t("settings.language.nav")}
              aria-pressed={activeSection === "language"}
              onClick={() => setActiveSection("language")}
              className={settingsNavButtonClassName(activeSection === "language")}
            >
              <Languages className="h-4 w-4" aria-hidden="true" />
              {t("settings.language.nav")}
            </Button>
          </nav>
        </aside>
        <div className="min-w-0 overflow-y-auto p-8">
          {activeSection === "import" ? (
            <>
              <div className="mb-8 flex items-start gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {t("settings.workspaceEyebrow")}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">
                    {t("settings.import.title")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t("settings.import.description")}
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label={t("settings.close")}
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
                    aria-label={t("settings.import.fileInput")}
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
                      {t("settings.import.fileInput")}
                    </span>
                    <span className="mt-2 text-sm leading-6 text-slate-600">
                      {selectedFiles.length > 0
                        ? t("settings.import.selectedFiles", { count: selectedFiles.length })
                        : t("settings.import.fileTypes")}
                    </span>
                  </button>
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)] gap-3">
                    <div className="relative min-w-0">
                      <button
                        type="button"
                        aria-label={t("settings.import.destination", { path: destinationPath })}
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
                            aria-label={t("settings.import.destinationFolders")}
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
                                {folder.displayPath ?? folder.path}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <Button type="submit" disabled={isSubmitDisabled} className="h-10 w-full">
                      {t("settings.import.submit")}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : activeSection === "ai" ? (
            <section aria-label={t("settings.ai.title")} className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">
                    {t("settings.workspaceEyebrow")}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">
                    {t("settings.ai.title")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t("settings.ai.description")}
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label={t("settings.close")}
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
                  {storedChatModel
                    ? t("settings.ai.browserOverride")
                    : t("settings.ai.serverDefault")}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  {providerLabel(effectiveChatProvider)}
                </p>
                <p className="mt-2 break-all text-sm font-semibold text-ink">
                  {effectiveChatModel}
                </p>
              </div>

              <div>
                <label
                  htmlFor="chatProvider"
                  className="text-sm font-semibold text-ink"
                >
                  {t("settings.ai.provider")}
                </label>
                <select
                  id="chatProvider"
                  aria-label={t("settings.ai.providerSelect")}
                  value={selectedChatProvider}
                  onChange={(event) =>
                    setSelectedChatProvider(event.target.value as ClientRagChatProvider)
                  }
                  className="mt-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  {availableProviderOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>

              {visiblePresetModels.length > 0 ? (
                <div>
                  <p className="text-sm font-semibold text-ink">{t("settings.ai.presets")}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {visiblePresetModels.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        aria-label={t("settings.ai.usePreset", { label: preset.label })}
                        onClick={() =>
                          handleSavePresetModel({
                            chatProvider: preset.chatProvider,
                            chatModel: preset.id,
                          })
                        }
                        className="h-auto justify-start border border-slate-200 bg-white px-3 py-2 text-left text-ink hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{preset.label}</span>
                          <span className="mt-1 block break-all text-xs font-normal text-slate-500">
                            {preset.id}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="customChatModel"
                  className="text-sm font-semibold text-ink"
                >
                  {t("settings.ai.customModelId")}
                </label>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <input
                    id="customChatModel"
                    value={customModel}
                    onChange={(event) => setCustomModel(event.target.value)}
                    className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-ink shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                  <Button type="button" onClick={handleSaveCustomModel} className="h-10">
                    {t("settings.ai.saveCustomModel")}
                  </Button>
                </div>
              </div>

              {visibleCustomChatModels.length > 0 ? (
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {t("settings.ai.customModels")}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {visibleCustomChatModels.map((setting) => (
                      <Button
                        key={`${setting.chatProvider}:${setting.chatModel}`}
                        type="button"
                        aria-label={t("settings.ai.useCustomModel", {
                          model: setting.chatModel,
                        })}
                        onClick={() => handleSavePresetModel(setting)}
                        className="h-auto justify-start border border-slate-200 bg-white px-3 py-2 text-left text-ink hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block break-all text-sm font-semibold">
                            {setting.chatModel}
                          </span>
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            {providerLabel(setting.chatProvider)}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleResetModel}
                  className="h-10 border border-slate-200 bg-white text-ink hover:bg-slate-50"
                >
                  {t("settings.ai.resetModel")}
                </Button>
                {modelStatus ? (
                  <p role="status" className="text-sm font-medium text-slate-700">
                    {statusMessageText(modelStatus, t)}
                  </p>
                ) : null}
              </div>
            </section>
          ) : activeSection === "language" ? (
            <section
              aria-label={t("settings.language.title")}
              className="flex min-h-full flex-col space-y-6"
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">
                    {t("settings.language.eyebrow")}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">
                    {t("settings.language.title")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t("settings.language.description")}
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label={t("settings.close")}
                  onClick={() => {
                    if (!isImportActive) onClose();
                  }}
                  disabled={isImportActive}
                  className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">{t("settings.language.title")}</legend>
                {LANGUAGE_OPTIONS.map((option) => {
                  const isApplied = option.value === language;
                  const isSelected = option.value === draftLanguage;
                  const inputId = `settings-language-${option.value}`;
                  return (
                    <div key={option.value} className="relative">
                      <input
                        id={inputId}
                        type="radio"
                        name="settings-language"
                        value={option.value}
                        checked={isSelected}
                        onChange={() => {
                          setDraftLanguage(option.value);
                          setLanguageStatus(null);
                        }}
                        className="peer sr-only"
                      />
                      <label
                        htmlFor={inputId}
                        className={[
                          "block min-h-24 cursor-pointer rounded-md border px-4 py-3 text-left shadow-sm outline-none",
                          "peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2",
                          isSelected
                            ? "border-ink bg-slate-50"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                          isApplied ? "ring-2 ring-sky-200" : "",
                        ].join(" ")}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-ink">
                            {languageLabel(option.value, language)}
                          </span>
                          {isApplied ? (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[0.68rem] font-semibold text-sky-800">
                              {t("settings.language.currentBadge")}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-2 block text-xs text-slate-500">
                          {option.nativeName}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </fieldset>

              <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
                <Button
                  type="button"
                  disabled={!hasLanguageDraftChange}
                  onClick={handleSaveLanguage}
                  className="h-10"
                >
                  {t("settings.language.save")}
                </Button>
                <Button
                  type="button"
                  disabled={!hasLanguageDraftChange}
                  onClick={handleCancelLanguage}
                  className="h-10 border border-slate-200 bg-white text-ink hover:bg-slate-50"
                >
                  {t("settings.language.cancel")}
                </Button>
                <div role="status" className="min-w-0 text-sm font-medium text-slate-700">
                  <p>
                    {hasLanguageDraftChange
                      ? t("settings.language.pending", {
                          language: languageLabel(draftLanguage, language),
                        })
                      : t("settings.language.currentStatus", {
                          language: languageLabel(language, language),
                        })}
                  </p>
                  {languageStatus ? (
                    <p className="mt-1">
                      {languageStatus === "saved"
                        ? t("settings.language.saved", {
                            language: languageLabel(language, language),
                          })
                        : t("settings.language.storageFailed")}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : (
            <section aria-label={t("settings.retention.title")} className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">
                    {t("settings.workspaceEyebrow")}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">
                    {t("settings.retention.title")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t("settings.retention.description")}
                  </p>
                </div>
                <Button
                  type="button"
                  aria-label={t("settings.close")}
                  onClick={() => {
                    if (!isImportActive) onClose();
                  }}
                  disabled={isImportActive}
                  className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <form onSubmit={handleSaveRetentionPolicy} className="space-y-4">
                <div>
                  <label
                    htmlFor="archivedDocumentRetentionPolicy"
                    className="text-sm font-semibold text-ink"
                  >
                    {t("settings.retention.deletedDocumentRetention")}
                  </label>
                  <select
                    id="archivedDocumentRetentionPolicy"
                    name="archivedDocumentRetentionPolicy"
                    aria-label={t("settings.retention.deletedDocumentRetention")}
                    value={selectedRetentionPolicy}
                    onChange={(event) =>
                      setSelectedRetentionPolicy(
                        event.target.value as ArchivedDocumentRetentionPolicyValue,
                      )
                    }
                    disabled={!canWrite || isRetentionPending}
                    className="mt-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {ARCHIVED_DOCUMENT_RETENTION_POLICIES.map((policy) => (
                      <option key={policy.value} value={policy.value}>
                        {t(retentionPolicyMessageKeys[policy.value])}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    disabled={!canWrite || isRetentionPending}
                    className="h-10"
                  >
                    {t("settings.retention.save")}
                  </Button>
                  {retentionStatus ? (
                    <p role="status" className="text-sm font-medium text-slate-700">
                      {statusMessageText(retentionStatus, t)}
                    </p>
                  ) : null}
                </div>
              </form>
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

function chatModelErrorMessage(error: ChatModelValidationError): StatusMessage {
  if (error === INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR) {
    return { key: "settings.ai.incompatibleProvider" };
  }

  return { key: "settings.ai.invalidModel" };
}

function statusMessageText(status: StatusMessage, t: Translate) {
  if (status.key === "settings.retention.saved") {
    return t(status.key, {
      policy: t(retentionPolicyMessageKeys[status.retentionPolicy]),
    });
  }

  return t(status.key, status.params);
}

function providerLabel(providerId: ClientRagChatProvider): string {
  return (
    RAG_CHAT_PROVIDER_OPTIONS.find((provider) => provider.id === providerId)?.label ??
    providerId
  );
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
  const { t } = useI18n();
  const totalCount = run.files.length;
  const completedCount = run.importedCount + run.failedCount;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const statusText = importRunStatusText(run, completedCount, totalCount, t);

  return (
    <section
      role="region"
      aria-label={t("settings.import.progress.region")}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">
            {t("settings.import.progress.eyebrow")}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">
            {t("settings.import.progress.title")}
          </h3>
          <p className="mt-2 truncate text-sm text-slate-600">
            {t("settings.import.progress.destination", { path: run.destinationPath })}
          </p>
        </div>
        <Button
          type="button"
          aria-label={t("settings.import.progress.close")}
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
          <p className="mt-3 truncate text-sm text-slate-600">
            {t("settings.import.progress.current", { fileName: run.currentFileName })}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 overflow-hidden rounded-md border border-slate-200">
        <div className="max-h-[min(22rem,calc(100vh-24rem))] overflow-y-auto">
          <table
            aria-label={t("settings.import.progress.files")}
            className="w-full table-fixed text-left text-sm"
          >
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th scope="col" className="w-[60%] px-3 py-2">
                  {t("settings.import.progress.fileName")}
                </th>
                <th scope="col" className="w-24 px-3 py-2">
                  {t("settings.import.progress.size")}
                </th>
                <th scope="col" className="w-24 px-3 py-2">
                  {t("settings.import.progress.status")}
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
                  <td className="whitespace-nowrap px-3 py-2">
                    {importFileStatusLabel(selectedFile.status, t)}
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

function importFileStatusLabel(status: ImportFileStatus, t: Translate) {
  switch (status) {
    case "Ready":
      return t("settings.import.progress.statusReady");
    case "Queued":
      return t("settings.import.progress.statusQueued");
    case "Importing":
      return t("settings.import.progress.statusImporting");
    case "Imported":
      return t("settings.import.progress.statusImported");
    case "Failed":
      return t("settings.import.progress.statusFailed");
  }
}

function importRunStatusText(
  run: ImportRun,
  completedCount: number,
  totalCount: number,
  t: Translate,
) {
  if (run.status === "importing") {
    return t("settings.import.progress.importing", {
      current: Math.min(completedCount + 1, totalCount),
      total: totalCount,
    });
  }

  if (run.failedCount === 0) {
    return t("settings.import.progress.imported", { count: run.importedCount });
  }

  if (run.importedCount === 0) {
    return t("settings.import.progress.failed", { count: run.failedCount });
  }

  return t("settings.import.progress.partial", {
    imported: run.importedCount,
    failed: run.failedCount,
  });
}
