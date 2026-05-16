// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Attachment, AuditLog, DocumentVersion } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetadataPanel } from "@/components/metadata-panel";

afterEach(() => {
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

function renderPanel(props: Partial<Parameters<typeof MetadataPanel>[0]> = {}) {
  return render(
    <MetadataPanel
      versions={versions}
      auditLogs={auditLogs}
      attachments={attachments}
      canWrite
      restoreVersionAction={async () => {}}
      onTogglePanel={vi.fn()}
      {...props}
    />,
  );
}

describe("MetadataPanel", () => {
  it("opens metadata lists from the tab toolbar without rendering a local graph", () => {
    renderPanel();

    expect(screen.queryByText("Local graph")).toBeNull();
    expect(screen.queryByRole("img", { name: /Local graph/ })).toBeNull();
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
