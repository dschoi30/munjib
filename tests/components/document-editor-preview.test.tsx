// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render as testingRender, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { AppShell, useHeadingNavigation, useTagSearch } from "@/components/app-shell";
import { DocumentEditor } from "@/components/document-editor";
import { DocumentViewModeProvider, useDocumentViewMode } from "@/components/document-view-mode";
import { I18nProvider } from "@/components/i18n-provider";

const toastError = vi.hoisted(() => vi.fn());

const codeMirrorHarness = vi.hoisted(() => ({
  updateListeners: [] as Array<(update: unknown) => void>,
  pasteHandlers: [] as Array<(event: ClipboardEvent, view: unknown) => boolean>,
  changeHandlers: [] as Array<(value: string, viewUpdate: { state: { selection: { main: { head: number } } } }) => void>,
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    "aria-label": ariaLabel,
    extensions,
    onChange,
  }: {
    value: string;
    "aria-label": string;
    extensions?: unknown[];
    onChange?: (value: string, viewUpdate: { state: { selection: { main: { head: number } } } }) => void;
  }) => {
    codeMirrorHarness.updateListeners = findUpdateListeners(extensions ?? []);
    codeMirrorHarness.pasteHandlers = findPasteHandlers(extensions ?? []);
    codeMirrorHarness.changeHandlers = onChange ? [onChange] : [];

    return <textarea aria-label={ariaLabel} readOnly value={value} />;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
  },
}));

