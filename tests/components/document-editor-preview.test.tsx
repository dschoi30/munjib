// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { AppShell, useHeadingNavigation } from "@/components/app-shell";
import { DocumentEditor } from "@/components/document-editor";
import { DocumentViewModeProvider, useDocumentViewMode } from "@/components/document-view-mode";

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
});

const baseProps = {
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
          insert: "",
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
