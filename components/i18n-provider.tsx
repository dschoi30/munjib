"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, type Language } from "@/lib/i18n/language";
import { getMessage, type MessageKey } from "@/lib/i18n/messages";
import {
  getInitialBrowserLanguage,
  subscribeToStoredLanguageChanges,
  writeStoredLanguage,
  type StoredLanguageWriteResult,
} from "@/lib/i18n/storage";

type TranslationParams = Record<string, string | number>;

type I18nContextValue = {
  language: Language;
  isHydrated: boolean;
  setLanguage: (language: Language) => StoredLanguageWriteResult;
  t: (key: MessageKey, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setLanguageState(getInitialBrowserLanguage());
    setIsHydrated(true);
    return subscribeToStoredLanguageChanges((change) => {
      setLanguageState(change.language);
      setIsHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    document.documentElement.lang = language;
  }, [isHydrated, language]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    const result = writeStoredLanguage(nextLanguage);
    setLanguageState(nextLanguage);
    setIsHydrated(true);
    return result;
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      isHydrated,
      setLanguage,
      t: (key, params) => getMessage(language, key, params),
    }),
    [isHydrated, language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return value;
}