beforeEach(() => {
  let store: Record<string, string> = {};
  codeMirrorHarness.updateListeners = [];
  codeMirrorHarness.pasteHandlers = [];
  codeMirrorHarness.changeHandlers = [];
  toastError.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => {
        store = {};
      },
      getItem: (key: string) => store[key] ?? null,
      removeItem: (key: string) => {
        delete store[key];
      },
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const baseProps = {
  workspaceSlug: "company-handbook",
  defaultChatModel: "gemma4:e4b",
  defaultChatProvider: "openai-compatible" as const,
  availableChatProviders: {
    ollama: true,
    openai: true,
    "openai-compatible": true,
  },
  canWrite: true,
  action: async () => {},
  uploadAttachmentAction: async () => {},
  pasteImageAttachmentAction: async () => ({ markdown: "![clipboard.png](/api/attachments/attachment-1)" }),
  linkCandidates: [],
  tags: [],
  properties: [],
  comments: [],
  linkPanels: { outgoing: [], backlinks: [], brokenLinks: [], ambiguousLinks: [] },
  createFromBrokenLinkAction: async () => {},
  createCommentAction: async () => {},
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function renderEditor(markdown: string, props: Partial<Parameters<typeof DocumentEditor>[0]> = {}) {
  return render(
    <DocumentViewModeProvider>
      <TestModeControls />
      <DocumentEditor
        {...baseProps}
        {...props}
        document={{ id: "doc-1", title: "Foldable", contentMarkdown: markdown }}
      />
    </DocumentViewModeProvider>,
  );
}

function render(ui: React.ReactElement) {
  const result = testingRender(<I18nProvider>{ui}</I18nProvider>);
  return {
    ...result,
    rerender: (nextUi: React.ReactElement) => result.rerender(<I18nProvider>{nextUi}</I18nProvider>),
  };
}

function TagSearchReceiver() {
  const tagSearch = useTagSearch();

  return (
    <span data-testid="tag-search-request">
      {tagSearch?.latestTagSearchRequest?.tagName ?? ""}
    </span>
  );
}

function findPasteHandlers(extensions: unknown[]): Array<(event: ClipboardEvent, view: unknown) => boolean> {
  const handlers: Array<(event: ClipboardEvent, view: unknown) => boolean> = [];
  const visit = (extension: unknown) => {
    if (!extension || typeof extension !== "object") {
      return;
    }

    const maybeProvider = extension as {
      extension?: unknown;
      extensions?: unknown;
      domEventHandlers?: { paste?: unknown };
    };

    if (typeof maybeProvider.domEventHandlers?.paste === "function") {
      handlers.push(maybeProvider.domEventHandlers.paste as (event: ClipboardEvent, view: unknown) => boolean);
    }

    if (Array.isArray(maybeProvider.extension)) {
      maybeProvider.extension.forEach(visit);
    }

    if (Array.isArray(maybeProvider.extensions)) {
      maybeProvider.extensions.forEach(visit);
    }
  };

  extensions.forEach(visit);

  return handlers;
}

function renderEditorInAppShell(markdown: string, target: { id: string; lineNumber: number }) {
  return render(
    <AppShell
      left={<div>Documents</div>}
      center={
        <DocumentViewModeProvider>
          <DocumentEditor
            {...baseProps}
            document={{ id: "doc-1", title: "Foldable", contentMarkdown: markdown }}
          />
        </DocumentViewModeProvider>
      }
      right={<NavigateHeadingButton target={target} />}
    />,
  );
}

function NavigateHeadingButton({ target }: { target: { id: string; lineNumber: number } }) {
  const headingNavigation = useHeadingNavigation();

  return (
    <button type="button" onClick={() => headingNavigation?.navigateToHeading(target)}>
      Navigate target heading
    </button>
  );
}

function TestModeControls() {
  const { mode, setMode } = useDocumentViewMode();

  return (
    <div>
      <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
        Edit
      </button>
      <button type="button" aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>
        Preview
      </button>
    </div>
  );
}

function findUpdateListeners(extensions: unknown[]): Array<(update: unknown) => void> {
  const listeners: Array<(update: unknown) => void> = [];
  const updateListenerFacetId = (EditorView.updateListener as unknown as { id: number }).id;
  const visit = (extension: unknown) => {
    if (!extension || typeof extension !== "object") {
      return;
    }

    const maybeProvider = extension as {
      extension?: unknown;
      extensions?: unknown;
      facet?: { id?: number };
      value?: unknown;
    };

    if (
      maybeProvider.facet?.id === updateListenerFacetId &&
      typeof maybeProvider.value === "function"
    ) {
      listeners.push(maybeProvider.value as (update: unknown) => void);
    }

    if (Array.isArray(maybeProvider.extension)) {
      maybeProvider.extension.forEach(visit);
    }

    if (Array.isArray(maybeProvider.extensions)) {
      maybeProvider.extensions.forEach(visit);
    }
  };

  extensions.forEach(visit);

  return listeners;
}

function createFoldedRangeUpdate(markdown: string, fromLine: number, toLine: number) {
  const lineOffsets = createLineOffsets(markdown);
  const doc = {
    length: markdown.length,
    lineAt(position: number) {
      for (const [number, offsets] of lineOffsets) {
        if (position >= offsets.from && position <= offsets.to) {
          return { number, ...offsets };
        }
      }

      throw new Error(`No line at ${position}`);
    },
    toString: () => markdown,
  };
  const fromHeadingLineEnd = lineOffsets.get(fromLine)?.to ?? 0;
  const to = lineOffsets.get(toLine)?.to ?? 0;

  return {
    view: {
      state: {
        doc,
        field: () => ({
          between: (_from: number, _to: number, callback: (from: number, to: number) => void) => {
            callback(fromHeadingLineEnd, to);
          },
        }),
      },
    },
  };
}

function createLineOffsets(markdown: string) {
  const lineOffsets = new Map<number, { from: number; to: number }>();
  let from = 0;
  let lineNumber = 1;

  for (let index = 0; index <= markdown.length; index += 1) {
    if (index !== markdown.length && markdown[index] !== "\n") {
      continue;
    }

    lineOffsets.set(lineNumber, { from, to: index });
    from = index + 1;
    lineNumber += 1;
  }

  return lineOffsets;
}

describe("DocumentEditor heading preview folding", () => {
  it("removes split mode and opens preview mode by default", () => {
    renderEditor("# A\nBody");

    expect(screen.queryByRole("button", { name: /split/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "A" })).toBeTruthy();
  });

  it("renders the document title as a borderless heading-sized control", () => {
    renderEditor("# A\nBody");

    const titleInput = screen.getByDisplayValue("Foldable");

    expect(titleInput.className).toContain("border-0");
    expect(titleInput.className).toContain("text-[1.75rem]");
  });

  it("opens the AI assistant and asks from saved document content only", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        answer: "*   **Process:** Follow the handbook process [1].",
        citations: [{ index: 1, documentId: "doc-1", title: "Foldable", headingPath: ["Process"] }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderEditor("# A\nBody");

    fireEvent.change(screen.getByDisplayValue("Foldable"), {
      target: { value: "Unsaved title" },
    });
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");
    codeMirrorHarness.changeHandlers[0]("Draft body", {
      state: { selection: { main: { head: "Draft body".length } } },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));

    const assistant = await screen.findByRole("region", { name: "AI assistant" });
    expect(screen.getByRole("button", { name: "Close AI assistant" })).toBeTruthy();
    expect(within(assistant).getByRole("button", { name: "Ask AI" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Ask AI" }).length).toBe(1);

    expect(screen.getByText("Unsaved changes are not included in AI answers.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("AI question"), {
      target: { value: "  What should I do?  " },
    });
    fireEvent.submit(screen.getByLabelText("AI question").closest("form") as HTMLFormElement);

    const strong = await screen.findByText("Process:");
    expect(strong.tagName).toBe("STRONG");
    const citationLink = screen.getByRole("link", { name: "[1] Foldable > Process" });
    expect(citationLink.getAttribute("href")).toBe(
      "/workspaces/company-handbook?document=doc-1",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/documents/doc-1/ask",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "What should I do?", uiLanguage: "en" }),
      },
    );
    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
    expect(requestBody).not.toContain("Unsaved title");
    expect(requestBody).not.toContain("Draft body");
  });

  it("uses an available fallback override when the Ask AI default provider is unavailable", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ answer: "Fallback answer.", citations: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderEditor("# A\nBody", {
      defaultChatProvider: "openai-compatible",
      defaultChatModel: "openrouter/fusion",
      availableChatProviders: { ollama: true, openai: false, "openai-compatible": false },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    expect(await screen.findByText("gemma4:e4b")).toBeTruthy();
    const questionInput = screen.getByLabelText("AI question");

    fireEvent.change(questionInput, {
      target: { value: "What should I do?" },
    });
    fireEvent.submit(questionInput.closest("form") as HTMLFormElement);

    expect(await screen.findByText("Fallback answer.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/documents/doc-1/ask",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          question: "What should I do?",
          uiLanguage: "en",
          chatProvider: "ollama",
          chatModel: "gemma4:e4b",
        }),
      }),
    );
  });

  it("uses the selected Korean display language for Ask AI chrome, errors, and request payloads", async () => {
    window.localStorage.setItem("munjib:language", "ko");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderEditor("# A\nBody", { defaultChatModel: "openrouter/fusion" });

    fireEvent.click(screen.getByRole("button", { name: "AI 어시스턴트 열기" }));
    expect(await screen.findByRole("region", { name: "AI 어시스턴트" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI 어시스턴트 닫기" })).toBeTruthy();
    expect(screen.getByText("모델")).toBeTruthy();
    expect(screen.getByPlaceholderText("이 문서에 대해 질문하기")).toBeTruthy();
    const questionInput = screen.getByLabelText("AI 질문");

    fireEvent.change(questionInput, {
      target: { value: "  무엇을 해야 하나요?  " },
    });
    fireEvent.submit(questionInput.closest("form") as HTMLFormElement);

    expect(await screen.findByText("AI 답변을 가져오지 못했습니다.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/documents/doc-1/ask",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          question: "무엇을 해야 하나요?",
          uiLanguage: "ko",
        }),
      }),
    );
  });

  it("uses the selected Korean display language for the empty editor state", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    render(
      <DocumentViewModeProvider>
        <DocumentEditor {...baseProps} document={null} />
      </DocumentViewModeProvider>,
    );

    expect(await screen.findByText("문서를 만들거나 선택하세요.")).toBeTruthy();
  });

  it("uses the selected Korean display language for editor chrome and properties", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    renderEditor("# A\nBody", {
      properties: [{ id: "property-tags", key: "tags", valueJson: [] }],
      linkPanels: {
        outgoing: [
          {
            id: "link-1",
            targetTitleRaw: "Missing",
            alias: null,
            isBroken: true,
            isAmbiguous: false,
            targetDocument: null,
          },
        ],
        backlinks: [],
        brokenLinks: [],
        ambiguousLinks: [],
      },
    });

    expect(await screen.findByLabelText("문서 제목")).toBeTruthy();
    const properties = screen.getByRole("region", { name: "문서 속성" });
    expect(within(properties).getByText("속성")).toBeTruthy();
    expect(within(properties).getAllByText("없음").length).toBeGreaterThan(0);
    expect(within(properties).getByLabelText("댓글 추가")).toBeTruthy();
    expect(within(properties).getByPlaceholderText("댓글 추가")).toBeTruthy();
    expect(within(properties).getByRole("button", { name: "댓글" })).toBeTruthy();
    expect(within(properties).getByTitle("깨진 링크에서 문서 만들기")).toBeTruthy();
    expect(screen.getByLabelText("첨부 파일 업로드")).toBeTruthy();
    expect(screen.getByRole("button", { name: "업로드" })).toBeTruthy();
    expect(screen.getByText("저장을 누르면 Markdown 변경사항이 저장됩니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "저장" })).toBeTruthy();
  });

  it("uses the selected Korean display language for preview folding and wiki link suggestions", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    renderEditor("# A\nBody", {
      linkCandidates: [{ id: "doc-2", slug: "welcome", title: "Welcome", path: "/Welcome" }],
    });

    fireEvent.click(await screen.findByRole("button", { name: "A 섹션 접기" }));
    expect(screen.getByRole("button", { name: "A 섹션 펼치기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText("Markdown 편집기");

    act(() => {
      codeMirrorHarness.changeHandlers[0]?.("[[Wel", {
        state: { selection: { main: { head: 5 } } },
      });
    });

    expect(await screen.findByText("위키 링크")).toBeTruthy();
  });

  it("shows the Ask AI thinking indicator while the request is pending", async () => {
    vi.useFakeTimers();
    const deferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => deferred.promise));

    renderEditor("# Saved\n\nContent");
    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    fireEvent.change(screen.getByLabelText("AI question"), {
      target: { value: "What is saved?" },
    });
    fireEvent.submit(screen.getByLabelText("AI question").closest("form") as HTMLFormElement);

    expect(screen.getByText("Thinking...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Reviewing the relevant document context...")).toBeTruthy();

    await act(async () => {
      deferred.resolve(new Response(JSON.stringify({ answer: "Saved answer", citations: [] })));
      await deferred.promise;
    });
    vi.useRealTimers();

    await screen.findByText("Saved answer");
    expect(screen.queryByText("Reviewing the relevant document context...")).toBeNull();
  });

  it("shows the server default AI model when no browser override is stored", () => {
    renderEditor("# A\nBody", { defaultChatModel: "openrouter/fusion" });

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    expect(screen.getByText("moonshotai/kimi-k2.7-code")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("AI question"), {
      target: { value: "Which model answered?" },
    });
    fireEvent.submit(screen.getByLabelText("AI question").closest("form") as HTMLFormElement);

    await screen.findByText("Cloud model answer");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/company-handbook/documents/doc-1/ask",
      expect.objectContaining({
        body: JSON.stringify({
          question: "Which model answered?",
          uiLanguage: "en",
          chatProvider: "openai-compatible",
          chatModel: "moonshotai/kimi-k2.7-code",
        }),
      }),
    );
  });

  it("updates the displayed AI model when settings change in the same browser tab", () => {
    renderEditor("# A\nBody", { defaultChatModel: "openrouter/fusion" });

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    expect(screen.getByText("openrouter/fusion")).toBeTruthy();

    window.localStorage.setItem(
      "munjib:rag-chat-model:company-handbook",
      "qwen/qwen3.7-plus",
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent("munjib:rag-chat-model-setting-changed", {
          detail: {
            workspaceSlug: "company-handbook",
            chatProvider: "openai-compatible",
            chatModel: "qwen/qwen3.7-plus",
          },
        }),
      );
    });

    expect(screen.getByText("qwen/qwen3.7-plus")).toBeTruthy();
  });

  it("shows an AI error when a successful response body is not valid JSON", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderEditor("# A\nBody");

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    fireEvent.change(screen.getByLabelText("AI question"), {
      target: { value: "What should I do?" },
    });
    fireEvent.submit(screen.getByLabelText("AI question").closest("form") as HTMLFormElement);

    expect(await screen.findByText("Could not get an AI answer.")).toBeTruthy();
  });

  it("omits the heading separator for empty AI citation heading paths", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answer: "Use the saved handbook.",
        citations: [
          { documentId: "doc-1", title: "Foldable", headingPath: [] },
          { documentId: "doc-2", title: "Policy", headingPath: ["Process"] },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    renderEditor("# A\nBody");

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    fireEvent.change(screen.getByLabelText("AI question"), {
      target: { value: "What should I do?" },
    });
    fireEvent.submit(screen.getByLabelText("AI question").closest("form") as HTMLFormElement);

    await screen.findByText("Use the saved handbook.");
    const citationItems = within(screen.getByRole("list")).getAllByRole("listitem");

    expect(citationItems[0]?.textContent).toBe("[1] Foldable");
    expect(citationItems[1]?.textContent).toBe("[2] Policy > Process");
  });

  it("shows the saved-content warning while an image paste is still pending", async () => {
    const upload = createDeferred<{ markdown: string }>();
    const pasteImageAttachmentAction = vi.fn((_formData: FormData) => upload.promise);
    renderEditor("Intro", { pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        files: [image],
        items: [],
        getData: () => "",
      },
    } as unknown as ClipboardEvent;
    let currentMarkdown = "Intro";
    const dispatch = vi.fn((transaction: { changes?: { insert?: string } }) => {
      if (typeof transaction.changes?.insert === "string") {
        currentMarkdown = `Intro ${transaction.changes.insert}`;
      }
    });

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: {
        replaceSelection: vi.fn((text: string) => ({ changes: { from: 5, to: 5, insert: text } })),
        doc: { toString: () => currentMarkdown },
        selection: { ranges: [{ from: 5, to: 5 }] },
        sliceDoc: () => "",
      },
      dispatch,
    })).toBe(true);

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));

    expect(screen.getByText("Unsaved changes are not included in AI answers.")).toBeTruthy();
  });

  it("resets assistant panel state when switching documents", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ answer: "Answer for first document", citations: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <DocumentViewModeProvider>
        <TestModeControls />
        <DocumentEditor
          {...baseProps}
          document={{ id: "doc-1", title: "First", contentMarkdown: "First" }}
        />
      </DocumentViewModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open AI assistant" }));
    fireEvent.change(screen.getByLabelText("AI question"), {
      target: { value: "Question for first" },
    });
    fireEvent.submit(screen.getByLabelText("AI question").closest("form") as HTMLFormElement);

    await screen.findByText("Answer for first document");

    rerender(
      <DocumentViewModeProvider>
        <TestModeControls />
        <DocumentEditor
          {...baseProps}
          document={{ id: "doc-2", title: "Second", contentMarkdown: "Second" }}
        />
      </DocumentViewModeProvider>,
    );

    expect(screen.queryByText("Answer for first document")).toBeNull();
    expect((screen.getByLabelText("AI question") as HTMLTextAreaElement).value).toBe("");
  });

  it("folds and unfolds a preview heading section", () => {
    renderEditor("# A\nVisible body\n# B\nOther body");

    const toggle = screen.getByRole("button", { name: "Collapse section A" });
    expect(toggle.className).toContain("absolute");
    expect(toggle.className).not.toContain("hover:bg");
    expect(toggle.className).not.toContain("ring");
    expect(toggle.className).not.toContain("border");
    expect(toggle.parentElement?.className).not.toContain("flex");
    expect(screen.getByText("Visible body")).toBeTruthy();

    fireEvent.click(toggle);

    expect(screen.queryByText("Visible body")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand section A" }).getAttribute("aria-expanded")).toBe(
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand section A" }));

    expect(screen.getByText("Visible body")).toBeTruthy();
  });

  it("adds level-based spacing between preview heading sections", () => {
    renderEditor("# One\nBody\n## Two\nBody\n### Three\nBody");

    expect(screen.getByRole("heading", { name: "One" }).closest("section")?.className).toContain(
      "mt-8",
    );
    expect(screen.getByRole("heading", { name: "Two" }).closest("section")?.className).toContain(
      "mt-6",
    );
    expect(screen.getByRole("heading", { name: "Three" }).closest("section")?.className).toContain(
      "mt-4",
    );
  });

  it("marks preview headings with outline target attributes", () => {
    renderEditor("# Welcome\n\n## Setup");

    expect(document.querySelector('[data-outline-heading-id="1-welcome-0"]')).toBeTruthy();
    expect(document.querySelector('[data-outline-heading-id="1-welcome-0/2-setup-0"]')).toBeTruthy();
  });

  it("shows preview fold controls after CRLF fenced code blocks", () => {
    renderEditor("```ts\r\nconst value = 1;\r\n```\r\n# After code\r\nBody");

    expect(screen.getByRole("button", { name: "Collapse section After code" })).toBeTruthy();
  });

  it("keeps CRLF leading code block content before the first preview heading", () => {
    renderEditor("Intro\r\n```ts\r\nconst value = 1;\r\n```\r\n# After code\r\nBody");

    expect(screen.getByText("Intro")).toBeTruthy();
    expect(screen.getByText("const value = 1;")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse section After code" })).toBeTruthy();
  });

  it("restores folded headings from document localStorage", () => {
    window.localStorage.setItem("munjib:heading-folds:doc-1", "[\"1-a-0\"]");

    renderEditor("# A\nStored body");

    expect(screen.queryByText("Stored body")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand section A" })).toBeTruthy();
  });

  it("unfolds collapsed preview ancestors before navigating to a child outline heading", () => {
    window.localStorage.setItem("munjib:heading-folds:doc-1", "[\"1-parent-0\"]");

    renderEditorInAppShell("# Parent\n## Child\nNested body", {
      id: "1-parent-0/2-child-0",
      lineNumber: 2,
    });

    expect(screen.queryByRole("heading", { name: "Child" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Navigate target heading" }));

    expect(screen.getByRole("heading", { name: "Child" })).toBeTruthy();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("restores folded wikilink headings using raw markdown keys", () => {
    window.localStorage.setItem("munjib:heading-folds:doc-1", "[\"1-welcome-0\"]");

    renderEditor("# [[Welcome]]\nBody", {
      linkCandidates: [
        { id: "doc-welcome", slug: "welcome", title: "Welcome", path: "Welcome" },
      ],
    });

    expect(screen.queryByText("Body")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand section Welcome" })).toBeTruthy();

    const heading = screen.getByRole("heading", { name: "Welcome" });
    const link = within(heading).getByRole("link", { name: "Welcome" });
    expect(link.getAttribute("href")).toBe("?document=doc-welcome");
  });

  it("renders inline markdown and wiki links inside preview headings", () => {
    renderEditor("# **Bold** [[Target]]\nBody", {
      linkCandidates: [{ id: "target-doc", slug: "target", title: "Target", path: "Target" }],
    });

    const heading = screen.getByRole("heading", { name: "Bold Target" });
    const link = within(heading).getByRole("link", { name: "Target" });
    expect(link.getAttribute("href")).toBe("?document=target-doc");
    expect(link.className).toContain("text-primary");
    expect(link.className).toContain("hover:text-primary-hover");
    expect(link.className).not.toContain("violet");
  });

  it("uses the primary green theme for preview tag links", () => {
    renderEditor("Use #planning", {
      linkCandidates: [{ id: "target-doc", slug: "target", title: "Target", path: "Target" }],
    });

    const tagLink = screen.getByRole("button", { name: "Search tag #planning" });
    expect(tagLink.className).toContain("text-primary");
    expect(tagLink.className).toContain("focus:ring-[var(--color-focus-visible)]");
    expect(tagLink.className).not.toContain("violet");
  });

  it("resolves reference links whose definitions appear in later sections", () => {
    renderEditor("# A\n[ref][x]\n# B\n[x]: https://example.com");

    const link = screen.getByRole("link", { name: "ref" });
    expect(link.getAttribute("href")).toContain("https://example.com");
  });

  it("resolves multi-line footnote definitions across preview sections", () => {
    const { container } = renderEditor("# A\nFootnote[^one]\n# B\n[^one]: first\n    second");

    expect(container.textContent?.replace(/\s+/g, " ")).toContain("first second");
  });

  it("resolves empty first-line footnote definitions across preview sections", () => {
    const { container } = renderEditor("# A\nFootnote[^one]\n# B\n[^one]:\n    first\n    second");

    expect(container.textContent?.replace(/\s+/g, " ")).toContain("first second");
  });

  it("resolves reference definitions after CRLF fenced code blocks across preview sections", () => {
    renderEditor(
      "# A\r\n[ref][x]\r\n# B\r\n```ts\r\nconst value = 1;\r\n```\r\n[x]: https://example.com\r\n",
    );

    const link = screen.getByRole("link", { name: "ref" });
    expect(link.getAttribute("href")).toContain("https://example.com");
  });

  it("does not append shared definitions again when preview has no headings", () => {
    const { container } = renderEditor("Footnote[^one]\n\n[^one]: first");

    expect(container.textContent?.match(/first/g)).toHaveLength(1);
  });

  it("keeps heading body content in a separate preview paragraph", () => {
    const { container } = renderEditor("# Heading\nBody line");

    const heading = screen.getByRole("heading", { name: "Heading" });
    const paragraph = screen.getByText("Body line");

    expect(heading.tagName).toBe("H1");
    expect(paragraph.tagName).toBe("P");
    expect(container.textContent).toContain("HeadingBody line");
  });

  it("renders edit-mode soft line breaks as explicit preview line breaks", async () => {
    const { container } = renderEditor("First line");

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    expect(codeMirrorHarness.changeHandlers).toHaveLength(1);

    codeMirrorHarness.changeHandlers[0]("First line\nSecond line", {
      state: { selection: { main: { head: "First line\nSecond line".length } } },
    });
    fireEvent.click(screen.getByRole("button", { name: /preview/i }));

    const paragraph = container.querySelector(".markdown-preview p");

    expect(paragraph?.textContent).toContain("First line");
    expect(paragraph?.textContent).toContain("Second line");
    expect(paragraph?.querySelector("br")).toBeTruthy();
  });

  it("renders soft line breaks inside preview heading sections", async () => {
    const { container } = renderEditor("# Heading\nFirst line");

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    codeMirrorHarness.changeHandlers[0]("# Heading\nFirst line\nSecond line", {
      state: { selection: { main: { head: "# Heading\nFirst line\nSecond line".length } } },
    });
    fireEvent.click(screen.getByRole("button", { name: /preview/i }));

    const paragraph = container.querySelector(".markdown-preview section p");

    expect(paragraph?.textContent).toContain("First line");
    expect(paragraph?.textContent).toContain("Second line");
    expect(paragraph?.querySelector("br")).toBeTruthy();
  });

  it("persists edit-mode folded heading ranges to document localStorage", async () => {
    const markdown = "# A\nLine\n# B\nOther";
    renderEditor(markdown);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    expect(codeMirrorHarness.updateListeners).toHaveLength(1);

    codeMirrorHarness.updateListeners[0](createFoldedRangeUpdate(markdown, 1, 2));

    expect(window.localStorage.getItem("munjib:heading-folds:doc-1")).toBe("[\"1-a-0\"]");
  });

  it("persists edit-mode folds against the live CodeMirror document", async () => {
    renderEditor("# A\nLine\n# B\nOther");

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const liveMarkdown = "Intro\n# A\nLine\n# B\nOther";
    codeMirrorHarness.updateListeners[0](createFoldedRangeUpdate(liveMarkdown, 2, 3));

    expect(window.localStorage.getItem("munjib:heading-folds:doc-1")).toBe("[\"1-a-0\"]");
  });

  it("converts rich HTML clipboard content to markdown before paste", async () => {
    renderEditor("Intro");

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const preventDefault = vi.fn();
    const dispatch = vi.fn();
    const replaceSelection = vi.fn((text: string) => ({ changes: text }));
    const event = {
      preventDefault,
      clipboardData: {
        getData: (type: string) =>
          type === "text/html"
            ? "<h1>Pasted Title</h1><p><strong>Styled</strong> text</p>"
            : "Pasted Title\nStyled text",
      },
    } as unknown as ClipboardEvent;

    expect(codeMirrorHarness.pasteHandlers).toHaveLength(1);
    expect(
      codeMirrorHarness.pasteHandlers[0](event, {
        state: { replaceSelection },
        dispatch,
      }),
    ).toBe(true);

    expect(preventDefault).toHaveBeenCalled();
    expect(replaceSelection).toHaveBeenCalledWith("# Pasted Title\n\n**Styled** text");
    expect(dispatch).toHaveBeenCalledWith({ changes: "# Pasted Title\n\n**Styled** text" });
  });

  it("uploads clipboard image files and replaces the current placeholder with returned markdown", async () => {
    const upload = createDeferred<{ markdown: string }>();
    const pasteImageAttachmentAction = vi.fn((_formData: FormData) => upload.promise);
    renderEditor("Intro", { pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const preventDefault = vi.fn();
    let currentMarkdown = "Intro";
    const replaceSelection = vi.fn((text: string) => ({
      changes: { from: 2, to: 5, insert: text },
    }));
    const dispatch = vi.fn((transaction: { changes?: { insert?: string } }) => {
      if (typeof transaction.changes?.insert === "string") {
        currentMarkdown = `shifted ${transaction.changes.insert} tail ${transaction.changes.insert}`;
      }
    });
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const event = {
      preventDefault,
      clipboardData: {
        files: [image],
        items: [],
        getData: () => "",
      },
    } as unknown as ClipboardEvent;

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: {
        replaceSelection,
        doc: { toString: () => currentMarkdown },
        selection: { ranges: [{ from: 2, to: 5 }] },
        sliceDoc: (from: number, to: number) => "Intro".slice(from, to),
      },
      dispatch,
    })).toBe(true);

    expect(replaceSelection).toHaveBeenCalledWith(expect.stringMatching(/^!\[Uploading image\.\.\.\]\(about:blank#munjib-paste-/));
    const placeholder = replaceSelection.mock.calls[0]?.[0];
    if (!placeholder) throw new Error("Expected paste placeholder");
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 2, to: 5, insert: placeholder },
    });

    await vi.waitFor(() => {
      expect(pasteImageAttachmentAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const formData = pasteImageAttachmentAction.mock.calls[0]?.[0];
    if (!formData) throw new Error("Expected paste FormData");
    expect(formData.get("documentId")).toBe("doc-1");
    expect(formData.get("attachment")).toBe(image);
    expect(preventDefault).toHaveBeenCalled();

    upload.resolve({ markdown: "![clipboard.png](/api/attachments/attachment-1)" });

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        changes: [
          {
            from: 8,
            to: 8 + placeholder.length,
            insert: "![clipboard.png](/api/attachments/attachment-1)",
          },
          {
            from: 14 + placeholder.length,
            to: 14 + placeholder.length * 2,
            insert: "![clipboard.png](/api/attachments/attachment-1)",
          },
        ],
      });
    });
  });

  it("blocks document save while pasted image upload is pending", async () => {
    const upload = createDeferred<{ markdown: string }>();
    const pasteImageAttachmentAction = vi.fn((_formData: FormData) => upload.promise);
    const action = vi.fn(async () => {});
    const { container } = renderEditor("Intro", { action, pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        files: [image],
        items: [],
        getData: () => "",
      },
    } as unknown as ClipboardEvent;
    let currentMarkdown = "Intro";
    const dispatch = vi.fn((transaction: { changes?: { insert?: string } }) => {
      if (typeof transaction.changes?.insert === "string") {
        currentMarkdown = `Intro ${transaction.changes.insert}`;
      }
    });

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: {
        replaceSelection: vi.fn((text: string) => ({ changes: { from: 5, to: 5, insert: text } })),
        doc: { toString: () => currentMarkdown },
        selection: { ranges: [{ from: 5, to: 5 }] },
        sliceDoc: () => "",
      },
      dispatch,
    })).toBe(true);

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(true);
    });

    const form = container.querySelector<HTMLFormElement>("#document-save-doc-1");
    if (!form) throw new Error("Expected save form");
    fireEvent.submit(form);
    expect(action).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Image upload is still in progress");

    const placeholder = currentMarkdown.replace("Intro ", "");
    upload.resolve({ markdown: "![clipboard.png](/api/attachments/attachment-1)" });

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        changes: [
          {
            from: 6,
            to: 6 + placeholder.length,
            insert: "![clipboard.png](/api/attachments/attachment-1)",
          },
        ],
      });
    });
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(false);
    });
  });

  it("tracks pending pasted image uploads by document", async () => {
    const firstUpload = createDeferred<{ markdown: string }>();
    const secondUpload = createDeferred<{ markdown: string }>();
    const uploads = [firstUpload, secondUpload];
    const pasteImageAttachmentAction = vi.fn((_formData: FormData) => {
      const upload = uploads[pasteImageAttachmentAction.mock.calls.length - 1];
      if (!upload) throw new Error("Unexpected paste upload");

      return upload.promise;
    });
    const { rerender } = render(
      <DocumentViewModeProvider>
        <TestModeControls />
        <DocumentEditor
          {...baseProps}
          pasteImageAttachmentAction={pasteImageAttachmentAction}
          document={{ id: "doc-1", title: "First", contentMarkdown: "First" }}
        />
      </DocumentViewModeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        files: [image],
        items: [],
        getData: () => "",
      },
    } as unknown as ClipboardEvent;
    let firstMarkdown = "First";
    let firstView: {
      state: {
        replaceSelection: ReturnType<typeof vi.fn>;
        doc: { readonly length: number; toString: () => string; lineAt: () => { number: number } };
        selection: { ranges: Array<{ from: number; to: number }> };
        sliceDoc: () => string;
      };
      dispatch: ReturnType<typeof vi.fn>;
    };
    const firstDispatch = vi.fn((transaction: { changes?: { insert?: string } }) => {
      if (typeof transaction.changes?.insert === "string") {
        firstMarkdown = `First ${transaction.changes.insert}`;
      }
      codeMirrorHarness.updateListeners.forEach((listener) => listener({ view: firstView }));
    });
    firstView = {
      state: {
        replaceSelection: vi.fn((text: string) => ({ changes: { from: 5, to: 5, insert: text } })),
        doc: {
          get length() {
            return firstMarkdown.length;
          },
          toString: () => firstMarkdown,
          lineAt: () => ({ number: 1 }),
        },
        selection: { ranges: [{ from: 5, to: 5 }] },
        sliceDoc: () => "",
      },
      dispatch: firstDispatch,
    };
    expect(codeMirrorHarness.pasteHandlers[0](event, firstView)).toBe(true);

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(true);
    });

    rerender(
      <DocumentViewModeProvider>
        <TestModeControls />
        <DocumentEditor
          {...baseProps}
          pasteImageAttachmentAction={pasteImageAttachmentAction}
          document={{ id: "doc-2", title: "Second", contentMarkdown: "Second" }}
        />
      </DocumentViewModeProvider>,
    );

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(false);
    });

    let secondMarkdown = "Second";
    let secondView: {
      state: {
        replaceSelection: ReturnType<typeof vi.fn>;
        doc: { readonly length: number; toString: () => string; lineAt: () => { number: number } };
        selection: { ranges: Array<{ from: number; to: number }> };
        sliceDoc: () => string;
      };
      dispatch: ReturnType<typeof vi.fn>;
    };
    const secondDispatch = vi.fn((transaction: { changes?: { insert?: string } | Array<{ insert: string }> }) => {
      if (Array.isArray(transaction.changes)) {
        secondMarkdown = `Second ${transaction.changes[0]?.insert ?? ""}`;
      } else if (typeof transaction.changes?.insert === "string") {
        secondMarkdown = `Second ${transaction.changes.insert}`;
      }
      codeMirrorHarness.updateListeners.forEach((listener) => listener({ view: secondView }));
    });
    secondView = {
      state: {
        replaceSelection: vi.fn((text: string) => ({ changes: { from: 6, to: 6, insert: text } })),
        doc: {
          get length() {
            return secondMarkdown.length;
          },
          toString: () => secondMarkdown,
          lineAt: () => ({ number: 1 }),
        },
        selection: { ranges: [{ from: 6, to: 6 }] },
        sliceDoc: () => "",
      },
      dispatch: secondDispatch,
    };
    expect(codeMirrorHarness.pasteHandlers[0](event, secondView)).toBe(true);

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(true);
    });

    rerender(
      <DocumentViewModeProvider>
        <TestModeControls />
        <DocumentEditor
          {...baseProps}
          pasteImageAttachmentAction={pasteImageAttachmentAction}
          document={{ id: "doc-1", title: "First", contentMarkdown: "First" }}
        />
      </DocumentViewModeProvider>,
    );

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(true);
    });

    secondUpload.resolve({ markdown: "![second.png](/api/attachments/attachment-2)" });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(true);

    firstUpload.resolve({ markdown: "![first.png](/api/attachments/attachment-1)" });

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(false);
    });
    await vi.waitFor(() => {
      expect((screen.getByLabelText("Markdown editor") as HTMLTextAreaElement).value).toBe(
        "First ![first.png](/api/attachments/attachment-1)",
      );
    });

    rerender(
      <DocumentViewModeProvider>
        <TestModeControls />
        <DocumentEditor
          {...baseProps}
          pasteImageAttachmentAction={pasteImageAttachmentAction}
          document={{ id: "doc-1", title: "First", contentMarkdown: "First server refresh" }}
        />
      </DocumentViewModeProvider>,
    );

    await vi.waitFor(() => {
      expect((screen.getByLabelText("Markdown editor") as HTMLTextAreaElement).value).toBe(
        "First server refresh",
      );
    });
  });

  it("prefers clipboard image items over files when uploading pasted images", async () => {
    const pasteImageAttachmentAction = vi.fn(async (_formData: FormData) => ({
      markdown: "![item.png](/api/attachments/attachment-item)",
    }));
    renderEditor("Intro", { pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const itemImage = new File(["item"], "item.png", { type: "image/png" });
    const fallbackFile = new File(["file"], "file.png", { type: "image/png" });
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        files: [fallbackFile],
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => itemImage,
          },
        ],
        getData: () => "",
      },
    } as unknown as ClipboardEvent;

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: {
        replaceSelection: vi.fn((text: string) => ({ changes: { from: 0, to: 0, insert: text } })),
        doc: { toString: () => "" },
        selection: { ranges: [{ from: 0, to: 0 }] },
        sliceDoc: () => "",
      },
      dispatch: vi.fn(),
    })).toBe(true);

    await vi.waitFor(() => {
      expect(pasteImageAttachmentAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const formData = pasteImageAttachmentAction.mock.calls[0]?.[0];
    if (!formData) throw new Error("Expected paste FormData");
    expect(formData.get("attachment")).toBe(itemImage);
  });

  it("removes the image placeholder and shows an error toast when pasted image upload fails", async () => {
    const upload = createDeferred<{ markdown: string }>();
    const pasteImageAttachmentAction = vi.fn((_formData: FormData) => upload.promise);
    renderEditor("Intro", { pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    let currentMarkdown = "Intro";
    const replaceSelection = vi.fn((text: string) => ({ changes: { from: 1, to: 1, insert: text } }));
    const dispatch = vi.fn((transaction: { changes?: { insert?: string } }) => {
      if (typeof transaction.changes?.insert === "string") {
        currentMarkdown = `prefix ${transaction.changes.insert} suffix`;
      }
    });
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        files: [image],
        items: [],
        getData: () => "",
      },
    } as unknown as ClipboardEvent;

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: {
        replaceSelection,
        doc: { toString: () => currentMarkdown },
        selection: { ranges: [{ from: 1, to: 4 }] },
        sliceDoc: (from: number, to: number) => "Intro".slice(from, to),
      },
      dispatch,
    })).toBe(true);

    const placeholder = replaceSelection.mock.calls[0]?.[0];
    if (!placeholder) throw new Error("Expected paste placeholder");

    upload.reject(new Error("upload failed"));

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Image paste failed");
    });
    expect(dispatch).toHaveBeenCalledWith({
      changes: [
        {
          from: 7,
          to: 7 + placeholder.length,
          insert: "ntr",
        },
      ],
    });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          insert: "![clipboard.png](/api/attachments/attachment-1)",
        }),
      }),
    );
  });

  it("keeps rich HTML paste behavior when no image file is present", async () => {
    const pasteImageAttachmentAction = vi.fn(async () => ({
      markdown: "![clipboard.png](/api/attachments/attachment-1)",
    }));
    renderEditor("Intro", { pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const preventDefault = vi.fn();
    const dispatch = vi.fn();
    const replaceSelection = vi.fn((text: string) => ({ changes: text }));
    const event = {
      preventDefault,
      clipboardData: {
        files: [],
        items: [],
        getData: (type: string) => (type === "text/html" ? "<p><strong>Styled</strong></p>" : "Styled"),
      },
    } as unknown as ClipboardEvent;

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: { replaceSelection },
      dispatch,
    })).toBe(true);

    expect(pasteImageAttachmentAction).not.toHaveBeenCalled();
    expect(replaceSelection).toHaveBeenCalledWith("**Styled**");
  });

  it("uploads image tags from rich HTML clipboard content instead of pasting only the source link", async () => {
    const upload = createDeferred<{ markdown: string }>();
    const pasteImageAttachmentAction = vi.fn((_formData: FormData) => upload.promise);
    renderEditor("Intro", { pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const preventDefault = vi.fn();
    let currentMarkdown = "Intro";
    const replaceSelection = vi.fn((text: string) => ({ changes: { from: 5, to: 5, insert: text } }));
    const dispatch = vi.fn((transaction: { changes?: { insert?: string } | Array<{ insert: string }> }) => {
      if (Array.isArray(transaction.changes)) {
        currentMarkdown = `Intro ${transaction.changes[0]?.insert ?? ""}`;
      } else if (typeof transaction.changes?.insert === "string") {
        currentMarkdown = `Intro ${transaction.changes.insert}`;
      }
    });
    const event = {
      preventDefault,
      clipboardData: {
        files: [],
        items: [],
        getData: (type: string) =>
          type === "text/html"
            ? '<p>Before <a href="https://example.com/source.png"><img src="data:image/png;base64,aW1hZ2U=" alt="diagram"></a> after</p>'
            : "",
      },
    } as unknown as ClipboardEvent;

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: {
        replaceSelection,
        doc: { toString: () => currentMarkdown },
        selection: { ranges: [{ from: 5, to: 5 }] },
        sliceDoc: () => "",
      },
      dispatch,
    })).toBe(true);

    await vi.waitFor(() => {
      expect(pasteImageAttachmentAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const formData = pasteImageAttachmentAction.mock.calls[0]?.[0];
    if (!formData) throw new Error("Expected image paste FormData");
    expect(formData.get("documentId")).toBe("doc-1");
    expect((formData.get("attachment") as File).name).toBe("diagram.png");

    const insertedMarkdown = replaceSelection.mock.calls[0]?.[0];
    if (!insertedMarkdown) throw new Error("Expected inserted markdown");
    const placeholder = insertedMarkdown.match(/!\[Uploading image\.\.\.\]\(about:blank#munjib-paste-[^)]+\)/)?.[0];
    if (!placeholder) throw new Error("Expected pasted image placeholder");
    expect(insertedMarkdown).toBe(`Before ${placeholder} after`);
    expect(insertedMarkdown).not.toContain("https://example.com/source.png");

    upload.resolve({ markdown: "![diagram.png](/api/attachments/attachment-1)" });

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        changes: [
          {
            from: 13,
            to: 13 + placeholder.length,
            insert: "![diagram.png](/api/attachments/attachment-1)",
          },
        ],
      });
    });
  });

  it("sends remote image tags from rich HTML paste to the server without client-side fetch", async () => {
    const upload = createDeferred<{ markdown: string }>();
    const pasteImageAttachmentAction = vi.fn((_formData: FormData) => upload.promise);
    renderEditor("Intro", { pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const preventDefault = vi.fn();
    const replaceSelection = vi.fn((text: string) => ({ changes: { from: 5, to: 5, insert: text } }));
    const dispatch = vi.fn();
    const event = {
      preventDefault,
      clipboardData: {
        files: [],
        items: [],
        getData: (type: string) =>
          type === "text/html"
            ? '<p><a href="https://example.com/source.png"><img src="https://cdn.example.com/source.png" alt="remote diagram"></a></p>'
            : "",
      },
    } as unknown as ClipboardEvent;

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: {
        replaceSelection,
        doc: { toString: () => "Intro" },
        selection: { ranges: [{ from: 5, to: 5 }] },
        sliceDoc: () => "",
      },
      dispatch,
    })).toBe(true);

    await vi.waitFor(() => {
      expect(pasteImageAttachmentAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const formData = pasteImageAttachmentAction.mock.calls[0]?.[0];
    if (!formData) throw new Error("Expected image paste FormData");
    expect(formData.get("attachment")).toBeNull();
    expect(formData.get("imageUrl")).toBe("https://cdn.example.com/source.png");
    expect(formData.get("fileName")).toBe("source");
    expect(replaceSelection.mock.calls[0]?.[0]).not.toContain("https://example.com/source.png");

    upload.resolve({ markdown: "![source.png](/api/attachments/attachment-1)" });
  });

  it("clears pending state when rich HTML image form data creation fails", async () => {
    const pasteImageAttachmentAction = vi.fn(async (_formData: FormData) => ({
      markdown: "![source.png](/api/attachments/attachment-1)",
    }));
    renderEditor("Intro", { pasteImageAttachmentAction });

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    const preventDefault = vi.fn();
    const replaceSelection = vi.fn((text: string) => ({ changes: { from: 5, to: 5, insert: text } }));
    let currentMarkdown = "Intro";
    const dispatch = vi.fn((transaction: { changes?: { insert?: string } | Array<{ insert: string }> }) => {
      if (Array.isArray(transaction.changes)) {
        currentMarkdown = `Intro ${transaction.changes[0]?.insert ?? ""}`;
      } else if (typeof transaction.changes?.insert === "string") {
        currentMarkdown = `Intro ${transaction.changes.insert}`;
      }
    });
    const event = {
      preventDefault,
      clipboardData: {
        files: [],
        items: [],
        getData: (type: string) =>
          type === "text/html"
            ? '<p><img src="data:text/plain;base64,aW1hZ2U=" alt="fallback"></p>'
            : "",
      },
    } as unknown as ClipboardEvent;

    expect(codeMirrorHarness.pasteHandlers[0](event, {
      state: {
        replaceSelection,
        doc: { toString: () => currentMarkdown },
        selection: { ranges: [{ from: 5, to: 5 }] },
        sliceDoc: () => "",
      },
      dispatch,
    })).toBe(true);

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Image paste failed");
    });
    expect(pasteImageAttachmentAction).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i }).hasAttribute("disabled")).toBe(false);
    });
  });
});

