# OpenRouter Chat Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser/workspace-scoped Ask AI chat model selection for OpenRouter-compatible testing while keeping secrets and embedding configuration server-owned.

**Architecture:** Add a small shared model-setting helper that validates chat model ids, owns workspace-scoped `localStorage`, and emits browser change events. Thread the server default chat model id from the workspace page into the settings and assistant components, then let the Ask AI route accept a validated optional `chatModel` request field that replaces only `modelConfig.chat.model` for answer generation. Because this repository's pre-commit hook requires source changes and wiki maintenance to be staged together, implementation tasks do not create intermediate commits; the final wiki task stages and commits the complete implementation.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Vitest, Testing Library, Prisma-backed RAG service, LangChain chat model factory, wiki maintenance CLI.

---

## Scope Check

This plan implements one cohesive subsystem: browser-local chat model selection for the existing Ask AI RAG path. It does not add database settings, provider switching, embedding switching, OpenRouter model catalog fetching, or reindexing.

## File Structure

- Create `lib/rag/client-model-settings.ts`: shared validation, static presets, browser storage helpers, and setting-change event helpers. This file must not use `"use client"` and must guard every `window` access so route/server code can import validation safely.
- Create `tests/rag/client-model-settings.test.ts`: jsdom unit tests for validation, workspace-scoped storage, corrupted storage cleanup, reset, and browser events.
- Modify `lib/rag/model-config.ts`: export a safe `getDefaultRagChatModel()` display helper that reads only the default chat model id and does not validate provider credentials.
- Modify `tests/rag/model-config.test.ts`: cover `getDefaultRagChatModel()`.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: read the default chat model id once on the server and pass it to `DocumentList` and `DocumentEditor`.
- Modify `components/document-list.tsx`: add a `defaultChatModel` prop and pass it into `WorkspaceSettingsPanel`.
- Modify `components/workspace-settings-panel.tsx`: add `Import`/`AI` tab state, render the AI model settings UI, and keep import behavior unchanged.
- Modify `components/document-editor/types.ts`: add `defaultChatModel`.
- Modify `components/document-editor.tsx`: pass `defaultChatModel` into `AiAssistantPanel`.
- Modify `components/document-editor/ai-assistant-panel.tsx`: read the stored override, subscribe to model setting events, display the effective model, and include `chatModel` in the Ask AI payload only when an override exists.
- Modify `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`: validate optional `chatModel`, pass it into the service, and return `INVALID_CHAT_MODEL` 400 for invalid override input.
- Modify `lib/rag/ask.ts`: accept `chatModelOverride`, replace only `chat.model` in the effective model config, and keep embedding/index behavior unchanged.
- Modify `tests/components/document-list.test.tsx`, `tests/components/document-editor-preview.test.tsx`, `tests/rag/ask-route.test.ts`, `tests/rag/ask.test.ts`, and `tests/rag/langfuse.test.ts` as described below.
- Modify `wiki/RAG Process Workflow.md`, `wiki/Local Development Workflow.md`, `wiki/index.md`, `wiki/log.md`, and `wiki/manifest.json` after implementation.

## Task 1: Shared Chat Model Setting Helper

**Files:**
- Create: `lib/rag/client-model-settings.ts`
- Create: `tests/rag/client-model-settings.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/rag/client-model-settings.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_MODEL_SETTING_EVENT,
  INVALID_CHAT_MODEL_ERROR,
  RAG_CHAT_MODEL_PRESETS,
  readStoredChatModel,
  resetStoredChatModel,
  subscribeToStoredChatModelChanges,
  validateChatModelId,
  writeStoredChatModel,
} from "@/lib/rag/client-model-settings";

describe("client RAG chat model settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defines static presets that are valid model ids", () => {
    expect(RAG_CHAT_MODEL_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const preset of RAG_CHAT_MODEL_PRESETS) {
      expect(validateChatModelId(preset.id)).toEqual({ ok: true, value: preset.id });
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it("validates and normalizes chat model ids", () => {
    expect(validateChatModelId(" openrouter/fusion ")).toEqual({
      ok: true,
      value: "openrouter/fusion",
    });
    expect(validateChatModelId("moonshotai/kimi-k2.7-code")).toEqual({
      ok: true,
      value: "moonshotai/kimi-k2.7-code",
    });
    expect(validateChatModelId("")).toEqual({ ok: false, error: INVALID_CHAT_MODEL_ERROR });
    expect(validateChatModelId("bad model")).toEqual({
      ok: false,
      error: INVALID_CHAT_MODEL_ERROR,
    });
    expect(validateChatModelId("-bad-prefix")).toEqual({
      ok: false,
      error: INVALID_CHAT_MODEL_ERROR,
    });
    expect(validateChatModelId("a".repeat(161))).toEqual({
      ok: false,
      error: INVALID_CHAT_MODEL_ERROR,
    });
  });

  it("stores model ids per workspace", () => {
    expect(writeStoredChatModel("company-handbook", "openrouter/fusion")).toEqual({
      ok: true,
      value: "openrouter/fusion",
    });
    expect(writeStoredChatModel("research", "qwen/qwen3.7-plus")).toEqual({
      ok: true,
      value: "qwen/qwen3.7-plus",
    });

    expect(readStoredChatModel("company-handbook")).toBe("openrouter/fusion");
    expect(readStoredChatModel("research")).toBe("qwen/qwen3.7-plus");
  });

  it("removes corrupted stored values", () => {
    window.localStorage.setItem("munjib:rag-chat-model:company-handbook", "bad model");

    expect(readStoredChatModel("company-handbook")).toBeNull();
    expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBeNull();
  });

  it("resets stored model ids", () => {
    writeStoredChatModel("company-handbook", "openrouter/fusion");

    resetStoredChatModel("company-handbook");

    expect(readStoredChatModel("company-handbook")).toBeNull();
  });

  it("emits a browser event when settings change", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToStoredChatModelChanges(handler);

    writeStoredChatModel("company-handbook", "openrouter/fusion");
    resetStoredChatModel("company-handbook");

    expect(handler).toHaveBeenNthCalledWith(1, {
      workspaceSlug: "company-handbook",
      chatModel: "openrouter/fusion",
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      workspaceSlug: "company-handbook",
      chatModel: null,
    });

    unsubscribe();
    window.dispatchEvent(new CustomEvent(CHAT_MODEL_SETTING_EVENT));

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/rag/client-model-settings.test.ts
```

