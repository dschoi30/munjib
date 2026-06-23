export const INVALID_CHAT_MODEL_ERROR = "INVALID_CHAT_MODEL";
export const INVALID_CHAT_PROVIDER_ERROR = "INVALID_CHAT_PROVIDER";
export const INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR = "INCOMPATIBLE_CHAT_MODEL_PROVIDER";
export const CHAT_MODEL_SETTING_EVENT = "munjib:rag-chat-model-setting-changed";

export type ClientRagChatProvider = "ollama" | "openai" | "openai-compatible";

export type ChatModelSetting = {
  chatProvider: ClientRagChatProvider;
  chatModel: string;
};

export type ClientRagChatProviderAvailability = Record<ClientRagChatProvider, boolean>;

export type ChatModelValidationError =
  | typeof INVALID_CHAT_MODEL_ERROR
  | typeof INVALID_CHAT_PROVIDER_ERROR
  | typeof INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR;

export type ChatProviderValidationResult =
  | { ok: true; value: ClientRagChatProvider }
  | { ok: false; error: typeof INVALID_CHAT_PROVIDER_ERROR };

export type ChatModelValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: ChatModelValidationError };

export type ChatModelSettingValidationResult =
  | { ok: true; value: ChatModelSetting }
  | { ok: false; error: ChatModelValidationError };

export type ChatModelWriteResult =
  | { ok: true; value: string; stored: boolean }
  | { ok: false; error: ChatModelValidationError };

export type ChatModelSettingWriteResult =
  | { ok: true; value: ChatModelSetting; stored: boolean }
  | { ok: false; error: ChatModelValidationError };

export type StoredChatModelChange = {
  workspaceSlug: string;
  chatModel: string | null;
  chatProvider?: ClientRagChatProvider | null;
};