describe("DocumentEditor properties", () => {
  it("does not render a frontmatter none row when a document has no frontmatter", () => {
    renderEditor("# Body tag\n\nUse #graph-only", {
      tags: [{ id: "tag-graph", name: "graph-only" }],
      properties: [],
    });

    const properties = screen.getByRole("region", { name: "Document properties" });

    expect(within(properties).queryByText("frontmatter")).toBeNull();
    expect(within(properties).queryByText("#graph-only")).toBeNull();
  });

  it("renders only frontmatter tags in the Properties tags row", () => {
    renderEditor("---\ntags:\n  - platform\n  - review\n---\n\nUse #graph-only", {
      tags: [
        { id: "tag-platform", name: "platform" },
        { id: "tag-review", name: "review" },
        { id: "tag-graph", name: "graph-only" },
      ],
      properties: [
        { id: "property-tags", key: "tags", valueJson: ["platform", "review"] },
      ],
    });

    const properties = screen.getByRole("region", { name: "Document properties" });

    expect(within(properties).getByText("#platform")).toBeTruthy();
    expect(within(properties).getByText("#review")).toBeTruthy();
    expect(within(properties).queryByText("#graph-only")).toBeNull();
  });

  it("requests sidebar tag search when a frontmatter tag chip is clicked", () => {
    render(
      <AppShell
        left={<TagSearchReceiver />}
        center={
          <DocumentViewModeProvider>
            <DocumentEditor
              {...baseProps}
              document={{
                id: "doc-1",
                title: "Tagged",
                contentMarkdown: "---\ntags:\n  - LangChain\n---\n\nBody",
              }}
              properties={[
                { id: "property-tags", key: "tags", valueJson: ["LangChain"] },
              ]}
            />
          </DocumentViewModeProvider>
        }
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag #LangChain" }));

    expect(screen.getByTestId("tag-search-request").textContent).toBe("LangChain");
  });

  it("requests sidebar tag search when a preview body tag is clicked", () => {
    render(
      <AppShell
        left={<TagSearchReceiver />}
        center={
          <DocumentViewModeProvider>
            <DocumentEditor
              {...baseProps}
              document={{
                id: "doc-1",
                title: "Tagged",
                contentMarkdown: "Use #LangChain today",
              }}
            />
          </DocumentViewModeProvider>
        }
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag #LangChain" }));

    expect(screen.getByTestId("tag-search-request").textContent).toBe("LangChain");
  });

  it("requests sidebar tag search when a Korean preview body tag is clicked", () => {
    render(
      <AppShell
        left={<TagSearchReceiver />}
        center={
          <DocumentViewModeProvider>
            <DocumentEditor
              {...baseProps}
              document={{
                id: "doc-1",
                title: "Tagged",
                contentMarkdown: "관련 내용 #로드맵 확인",
              }}
            />
          </DocumentViewModeProvider>
        }
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag #로드맵" }));

    expect(screen.getByTestId("tag-search-request").textContent).toBe("로드맵");
  });

  it("requests sidebar tag search from formatted and structured preview tags", () => {
    render(
      <AppShell
        left={<TagSearchReceiver />}
        center={
          <DocumentViewModeProvider>
            <DocumentEditor
              {...baseProps}
              document={{
                id: "doc-1",
                title: "Tagged",
                contentMarkdown:
                  "# #제목\n\nUse **#강조** today\n\n> #인용\n\n| Column |\n| --- |\n| #표 |",
              }}
            />
          </DocumentViewModeProvider>
        }
        right={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search tag #제목" }));
    expect(screen.getByTestId("tag-search-request").textContent).toBe("제목");

    fireEvent.click(screen.getByRole("button", { name: "Search tag #강조" }));
    expect(screen.getByTestId("tag-search-request").textContent).toBe("강조");

    fireEvent.click(screen.getByRole("button", { name: "Search tag #인용" }));
    expect(screen.getByTestId("tag-search-request").textContent).toBe("인용");

    fireEvent.click(screen.getByRole("button", { name: "Search tag #표" }));
    expect(screen.getByTestId("tag-search-request").textContent).toBe("표");
  });

  it("does not rewrite tags inside markdown links into nested buttons", () => {
    render(
      <AppShell
        left={<TagSearchReceiver />}
        center={
          <DocumentViewModeProvider>
            <DocumentEditor
              {...baseProps}
              document={{
                id: "doc-1",
                title: "Tagged",
                contentMarkdown: "See [docs #링크](https://example.com)",
              }}
            />
          </DocumentViewModeProvider>
        }
        right={<div />}
      />,
    );

    expect(screen.getByRole("link", { name: "docs #링크" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Search tag #링크" })).toBeNull();
  });

  it("does not rewrite tags inside inline code into buttons", () => {
    render(
      <AppShell
        left={<TagSearchReceiver />}
        center={
          <DocumentViewModeProvider>
            <DocumentEditor
              {...baseProps}
              document={{
                id: "doc-1",
                title: "Tagged",
                contentMarkdown: "Use `#코드` and #본문",
              }}
            />
          </DocumentViewModeProvider>
        }
        right={<div />}
      />,
    );

    expect(screen.queryByRole("button", { name: "Search tag #코드" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search tag #본문" })).toBeTruthy();
  });

  it("preserves markdown table alignment while linking table cell tags", () => {
    render(
      <AppShell
        left={<TagSearchReceiver />}
        center={
          <DocumentViewModeProvider>
            <DocumentEditor
              {...baseProps}
              document={{
                id: "doc-1",
                title: "Tagged",
                contentMarkdown: "| Column |\n| :---: |\n| #표 |",
              }}
            />
          </DocumentViewModeProvider>
        }
        right={<div />}
      />,
    );

    const header = screen.getByRole("columnheader", { name: "Column" }) as HTMLElement;
    const cell = screen.getByRole("cell") as HTMLElement;

    expect(header.getAttribute("align") === "center" || header.style.textAlign === "center").toBe(
      true,
    );
    expect(cell.getAttribute("align") === "center" || cell.style.textAlign === "center").toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Search tag #표" })).toBeTruthy();
  });

  it("renders object and null frontmatter property values without placeholder strings", () => {
    renderEditor("---\nsettings:\n  enabled: true\nempty:\n---\n\nBody", {
      properties: [
        { id: "property-settings", key: "settings", valueJson: { enabled: true } },
        { id: "property-empty", key: "empty", valueJson: null },
      ],
    });

    const properties = screen.getByRole("region", { name: "Document properties" });

    expect(within(properties).getByText('{"enabled":true}')).toBeTruthy();
    expect(within(properties).queryByText("[object Object]")).toBeNull();
    expect(within(properties).queryByText("null")).toBeNull();
  });
});