Expected: FAIL because `@/lib/rag/client-model-settings` does not exist.

- [ ] **Step 3: Implement the helper**

Create `lib/rag/client-model-settings.ts`:

```ts
export const INVALID_CHAT_MODEL_ERROR = "INVALID_CHAT_MODEL";
export const CHAT_MODEL_SETTING_EVENT = "munjib:rag-chat-model-setting-changed";

export const RAG_CHAT_MODEL_PRESETS = [
  { id: "openrouter/fusion", label: "OpenRouter Fusion" },
  { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code" },
  { id: "qwen/qwen3.7-plus", label: "Qwen3.7 Plus" },
] as const;

export type ChatModelValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: typeof INVALID_CHAT_MODEL_ERROR };

export type ChatModelSettingChange = {
  workspaceSlug: string;
  chatModel: string | null;
};

const MAX_CHAT_MODEL_ID_LENGTH = 160;
const CHAT_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/._:-]*$/;

export function validateChatModelId(value: unknown): ChatModelValidationResult {
  if (typeof value !== "string") {
    return { ok: false, error: INVALID_CHAT_MODEL_ERROR };
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_CHAT_MODEL_ID_LENGTH ||
    !CHAT_MODEL_ID_PATTERN.test(trimmed)
  ) {
    return { ok: false, error: INVALID_CHAT_MODEL_ERROR };
  }

  return { ok: true, value: trimmed };
}

export function readStoredChatModel(workspaceSlug: string): string | null {
  if (!hasBrowserStorage()) return null;

  const key = chatModelStorageKey(workspaceSlug);
  const raw = window.localStorage.getItem(key);
  if (raw === null) return null;

  const validation = validateChatModelId(raw);
  if (!validation.ok) {
    window.localStorage.removeItem(key);
    return null;
  }

  return validation.value;
}

export function writeStoredChatModel(
  workspaceSlug: string,
  value: string,
): ChatModelValidationResult {
  const validation = validateChatModelId(value);
  if (!validation.ok) return validation;
  if (!hasBrowserStorage()) return validation;

  window.localStorage.setItem(chatModelStorageKey(workspaceSlug), validation.value);
  dispatchChatModelChange({ workspaceSlug, chatModel: validation.value });
  return validation;
}

export function resetStoredChatModel(workspaceSlug: string) {
  if (!hasBrowserStorage()) return;

  window.localStorage.removeItem(chatModelStorageKey(workspaceSlug));
  dispatchChatModelChange({ workspaceSlug, chatModel: null });
}

export function subscribeToStoredChatModelChanges(
  handler: (change: ChatModelSettingChange) => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  function listener(event: Event) {
    if (!(event instanceof CustomEvent)) return;
    const detail = event.detail as Partial<ChatModelSettingChange> | undefined;
    if (typeof detail?.workspaceSlug !== "string") return;
    if (typeof detail.chatModel !== "string" && detail.chatModel !== null) return;
    handler({ workspaceSlug: detail.workspaceSlug, chatModel: detail.chatModel });
  }

  window.addEventListener(CHAT_MODEL_SETTING_EVENT, listener);
  return () => window.removeEventListener(CHAT_MODEL_SETTING_EVENT, listener);
}

function chatModelStorageKey(workspaceSlug: string) {
  return `munjib:rag-chat-model:${workspaceSlug}`;
}

function dispatchChatModelChange(change: ChatModelSettingChange) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(CHAT_MODEL_SETTING_EVENT, {
      detail: change,
    }),
  );
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/rag/client-model-settings.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check helper slice status without committing**

Run:

```bash
git status --short
```

Expected: helper source and tests are modified or untracked. Do not commit yet; final wiki maintenance and commit happen in Task 6.

## Task 2: Thread Server Default Chat Model To Client Components

**Files:**
- Modify: `lib/rag/model-config.ts`
- Modify: `tests/rag/model-config.test.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `components/document-list.tsx`
- Modify: `components/workspace-settings-panel.tsx`
- Modify: `components/document-editor/types.ts`
- Modify: `components/document-editor.tsx`
- Test: `tests/components/document-list.test.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Add failing default model config tests**

In `tests/rag/model-config.test.ts`, add imports and tests near the existing RAG model configuration tests:

```ts
import { getDefaultRagChatModel } from "@/lib/rag/model-config";
```

Add this test block:

```ts
it("reads the default chat model for display without requiring provider credentials", () => {
  vi.stubEnv("MUNJIB_RAG_CHAT_PROVIDER", "openai-compatible");
  vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "openrouter/fusion");
  vi.stubEnv("MUNJIB_OPENAI_COMPATIBLE_BASE_URL", "");

  expect(getDefaultRagChatModel()).toBe("openrouter/fusion");
});

