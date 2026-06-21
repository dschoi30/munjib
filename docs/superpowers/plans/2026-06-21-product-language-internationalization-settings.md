# Product Language Internationalization Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add English/Korean product display language switching from Settings, with OS-language fallback for first use and immediate UI updates after Save.

**Architecture:** Add a small typed i18n layer with shared language validation, browser-global storage, a React provider, and typed message catalogs. Migrate user-facing UI chrome to `useI18n()` in focused surface groups, and pass the selected UI language to AI routes for default/fallback wording while preserving question-language-first answers.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, Vitest, Testing Library, browser `localStorage`, existing `pnpm wiki:*` maintenance tooling.

---

## File Structure

- Create `lib/i18n/language.ts`: shared `Language` type, supported language metadata, validation, browser/OS inference, and label helpers. This file is safe for server and client imports.
- Create `lib/i18n/messages.ts`: typed English/Korean catalog and translation helpers. Keep stable identifiers such as provider ids and model ids out of the catalog.
- Create `lib/i18n/storage.ts`: browser storage helpers, custom same-tab event, cross-tab storage event subscription, safe read/write behavior.
- Create `components/i18n-provider.tsx`: client provider, `useI18n()`, document `lang` synchronization, storage subscription, and session fallback state.
- Modify `app/layout.tsx`: wrap the app in `I18nProvider`.
- Modify `app/login/login-form.tsx`: translate login text and user-facing login errors.
- Modify `components/workspace-settings-panel.tsx`: add `Language` section, translate existing settings strings, implement Save/Cancel/current highlight.
- Modify `components/ai/thinking-indicator.tsx`: translate elapsed-time thinking messages through `useI18n()`.
- Modify `components/document-list.tsx`, `components/document-create-controls.tsx`, `components/document-navigation.tsx`, `components/document-navigation/*`, `components/app-shell.tsx`: translate workspace chrome, navigation, search, favorites, recents, folder/document action text, and toasts.
- Modify `components/document-tabs.tsx`, `components/document-toolbar.tsx`, `components/workspace-center-shell.tsx`, `components/folder-detail.tsx`: translate center shell chrome and empty/path labels.
- Modify `components/document-editor.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/document-editor/document-properties.tsx`, `components/document-editor/wiki-link-suggestions.tsx`, `components/metadata-panel.tsx`, `components/knowledge-graph-view.tsx`, `components/workspace-chatbot.tsx`: translate editor, metadata, graph, Ask AI, and Workspace AI user-facing text.
- Modify `lib/rag/prompt.ts`: accept optional `uiLanguage`, use localized default/fallback context phrases, and keep answer language policy question-first.
- Modify `lib/rag/ask.ts`, `lib/rag/workspace-chat.ts`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`: validate and pass optional `uiLanguage`.
- Create tests in `tests/i18n/*.test.ts` and update focused component/RAG tests.
- Update wiki pages after implementation: [[Munjib]], [[Project PRD]], [[RAG Process Workflow]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]], and `wiki/manifest.json`.

---

### Task 1: Shared Language Core And Message Catalog

**Files:**
- Create: `lib/i18n/language.ts`
- Create: `lib/i18n/messages.ts`
- Test: `tests/i18n/language.test.ts`
- Test: `tests/i18n/messages.test.ts`

- [ ] **Step 1: Write failing language core tests**

Create `tests/i18n/language.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  inferLanguageFromBrowserHints,
  languageLabel,
  parseLanguage,
  SUPPORTED_LANGUAGES,
} from "@/lib/i18n/language";

describe("i18n language core", () => {
  it("accepts only supported display languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "ko"]);
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("ko")).toBe(true);
    expect(isLanguage("ko-KR")).toBe(false);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });

  it("parses unknown values as null", () => {
    expect(parseLanguage("en")).toBe("en");
    expect(parseLanguage("ko")).toBe("ko");
    expect(parseLanguage(" ko ")).toBeNull();
    expect(parseLanguage("")).toBeNull();
    expect(parseLanguage(undefined)).toBeNull();
  });

  it("infers Korean from browser or OS Korean hints", () => {
    expect(inferLanguageFromBrowserHints(["ko-KR", "en-US"])).toBe("ko");
    expect(inferLanguageFromBrowserHints(["KO", "en-US"])).toBe("ko");
    expect(inferLanguageFromBrowserHints(["en-US", "ko"])).toBe("ko");
  });

  it("falls back to English for non-Korean or missing hints", () => {
    expect(inferLanguageFromBrowserHints(["en-US"])).toBe("en");
    expect(inferLanguageFromBrowserHints(["ja-JP", "en-US"])).toBe("en");
    expect(inferLanguageFromBrowserHints([])).toBe("en");
    expect(inferLanguageFromBrowserHints(undefined)).toBe("en");
  });

  it("returns localized language labels", () => {
    expect(languageLabel("en", "en")).toBe("English");
    expect(languageLabel("ko", "en")).toBe("Korean");
    expect(languageLabel("en", "ko")).toBe("영어");
    expect(languageLabel("ko", "ko")).toBe("한국어");
  });
});
```

- [ ] **Step 2: Write failing catalog tests**

Create `tests/i18n/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMessage, messages } from "@/lib/i18n/messages";

describe("i18n message catalog", () => {
  it("has matching English and Korean keys", () => {
    expect(Object.keys(messages.ko).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it("returns localized strings by key", () => {
    expect(getMessage("en", "settings.title")).toBe("Settings");
    expect(getMessage("ko", "settings.title")).toBe("설정");
  });

  it("supports parameter interpolation", () => {
    expect(getMessage("en", "settings.language.pending", { language: "Korean" })).toBe(
      "Korean will apply after you save.",
    );
    expect(getMessage("ko", "settings.language.pending", { language: "영어" })).toBe(
      "저장하면 영어로 적용됩니다.",
    );
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/i18n/language.test.ts tests/i18n/messages.test.ts
```

Expected: FAIL because `@/lib/i18n/language` and `@/lib/i18n/messages` do not exist.

- [ ] **Step 4: Implement the shared language core**

Create `lib/i18n/language.ts`:

```ts
export const SUPPORTED_LANGUAGES = ["en", "ko"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = "en";

export type LanguageOption = {
  value: Language;
  nativeName: string;
  labels: Record<Language, string>;
};

export const LANGUAGE_OPTIONS = [
  {
    value: "en",
    nativeName: "English",
    labels: {
      en: "English",
      ko: "영어",
    },
  },
  {
    value: "ko",
    nativeName: "한국어",
    labels: {
      en: "Korean",
      ko: "한국어",
    },
  },
] as const satisfies readonly LanguageOption[];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as Language);
}

export function parseLanguage(value: unknown): Language | null {
  return isLanguage(value) ? value : null;
}

export function inferLanguageFromBrowserHints(hints: readonly string[] | undefined): Language {
  if (!hints || hints.length === 0) return DEFAULT_LANGUAGE;
  return hints.some((hint) => isKoreanLanguageHint(hint)) ? "ko" : DEFAULT_LANGUAGE;
}

export function languageLabel(language: Language, displayLanguage: Language) {
  return (
    LANGUAGE_OPTIONS.find((option) => option.value === language)?.labels[displayLanguage] ??
    language
  );
}

function isKoreanLanguageHint(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "ko" || normalized.startsWith("ko-");
}
```

- [ ] **Step 5: Implement the typed catalog**

Create `lib/i18n/messages.ts` with the first catalog keys. Later tasks will add keys to this same object instead of creating ad hoc local objects.

```ts
import type { Language } from "@/lib/i18n/language";

export const messages = {
  en: {
    "app.openSidebar": "Open sidebar",
    "app.openMetadataPanel": "Open metadata panel",
    "settings.title": "Settings",
    "settings.close": "Close settings",
    "settings.menu": "Settings menu",
    "settings.import.nav": "Import",
    "settings.ai.nav": "AI",
    "settings.retention.nav": "Retention",
    "settings.language.nav": "Language",
    "settings.language.title": "Language",
    "settings.language.eyebrow": "Workspace",
    "settings.language.description": "Choose the product display language for this browser.",
    "settings.language.currentBadge": "Current",
    "settings.language.currentStatus": "Current language: {language}",
    "settings.language.pending": "{language} will apply after you save.",
    "settings.language.save": "Save",
    "settings.language.cancel": "Cancel",
    "settings.language.saved": "Saved language: {language}",
    "settings.language.storageFailed": "Language changed for this session, but could not be saved in this browser.",
  },
  ko: {
    "app.openSidebar": "사이드바 열기",
    "app.openMetadataPanel": "메타데이터 패널 열기",
    "settings.title": "설정",
    "settings.close": "설정 닫기",
    "settings.menu": "설정 메뉴",
    "settings.import.nav": "가져오기",
    "settings.ai.nav": "AI",
    "settings.retention.nav": "보존",
    "settings.language.nav": "언어",
    "settings.language.title": "언어",
    "settings.language.eyebrow": "Workspace",
    "settings.language.description": "이 브라우저에서 사용할 제품 표시 언어를 선택합니다.",
    "settings.language.currentBadge": "현재 적용 중",
    "settings.language.currentStatus": "현재 언어: {language}",
    "settings.language.pending": "저장하면 {language}로 적용됩니다.",
    "settings.language.save": "저장",
    "settings.language.cancel": "취소",
    "settings.language.saved": "저장된 언어: {language}",
    "settings.language.storageFailed": "이번 세션에는 언어가 변경되었지만, 이 브라우저에 저장하지 못했습니다.",
  },
} as const;

export type MessageKey = keyof typeof messages.en;

type MessageParams = Record<string, string | number>;

export function getMessage(
  language: Language,
  key: MessageKey,
  params: MessageParams = {},
) {
  const template = messages[language][key] ?? messages.en[key];
  return interpolateMessage(template, params);
}

export function interpolateMessage(template: string, params: MessageParams) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
```

- [ ] **Step 6: Run tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/i18n/language.test.ts tests/i18n/messages.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/i18n/language.ts lib/i18n/messages.ts tests/i18n/language.test.ts tests/i18n/messages.test.ts
git commit -m "feat: add product language catalog"
```

---

### Task 2: Browser Storage And React Provider

**Files:**
- Create: `lib/i18n/storage.ts`
- Create: `components/i18n-provider.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/i18n/storage.test.ts`
- Test: `tests/components/i18n-provider.test.tsx`

- [ ] **Step 1: Write failing storage tests**

Create `tests/i18n/storage.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  subscribeToStoredLanguageChanges,
  writeStoredLanguage,
} from "@/lib/i18n/storage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("language storage", () => {
  it("reads and writes a valid browser-global language", () => {
    expect(readStoredLanguage()).toBeNull();
    expect(writeStoredLanguage("ko")).toEqual({ language: "ko", stored: true });
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe("ko");
    expect(readStoredLanguage()).toBe("ko");
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "fr");
    expect(readStoredLanguage()).toBeNull();
  });

  it("reports storage write failure without throwing", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(writeStoredLanguage("ko")).toEqual({ language: "ko", stored: false });
  });

  it("notifies same-tab subscribers on write", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToStoredLanguageChanges(listener);

    writeStoredLanguage("ko");

    expect(listener).toHaveBeenCalledWith({ language: "ko" });
    unsubscribe();
  });
});
```

- [ ] **Step 2: Write failing provider tests**

Create `tests/components/i18n-provider.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { APP_LANGUAGE_STORAGE_KEY } from "@/lib/i18n/storage";

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    value: ["ko-KR", "en-US"],
  });
});

afterEach(() => {
  cleanup();
});

function Probe() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div>
      <p>{language}</p>
      <p>{t("settings.title")}</p>
      <button type="button" onClick={() => setLanguage("en")}>
        Set English
      </button>
    </div>
  );
}

describe("I18nProvider", () => {
  it("infers Korean from browser hints when no language is stored", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("ko")).toBeTruthy();
    expect(screen.getByText("설정")).toBeTruthy();
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.lang).toBe("ko");
  });

  it("uses the stored language before browser hints", () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, "en");

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("en")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("updates language and stores explicit user selection", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set English" }));

    expect(screen.getByText("en")).toBeTruthy();
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/i18n/storage.test.ts tests/components/i18n-provider.test.tsx
```

Expected: FAIL because storage and provider modules do not exist.

- [ ] **Step 4: Implement browser storage**

Create `lib/i18n/storage.ts`:

```ts
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
```

- [ ] **Step 5: Implement provider and hook**

Create `components/i18n-provider.tsx`:

```tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  setLanguage: (language: Language) => StoredLanguageWriteResult;
  t: (key: MessageKey, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    setLanguageState(getInitialBrowserLanguage());
    return subscribeToStoredLanguageChanges((change) => {
      setLanguageState(change.language);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage: (nextLanguage) => {
        const result = writeStoredLanguage(nextLanguage);
        setLanguageState(nextLanguage);
        return result;
      },
      t: (key, params) => getMessage(language, key, params),
    }),
    [language],
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
```

- [ ] **Step 6: Mount provider in the app layout**

Modify `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { I18nProvider } from "@/components/i18n-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Munjib",
  description: "Markdown-first enterprise wiki foundation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <I18nProvider>
          {children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
pnpm exec vitest run tests/i18n/language.test.ts tests/i18n/messages.test.ts tests/i18n/storage.test.ts tests/components/i18n-provider.test.tsx
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/layout.tsx components/i18n-provider.tsx lib/i18n/storage.ts tests/i18n/storage.test.ts tests/components/i18n-provider.test.tsx
git commit -m "feat: add browser language provider"
```

---

### Task 3: Settings Language Section With Save, Cancel, And Current Highlight

**Files:**
- Modify: `lib/i18n/messages.ts`
- Modify: `components/workspace-settings-panel.tsx`
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Add failing Settings Language tests**

Append these tests to `tests/components/document-list.test.tsx`. Import `I18nProvider` if the file does not already use it, then wrap `renderList()` in the provider.

```tsx
import { I18nProvider } from "@/components/i18n-provider";
```

Change `renderList`:

```tsx
function renderList(props: Partial<Parameters<typeof DocumentList>[0]> = {}) {
  return render(
    <I18nProvider>
      <DocumentList {...baseProps} {...props} />
    </I18nProvider>,
  );
}
```

Add tests:

```tsx
it("opens the Language settings tab and highlights the current language", () => {
  window.localStorage.setItem("munjib:language", "en");
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Language" }));

  expect(screen.getByRole("heading", { name: "Language" })).toBeTruthy();
  expect(screen.getByText("Current language: English")).toBeTruthy();
  expect(within(screen.getByRole("radio", { name: /English/ })).getByText("Current")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
});

it("keeps the current language highlighted until Save", () => {
  window.localStorage.setItem("munjib:language", "en");
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(screen.getByRole("radio", { name: /Korean/ }));

  expect(screen.getByText("Korean will apply after you save.")).toBeTruthy();
  expect(within(screen.getByRole("radio", { name: /English/ })).getByText("Current")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(screen.getByRole("heading", { name: "언어" })).toBeTruthy();
  expect(screen.getByText("현재 언어: 한국어")).toBeTruthy();
  expect(window.localStorage.getItem("munjib:language")).toBe("ko");
});

it("discards a draft language on Cancel", () => {
  window.localStorage.setItem("munjib:language", "en");
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(screen.getByRole("radio", { name: /Korean/ }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.getByText("Current language: English")).toBeTruthy();
  expect(screen.queryByText("Korean will apply after you save.")).toBeNull();
  expect(window.localStorage.getItem("munjib:language")).toBe("en");
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx -t "Language settings"
```

Expected: FAIL because the Language tab and translated Settings section do not exist.

- [ ] **Step 3: Add Settings and Language catalog keys**

Extend `lib/i18n/messages.ts` with keys for existing Settings text. Keep every key present in both languages.

```ts
"settings.import.title": "Import your contents",
"settings.import.description": "Markdown files become documents.",
"settings.import.fileInput": "Markdown files",
"settings.import.fileTypes": ".md or .markdown",
"settings.import.selectedFiles": "{count} file(s) selected",
"settings.import.destination": "Import destination: {path}",
"settings.import.destinationFolders": "Import destination folders",
"settings.import.submit": "Import Markdown",
"settings.ai.title": "AI model",
"settings.ai.description": "Credentials stay on the server.",
"settings.ai.browserOverride": "Browser override",
"settings.ai.serverDefault": "Server default",
"settings.ai.provider": "Provider",
"settings.ai.presets": "Presets",
"settings.ai.customModelId": "Custom model id",
"settings.ai.saveCustomModel": "Save custom model",
"settings.ai.customModels": "Custom models",
"settings.ai.resetModel": "Reset model",
"settings.ai.invalidModel": "Enter a valid model id.",
"settings.ai.incompatibleProvider": "OpenRouter model ids require the server chat provider to be OpenAI-compatible.",
"settings.ai.savedModel": "Saved model: {model}",
"settings.ai.modelSaveFailed": "Model setting could not be saved.",
"settings.ai.serverDefaultStatus": "Using server default: {model}",
"settings.ai.modelResetFailed": "Model setting could not be reset.",
"settings.retention.title": "Document retention",
"settings.retention.description": "Permanently delete documents after they have been in trash.",
"settings.retention.deletedDocumentRetention": "Deleted document retention",
"settings.retention.save": "Save retention",
"settings.retention.invalid": "Choose a valid retention period.",
"settings.retention.saved": "Saved retention: {policy}",
"settings.import.progress.region": "Markdown import progress",
"settings.import.progress.eyebrow": "Markdown Import",
"settings.import.progress.title": "Importing files",
"settings.import.progress.destination": "Destination: {path}",
"settings.import.progress.close": "Close import progress",
"settings.import.progress.current": "Current: {fileName}",
"settings.import.progress.fileName": "File name",
"settings.import.progress.size": "Size",
"settings.import.progress.status": "Status",
"settings.import.progress.importing": "Importing {current} / {total}",
"settings.import.progress.imported": "Imported {count} Markdown file(s).",
"settings.import.progress.failed": "Import failed for {count} file(s).",
"settings.import.progress.partial": "Imported {imported} file(s). {failed} file(s) failed.",
```

Korean values:

```ts
"settings.import.title": "콘텐츠 가져오기",
"settings.import.description": "Markdown 파일을 문서로 가져옵니다.",
"settings.import.fileInput": "Markdown 파일",
"settings.import.fileTypes": ".md 또는 .markdown",
"settings.import.selectedFiles": "{count}개 파일 선택됨",
"settings.import.destination": "가져올 위치: {path}",
"settings.import.destinationFolders": "가져올 폴더",
"settings.import.submit": "Markdown 가져오기",
"settings.ai.title": "AI 모델",
"settings.ai.description": "인증 정보는 서버에만 보관됩니다.",
"settings.ai.browserOverride": "브라우저 override",
"settings.ai.serverDefault": "서버 기본값",
"settings.ai.provider": "Provider",
"settings.ai.presets": "프리셋",
"settings.ai.customModelId": "Custom model id",
"settings.ai.saveCustomModel": "Custom model 저장",
"settings.ai.customModels": "Custom 모델",
"settings.ai.resetModel": "모델 초기화",
"settings.ai.invalidModel": "올바른 model id를 입력하세요.",
"settings.ai.incompatibleProvider": "OpenRouter model id는 서버 chat provider가 OpenAI-compatible일 때만 사용할 수 있습니다.",
"settings.ai.savedModel": "저장된 모델: {model}",
"settings.ai.modelSaveFailed": "모델 설정을 저장하지 못했습니다.",
"settings.ai.serverDefaultStatus": "서버 기본값 사용 중: {model}",
"settings.ai.modelResetFailed": "모델 설정을 초기화하지 못했습니다.",
"settings.retention.title": "문서 보존",
"settings.retention.description": "휴지통으로 이동한 문서를 일정 기간 후 영구 삭제합니다.",
"settings.retention.deletedDocumentRetention": "삭제된 문서 보존 기간",
"settings.retention.save": "보존 설정 저장",
"settings.retention.invalid": "올바른 보존 기간을 선택하세요.",
"settings.retention.saved": "저장된 보존 기간: {policy}",
"settings.import.progress.region": "Markdown 가져오기 진행 상태",
"settings.import.progress.eyebrow": "Markdown 가져오기",
"settings.import.progress.title": "파일 가져오는 중",
"settings.import.progress.destination": "대상: {path}",
"settings.import.progress.close": "가져오기 진행 창 닫기",
"settings.import.progress.current": "현재 파일: {fileName}",
"settings.import.progress.fileName": "파일 이름",
"settings.import.progress.size": "크기",
"settings.import.progress.status": "상태",
"settings.import.progress.importing": "{current} / {total} 가져오는 중",
"settings.import.progress.imported": "Markdown 파일 {count}개를 가져왔습니다.",
"settings.import.progress.failed": "파일 {count}개 가져오기에 실패했습니다.",
"settings.import.progress.partial": "파일 {imported}개를 가져왔고 {failed}개는 실패했습니다.",
```

- [ ] **Step 4: Implement Settings Language UI**

In `components/workspace-settings-panel.tsx`:

1. Import `Languages`, `useEffect`, `LANGUAGE_OPTIONS`, `languageLabel`, and `useI18n`.
2. Extend `SettingsSection` to include `"language"`.
3. Replace hardcoded settings labels with `t(...)`.
4. Add draft language state and status:

```tsx
const { language, setLanguage, t } = useI18n();
const [draftLanguage, setDraftLanguage] = useState(language);
const [languageStatus, setLanguageStatus] = useState<string | null>(null);
const hasLanguageDraftChange = draftLanguage !== language;

useEffect(() => {
  setDraftLanguage(language);
  setLanguageStatus(null);
}, [language]);
```

5. Add handlers:

```tsx
const handleSaveLanguage = useCallback(() => {
  const result = setLanguage(draftLanguage);
  const label = languageLabel(draftLanguage, draftLanguage);
  setLanguageStatus(
    result.stored
      ? t("settings.language.saved", { language: label })
      : t("settings.language.storageFailed"),
  );
}, [draftLanguage, setLanguage, t]);

const handleCancelLanguage = useCallback(() => {
  setDraftLanguage(language);
  setLanguageStatus(null);
}, [language]);
```

6. Add the left nav button after Retention:

```tsx
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
```

7. Add the section render branch:

```tsx
) : activeSection === "language" ? (
  <section aria-label={t("settings.language.title")} className="flex min-h-full flex-col space-y-6">
    <div className="flex items-start gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{t("settings.language.eyebrow")}</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">{t("settings.language.title")}</h3>
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

    <div role="radiogroup" aria-label={t("settings.language.title")} className="grid gap-3 sm:grid-cols-2">
      {LANGUAGE_OPTIONS.map((option) => {
        const isApplied = option.value === language;
        const isSelected = option.value === draftLanguage;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => {
              setDraftLanguage(option.value);
              setLanguageStatus(null);
            }}
            className={[
              "min-h-24 rounded-md border px-4 py-3 text-left shadow-sm",
              isSelected ? "border-ink bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50",
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
            <span className="mt-2 block text-xs text-slate-500">{option.nativeName}</span>
          </button>
        );
      })}
    </div>

    <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
      <Button type="button" disabled={!hasLanguageDraftChange} onClick={handleSaveLanguage} className="h-10">
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
      <p role="status" className="text-sm font-medium text-slate-700">
        {languageStatus ??
          (hasLanguageDraftChange
            ? t("settings.language.pending", { language: languageLabel(draftLanguage, language) })
            : t("settings.language.currentStatus", { language: languageLabel(language, language) }))}
      </p>
    </div>
  </section>
) : (
```

- [ ] **Step 5: Run Settings tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS after updating existing English expectations to use the English catalog text where labels changed only cosmetically. Existing tests for Import/AI/Retention should still pass.

- [ ] **Step 6: Commit**

```bash
git add components/workspace-settings-panel.tsx lib/i18n/messages.ts tests/components/document-list.test.tsx
git commit -m "feat: add language settings section"
```

---

### Task 4: AI UI Messages And Prompt Language Plumbing

**Files:**
- Modify: `lib/i18n/messages.ts`
- Modify: `components/ai/thinking-indicator.tsx`
- Modify: `components/document-editor/ai-assistant-panel.tsx`
- Modify: `components/workspace-chatbot.tsx`
- Modify: `lib/rag/prompt.ts`
- Modify: `lib/rag/ask.ts`
- Modify: `lib/rag/workspace-chat.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- Modify: `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`
- Test: `tests/components/thinking-indicator.test.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`
- Test: `tests/components/workspace-chatbot.test.tsx`
- Test: `tests/rag/prompt.test.ts`
- Test: `tests/rag/ask-route.test.ts`
- Test: `tests/rag/workspace-chat-route.test.ts`

- [ ] **Step 1: Write failing ThinkingIndicator Korean test**

Modify `tests/components/thinking-indicator.test.tsx` to wrap rendered indicators with `I18nProvider`. Add:

```tsx
import { I18nProvider } from "@/components/i18n-provider";
```

Add this test:

```tsx
it("advances through Korean elapsed-time messages", () => {
  window.localStorage.setItem("munjib:language", "ko");

  render(
    <I18nProvider>
      <ThinkingIndicator active />
    </I18nProvider>,
  );

  expect(screen.getByText("생각 중...")).toBeTruthy();

  act(() => {
    vi.advanceTimersByTime(10_000);
  });
  expect(screen.getByText("관련 문서 맥락을 검토하고 있습니다...")).toBeTruthy();

  act(() => {
    vi.advanceTimersByTime(20_000);
  });
  expect(screen.getByText("근거를 정리하고 답변을 작성하고 있습니다...")).toBeTruthy();

  act(() => {
    vi.advanceTimersByTime(30_000);
  });
  expect(screen.getByText("평소보다 오래 걸리고 있습니다. 기다려 주셔서 감사합니다...")).toBeTruthy();
});
```

- [ ] **Step 2: Write failing prompt language tests**

Append to `tests/rag/prompt.test.ts`:

```ts
it("uses localized no-context fallback while preserving question-language-first instruction", () => {
  const prompt = buildRagPrompt({
    question: "What does the handbook say?",
    chunks: [],
    uiLanguage: "ko",
  });

  expect(prompt.user).toContain("저장된 문서 맥락을 찾지 못했습니다.");
  expect(prompt.system).toContain("Answer in the same language as the question where possible.");
  expect(prompt.system).toContain("The selected UI language is Korean");
});

it("uses localized current-document empty fallback", () => {
  const prompt = buildDirectDocumentPrompt({
    question: "What is saved?",
    uiLanguage: "ko",
    currentDocumentContext: {
      context: "",
      partial: false,
      sections: [],
    },
  });

  expect(prompt.user).toContain("현재 저장된 문서가 비어 있습니다.");
  expect(prompt.system).toContain("The selected UI language is Korean");
});
```

- [ ] **Step 3: Write failing route payload tests**

In `tests/rag/ask-route.test.ts`, add a request body expectation in the existing happy-path route test or add a new test that posts:

```ts
const response = await POST(
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify({
      question: "What is saved?",
      uiLanguage: "ko",
    }),
  }),
  { params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }) },
);
```

Expected service call contains:

```ts
expect(askDocumentQuestionMock).toHaveBeenCalledWith(
  expect.objectContaining({
    uiLanguage: "ko",
  }),
);
```

In `tests/rag/workspace-chat-route.test.ts`, add the same for `uiLanguage: "ko"` and expect `sendWorkspaceChatMessageMock` to receive `uiLanguage: "ko"`.

- [ ] **Step 4: Run focused tests and verify failures**

Run:

```bash
pnpm exec vitest run tests/components/thinking-indicator.test.tsx tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts
```

Expected: FAIL because thinking messages are not localized and prompt/route signatures do not accept `uiLanguage`.

- [ ] **Step 5: Add AI catalog keys**

Extend `lib/i18n/messages.ts`:

```ts
"ai.model": "Model",
"ai.questionLabel": "AI question",
"ai.askPlaceholder": "Ask about this document",
"ai.askSubmit": "Ask AI",
"ai.unsavedWarning": "Unsaved changes are not included in AI answers.",
"ai.answerFailed": "Could not get an AI answer.",
"ai.workspace.open": "Open workspace AI chat",
"ai.workspace.label": "Workspace AI chat",
"ai.workspace.title": "Workspace AI",
"ai.workspace.reset": "Reset conversation",
"ai.workspace.close": "Close workspace AI chat",
"ai.workspace.empty": "Ask across this workspace.",
"ai.workspace.placeholder": "Ask across this workspace",
"ai.workspace.messageLabel": "Workspace chat message",
"ai.workspace.send": "Send message",
"ai.workspace.unavailable": "Workspace AI is unavailable.",
"ai.thinking.0": "Thinking...",
"ai.thinking.10000": "Reviewing the relevant document context...",
"ai.thinking.30000": "Organizing the evidence and drafting an answer...",
"ai.thinking.60000": "This is taking longer than usual. Thanks for your patience...",
```

Korean values:

```ts
"ai.model": "모델",
"ai.questionLabel": "AI 질문",
"ai.askPlaceholder": "이 문서에 대해 질문하기",
"ai.askSubmit": "AI에게 묻기",
"ai.unsavedWarning": "저장되지 않은 변경사항은 AI 답변에 반영되지 않습니다.",
"ai.answerFailed": "AI 답변을 가져오지 못했습니다.",
"ai.workspace.open": "Workspace AI 채팅 열기",
"ai.workspace.label": "Workspace AI 채팅",
"ai.workspace.title": "Workspace AI",
"ai.workspace.reset": "대화 초기화",
"ai.workspace.close": "Workspace AI 채팅 닫기",
"ai.workspace.empty": "이 workspace 전체에 대해 질문해 보세요.",
"ai.workspace.placeholder": "이 workspace 전체에 대해 질문하기",
"ai.workspace.messageLabel": "Workspace 채팅 메시지",
"ai.workspace.send": "메시지 보내기",
"ai.workspace.unavailable": "Workspace AI를 사용할 수 없습니다.",
"ai.thinking.0": "생각 중...",
"ai.thinking.10000": "관련 문서 맥락을 검토하고 있습니다...",
"ai.thinking.30000": "근거를 정리하고 답변을 작성하고 있습니다...",
"ai.thinking.60000": "평소보다 오래 걸리고 있습니다. 기다려 주셔서 감사합니다...",
```

- [ ] **Step 6: Localize ThinkingIndicator**

Modify `components/ai/thinking-indicator.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n/messages";

const THINKING_MESSAGES = [
  { delayMs: 0, key: "ai.thinking.0" },
  { delayMs: 10_000, key: "ai.thinking.10000" },
  { delayMs: 30_000, key: "ai.thinking.30000" },
  { delayMs: 60_000, key: "ai.thinking.60000" },
] as const satisfies ReadonlyArray<{ delayMs: number; key: MessageKey }>;

type ThinkingIndicatorProps = {
  active: boolean;
  className?: string;
};

export function useThinkingIndicator(active: boolean) {
  const { t } = useI18n();
  const [messageKey, setMessageKey] = useState<MessageKey | null>(
    active ? THINKING_MESSAGES[0].key : null,
  );

  useEffect(() => {
    if (!active) {
      setMessageKey(null);
      return;
    }

    setMessageKey(THINKING_MESSAGES[0].key);
    const timers = THINKING_MESSAGES.slice(1).map(({ delayMs, key }) =>
      window.setTimeout(() => {
        setMessageKey(key);
      }, delayMs),
    );

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [active]);

  return active && messageKey ? t(messageKey) : null;
}

export function ThinkingIndicator({ active, className }: ThinkingIndicatorProps) {
  const message = useThinkingIndicator(active);

  if (!message) return null;

  return (
    <p aria-atomic="true" aria-live="polite" className={className} role="status">
      {message}
    </p>
  );
}
```

- [ ] **Step 7: Pass UI language from Ask AI and Workspace AI clients**

In `components/document-editor/ai-assistant-panel.tsx`, import `useI18n`, then:

```tsx
const { language, t } = useI18n();
```

Use localized strings:

```tsx
setError(t("ai.answerFailed"));
...
aria-label={t("ai.questionLabel")}
placeholder={t("ai.askPlaceholder")}
...
{t("ai.askSubmit")}
```

Add `uiLanguage` to request bodies:

```tsx
const requestBody = chatModelOverride
  ? {
      question: trimmedQuestion,
      chatProvider: chatModelOverride.chatProvider,
      chatModel: chatModelOverride.chatModel,
      uiLanguage: language,
    }
  : { question: trimmedQuestion, uiLanguage: language };
```

In `components/workspace-chatbot.tsx`, import `useI18n`, then:

```tsx
const { language, t } = useI18n();
```

Use localized text for labels/placeholders/errors and add `uiLanguage: language` to the message POST JSON body.

- [ ] **Step 8: Add prompt language support**

Modify `lib/rag/prompt.ts`:

```ts
import type { Language } from "@/lib/i18n/language";
```

Add optional field to both input types:

```ts
type BuildRagPromptInput = {
  question: string;
  chunks: PromptChunk[];
  uiLanguage?: Language;
};

type BuildDirectDocumentPromptInput = {
  question: string;
  currentDocumentContext: CurrentDocumentContext;
  uiLanguage?: Language;
};
```

Add helpers:

```ts
function uiLanguageName(language: Language | undefined) {
  return language === "ko" ? "Korean" : "English";
}

function noSavedContextMessage(language: Language | undefined) {
  return language === "ko"
    ? "저장된 문서 맥락을 찾지 못했습니다."
    : "No saved document context was retrieved.";
}

function emptyCurrentDocumentMessage(language: Language | undefined) {
  return language === "ko"
    ? "현재 저장된 문서가 비어 있습니다."
    : "The current saved document is empty.";
}

function uiLanguageInstruction(language: Language | undefined) {
  return `The selected UI language is ${uiLanguageName(language)}. Use it for fallback or status phrasing, but answer in the same language as the question where possible.`;
}
```

Use `noSavedContextMessage(input.uiLanguage)` and `emptyCurrentDocumentMessage(input.uiLanguage)`. Add `uiLanguageInstruction(input.uiLanguage)` to the system prompt arrays while retaining the existing `"Answer in the same language as the question where possible."` sentence.

- [ ] **Step 9: Validate route language values**

In both AI route files, import `parseLanguage`:

```ts
import { parseLanguage } from "@/lib/i18n/language";
```

Parse optional request body field:

```ts
const uiLanguage = parseLanguage(body.uiLanguage);
```

Pass `...(uiLanguage ? { uiLanguage } : {})` into the service call. Do not reject invalid language values.

Update service input types in `lib/rag/ask.ts` and `lib/rag/workspace-chat.ts`:

```ts
uiLanguage?: Language;
```

Pass to prompt builders:

```ts
buildDirectDocumentPrompt({
  question: input.question,
  currentDocumentContext,
  uiLanguage: input.uiLanguage,
});
```

and:

```ts
buildRagPrompt({
  question: input.message,
  chunks: rerankedChunks,
  uiLanguage: input.uiLanguage,
});
```

- [ ] **Step 10: Run focused AI tests**

Run:

```bash
pnpm exec vitest run tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add components/ai/thinking-indicator.tsx components/document-editor/ai-assistant-panel.tsx components/workspace-chatbot.tsx lib/i18n/messages.ts lib/rag/prompt.ts lib/rag/ask.ts lib/rag/workspace-chat.ts app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts
git commit -m "feat: localize AI surfaces"
```

---

### Task 5: Login And Workspace Chrome Translation

**Files:**
- Modify: `lib/i18n/messages.ts`
- Modify: `app/login/login-form.tsx`
- Modify: `components/app-shell.tsx`
- Modify: `components/document-list.tsx`
- Modify: `components/document-create-controls.tsx`
- Modify: `components/document-navigation.tsx`
- Modify: `components/document-navigation/document-section.tsx`
- Modify: `components/document-navigation/document-row.tsx`
- Modify: `components/document-navigation/favorites-panel.tsx`
- Modify: `components/document-navigation/folder-row.tsx`
- Modify: `components/document-navigation/folder-trash.ts`
- Modify: `components/document-navigation/search-panel.tsx`
- Test: `tests/components/document-list.test.tsx`
- Test: `tests/e2e/login.spec.ts`

- [ ] **Step 1: Add failing representative chrome tests**

Add to `tests/components/document-list.test.tsx`:

```tsx
it("renders workspace chrome in Korean when Korean is selected", () => {
  window.localStorage.setItem("munjib:language", "ko");
  renderList();

  expect(screen.getByRole("button", { name: "Workspace 메뉴" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "문서" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "그래프" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "새 문서" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "새 폴더" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "검색" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "즐겨찾기" })).toBeTruthy();
  expect(screen.getByText("최근 문서")).toBeTruthy();
});
```

- [ ] **Step 2: Run representative test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx -t "workspace chrome in Korean"
```

Expected: FAIL with English labels still rendered.

- [ ] **Step 3: Add login and navigation catalog keys**

Add keys for:

```ts
"login.title": "Development login",
"login.description": "Choose a seeded development user or sign in with an email address.",
"login.email": "Email",
"login.signingIn": "Signing in...",
"login.signIn": "Sign in",
"login.clearSession": "Clear local session",
"login.noMatchingUser": "No matching development user was found. Run pnpm run db:seed and try one of the listed accounts.",
"login.failed": "Sign in failed. Clear the local session and try again.",
"workspace.menu": "Workspace menu",
"workspace.settings": "Settings",
"workspace.closeSidebar": "Close sidebar",
"workspace.openSidebar": "Open sidebar",
"workspace.openMetadataPanel": "Open metadata panel",
"nav.documents": "Documents",
"nav.graph": "Graph",
"nav.newDocument": "New document",
"nav.newFolder": "New folder",
"nav.search": "Search",
"nav.favorites": "Favorites",
"nav.recents": "Recents",
"nav.allDocuments": "All documents",
"nav.searchPlaceholder": "Search documents",
"nav.noSearchResults": "No matching documents.",
"nav.noFavorites": "No favorites yet.",
"nav.noDocuments": "No documents yet.",
"nav.addDocument": "Add document",
"nav.addFolder": "Add folder",
"nav.rename": "Rename",
"nav.moveToTrash": "Move to trash",
"nav.openInNewTab": "Open in new tab",
"nav.addToFavorites": "Add to favorites",
"nav.removeFromFavorites": "Remove from favorites",
"nav.trashConfirmTitle": "Move folder to trash?",
"nav.trashConfirmBody": "This will move {folders} folder(s) and {documents} document(s) to trash.",
"nav.trashConfirmCancel": "Cancel",
"nav.trashConfirmSubmit": "Move to trash",
"nav.folderCreateFailed": "Could not create the item. Try again.",
```

Add Korean equivalents:

```ts
"login.title": "개발용 로그인",
"login.description": "Seed된 개발 사용자를 선택하거나 이메일로 로그인하세요.",
"login.email": "이메일",
"login.signingIn": "로그인 중...",
"login.signIn": "로그인",
"login.clearSession": "로컬 세션 지우기",
"login.noMatchingUser": "일치하는 개발 사용자를 찾지 못했습니다. pnpm run db:seed 실행 후 목록의 계정으로 다시 시도하세요.",
"login.failed": "로그인에 실패했습니다. 로컬 세션을 지우고 다시 시도하세요.",
"workspace.menu": "Workspace 메뉴",
"workspace.settings": "설정",
"workspace.closeSidebar": "사이드바 닫기",
"workspace.openSidebar": "사이드바 열기",
"workspace.openMetadataPanel": "메타데이터 패널 열기",
"nav.documents": "문서",
"nav.graph": "그래프",
"nav.newDocument": "새 문서",
"nav.newFolder": "새 폴더",
"nav.search": "검색",
"nav.favorites": "즐겨찾기",
"nav.recents": "최근 문서",
"nav.allDocuments": "전체 문서",
"nav.searchPlaceholder": "문서 검색",
"nav.noSearchResults": "일치하는 문서가 없습니다.",
"nav.noFavorites": "아직 즐겨찾기가 없습니다.",
"nav.noDocuments": "아직 문서가 없습니다.",
"nav.addDocument": "문서 추가",
"nav.addFolder": "폴더 추가",
"nav.rename": "이름 변경",
"nav.moveToTrash": "휴지통으로 이동",
"nav.openInNewTab": "새 탭에서 열기",
"nav.addToFavorites": "즐겨찾기에 추가",
"nav.removeFromFavorites": "즐겨찾기에서 제거",
"nav.trashConfirmTitle": "폴더를 휴지통으로 이동할까요?",
"nav.trashConfirmBody": "폴더 {folders}개와 문서 {documents}개를 휴지통으로 이동합니다.",
"nav.trashConfirmCancel": "취소",
"nav.trashConfirmSubmit": "휴지통으로 이동",
"nav.folderCreateFailed": "항목을 만들지 못했습니다. 다시 시도하세요.",
```

- [ ] **Step 4: Replace chrome strings with `useI18n()`**

For each listed component, import `useI18n` and replace user-facing text with `t(...)`.

Example for `components/document-create-controls.tsx`:

```tsx
const { t } = useI18n();
...
<ToolbarTooltip label={t("nav.documents")}>
  <Button aria-label={t("nav.documents")} ...>
...
<ToolbarTooltip label={t("nav.newDocument")}>
  <Button aria-label={t("nav.newDocument")} ...>
```

Example for `components/app-shell.tsx`:

```tsx
const { t } = useI18n();
...
aria-label={t("workspace.openSidebar")}
...
<TooltipContent side="bottom">{t("workspace.openSidebar")}</TooltipContent>
...
aria-label={t("workspace.openMetadataPanel")}
```

Example for `app/login/login-form.tsx`:

```tsx
const { t } = useI18n();
...
setError(
  result?.error === "CredentialsSignin"
    ? t("login.noMatchingUser")
    : t("login.failed"),
);
...
<h1>{t("login.title")}</h1>
```

- [ ] **Step 5: Run focused chrome tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
pnpm exec playwright test tests/e2e/login.spec.ts
```

Expected: PASS. If Playwright needs a running app and fails because the server is not running, defer it to final verification and record the blocker.

- [ ] **Step 6: Commit**

```bash
git add app/login/login-form.tsx components/app-shell.tsx components/document-list.tsx components/document-create-controls.tsx components/document-navigation.tsx components/document-navigation/document-section.tsx components/document-navigation/document-row.tsx components/document-navigation/favorites-panel.tsx components/document-navigation/folder-row.tsx components/document-navigation/folder-trash.tsx components/document-navigation/search-panel.tsx lib/i18n/messages.ts tests/components/document-list.test.tsx tests/e2e/login.spec.ts
git commit -m "feat: localize workspace chrome"
```

---

### Task 6: Center Shell, Editor, Metadata, And Graph Translation

**Files:**
- Modify: `lib/i18n/messages.ts`
- Modify: `components/document-tabs.tsx`
- Modify: `components/document-toolbar.tsx`
- Modify: `components/workspace-center-shell.tsx`
- Modify: `components/folder-detail.tsx`
- Modify: `components/document-editor.tsx`
- Modify: `components/document-editor/document-properties.tsx`
- Modify: `components/document-editor/wiki-link-suggestions.tsx`
- Modify: `components/metadata-panel.tsx`
- Modify: `components/knowledge-graph-view.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`
- Test: `tests/components/metadata-panel.test.tsx`
- Test: `tests/components/knowledge-graph-view.test.tsx`
- Test: `tests/components/workspace-center-shell.test.tsx`

- [ ] **Step 1: Add representative failing surface tests**

Add one Korean test per major surface:

`tests/components/workspace-center-shell.test.tsx`:

```tsx
it("renders graph path label in Korean", () => {
  window.localStorage.setItem("munjib:language", "ko");
  renderShell({ isGraphView: true });

  expect(screen.getByText("그래프 보기")).toBeTruthy();
});
```

`tests/components/metadata-panel.test.tsx`:

```tsx
it("renders metadata panel tabs in Korean", () => {
  window.localStorage.setItem("munjib:language", "ko");
  renderPanel();

  expect(screen.getByRole("tab", { name: "개요" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "첨부" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "버전" })).toBeTruthy();
});
```

`tests/components/knowledge-graph-view.test.tsx`:

```tsx
it("renders graph controls in Korean", () => {
  window.localStorage.setItem("munjib:language", "ko");
  renderGraph();

  expect(screen.getByRole("button", { name: "그래프 설정" })).toBeTruthy();
  expect(screen.getByText("필터")).toBeTruthy();
});
```

Use each test file's existing render helper. Wrap with `I18nProvider` when not already wrapped.

- [ ] **Step 2: Run surface tests and verify failures**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/metadata-panel.test.tsx tests/components/knowledge-graph-view.test.tsx
```

Expected: FAIL because the surfaces still render English.

- [ ] **Step 3: Add catalog keys for center/editor/metadata/graph**

Add keys for:

```ts
"tabs.newTab": "New tab",
"toolbar.back": "Navigate back",
"toolbar.forward": "Navigate forward",
"toolbar.edit": "Edit",
"toolbar.preview": "Preview",
"center.graphView": "Graph view",
"folder.emptyTitle": "No document selected",
"folder.emptyBody": "Select a document or create one to start writing.",
"editor.titlePlaceholder": "Untitled",
"editor.save": "Save",
"editor.saving": "Saving...",
"editor.saved": "Saved",
"editor.edit": "Edit",
"editor.preview": "Preview",
"editor.attachments": "Attachments",
"editor.comments": "Comments",
"editor.properties": "Properties",
"editor.links": "Links",
"editor.tags": "Tags",
"editor.backlinks": "Backlinks",
"editor.brokenLinks": "Broken links",
"metadata.outline": "Outline",
"metadata.attachments": "Attachments",
"metadata.versions": "Versions",
"metadata.auditLog": "Audit log",
"metadata.close": "Close metadata panel",
"metadata.noOutline": "No headings in this document.",
"metadata.noAttachments": "No attachments yet.",
"metadata.noVersions": "No versions yet.",
"metadata.noAuditLog": "No audit entries yet.",
"graph.settings": "Graph settings",
"graph.closeSettings": "Close graph settings",
"graph.filters": "Filters",
"graph.display": "Display",
"graph.forces": "Forces",
"graph.tags": "Tags",
"graph.orphans": "Orphans",
"graph.arrows": "Arrows",
"graph.labels": "Labels",
```

Add Korean equivalents:

```ts
"tabs.newTab": "새 탭",
"toolbar.back": "뒤로 이동",
"toolbar.forward": "앞으로 이동",
"toolbar.edit": "편집",
"toolbar.preview": "미리보기",
"center.graphView": "그래프 보기",
"folder.emptyTitle": "선택된 문서 없음",
"folder.emptyBody": "문서를 선택하거나 새로 만들어 작성을 시작하세요.",
"editor.titlePlaceholder": "제목 없음",
"editor.save": "저장",
"editor.saving": "저장 중...",
"editor.saved": "저장됨",
"editor.edit": "편집",
"editor.preview": "미리보기",
"editor.attachments": "첨부",
"editor.comments": "댓글",
"editor.properties": "속성",
"editor.links": "링크",
"editor.tags": "태그",
"editor.backlinks": "백링크",
"editor.brokenLinks": "깨진 링크",
"metadata.outline": "개요",
"metadata.attachments": "첨부",
"metadata.versions": "버전",
"metadata.auditLog": "감사 로그",
"metadata.close": "메타데이터 패널 닫기",
"metadata.noOutline": "이 문서에는 제목이 없습니다.",
"metadata.noAttachments": "아직 첨부가 없습니다.",
"metadata.noVersions": "아직 버전이 없습니다.",
"metadata.noAuditLog": "아직 감사 로그가 없습니다.",
"graph.settings": "그래프 설정",
"graph.closeSettings": "그래프 설정 닫기",
"graph.filters": "필터",
"graph.display": "표시",
"graph.forces": "힘",
"graph.tags": "태그",
"graph.orphans": "고립 문서",
"graph.arrows": "화살표",
"graph.labels": "라벨",
```

- [ ] **Step 4: Replace strings in center/editor/metadata/graph files**

Use `const { t } = useI18n();` in client components. Keep user-authored document titles, paths, tags, folder names, and markdown content unchanged.

Example for `components/document-toolbar.tsx`:

```tsx
const { t } = useI18n();
const modeLabel = mode === "preview" ? t("toolbar.edit") : t("toolbar.preview");
...
aria-label={t("toolbar.back")}
...
aria-label={t("toolbar.forward")}
```

Example for `components/workspace-center-shell.tsx`:

```tsx
const { t } = useI18n();
...
path={isGraphView ? t("center.graphView") : selectedDocument?.path ?? selectedFolder?.path ?? "/"}
```

Example for `components/knowledge-graph-view.tsx`:

```tsx
aria-label={t("graph.settings")}
...
<h2>{t("graph.settings")}</h2>
...
{t("graph.filters")}
```

- [ ] **Step 5: Run focused surface tests**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-editor-preview.test.tsx tests/components/metadata-panel.test.tsx tests/components/knowledge-graph-view.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/document-tabs.tsx components/document-toolbar.tsx components/workspace-center-shell.tsx components/folder-detail.tsx components/document-editor.tsx components/document-editor/document-properties.tsx components/document-editor/wiki-link-suggestions.tsx components/metadata-panel.tsx components/knowledge-graph-view.tsx lib/i18n/messages.ts tests/components/workspace-center-shell.test.tsx tests/components/document-editor-preview.test.tsx tests/components/metadata-panel.test.tsx tests/components/knowledge-graph-view.test.tsx
git commit -m "feat: localize document workspace surfaces"
```

---

### Task 7: Full String Sweep, Typecheck, And Wiki Maintenance

**Files:**
- Modify as discovered: `components/**/*.tsx`, `app/**/*.tsx`, `lib/i18n/messages.ts`
- Modify: `wiki/Munjib.md`
- Modify: `wiki/Project PRD.md`
- Modify: `wiki/RAG Process Workflow.md`
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Search remaining obvious user-facing literals**

Run:

```bash
rg -n '("[^"]*[A-Za-z가-힣][^"]*"|>[A-Za-z가-힣][^<]*<)' app components lib \
  --glob '!lib/i18n/messages.ts' \
  --glob '!**/*.test.*'
