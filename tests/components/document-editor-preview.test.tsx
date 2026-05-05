// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentEditor } from "@/components/document-editor";

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, "aria-label": ariaLabel }: { value: string; "aria-label": string }) => (
    <textarea aria-label={ariaLabel} readOnly value={value} />
  ),
}));

beforeEach(() => {
  let store: Record<string, string> = {};

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
});