it("falls back to the Ollama default display model when no chat model env is set", () => {
  vi.stubEnv("MUNJIB_RAG_CHAT_MODEL", "");

  expect(getDefaultRagChatModel()).toBe("gemma4:e4b");
});
```

- [ ] **Step 2: Run model config tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/rag/model-config.test.ts
```

Expected: FAIL because `getDefaultRagChatModel` is not exported.

- [ ] **Step 3: Implement safe display model helper**

In `lib/rag/model-config.ts`, add this export after the `DEFAULTS` constant:

```ts
export function getDefaultRagChatModel(env: RagEnv = process.env): string {
  return readOptionalEnv(env, "MUNJIB_RAG_CHAT_MODEL") ?? DEFAULTS.chatModel;
}
```

- [ ] **Step 4: Run model config tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/rag/model-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add props and page plumbing**

In `app/workspaces/[workspaceSlug]/page.tsx`, add:

```ts
import { getDefaultRagChatModel } from "@/lib/rag/model-config";
```

Before the `return`, add:

```ts
  const defaultChatModel = getDefaultRagChatModel();
```

Pass `defaultChatModel={defaultChatModel}` to both `DocumentList` and `DocumentEditor`.

In `components/document-list.tsx`, add `defaultChatModel` to the props type and function destructuring:

```ts
  defaultChatModel: string;
```

Pass it to `WorkspaceSettingsPanel`:

```tsx
          defaultChatModel={defaultChatModel}
```

In `components/workspace-settings-panel.tsx`, add `defaultChatModel` to props:

```ts
  defaultChatModel: string;
```

In `components/document-editor/types.ts`, add:

```ts
  defaultChatModel: string;
```

In `components/document-editor.tsx`, pass the prop into `AiAssistantPanel`:

```tsx
          defaultChatModel={defaultChatModel}
```

In `tests/components/document-list.test.tsx`, add this field to `baseProps`:

```ts
  defaultChatModel: "gemma4:e4b",
```

In `tests/components/document-editor-preview.test.tsx`, add this prop to the editor base props used by `renderEditor`:

```ts
  defaultChatModel: "gemma4:e4b",
```

- [ ] **Step 6: Run TypeScript and affected component tests**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Check default model plumbing status without committing**

Run:

```bash
git status --short
```

Expected: Task 1 and Task 2 files are present in the working tree. Do not commit yet; final wiki maintenance and commit happen in Task 6.

## Task 3: Add AI Tab To Workspace Settings

**Files:**
- Modify: `components/workspace-settings-panel.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Add failing settings-panel tests**

In `tests/components/document-list.test.tsx`, add these tests near the existing workspace settings tests:

```ts
it("opens the AI settings tab and shows the server default model", () => {
  renderList({ defaultChatModel: "openrouter/fusion" });

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "AI" }));

  expect(screen.getByRole("button", { name: "AI" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("heading", { name: "AI model" })).toBeTruthy();
  expect(screen.getByText("Server default")).toBeTruthy();
  expect(screen.getByText("openrouter/fusion")).toBeTruthy();
  expect(screen.queryByLabelText(/api key/i)).toBeNull();
  expect(screen.queryByLabelText(/base url/i)).toBeNull();
});

it("saves a preset chat model override in workspace-scoped storage", () => {
  renderList({ defaultChatModel: "openrouter/fusion" });

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "AI" }));
  fireEvent.click(screen.getByRole("button", { name: "Use Kimi K2.7 Code" }));

  expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBe(
    "moonshotai/kimi-k2.7-code",
  );
  expect(screen.getByText("Saved model: moonshotai/kimi-k2.7-code")).toBeTruthy();
});

