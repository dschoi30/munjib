import { inferLanguageFromBrowserHints, parseLanguage, type Language } from "@/lib/i18n/language";

export const APP_LANGUAGE_STORAGE_KEY = "munjib:language";
export const APP_LANGUAGE_CHANGE_EVENT = "munjib:language-changed";

export type StoredLanguageChange = {
  language: Language;
};

export type StoredLanguageWriteResult = {
  language: Language;
  stored: boolean;
};

export function readStoredLanguage(): Language | null {
  const storage = getBrowserStorage();
  if (!storage) return null;
  return parseLanguage(safeGetItem(storage, APP_LANGUAGE_STORAGE_KEY));
}

export function writeStoredLanguage(language: Language): StoredLanguageWriteResult {
  const storage = getBrowserStorage();
  const stored = storage ? safeSetItem(storage, APP_LANGUAGE_STORAGE_KEY, language) : false;
  emitStoredLanguageChange({ language });
  return { language, stored };
}

export function getInitialBrowserLanguage(): Language {
  return readStoredLanguage() ?? inferLanguageFromBrowserHints(readBrowserLanguageHints());
}

export function readBrowserLanguageHints(): string[] {
  if (typeof navigator === "undefined") return [];
  const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
  const language = typeof navigator.language === "string" ? [navigator.language] : [];
  return [...languages, ...language];
}

export function subscribeToStoredLanguageChanges(
  listener: (change: StoredLanguageChange) => void,
) {
  if (typeof window === "undefined") return () => {};

  function handleCustomEvent(event: Event) {
    const detail = (event as CustomEvent<StoredLanguageChange>).detail;
    if (parseLanguage(detail?.language)) listener({ language: detail.language });
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
    const language = parseLanguage(event.newValue);
    if (language) listener({ language });
  }

  window.addEventListener(APP_LANGUAGE_CHANGE_EVENT, handleCustomEvent);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(APP_LANGUAGE_CHANGE_EVENT, handleCustomEvent);
    window.removeEventListener("storage", handleStorage);
  };
}

function emitStoredLanguageChange(change: StoredLanguageChange) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_LANGUAGE_CHANGE_EVENT, { detail: change }));
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeGetItem(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