```

Expected: output still contains internal strings and stable identifiers. Review each remaining hit. Translate ordinary user-facing UI strings; leave these categories unchanged:

- internal error codes like `"WORKSPACE_CHAT_FAILED"`
- provider/model ids and env var names
- test ids and storage keys
- user-authored content variables
- telemetry event names and Sentry fingerprints
- backend audit action names

- [ ] **Step 2: Add missing catalog keys**

For every ordinary user-facing string found in Step 1, add a key to both `messages.en` and `messages.ko`. Use this naming pattern:

```ts
"surface.section.specificLabel": "English text",
```

and:

```ts
"surface.section.specificLabel": "Korean text",
```

Do not add keys for strings that should remain stable identifiers.

- [ ] **Step 3: Update tests for changed accessible labels**

When a test queries a user-facing English label, keep it English if the test uses default language. Add a Korean companion assertion only for representative surfaces, not every button. Example:

```tsx
window.localStorage.setItem("munjib:language", "ko");
render(
  <I18nProvider>
    <ComponentUnderTest />
  </I18nProvider>,
);
expect(screen.getByRole("button", { name: "저장" })).toBeTruthy();
```

- [ ] **Step 4: Run focused and broad verification**

Run:

```bash
pnpm exec vitest run tests/i18n/language.test.ts tests/i18n/messages.test.ts tests/i18n/storage.test.ts tests/components/i18n-provider.test.tsx
pnpm exec vitest run tests/components/document-list.test.tsx tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/components/workspace-center-shell.test.tsx tests/components/metadata-panel.test.tsx tests/components/knowledge-graph-view.test.tsx
pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts
pnpm exec tsc --noEmit --pretty false
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Stage source changes and generate wiki sync plan**