export const RAG_CHAT_MODEL_PRESETS = [
  { id: "openrouter/fusion", label: "OpenRouter Fusion", chatProvider: "openai-compatible" },
  { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code", chatProvider: "openai-compatible" },
  { id: "qwen/qwen3.7-plus", label: "Qwen3.7 Plus", chatProvider: "openai-compatible" },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B IT Free", chatProvider: "openai-compatible" },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B A4B IT Free", chatProvider: "openai-compatible" },
  { id: "openai/gpt-oss-20b:free", label: "GPT OSS 20B Free", chatProvider: "openai-compatible" },
  { id: "openai/gpt-oss-120b:free", label: "GPT OSS 120B Free", chatProvider: "openai-compatible" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", chatProvider: "openai" },
  { id: "gpt-5.4", label: "GPT-5.4", chatProvider: "openai" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", chatProvider: "openai" },
  { id: "gemma4:e4b", label: "Gemma4 E4B", chatProvider: "ollama" },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  chatProvider: ClientRagChatProvider;
}>;

export const RAG_CHAT_PROVIDER_RESET_DEFAULTS = {
  ollama: { chatProvider: "ollama", chatModel: "gemma4:e4b" },
  openai: { chatProvider: "openai", chatModel: "gpt-5.4-mini" },
  "openai-compatible": {
    chatProvider: "openai-compatible",
    chatModel: "google/gemma-4-31b-it:free",
  },
} as const satisfies Record<ClientRagChatProvider, ChatModelSetting>;

export function getRagChatModelPresets(chatProvider: ClientRagChatProvider) {
  return RAG_CHAT_MODEL_PRESETS.filter((preset) => preset.chatProvider === chatProvider);
}

export function getRagChatProviderResetDefault(
  chatProvider: ClientRagChatProvider,
): ChatModelSetting {
  return RAG_CHAT_PROVIDER_RESET_DEFAULTS[chatProvider];
}

export const RAG_CHAT_PROVIDER_OPTIONS = [
  { id: "ollama", label: "Ollama" },
  { id: "openai", label: "OpenAI" },
  { id: "openai-compatible", label: "OpenRouter / OpenAI-compatible" },
] as const satisfies ReadonlyArray<{ id: ClientRagChatProvider; label: string }>;

export const DEFAULT_CHAT_PROVIDER_AVAILABILITY = {
  ollama: true,
  openai: true,
  "openai-compatible": true,
} as const satisfies ClientRagChatProviderAvailability;

export function isChatProviderAvailable(
  chatProvider: ClientRagChatProvider,
  availability: ClientRagChatProviderAvailability = DEFAULT_CHAT_PROVIDER_AVAILABILITY,
): boolean {
  return availability[chatProvider] === true;
}

export function firstAvailableChatProvider(
  availability: ClientRagChatProviderAvailability = DEFAULT_CHAT_PROVIDER_AVAILABILITY,
  fallbackChatProvider: ClientRagChatProvider = "ollama",
): ClientRagChatProvider {
  if (isChatProviderAvailable(fallbackChatProvider, availability)) {
    return fallbackChatProvider;
  }

  return (
    RAG_CHAT_PROVIDER_OPTIONS.find((provider) =>
      isChatProviderAvailable(provider.id, availability),
    )?.id ?? "ollama"
  );
}

export function availableChatModelSetting(
  setting: ChatModelSetting | null,
  availability: ClientRagChatProviderAvailability = DEFAULT_CHAT_PROVIDER_AVAILABILITY,
): ChatModelSetting | null {
  return setting && isChatProviderAvailable(setting.chatProvider, availability) ? setting : null;
}

const CHAT_MODEL_STORAGE_PREFIX = "munjib:rag-chat-model:";
const CUSTOM_CHAT_MODELS_STORAGE_PREFIX = "munjib:rag-custom-chat-models:";
const CHAT_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/._:-]*$/;
const MAX_CHAT_MODEL_ID_LENGTH = 160;
const MAX_CUSTOM_CHAT_MODELS = 20;
const CHAT_PROVIDERS = new Set<ClientRagChatProvider>([
  "ollama",
  "openai",
  "openai-compatible",
]);
const OPENROUTER_MODEL_PREFIXES = new Set([
  "google",
  "moonshotai",
  "openai",
  "openrouter",
  "qwen",
]);

export function validateChatProvider(value: unknown): ChatProviderValidationResult {
  if (typeof value !== "string") {
    return { ok: false, error: INVALID_CHAT_PROVIDER_ERROR };
  }

  const normalized = value.trim().toLowerCase();
  if (CHAT_PROVIDERS.has(normalized as ClientRagChatProvider)) {
    return { ok: true, value: normalized as ClientRagChatProvider };
  }

  return { ok: false, error: INVALID_CHAT_PROVIDER_ERROR };
}

export function validateChatModelId(
  value: unknown,
  chatProvider?: ClientRagChatProvider,
): ChatModelValidationResult {
  if (typeof value !== "string") {
    return invalidChatModel();
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_CHAT_MODEL_ID_LENGTH ||
    !CHAT_MODEL_ID_PATTERN.test(normalized)
  ) {
    return invalidChatModel();
  }

  if (
    chatProvider &&
    !isChatModelCompatibleWithProvider({ chatProvider, chatModel: normalized })
  ) {
    return invalidChatModel(INCOMPATIBLE_CHAT_MODEL_PROVIDER_ERROR);
  }

  return { ok: true, value: normalized };
}

export function validateChatModelSetting(input: {
  chatProvider: unknown;
  chatModel: unknown;
}): ChatModelSettingValidationResult {
  const provider = validateChatProvider(input.chatProvider);
  if (!provider.ok) {
    return { ok: false, error: provider.error };
  }

  const model = validateChatModelId(input.chatModel, provider.value);
  if (!model.ok) {
    return model;
  }

  return {
    ok: true,
    value: {
      chatProvider: provider.value,
      chatModel: model.value,
    },
  };
}

export function readStoredChatModelSetting(
  workspaceSlug: string,
  fallbackChatProvider?: ClientRagChatProvider,
): ChatModelSetting | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  const storageKey = getChatModelStorageKey(workspaceSlug);
  const value = safeGetItem(storage, storageKey);
  if (value === null) {
    return null;
  }

  const result = parseStoredChatModelSetting(value, fallbackChatProvider);
  if (result.ok) {
    return result.value;
  }
  if (
    result.error === INVALID_CHAT_MODEL_ERROR ||
    result.error === INVALID_CHAT_PROVIDER_ERROR
  ) {
    safeRemoveItem(storage, storageKey);
  }
  return null;
}

export function readStoredChatModel(
  workspaceSlug: string,
  chatProvider?: ClientRagChatProvider,
): string | null {
  return readStoredChatModelSetting(workspaceSlug, chatProvider)?.chatModel ?? null;
}

export function writeStoredChatModelSetting(
  workspaceSlug: string,
  value: unknown,
): ChatModelSettingWriteResult {
  const result: ChatModelSettingValidationResult = isRecord(value)
    ? validateChatModelSetting({
        chatProvider: value.chatProvider,
        chatModel: value.chatModel,
      })
    : { ok: false as const, error: INVALID_CHAT_MODEL_ERROR };
  if (!result.ok) {
    return result;
  }

  const storage = getBrowserStorage();
  if (!storage) {
    return { ...result, stored: false };
  }

  const stored = safeSetItem(
    storage,
    getChatModelStorageKey(workspaceSlug),
    JSON.stringify(result.value),
  );
  if (stored) {
    emitStoredChatModelChange({
      workspaceSlug,
      chatProvider: result.value.chatProvider,
      chatModel: result.value.chatModel,
    });
  }

  return { ...result, stored };
}

