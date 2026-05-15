"use client";

import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentTabs } from "@/components/document-tabs";
import { DocumentToolbar } from "@/components/document-toolbar";
import {
  DocumentViewModeProvider,
  useDocumentViewMode,
  type DocumentViewMode,
} from "@/components/document-view-mode";
import { useDocumentTabs } from "@/components/use-document-tabs";
import type { DocumentTabDocument } from "@/lib/document-tabs";

type WorkspaceCenterShellProps = {
  workspaceSlug: string;
  documents: DocumentTabDocument[];
  selectedDocument: DocumentTabDocument | null;
  selectedFolder: { path: string } | null;
  isGraphView?: boolean;
  children: React.ReactNode;
};

export function WorkspaceCenterShell({
  workspaceSlug,
  documents,
  selectedDocument,
  selectedFolder,
  isGraphView = false,
  children,
}: WorkspaceCenterShellProps) {
  return (
    <DocumentViewModeProvider>
      <WorkspaceCenterShellContent
        workspaceSlug={workspaceSlug}
        documents={documents}
        selectedDocument={selectedDocument}
        selectedFolder={selectedFolder}
        isGraphView={isGraphView}
      >
        {children}
      </WorkspaceCenterShellContent>
    </DocumentViewModeProvider>
  );
}

function WorkspaceCenterShellContent({
  workspaceSlug,
  documents,
  selectedDocument,
  selectedFolder,
  isGraphView = false,
  children,
}: WorkspaceCenterShellProps) {
  const router = useRouter();
  const { setMode } = useDocumentViewMode();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollTopBeforeModeChangeRef = useRef<number | null>(null);
  const { tabs, activeTabId, closeTab, selectTab, createNewTab } = useDocumentTabs({
    workspaceSlug,
    documents,
    selectedDocument,
  });
  const [documentHistory, setDocumentHistory] = useState(() => ({
    ids: selectedDocument ? [selectedDocument.id] : [],
    index: selectedDocument ? 0 : -1,
  }));
  const readableDocumentIds = useMemo(() => new Set(documents.map((document) => document.id)), [documents]);

  useEffect(() => {
    if (!selectedDocument) {
      return;
    }

    setMode("preview");
  }, [selectedDocument?.id, setMode]);

  useEffect(() => {
    if (!selectedDocument) {
      return;
    }

    setDocumentHistory((current) => {
      if (current.index >= 0 && current.ids[current.index] === selectedDocument.id) {
        return current;
      }

      const retainedIds = current.index >= 0 ? current.ids.slice(0, current.index + 1) : current.ids;
      const nextIds = [...retainedIds, selectedDocument.id];
      return { ids: nextIds, index: nextIds.length - 1 };
    });
  }, [selectedDocument]);

  const canNavigateBack =
    documentHistory.index > 0 &&
    readableDocumentIds.has(documentHistory.ids[documentHistory.index - 1] ?? "");
  const canNavigateForward =
    documentHistory.index >= 0 &&
    documentHistory.index < documentHistory.ids.length - 1 &&
    readableDocumentIds.has(documentHistory.ids[documentHistory.index + 1] ?? "");

  useLayoutEffect(() => {
    const scrollTop = scrollTopBeforeModeChangeRef.current;
    const element = scrollContainerRef.current;

    if (scrollTop === null || !element) {
      return;
    }

    const restoreScroll = () => {
      element.scrollTop = scrollTop;
    };

    restoreScroll();
    const animationFrame = window.requestAnimationFrame(restoreScroll);
    scrollTopBeforeModeChangeRef.current = null;

    return () => window.cancelAnimationFrame(animationFrame);
  });

  function openDocument(documentId: string | null) {
    if (!documentId) {
      router.push(`/workspaces/${workspaceSlug}`);
      return;
    }

    router.push(`/workspaces/${workspaceSlug}?document=${documentId}`);
  }

  function handleSelect(tabId: string) {
    openDocument(selectTab(tabId));
  }

  function handleClose(tabId: string) {
    const result = closeTab(tabId);
    if (result.closedWasActive) {
      openDocument(result.nextDocumentId);
    }
  }

  function handleAdd() {
    createNewTab();
    openDocument(null);
  }

  function handleNavigateBack() {
    if (!canNavigateBack) {
      return;
    }

    const nextIndex = documentHistory.index - 1;
    const targetDocumentId = documentHistory.ids[nextIndex] ?? null;
    setDocumentHistory((current) => ({ ...current, index: nextIndex }));

    if (targetDocumentId) {
      openDocument(targetDocumentId);
    }
  }

  function handleNavigateForward() {
    if (!canNavigateForward) {
      return;
    }

    const nextIndex = documentHistory.index + 1;
    const targetDocumentId = documentHistory.ids[nextIndex] ?? null;
    setDocumentHistory((current) => ({ ...current, index: nextIndex }));

    if (targetDocumentId) {
      openDocument(targetDocumentId);
    }
  }

  function handleModeChange(nextMode: DocumentViewMode) {
    scrollTopBeforeModeChangeRef.current = scrollContainerRef.current?.scrollTop ?? null;
    setMode(nextMode);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <DocumentTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={handleSelect}
        onClose={handleClose}
        onAdd={handleAdd}
      />
      <DocumentToolbar
        path={isGraphView ? "Graph view" : selectedDocument?.path ?? selectedFolder?.path ?? "/"}
        canNavigateBack={canNavigateBack}
        canNavigateForward={canNavigateForward}
        showModeToggle={Boolean(selectedDocument) && !isGraphView}
        onModeChange={handleModeChange}
        onNavigateBack={handleNavigateBack}
        onNavigateForward={handleNavigateForward}
      />
      <div ref={scrollContainerRef} data-testid="workspace-scroll-container" className="min-h-0 flex-1 overflow-auto p-5">
        {children}
      </div>
    </div>
  );
}