Run:

```bash
git add app components lib tests
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
```

Expected: sync plan lists candidate wiki pages. At minimum review [[Munjib]], [[Project PRD]], [[RAG Process Workflow]], [[Document Editing Workflow]], and [[index|Wiki Index]].

- [ ] **Step 6: Update wiki durable knowledge**

Update:

- `wiki/Munjib.md`: move Issue #126 from planned design to implemented behavior after implementation is complete.
- `wiki/Project PRD.md`: record browser-global language setting, OS-language fallback, full user-facing UI translation, and AI question-language-first policy.
- `wiki/RAG Process Workflow.md`: record optional `uiLanguage` request field for fallback/default prompt wording and the unchanged question-language-first answer policy.
- `wiki/Document Editing Workflow.md`: mention editor/product chrome can display English/Korean and user-authored document content is not translated.
- `wiki/index.md`: keep the status board current.
- `wiki/log.md`: append an implementation entry with files, tests, and Issue #126.

Use concrete source evidence:

```md
- Source evidence: GitHub issue #126, `lib/i18n/language.ts`, `lib/i18n/messages.ts`, `lib/i18n/storage.ts`, `components/i18n-provider.tsx`, `components/workspace-settings-panel.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `components/workspace-chatbot.tsx`, `lib/rag/prompt.ts`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`, focused i18n/component/RAG tests.
```

