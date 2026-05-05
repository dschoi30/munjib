// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { DocumentEditor } from "@/components/document-editor";

const codeMirrorHarness = vi.hoisted(() => ({
  updateListeners: [] as Array<(update: unknown) => void>,
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    "aria-label": ariaLabel,
    extensions,
  }: {
    value: string;
    "aria-label": string;
    extensions?: unknown[];
  }) => {
    codeMirrorHarness.updateListeners = findUpdateListeners(extensions ?? []);

    return <textarea aria-label={ariaLabel} readOnly value={value} />;
  },
}));

beforeEach(() => {
  let store: Record<string, string> = {};
  codeMirrorHarness.updateListeners = [];

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
  linkCandidates: [],
  tags: [],
  properties: [],
  comments: [],
  linkPanels: { outgoing: [], backlinks: [], brokenLinks: [], ambiguousLinks: [] },
  createFromBrokenLinkAction: async () => {},
  createCommentAction: async () => {},
};

function renderEditor(markdown: string, props: Partial<Parameters<typeof DocumentEditor>[0]> = {}) {
  return render(
    <DocumentEditor
      {...baseProps}
      {...props}
      document={{ id: "doc-1", title: "Foldable", contentMarkdown: markdown }}
    />,
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

function createFoldedRangeUpdate(fromLine: number, toLine: number) {
  const lineOffsets = new Map([
    [1, { from: 0, to: 3 }],
    [2, { from: 4, to: 8 }],
    [3, { from: 9, to: 12 }],
    [4, { from: 13, to: 18 }],
  ]);
  const doc = {
    length: 18,
    lineAt(position: number) {
      for (const [number, offsets] of lineOffsets) {
        if (position >= offsets.from && position <= offsets.to) {
          return { number, ...offsets };
        }
      }

      throw new Error(`No line at ${position}`);
    },
  };
  const from = lineOffsets.get(fromLine)?.from ?? 0;
  const to = lineOffsets.get(toLine)?.to ?? 0;

  return {
    view: {
      state: {
        doc,
        field: () => ({
          between: (_from: number, _to: number, callback: (from: number, to: number) => void) => {
            callback(from, to);
          },
        }),
      },
    },
  };
}

describe("DocumentEditor heading preview folding", () => {
  it("removes split mode and opens preview mode by default", () => {
    renderEditor("# A\nBody");

    expect(screen.queryByRole("button", { name: /split/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "A" })).toBeTruthy();
  });

  it("folds and unfolds a preview heading section", () => {
    renderEditor("# A\nVisible body\n# B\nOther body");

    const toggle = screen.getByRole("button", { name: "Collapse section A" });
    expect(screen.getByText("Visible body")).toBeTruthy();

    fireEvent.click(toggle);

    expect(screen.queryByText("Visible body")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand section A" }).getAttribute("aria-expanded")).toBe(
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand section A" }));

    expect(screen.getByText("Visible body")).toBeTruthy();
  });

  it("restores folded headings from document localStorage", () => {
    window.localStorage.setItem("munjib:heading-folds:doc-1", "[\"1-a-0\"]");

    renderEditor("# A\nStored body");

    expect(screen.queryByText("Stored body")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand section A" })).toBeTruthy();
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

  it("persists edit-mode folded heading ranges to document localStorage", async () => {
    renderEditor("# A\nLine\n# B\nOther");

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    await screen.findByLabelText("Markdown editor");

    expect(codeMirrorHarness.updateListeners).toHaveLength(1);

    codeMirrorHarness.updateListeners[0](createFoldedRangeUpdate(2, 2));

    expect(window.localStorage.getItem("munjib:heading-folds:doc-1")).toBe("[\"1-a-0\"]");
  });
});
