export const INVALID_CHAT_MODEL_ERROR = "INVALID_CHAT_MODEL";
export const CHAT_MODEL_SETTING_EVENT = "munjib:rag-chat-model-setting-changed";

export type ChatModelValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: typeof INVALID_CHAT_MODEL_ERROR };

export type ChatModelWriteResult =
  | { ok: true; value: string; stored: boolean }
  | { ok: false; error: typeof INVALID_CHAT_MODEL_ERROR };

export type StoredChatModelChange = {
  workspaceSlug: string;
  chatModel: string | null;
};

export type ClientRagChatProvider = "ollama" | "openai" | "openai-compatible";

export const RAG_CHAT_MODEL_PRESETS = [
  { id: "openrouter/fusion", label: "OpenRouter Fusion" },
  { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code" },
  { id: "qwen/qwen3.7-plus", label: "Qwen3.7 Plus" },
] as const satisfies ReadonlyArray<{ id: string; label: string }>;

const CHAT_MODEL_STORAGE_PREFIX = "munjib:rag-chat-model:";
const CHAT_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/._:-]*$/;
const MAX_CHAT_MODEL_ID_LENGTH = 160;
const OPENROUTER_MODEL_PREFIXES = new Set(["google", "moonshotai", "openrouter", "qwen"]);

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
    return invalidChatModel();
  }

  return { ok: true, value: normalized };
}

export function readStoredChatModel(
  workspaceSlug: string,
  chatProvider?: ClientRagChatProvider,
): string | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  const storageKey = getChatModelStorageKey(workspaceSlug);
  const value = safeGetItem(storage, storageKey);
  if (value === null) {
    return null;
  }

  const result = validateChatModelId(value);
  if (!result.ok) {
    safeRemoveItem(storage, storageKey);
    return null;
  }
  if (
    chatProvider &&
    !isChatModelCompatibleWithProvider({ chatProvider, chatModel: result.value })
  ) {
    return null;
  }

  return result.value;
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

export function subscribeToStoredChatModelChanges(
  handler: (change: StoredChatModelChange) => void,
  options: { chatProvider?: ClientRagChatProvider } = {},
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener = (event: Event) => {
    const detail = "detail" in event ? event.detail : undefined;
    if (!isStoredChatModelChange(detail)) {
      return;
    }
    if (
      detail.chatModel &&
      options.chatProvider &&
      !isChatModelCompatibleWithProvider({
        chatProvider: options.chatProvider,
        chatModel: detail.chatModel,
      })
    ) {
      return;
    }

    handler(detail);
  };
  const storageListener = (event: StorageEvent) => {
    const change = storedChatModelChangeFromStorageEvent(event);
    if (
      change?.chatModel &&
      options.chatProvider &&
      !isChatModelCompatibleWithProvider({
        chatProvider: options.chatProvider,
        chatModel: change.chatModel,
      })
    ) {
      return;
    }
    if (change) {
      handler(change);
    }
  };

  window.addEventListener(CHAT_MODEL_SETTING_EVENT, listener);
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(CHAT_MODEL_SETTING_EVENT, listener);
    window.removeEventListener("storage", storageListener);
  };
}

function invalidChatModel(): ChatModelValidationResult {
  return { ok: false, error: INVALID_CHAT_MODEL_ERROR };
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

  return validateChatModelId(value.chatModel).ok;
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

  const validation = validateChatModelId(event.newValue);
  return validation.ok ? { workspaceSlug, chatModel: validation.value } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