export function writeStoredChatModel(
  workspaceSlug: string,
  value: unknown,
  chatProvider?: ClientRagChatProvider,
): ChatModelWriteResult {
  const result = validateChatModelId(value, chatProvider);
  if (!result.ok) {
    return result;
  }

  const storage = getBrowserStorage();
  if (!storage) {
    return { ...result, stored: false };
  }

  const stored = safeSetItem(storage, getChatModelStorageKey(workspaceSlug), result.value);
  if (stored) {
    emitStoredChatModelChange({ workspaceSlug, chatModel: result.value });
  }

  return { ...result, stored };
}

export function resetStoredChatModel(workspaceSlug: string): boolean {
  const storage = getBrowserStorage();
  if (!storage) {
    return false;
  }

  const removed = safeRemoveItem(storage, getChatModelStorageKey(workspaceSlug));
  if (removed) {
    emitStoredChatModelChange({ workspaceSlug, chatModel: null });
  }
  return removed;
}

export function readStoredCustomChatModels(workspaceSlug: string): ChatModelSetting[] {
  const storage = getBrowserStorage();
  if (!storage) {
    return [];
  }

  const storageKey = getCustomChatModelsStorageKey(workspaceSlug);
  const value = safeGetItem(storage, storageKey);
  if (value === null) {
    return [];
  }

  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) {
    safeRemoveItem(storage, storageKey);
    return [];
  }

  const settings = parsed
    .map((entry) =>
      isRecord(entry)
        ? validateChatModelSetting({
            chatProvider: entry.chatProvider,
            chatModel: entry.chatModel,
          })
        : ({ ok: false, error: INVALID_CHAT_MODEL_ERROR } as const),
    )
    .filter((entry): entry is { ok: true; value: ChatModelSetting } => entry.ok)
    .map((entry) => entry.value);
  return dedupeChatModelSettings(settings);
}

export function addStoredCustomChatModel(
  workspaceSlug: string,
  value: unknown,
): boolean {
  const result: ChatModelSettingValidationResult = isRecord(value)
    ? validateChatModelSetting({
        chatProvider: value.chatProvider,
        chatModel: value.chatModel,
      })
    : { ok: false as const, error: INVALID_CHAT_MODEL_ERROR };
  if (!result.ok) {
    return false;
  }

  const storage = getBrowserStorage();
  if (!storage) {
    return false;
  }

  const current = readStoredCustomChatModels(workspaceSlug);
  const next = dedupeChatModelSettings([result.value, ...current]).slice(
    0,
    MAX_CUSTOM_CHAT_MODELS,
  );
  return safeSetItem(
    storage,
    getCustomChatModelsStorageKey(workspaceSlug),
    JSON.stringify(next),
  );
}

export function subscribeToStoredChatModelChanges(
  handler: (change: StoredChatModelChange) => void,
  options: { chatProvider?: ClientRagChatProvider } = {},
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener = (event: Event) => {
    const detail = "detail" in event ? event.detail : undefined;
    const change = isStoredChatModelChange(detail) ? detail : null;
    const normalized = normalizeStoredChatModelChange(change, options.chatProvider);
    if (normalized) {
      handler(normalized);
    }
  };
  const storageListener = (event: StorageEvent) => {
    const change = storedChatModelChangeFromStorageEvent(event);
    const normalized = normalizeStoredChatModelChange(change, options.chatProvider);
    if (normalized) {
      handler(normalized);
    }
  };

  window.addEventListener(CHAT_MODEL_SETTING_EVENT, listener);
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(CHAT_MODEL_SETTING_EVENT, listener);
    window.removeEventListener("storage", storageListener);
  };
}

function parseStoredChatModelSetting(
  value: string,
  fallbackChatProvider?: ClientRagChatProvider,
): ChatModelSettingValidationResult {
  const parsed = parseJson(value);
  if (isRecord(parsed) && "chatProvider" in parsed && "chatModel" in parsed) {
    return validateChatModelSetting({
      chatProvider: parsed.chatProvider,
      chatModel: parsed.chatModel,
    });
  }

  const inferredProvider = fallbackChatProvider ?? inferLegacyChatProvider(value);
  const model = validateChatModelId(value, inferredProvider);
  if (!model.ok) {
    return model;
  }

  return {
    ok: true,
    value: {
      chatProvider: inferredProvider,
      chatModel: model.value,
    },
  };
}