it("saves a custom chat model override and can reset to server default", () => {
  renderList({ defaultChatModel: "openrouter/fusion" });

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "AI" }));

  fireEvent.change(screen.getByLabelText("Custom model id"), {
    target: { value: "qwen/qwen3.7-plus" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save custom model" }));

  expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBe(
    "qwen/qwen3.7-plus",
  );

  fireEvent.click(screen.getByRole("button", { name: "Reset model" }));

  expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBeNull();
  expect(screen.getByText("Using server default: openrouter/fusion")).toBeTruthy();
});

it("rejects invalid custom chat model ids in settings", () => {
  renderList({ defaultChatModel: "openrouter/fusion" });

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "AI" }));
  fireEvent.change(screen.getByLabelText("Custom model id"), {
    target: { value: "bad model" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save custom model" }));

  expect(window.localStorage.getItem("munjib:rag-chat-model:company-handbook")).toBeNull();
  expect(screen.getByText("Enter a valid model id.")).toBeTruthy();
});
```

- [ ] **Step 2: Run settings tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: FAIL because the AI settings tab does not exist.

- [ ] **Step 3: Implement settings tab state and imports**

In `components/workspace-settings-panel.tsx`, update the icon import:

```ts
import { Bot, FileText, Upload, X } from "lucide-react";
```

Add helper imports:

```ts
import {
  RAG_CHAT_MODEL_PRESETS,
  readStoredChatModel,
  resetStoredChatModel,
  validateChatModelId,
  writeStoredChatModel,
} from "@/lib/rag/client-model-settings";
```

Add local state after the existing `useState` calls:

```ts
  const [activeSection, setActiveSection] = useState<"import" | "ai">("import");
  const [customModel, setCustomModel] = useState("");
  const [modelStatus, setModelStatus] = useState("");
  const storedChatModel = readStoredChatModel(workspaceSlug);
  const effectiveChatModel = storedChatModel ?? defaultChatModel;
```

Add `workspaceSlug` to `WorkspaceSettingsPanel` props:

```ts
  workspaceSlug: string;
```

Update `DocumentList` to pass:

```tsx
          workspaceSlug={workspaceSlug}
```

- [ ] **Step 4: Replace single Import nav button with two tab buttons**

Replace the current settings nav with:

```tsx
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
```

Add this helper near the bottom of the file:

```ts
function settingsNavButtonClassName(isActive: boolean) {
  return [
    "h-9 w-full justify-start gap-2 px-2 text-sm",
    isActive
      ? "bg-slate-200 text-ink"
      : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-ink",
  ].join(" ");
}
```

- [ ] **Step 5: Move current import content behind the Import tab**

Wrap the current import heading, progress panel, and import form in:

```tsx
          {activeSection === "import" ? (
            <>
              {/* existing import heading, progress panel, and form stay here */}
            </>
          ) : null}
```

Keep the close button shared at the top of the content area so the dialog close behavior does not change.

- [ ] **Step 6: Add AI settings panel content**

Below the Import tab content, add:

```tsx
          {activeSection === "ai" ? (
            <section aria-label="AI model settings" className="space-y-6">
              <div className="mb-8 flex items-start gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Workspace</p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">AI model</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Credentials stay on the server.
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">
                  {storedChatModel ? "Browser override" : "Server default"}
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-ink">
                  {effectiveChatModel}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">Presets</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {RAG_CHAT_MODEL_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      aria-label={`Use ${preset.label}`}
                      onClick={() => {
                        const result = writeStoredChatModel(workspaceSlug, preset.id);
                        setModelStatus(result.ok ? `Saved model: ${result.value}` : "Enter a valid model id.");
                      }}
                      className="h-auto min-h-10 justify-start whitespace-normal bg-white px-3 py-2 text-left text-sm text-ink hover:bg-slate-100"
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500" htmlFor="customChatModel">
                  Custom model id
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
                  <input
                    id="customChatModel"
                    aria-label="Custom model id"
                    value={customModel}
                    onChange={(event) => setCustomModel(event.target.value)}
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-ink"
                  />
                  <Button
                    type="button"
                    className="h-10"
                    onClick={() => {
                      const validation = validateChatModelId(customModel);
                      if (!validation.ok) {
                        setModelStatus("Enter a valid model id.");
                        return;
                      }
                      writeStoredChatModel(workspaceSlug, validation.value);
                      setCustomModel(validation.value);
                      setModelStatus(`Saved model: ${validation.value}`);
                    }}
                  >
                    Save custom model
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  className="h-9 bg-transparent px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-ink"
                  onClick={() => {
                    resetStoredChatModel(workspaceSlug);
                    setModelStatus(`Using server default: ${defaultChatModel}`);
                  }}
                >
                  Reset model
                </Button>
                {modelStatus ? (
                  <p role="status" className="text-sm text-slate-600">
                    {modelStatus}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
```

- [ ] **Step 7: Run settings tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Check settings UI status without committing**

Run:

```bash
git status --short
```

Expected: Task 1 through Task 3 files are present in the working tree. Do not commit yet; final wiki maintenance and commit happen in Task 6.

## Task 4: Apply Browser Override In The Ask AI Panel

**Files:**
- Modify: `components/document-editor/ai-assistant-panel.tsx`
- Modify: `components/document-editor.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Add failing assistant panel tests**

In `tests/components/document-editor-preview.test.tsx`, add these tests near the existing AI assistant tests:

```ts
it("shows the server default AI model when no browser override is stored", () => {
  renderEditor("# A\nBody", { defaultChatModel: "openrouter/fusion" });

  fireEvent.click(screen.getByRole("button", { name: "AI에게 묻기" }));

  expect(screen.getByText("Model")).toBeTruthy();
  expect(screen.getByText("openrouter/fusion")).toBeTruthy();
});

it("includes the browser chat model override in Ask AI requests", async () => {
  window.localStorage.setItem(
    "munjib:rag-chat-model:company-handbook",
    "moonshotai/kimi-k2.7-code",
  );
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ answer: "Cloud model answer", citations: [] }),
  }));
  vi.stubGlobal("fetch", fetchMock);

  renderEditor("# A\nBody", { defaultChatModel: "openrouter/fusion" });

  fireEvent.click(screen.getByRole("button", { name: "AI에게 묻기" }));
  expect(screen.getByText("moonshotai/kimi-k2.7-code")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("AI question"), {
    target: { value: "Which model answered?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

  await screen.findByText("Cloud model answer");

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/workspaces/company-handbook/documents/doc-1/ask",
    expect.objectContaining({
      body: JSON.stringify({
        question: "Which model answered?",
        chatModel: "moonshotai/kimi-k2.7-code",
      }),
    }),
  );
});

it("updates the displayed AI model when settings change in the same browser tab", () => {
  renderEditor("# A\nBody", { defaultChatModel: "openrouter/fusion" });

  fireEvent.click(screen.getByRole("button", { name: "AI에게 묻기" }));
  expect(screen.getByText("openrouter/fusion")).toBeTruthy();

  window.localStorage.setItem(
    "munjib:rag-chat-model:company-handbook",
    "qwen/qwen3.7-plus",
  );
  window.dispatchEvent(
    new CustomEvent("munjib:rag-chat-model-setting-changed", {
      detail: { workspaceSlug: "company-handbook", chatModel: "qwen/qwen3.7-plus" },
    }),
  );

  expect(screen.getByText("qwen/qwen3.7-plus")).toBeTruthy();
});
```

- [ ] **Step 2: Run assistant tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
```

Expected: FAIL because `AiAssistantPanel` does not read or display chat model settings.

- [ ] **Step 3: Update assistant panel props and imports**

In `components/document-editor/ai-assistant-panel.tsx`, add:

```ts
import { useEffect } from "react";
import {
  readStoredChatModel,
  subscribeToStoredChatModelChanges,
} from "@/lib/rag/client-model-settings";
```

Change the React import to include `useEffect` without duplicating imports:

```ts
import { FormEvent, useEffect, useState } from "react";
```

Add `defaultChatModel` to props:

```ts
  defaultChatModel: string;
```

In the component parameter list, include `defaultChatModel`.

- [ ] **Step 4: Read and subscribe to stored model settings**

Inside `AiAssistantPanel`, add state after `isLoading`:

```ts
  const [chatModelOverride, setChatModelOverride] = useState<string | null>(() =>
    readStoredChatModel(workspaceSlug),
  );
  const effectiveChatModel = chatModelOverride ?? defaultChatModel;
```

Add this effect:

```ts
  useEffect(() => {
    setChatModelOverride(readStoredChatModel(workspaceSlug));
    return subscribeToStoredChatModelChanges((change) => {
      if (change.workspaceSlug !== workspaceSlug) return;
      setChatModelOverride(change.chatModel);
    });
  }, [workspaceSlug]);
```

- [ ] **Step 5: Include override in the request payload**

Replace the fetch `body` construction with:

```ts
      const requestBody = chatModelOverride
        ? { question: trimmedQuestion, chatModel: chatModelOverride }
        : { question: trimmedQuestion };
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/documents/${documentId}/ask`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
```

- [ ] **Step 6: Display the effective model**

Add this block above the `<form>`:

```tsx
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>Model</span>
        <span className="min-w-0 truncate font-medium text-slate-700" title={effectiveChatModel}>
          {effectiveChatModel}
        </span>
      </div>
```

- [ ] **Step 7: Pass defaultChatModel from DocumentEditor**

In `components/document-editor.tsx`, ensure the `AiAssistantPanel` call includes:

```tsx
          defaultChatModel={defaultChatModel}
```

- [ ] **Step 8: Run assistant tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Check assistant override UI status without committing**

Run:

```bash
git status --short
```

Expected: Task 1 through Task 4 files are present in the working tree. Do not commit yet; final wiki maintenance and commit happen in Task 6.

## Task 5: Validate And Apply Chat Model Override On The Server

**Files:**
- Modify: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- Modify: `lib/rag/ask.ts`
- Test: `tests/rag/ask-route.test.ts`
- Test: `tests/rag/ask.test.ts`
- Test: `tests/rag/langfuse.test.ts`

- [ ] **Step 1: Add failing route tests**

In `tests/rag/ask-route.test.ts`, update the existing "passes only the question" test expectation so `chatModel` is forwarded and draft fields are still ignored:

```ts
  it("passes the question and valid chat model override to the ask service", async () => {
    await POST(jsonRequest({
      question: "What is saved?",
      chatModel: "moonshotai/kimi-k2.7-code",
      draftTitle: "Unsaved",
      draftContentMarkdown: "Do not send me",
      contentMarkdown: "Draft body",
    }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    expect(askDocumentQuestion).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      documentId: "doc-1",
      actorId: "user-1",
      question: "What is saved?",
      chatModelOverride: "moonshotai/kimi-k2.7-code",
    });
  });
```

Add this invalid override test:

```ts
  it("rejects invalid chat model override input", async () => {
    const response = await POST(jsonRequest({
      question: "What is saved?",
      chatModel: "bad model",
    }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook", documentId: "doc-1" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "INVALID_CHAT_MODEL" });
    expect(response.status).toBe(400);
    expect(askDocumentQuestion).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Add failing ask service test**

In `tests/rag/ask.test.ts`, add this test before the failure propagation test:

```ts
  it("overrides only the chat model for answer generation", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const selected = await createSavedDocument({
      workspaceId: fixture.workspace.id,
      userId: fixture.user.id,
      title: "Saved Title",
      contentMarkdown: "# Facts\n\nSaved database content",
    });
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce([
      {
        id: "chunk-1",
        documentId: selected.id,
        documentTitle: "Saved Title",
        documentPath: "/saved-title",
        headingPath: "Facts",
        content: "Saved database content",
        distance: 0.1,
      },
    ]);

    await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: selected.id,
      actorId: fixture.user.id,
      question: "What is saved?",
      chatModelOverride: "moonshotai/kimi-k2.7-code",
    });

    expect(embedText).toHaveBeenCalledWith(
      "What is saved?",
      expect.objectContaining({
        config: expect.objectContaining({
          chat: expect.objectContaining({
            model: "moonshotai/kimi-k2.7-code",
          }),
          embedding: expect.objectContaining({
            provider: "ollama",
            model: "bge-m3",
            dimensions: 1024,
          }),
        }),
      }),
    );
    expect(safeIndexSavedDocument).toHaveBeenCalledWith({
      documentId: selected.id,
      embeddingModel: "bge-m3",
    });
    expect(createChatModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        model: "moonshotai/kimi-k2.7-code",
        baseUrl: "http://localhost:11434",
      }),
    );
    expect(createLangfuseCallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        chatProvider: "ollama",
        chatModel: "moonshotai/kimi-k2.7-code",
        embeddingProvider: "ollama",
        embeddingModel: "bge-m3",
        embeddingDimensions: 1024,
      }),
    );
  });
