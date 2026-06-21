// @vitest-environment jsdom
import React, { useEffect } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Attachment, AuditLog, DocumentVersion } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell, useHeadingNavigation } from "@/components/app-shell";
import { I18nProvider } from "@/components/i18n-provider";
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