function normalizeStoredChatModelChange(
  change: StoredChatModelChange | null,
  fallbackChatProvider?: ClientRagChatProvider,
): StoredChatModelChange | null {
  if (!change) {
    return null;
  }
  if (change.chatModel === null) {
    return { workspaceSlug: change.workspaceSlug, chatModel: null };
  }

  const chatProvider = change.chatProvider ?? fallbackChatProvider;
  if (chatProvider) {
    const setting = validateChatModelSetting({
      chatProvider,
      chatModel: change.chatModel,
    });
    return setting.ok
      ? {
          workspaceSlug: change.workspaceSlug,
          chatProvider: setting.value.chatProvider,
          chatModel: setting.value.chatModel,
        }
      : null;
  }

  const model = validateChatModelId(change.chatModel);
  return model.ok
    ? { workspaceSlug: change.workspaceSlug, chatModel: model.value }
    : null;
}

function inferLegacyChatProvider(chatModel: string): ClientRagChatProvider {
  return hasOpenRouterModelPrefix(chatModel) ? "openai-compatible" : "ollama";
}

function invalidChatModel(
  error: ChatModelValidationError = INVALID_CHAT_MODEL_ERROR,
): ChatModelValidationResult {
  return { ok: false, error };
}

export function isChatModelCompatibleWithProvider({
  chatProvider,
  chatModel,
}: {
  chatProvider: ClientRagChatProvider;
  chatModel: string;
}): boolean {
  if (chatProvider === "openai-compatible") {
    return true;
  }

  return !hasOpenRouterModelPrefix(chatModel);
}

function hasOpenRouterModelPrefix(chatModel: string): boolean {
  const slashIndex = chatModel.indexOf("/");
  if (slashIndex <= 0) {
    return false;
  }

  return OPENROUTER_MODEL_PREFIXES.has(chatModel.slice(0, slashIndex).toLowerCase());
}

function getChatModelStorageKey(workspaceSlug: string): string {
  return `${CHAT_MODEL_STORAGE_PREFIX}${workspaceSlug}`;
}

function getCustomChatModelsStorageKey(workspaceSlug: string): string {
  return `${CUSTOM_CHAT_MODELS_STORAGE_PREFIX}${workspaceSlug}`;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    // Browser storage may be unavailable despite window.localStorage existing.
    return false;
  }
}

function safeRemoveItem(storage: Storage, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    // Browser storage may be unavailable despite window.localStorage existing.
    return false;
  }
}

function emitStoredChatModelChange(change: StoredChatModelChange): void {
  if (typeof window === "undefined" || typeof window.CustomEvent !== "function") {
    return;
  }

  window.dispatchEvent(new window.CustomEvent(CHAT_MODEL_SETTING_EVENT, { detail: change }));
}

function isStoredChatModelChange(value: unknown): value is StoredChatModelChange {
  if (!isRecord(value) || typeof value.workspaceSlug !== "string") {
    return false;
  }

  if (value.chatModel === null) {
    return true;
  }

  if (typeof value.chatModel !== "string") {
    return false;
  }

  if (value.chatProvider === undefined || value.chatProvider === null) {
    return validateChatModelId(value.chatModel).ok;
  }

  return validateChatModelSetting({
    chatProvider: value.chatProvider,
    chatModel: value.chatModel,
  }).ok;
}

function storedChatModelChangeFromStorageEvent(
  event: StorageEvent,
): StoredChatModelChange | null {
  if (!event.key?.startsWith(CHAT_MODEL_STORAGE_PREFIX)) {
    return null;
  }

  const workspaceSlug = event.key.slice(CHAT_MODEL_STORAGE_PREFIX.length);
  if (!workspaceSlug) {
    return null;
  }

  if (event.newValue === null) {
    return { workspaceSlug, chatModel: null };
  }

  const parsed = parseStoredChatModelSetting(event.newValue);
  return parsed.ok
    ? {
        workspaceSlug,
        chatProvider: parsed.value.chatProvider,
        chatModel: parsed.value.chatModel,
      }
    : null;
}

function dedupeChatModelSettings(settings: ChatModelSetting[]): ChatModelSetting[] {
  const seen = new Set<string>();
  const deduped: ChatModelSetting[] = [];
  for (const setting of settings) {
    const key = `${setting.chatProvider}:${setting.chatModel}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(setting);
  }
  return deduped;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