```

- [ ] **Step 3: Add Langfuse metadata unit coverage**

In `tests/rag/langfuse.test.ts`, add:

```ts
  it("records the effective overridden chat model in metadata", () => {
    const config = createLangfuseCallbackConfig({
      enabled: false,
      operation: "rag.answer",
      chatProvider: "openai-compatible",
      chatModel: "moonshotai/kimi-k2.7-code",
      embeddingProvider: "ollama",
      embeddingModel: "bge-m3",
      embeddingDimensions: 1024,
    });

    expect(config.metadata).toEqual(expect.objectContaining({
      operation: "rag.answer",
      chatProvider: "openai-compatible",
      chatModel: "moonshotai/kimi-k2.7-code",
    }));
  });
```

- [ ] **Step 4: Run server tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/rag/ask-route.test.ts tests/rag/ask.test.ts tests/rag/langfuse.test.ts
```

Expected: FAIL because the route does not validate/pass `chatModel` and the service does not accept `chatModelOverride`.

- [ ] **Step 5: Update ask service types and effective config**

In `lib/rag/ask.ts`, update the input type:

```ts
export type AskDocumentQuestionInput = {
  workspaceSlug: string;
  documentId: string;
  actorId: string;
  question: string;
  chatModelOverride?: string;
};
```

