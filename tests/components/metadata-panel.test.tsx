// @vitest-environment jsdom
import React, { useEffect } from "react";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import type { Attachment, AuditLog, DocumentVersion } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, useHeadingNavigation, useRightPanel } from "@/components/app-shell";
import { I18nProvider } from "@/components/i18n-provider";
import { WorkspaceModeProvider } from "@/components/workspace-mode";
import { MetadataPanel } from "@/components/metadata-panel";

afterEach(() => {
  window.document.querySelectorAll("[data-outline-heading-id]").forEach((target) => {
    target.remove();
  });
  window.localStorage.clear();
  cleanup();
});

const versions: DocumentVersion[] = [
  {
    id: "version-2",
    documentId: "doc-1",
    versionNumber: 2,
    title: "Welcome",
    contentMarkdown: "# Welcome",
    createdById: "user-1",
    changeSummary: "Updated document",
    createdAt: new Date("2026-05-16T00:00:00.000Z"),
  },
];

const auditLogs: AuditLog[] = [
  {
    id: "log-1",
    organizationId: "org-1",
    actorId: "user-1",
    action: "document.updated",
    resourceType: "document",
    resourceId: "doc-1",
    metadataJson: {},
    createdAt: new Date("2026-05-16T00:00:00.000Z"),
  },
];

const attachments: Attachment[] = [
  {
    id: "attachment-1",
    documentId: "doc-1",
    fileName: "notes.txt",
    mimeType: "text/plain",
    size: 2048,
    storageKey: "attachments/doc-1/notes.txt",
    uploadedById: "user-1",
    createdAt: new Date("2026-05-16T00:00:00.000Z"),
  },
];

const outlineDocument = {
  id: "doc-1",
  contentMarkdown: "# Welcome\n\n## Setup\n\n### Install\n\n#### Env\n\n##### Hidden",
};

function renderPanel(props: Partial<Parameters<typeof MetadataPanel>[0]> = {}) {
  return renderWithI18n(
    <MetadataPanel
      document={outlineDocument}
      versions={versions}
      auditLogs={auditLogs}
      attachments={attachments}
      canWrite
      restoreVersionAction={async () => {}}
      onTogglePanel={vi.fn()}
      onNavigateToHeading={vi.fn()}
      {...props}
    />,
  );
}