- [ ] **Step 7: Run wiki verification**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
```

Expected: PASS. `pnpm wiki:lint` may print the existing unrelated `wiki/designs/sidebar.md` unresolved image warning; that warning is acceptable if the command exits 0.

- [ ] **Step 8: Commit implementation**

```bash
git add wiki/Munjib.md "wiki/Project PRD.md" "wiki/RAG Process Workflow.md" "wiki/Document Editing Workflow.md" wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "feat: add product language switching"
```

---

### Task 8: Final PR Workflow

**Files:**
- No source files unless review/CI feedback requires fixes.

- [ ] **Step 1: Run final local verification bundle**

Run:

```bash
pnpm exec vitest run tests/i18n/language.test.ts tests/i18n/messages.test.ts tests/i18n/storage.test.ts tests/components/i18n-provider.test.tsx
pnpm exec vitest run tests/components/document-list.test.tsx tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx tests/components/workspace-center-shell.test.tsx tests/components/metadata-panel.test.tsx tests/components/knowledge-graph-view.test.tsx
pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts
pnpm exec tsc --noEmit --pretty false
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --check
```

Expected: PASS except the known existing `wiki/designs/sidebar.md` unresolved image warning may appear during `wiki:lint` with exit 0.

- [ ] **Step 2: Push branch**

Run:

```bash
git push -u origin issue-126-product-language-internationalization-settings
```

Expected: branch pushed.

- [ ] **Step 3: Create PR**

Run:

```bash
gh pr create --draft --fill
```

Expected: draft PR created against `main`.

- [ ] **Step 4: Mark ready or request review**

Run:

```bash
gh pr ready
```

Expected: PR marked ready for review. If it is already ready, request review or leave a concise PR comment summarizing local verification.

- [ ] **Step 5: Wait and inspect review/CI**

Wait at least 5 minutes, then run:

```bash
gh pr checks --watch=false
gh pr view --json reviewDecision,reviews,comments,url
```

Expected: checks passing or actionable failure details visible. If CI or review feedback fails, fix on the same branch, rerun relevant verification, commit, push, and repeat this task.

---

## Self-Review Notes

- Spec coverage: The plan covers browser-global storage, OS-language fallback, Settings Language Save/Cancel/current highlight, full user-facing translation sweep, AI UI/default message localization, question-language-first AI answers, invalid value fallback, storage failure handling, tests, wiki maintenance, and PR workflow.
- Scope: The work is broad but still one coherent subsystem because all slices depend on the same i18n provider/catalog. The plan splits execution by stable boundaries so each task can be tested and committed independently.
- Stable identifiers: The plan explicitly leaves model ids, provider ids, storage keys, API constants, telemetry names, and user-authored content untranslated.