After `const modelConfig = getRagModelConfig();`, add:

```ts
  const effectiveModelConfig = input.chatModelOverride
    ? {
        ...modelConfig,
        chat: {
          ...modelConfig.chat,
          model: input.chatModelOverride,
        },
      }
    : modelConfig;
```

Replace downstream answer-generation uses of `modelConfig` with `effectiveModelConfig`, while keeping the embedding fields unchanged by virtue of object spreading:

```ts
  assertCurrentEmbeddingIndex(effectiveModelConfig);
```

Use `effectiveModelConfig.embedding.indexId` for `safeIndexSavedDocument`, `searchSimilarChunks`, and prompt metadata. Use `effectiveModelConfig` for `embedText()`. Use `effectiveModelConfig.chat` for `createChatModel()`. Use `effectiveModelConfig.chat.model` and `effectiveModelConfig.chat.provider` for Langfuse metadata.

- [ ] **Step 6: Update route validation and forwarding**

In `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, add:

```ts
import {
  INVALID_CHAT_MODEL_ERROR,
  validateChatModelId,
} from "@/lib/rag/client-model-settings";
```

Change body parsing to:

```ts
  const body = (await request.json().catch(() => ({}))) as {
    question?: unknown;
    chatModel?: unknown;
  };
  const question = typeof body.question === "string" ? body.question : "";
  const chatModelValidation =
    body.chatModel === undefined ? null : validateChatModelId(body.chatModel);

  if (chatModelValidation && !chatModelValidation.ok) {
    return NextResponse.json({ error: INVALID_CHAT_MODEL_ERROR }, { status: 400 });
  }