function renderPanelInAppShell(props: Partial<Parameters<typeof MetadataPanel>[0]> = {}) {
  return renderWithI18n(
    <AppShell
      left={<div>Left</div>}
      center={<div>Center</div>}
      right={
        <MetadataPanel
          document={outlineDocument}
          versions={versions}
          auditLogs={auditLogs}
          attachments={attachments}
          canWrite
          restoreVersionAction={async () => {}}
          onTogglePanel={vi.fn()}
          onNavigateToHeading={undefined}
          {...props}
        />
      }
    />,
  );
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function UnhandledHeadingNavigator() {
  const headingNavigation = useHeadingNavigation();
  const setHeadingNavigator = headingNavigation?.setHeadingNavigator;

  useEffect(() => {
    setHeadingNavigator?.(() => false);
    return () => setHeadingNavigator?.(null);
  }, [setHeadingNavigator]);

  return <div>Unhandled navigator</div>;
}

function LiveOutlineDocumentProbe({ contentMarkdown }: { contentMarkdown: string }) {
  const headingNavigation = useHeadingNavigation();
  const setOutlineDocument = headingNavigation?.setOutlineDocument;

  useEffect(() => {
    setOutlineDocument?.({ id: "doc-1", contentMarkdown });
    return () => setOutlineDocument?.(null);
  }, [contentMarkdown, setOutlineDocument]);

  return <div>Live outline document</div>;
}

describe("MetadataPanel", () => {
  it("opens outline by default and switches metadata lists from the tab toolbar", () => {
    renderPanel();

    expect(screen.queryByText("Local graph")).toBeNull();
    expect(screen.queryByRole("img", { name: /Local graph/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Outline" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Outline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to heading Welcome" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to heading Setup" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go to heading Hidden" })).toBeNull();
    expect(screen.queryByRole("link", { name: "notes.txt" })).toBeNull();
    expect(screen.queryByText("v2")).toBeNull();
    expect(screen.queryByText("document.updated")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Attachments" }));
    expect(screen.getByRole("link", { name: "notes.txt" })).toBeTruthy();
    expect(screen.queryByText("v2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(screen.getByText("v2")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "notes.txt" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Audit log" }));
    expect(screen.getByText("document.updated")).toBeTruthy();
    expect(screen.queryByText("v2")).toBeNull();
  });

  it("uses the selected Korean display language for metadata panel chrome", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    renderPanel();

    expect(await screen.findByRole("button", { name: "개요" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "첨부 파일" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "버전" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "감사 로그" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "메타데이터 패널 닫기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Welcome 제목으로 이동" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "버전" }));
    expect(screen.getByRole("button", { name: "복원" })).toBeTruthy();
  });

  it("uses the selected Korean display language for metadata empty states", async () => {
    window.localStorage.setItem("munjib:language", "ko");

    renderPanel({
      document: { id: "doc-1", contentMarkdown: "Body only" },
      versions: [],
      auditLogs: [],
      attachments: [],
    });

    expect(await screen.findByText("개요 제목 없음")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "첨부 파일" }));
    expect(screen.getByText("첨부 파일 없음")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "버전" }));
    expect(screen.getByText("버전 없음")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "감사 로그" }));
    expect(screen.getByText("감사 로그 없음")).toBeTruthy();
  });

  it("navigates to outline headings", () => {
    const onNavigateToHeading = vi.fn();

    renderPanel({ onNavigateToHeading });

    fireEvent.click(screen.getByRole("button", { name: "Go to heading Install" }));

    expect(onNavigateToHeading).toHaveBeenCalledWith({
      id: "1-welcome-0/2-setup-0/3-install-0",
      lineNumber: 5,
    });
  });

  it("scrolls to a matching outline target when no navigation callback is provided", () => {
    const scrollIntoView = vi.fn();
    const target = window.document.createElement("h2");
    target.setAttribute("data-outline-heading-id", "1-welcome-0/2-setup-0");
    target.scrollIntoView = scrollIntoView;
    window.document.body.appendChild(target);

    renderPanel({ onNavigateToHeading: undefined });

    fireEvent.click(screen.getByRole("button", { name: "Go to heading Setup" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("scrolls to a matching outline target when AppShell has no registered navigator", () => {
    const scrollIntoView = vi.fn();
    const target = window.document.createElement("h2");
    target.setAttribute("data-outline-heading-id", "1-welcome-0/2-setup-0");
    target.scrollIntoView = scrollIntoView;
    window.document.body.appendChild(target);

    renderPanelInAppShell();

    fireEvent.click(screen.getByRole("button", { name: "Go to heading Setup" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("falls back to a matching outline target when AppShell navigator does not handle it", () => {
    const scrollIntoView = vi.fn();
    const target = window.document.createElement("h2");
    target.setAttribute("data-outline-heading-id", "1-welcome-0/2-setup-0");
    target.scrollIntoView = scrollIntoView;
    window.document.body.appendChild(target);

    renderWithI18n(
      <AppShell
        left={<div>Left</div>}
        center={<UnhandledHeadingNavigator />}
        right={
          <MetadataPanel
            document={outlineDocument}
            versions={versions}
            auditLogs={auditLogs}
            attachments={attachments}
            canWrite
            restoreVersionAction={async () => {}}
            onTogglePanel={vi.fn()}
          />
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Go to heading Setup" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("uses the live outline document from AppShell when it matches the selected document", () => {
    renderWithI18n(
      <AppShell
        left={<div>Left</div>}
        center={
          <LiveOutlineDocumentProbe
            contentMarkdown={"# Live Draft\n\n## Unsaved Heading"}
          />
        }
        right={
          <MetadataPanel
            document={{ id: "doc-1", contentMarkdown: "# Saved Heading" }}
            versions={versions}
            auditLogs={auditLogs}
            attachments={attachments}
            canWrite
            restoreVersionAction={async () => {}}
            onTogglePanel={vi.fn()}
          />
        }
      />,
    );

    expect(screen.getByRole("button", { name: "Go to heading Live Draft" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to heading Unsaved Heading" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go to heading Saved Heading" })).toBeNull();
  });

  it("shows an empty state when the document has no outline headings", () => {
    renderPanel({ document: { id: "doc-1", contentMarkdown: "Body only" } });

    expect(screen.getByText("No outline headings")).toBeTruthy();
  });

  it("shows empty states for versions and audit log tabs", () => {
    renderPanel({ versions: [], auditLogs: [] });

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(screen.getByText("No versions")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Audit log" }));
    expect(screen.getByText("No audit logs")).toBeTruthy();
  });

  it("exposes a right-side collapse control", () => {
    const onTogglePanel = vi.fn();

    renderPanel({ onTogglePanel });

    fireEvent.click(screen.getByRole("button", { name: "Close metadata panel" }));

    expect(onTogglePanel).toHaveBeenCalledOnce();
  });

  it("shows tooltips for metadata toolbar icons on hover", async () => {
    renderPanel();

    fireEvent.pointerMove(screen.getByRole("button", { name: "Versions" }));

    expect(await screen.findByRole("tooltip", { name: "Versions" })).toBeTruthy();
  });
});


describe("MetadataPanel document groups", () => {
  const documents = [
    { document: { id: "a", title: "Document A", path: "folder/a", contentMarkdown: "# Alpha" }, versions: [], auditLogs: [], attachments: [], canWrite: true },
    { document: { id: "b", title: "Document B", path: "folder/b", contentMarkdown: "# Beta" }, versions: [], auditLogs: [], attachments: [], canWrite: false },
  ];

  it("opens and highlights an uploaded attachment in its own collapsed document group", () => {
    function UploadResult() {
      const panel = useRightPanel();
      return <button onClick={() => panel?.showAttachments("b", "attachment-1")}>Upload result</button>;
    }
    renderWithI18n(<AppShell left={<div />} center={<UploadResult />} right={
      <MetadataPanel documents={[documents[0], { ...documents[1], attachments }]} restoreVersionAction={async () => {}} />
    } />);
    fireEvent.click(screen.getByRole("button", { name: "Attachments" }));
    fireEvent.click(screen.getByRole("button", { name: "Document B" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload result" }));
    const attachment = screen.getByRole("link", { name: "notes.txt" });
    expect(attachment.closest("li")?.className).toContain("border-green-600");
    expect(screen.getByRole("button", { name: "Document B" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("restores disclosure state by document ID across reordering without changing focused document", () => {
    const onExpandedChange = vi.fn();
    const onNavigateToDocumentHeading = vi.fn();
    const { rerender } = renderPanel({ documents, expanded: { a: { outline: false } }, onExpandedChange, onNavigateToDocumentHeading });
    fireEvent.click(screen.getByRole("button", { name: "Document A" }));
    expect(onExpandedChange).toHaveBeenCalledWith("a", "outline", true);
    expect(onNavigateToDocumentHeading).not.toHaveBeenCalled();
    rerender(<I18nProvider><MetadataPanel documents={[documents[1], documents[0]]} expanded={{ a: { outline: false } }} restoreVersionAction={async () => {}} /></I18nProvider>);
    expect(screen.getByRole("button", { name: "Document A" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Document B" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("shows document names once beside disclosures and promotes children of a matching first H1", () => {
    renderPanel({ documents: documents.map(bundle => ({ ...bundle, document: { ...bundle.document, title: "Same title", contentMarkdown: "# Same title\n## Child section" } })) });
    expect(screen.getByRole("button", { name: "Same title folder/a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Same title folder/b" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Same title folder/a" }).textContent).toBe("Same title");
    expect(screen.getAllByText("Same title")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Go to heading Same title" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Go to heading Child section" })).toHaveLength(2);
    expect(screen.queryByText("folder/a")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("targets heading navigation by document even when headings match", () => {
    const onNavigateToDocumentHeading = vi.fn();
    renderPanel({ documents: documents.map((bundle) => ({ ...bundle, document: { ...bundle.document, contentMarkdown: `# ${bundle.document.title}\n# Same` } })), onNavigateToDocumentHeading });
    fireEvent.click(screen.getAllByRole("button", { name: "Go to heading Same" })[1]);
    expect(onNavigateToDocumentHeading).toHaveBeenCalledWith("b", { id: "1-same-0", lineNumber: 2 });
  });

  it("submits the selected document version and respects each document write permission", async () => {
    const restoreVersionAction = vi.fn(async (_data: FormData) => {});
    renderPanel({ documents: documents.map((bundle, index) => ({ ...bundle, versions: [{ ...versions[0], id: `version-${bundle.document.id}`, versionNumber: index + 1 }] })), restoreVersionAction });
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    const buttons = screen.getAllByRole("button", { name: "Restore" });
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(restoreVersionAction).toHaveBeenCalled());
    expect(restoreVersionAction.mock.calls[0][0].get("versionId")).toBe("version-a");
  });

  it("keeps each document's empty result and attachment list in the matching group", () => {
    renderPanel({ documents: [documents[0], { ...documents[1], attachments }] });
    fireEvent.click(screen.getByRole("button", { name: "Attachments" }));
    const groupA = screen.getByRole("button", { name: "Document A" }).closest("section")!;
    const groupB = screen.getByRole("button", { name: "Document B" }).closest("section")!;
    expect(within(groupA).getByText("No attachments")).toBeTruthy();
    expect(within(groupA).queryByRole("link")).toBeNull();
    expect(within(groupB).getByRole("link", { name: "notes.txt" }).getAttribute("href")).toBe("/api/attachments/attachment-1?download=1");
  });

  it("keeps loading and errors inside their own document groups", () => {
    const onRetryDocument = vi.fn();
    renderPanel({ documents: [{ ...documents[0], loading: true }, { ...documents[1], error: "Could not load document" }], onRetryDocument });
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(screen.getByRole("alert").textContent).toContain("Could not load document");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryDocument).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("button", { name: "Go to heading Alpha" })).toBeNull();
  });

  it("preserves the legacy read-only Trial attachment route", () => {
    renderWithI18n(<WorkspaceModeProvider mode="anonymous-trial-readonly"><MetadataPanel document={outlineDocument} attachments={attachments} versions={versions} canWrite={false} restoreVersionAction={async () => {}} /></WorkspaceModeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Attachments" }));
    expect(screen.getByRole("link", { name: "notes.txt" }).getAttribute("href")).toBe("/api/trial/attachments/attachment-1?download=1");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Attachments" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect((screen.getByRole("button", { name: "Restore" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows one category heading and independently collapses document content with named arrow controls", () => {
    const onNavigateToDocumentHeading = vi.fn();
    renderPanel({ documents, onNavigateToDocumentHeading });
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Outline" })).toBeTruthy();
    expect(screen.getAllByText("Document A")).toHaveLength(1);
    expect(screen.getAllByText("Document B")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Document A" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Document A" }));
    expect(screen.queryByRole("button", { name: "Go to heading Alpha" })).toBeNull();
    expect(screen.getByRole("button", { name: "Go to heading Beta" })).toBeTruthy();
    expect(onNavigateToDocumentHeading).not.toHaveBeenCalled();
    for (const category of ["Attachments", "Versions", "Audit log"]) {
      fireEvent.click(screen.getByRole("button", { name: category }));
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
      expect(screen.getByRole("heading", { name: category })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Document A" }).getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByRole("button", { name: "Document B" }).getAttribute("aria-expanded")).toBe("true");
    }
    fireEvent.click(screen.getByRole("button", { name: "Outline" }));
    expect(screen.getByRole("button", { name: "Document A" }).getAttribute("aria-expanded")).toBe("false");
  });
});