```

Pass the override into the service:

```ts
      ...(chatModelValidation?.ok ? { chatModelOverride: chatModelValidation.value } : {}),
```

- [ ] **Step 7: Run server tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/rag/ask-route.test.ts tests/rag/ask.test.ts tests/rag/langfuse.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run TypeScript**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS.

- [ ] **Step 9: Check server override status without committing**

Run:

```bash
git status --short
```

Expected: Task 1 through Task 5 files are present in the working tree. Do not commit yet; final wiki maintenance and commit happen in Task 6.

## Task 6: Wiki, Verification, And PR Handoff

**Files:**
- Modify: `wiki/RAG Process Workflow.md`
- Modify: `wiki/Local Development Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update RAG process workflow**

In `wiki/RAG Process Workflow.md`, update frontmatter:

```yaml
updated: 2026-06-15
source_count: 33
```

In `Entry points`, change the UI paragraph to state that the panel sends `question` plus an optional browser-scoped `chatModel` override and still sends no draft markdown:

```md
사용자 entry point는 `components/document-editor/ai-assistant-panel.tsx`다. Panel은 현재 문서 id와 trimmed `question`, 그리고 browser/workspace별로 저장된 optional `chatModel` override만 ask route로 보낸다. Unsaved title/content markdown이나 pending clipboard image paste payload는 request body에 넣지 않는다. 현재 editor draft가 saved DB document와 다르거나 pending paste upload가 있으면 saved-content-only warning을 표시한다.
```

In `Steps`, update step 4 and step 10:

```md
4. `getRagModelConfig()`가 server-wide env에서 chat provider, embedding provider, Langfuse config를 읽는다. Ask route가 validated `chatModel` override를 전달한 경우 service는 `chat.model`만 in-memory로 바꾸고 embedding provider/model/dimension은 그대로 둔다. 현재 live Ask AI는 indexed embedding identity가 Ollama `bge-m3` 1024와 다르면 `assertCurrentEmbeddingIndex()`에서 fail-fast한다.
```

```md
10. `createLangfuseCallbackConfig()`는 effective provider/model/chunk/citation metadata를 만들고, explicit full capture에서만 LangChain callback을 붙인다. Metadata mode에서는 raw prompt/context/question/answer body egress를 막기 위해 callback을 붙이지 않는다.
```

Add a paragraph to `Provider And Index Contract`:

```md
Issue #102 이후 OpenRouter 같은 OpenAI-compatible cloud chat model 테스트는 server env에 provider/base URL/API key/default model을 둔 뒤, workspace settings panel에서 browser/workspace-scoped chat model id override를 저장하는 방식으로 한다. 이 override는 Ask AI request의 `chatModel` field로만 전달되고, server는 validated string으로 `chat.model`만 대체한다. Provider, base URL, API key, embedding provider/model/dimension은 request에서 받지 않는다.
```

Add the new source evidence path under `근거`:

```md
- `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`
- `lib/rag/client-model-settings.ts`
```

- [ ] **Step 2: Update local development workflow**

In `wiki/Local Development Workflow.md`, update frontmatter:

```yaml
updated: 2026-06-15
source_count: 35
```

In the RAG environment section, add:

```md
OpenRouter chat 테스트는 existing OpenAI-compatible provider path를 사용한다. API key와 base URL은 server env에만 두고, settings panel은 browser-local chat model id override만 저장한다.

```text
MUNJIB_RAG_CHAT_PROVIDER=openai-compatible
MUNJIB_OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
MUNJIB_OPENAI_COMPATIBLE_API_KEY=...
MUNJIB_RAG_CHAT_MODEL=openrouter/fusion
MUNJIB_RAG_EMBED_PROVIDER=ollama
MUNJIB_RAG_EMBED_MODEL=bge-m3
MUNJIB_RAG_EMBED_DIMENSIONS=1024
```
```

- [ ] **Step 3: Update index and log**

In `wiki/index.md`, change the Issue #102 status sentence from "아직 구현된 동작이 아니며" to implemented behavior:

```md
- AI/RAG OpenRouter model selection: Issue #102는 OpenRouter를 `openai-compatible` provider env로 연결한 상태에서 settings panel이 browser/workspace별 chat model id만 저장하고 Ask AI 요청에 전달하는 구현이다. API key/base URL은 server env에만 두고, embedding provider/model/dimension과 현재 Ollama `bge-m3` 1024 index contract는 고정한다. 설계 근거는 `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`이다.
```

In `wiki/log.md`, add a new implementation entry above the design entry:

```md
## 2026-06-15T00:30:00+0900 - issue-102 openrouter chat model selection implementation

- Result: Workspace settings panel의 AI tab에서 browser/workspace별 Ask AI chat model override를 저장하고, assistant request가 optional `chatModel` field로 answer generation model만 바꾸도록 구현했다.
- Coverage: `lib/rag/client-model-settings.ts` validates model ids, stores overrides in `localStorage`, and emits same-tab change events. `AiAssistantPanel` displays the effective model and sends `chatModel` only when an override exists. Ask route validates override input and `askDocumentQuestion()` replaces only `chat.model`, preserving the current Ollama `bge-m3` 1024 embedding index contract.
- Pages: [[RAG Process Workflow]], [[Local Development Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #102, `docs/superpowers/specs/2026-06-15-openrouter-chat-model-selection-design.md`, `lib/rag/client-model-settings.ts`, `components/workspace-settings-panel.tsx`, `components/document-editor/ai-assistant-panel.tsx`, `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`, `lib/rag/ask.ts`.
- Verification: `pnpm exec tsc --noEmit --pretty false`; `pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/rag/model-config.test.ts tests/rag/ask-route.test.ts tests/rag/ask.test.ts tests/rag/langfuse.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`.
```

- [ ] **Step 4: Regenerate manifest**

Run:

```bash
pnpm wiki:manifest
```

Expected: writes `wiki/manifest.json`.

- [ ] **Step 5: Run targeted verification**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/rag/model-config.test.ts tests/rag/ask-route.test.ts tests/rag/ask.test.ts tests/rag/langfuse.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx
pnpm wiki:lint
```

Expected: TypeScript and Vitest PASS. `pnpm wiki:lint` may continue to print the existing `wiki/designs/sidebar.md` unresolved pasted-image warning while exiting 0.

- [ ] **Step 6: Stage source, plan, wiki maintenance, and run wiki sync checks**

Run:

```bash
git add docs/superpowers/plans/2026-06-15-openrouter-chat-model-selection.md lib/rag/client-model-settings.ts tests/rag/client-model-settings.test.ts lib/rag/model-config.ts tests/rag/model-config.test.ts 'app/workspaces/[workspaceSlug]/page.tsx' components/document-list.tsx components/workspace-settings-panel.tsx components/document-editor/types.ts components/document-editor.tsx components/document-editor/ai-assistant-panel.tsx 'app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts' lib/rag/ask.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx tests/rag/ask-route.test.ts tests/rag/ask.test.ts tests/rag/langfuse.test.ts wiki/RAG\ Process\ Workflow.md wiki/Local\ Development\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:sync-plan --staged
pnpm wiki:sync-check --staged
```

Expected: sync-plan and sync-check both report source changes and wiki maintenance changes.

- [ ] **Step 7: Commit plan, implementation, and wiki update**

Run:

```bash
git commit -m "feat: add openrouter chat model selection"
```

Expected: commit succeeds with pre-commit wiki checks.

- [ ] **Step 8: Push and open PR**

Run:

```bash
git status --short --branch
git push -u origin issue-102-openrouter-chat-model-selection
gh pr create --draft --title "Add OpenRouter chat model selection" --body "## Summary
- add workspace settings AI tab for browser-local chat model selection
- send optional Ask AI chatModel override while keeping provider credentials and embeddings server-owned
- update RAG workflow wiki docs

## Validation
- pnpm exec tsc --noEmit --pretty false
- pnpm exec vitest run tests/rag/client-model-settings.test.ts tests/rag/model-config.test.ts tests/rag/ask-route.test.ts tests/rag/ask.test.ts tests/rag/langfuse.test.ts tests/components/document-list.test.tsx tests/components/document-editor-preview.test.tsx
- pnpm wiki:manifest
- pnpm wiki:lint
- pnpm wiki:sync-check --staged"
gh pr ready
```

Expected: branch pushes, draft PR is created, then marked ready.

- [ ] **Step 9: Complete PR review workflow**

Wait at least 5 minutes after marking the PR ready. Then run:

```bash
gh pr view --json number,url,state,reviewDecision,statusCheckRollup
gh pr checks
```

Expected: report review state and CI/check status. If checks fail or review comments are actionable, fix them on the same branch, repeat targeted verification, wiki sync, commit, push, and re-check PR status.

## Plan Self-Review

- Spec coverage: Tasks 1-5 cover browser/workspace storage, static presets, direct custom entry, server-default display, optional request override, server validation, chat-only effective config, Langfuse metadata, and fixed embedding behavior. Task 6 covers wiki, plan staging, final commit, and PR workflow.
- Placeholder scan: This plan contains concrete file paths, code blocks, exact commands, and expected outcomes. It contains no incomplete implementation steps.
- Type consistency: The plan uses `chatModel` for the JSON request field and `chatModelOverride` for the service input. Shared validation exports `INVALID_CHAT_MODEL_ERROR`, `validateChatModelId`, and browser storage helpers from `lib/rag/client-model-settings.ts`.
