"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDocumentTab,
  addEmptyDocumentTab,
  closeDocumentTab,
  parseStoredDocumentTabs,
  reconcileDocumentTabs,
  serializeDocumentTabs,
  type DocumentTab,
  type DocumentTabDocument,
} from "@/lib/document-tabs";

type UseDocumentTabsInput = {
  workspaceSlug: string;
  documents: DocumentTabDocument[];
  selectedDocument: DocumentTabDocument | null;
};

export function useDocumentTabs({
  workspaceSlug,
  documents,
  selectedDocument,
}: UseDocumentTabsInput) {
  const storageKey = useMemo(() => documentTabsStorageKey(workspaceSlug), [workspaceSlug]);
  const activeStorageKey = useMemo(() => documentTabsActiveStorageKey(workspaceSlug), [workspaceSlug]);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    const storedTabs = parseStoredDocumentTabs(window.localStorage.getItem(storageKey));
    const storedActiveTabId = window.localStorage.getItem(activeStorageKey);
    const result = reconcileDocumentTabs({
      storedTabs,
      readableDocuments: documents,
      selectedDocument,
      activeTabId: storedActiveTabId,
    });

    setTabs(result.tabs);
    setActiveTabId(result.activeTabId);
    setHydratedStorageKey(storageKey);
  }, [activeStorageKey, documents, selectedDocument, storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, serializeDocumentTabs(tabs));
    if (activeTabId) {
      window.localStorage.setItem(activeStorageKey, activeTabId);
    } else {
      window.localStorage.removeItem(activeStorageKey);
    }
  }, [activeStorageKey, activeTabId, hydratedStorageKey, storageKey, tabs]);

  const closeTab = useCallback(
    (tabId: string) => {
      const result = closeDocumentTab({
        tabs,
        closedTabId: tabId,
        activeTabId,
      });

      setTabs(result.tabs);
      setActiveTabId(result.nextActiveTabId);
      return result;
    },
    [activeTabId, tabs],
  );

  const selectTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId) ?? null;
      setActiveTabId(tab?.id ?? null);
      return tab?.documentId ?? null;
    },
    [tabs],
  );

  const createNewTab = useCallback(() => {
    const result = addEmptyDocumentTab(tabs);
    setTabs(result.tabs);
    setActiveTabId(result.activeTabId);
    return result.activeTabId;
  }, [tabs]);

  const activeDocumentId = tabs.find((tab) => tab.id === activeTabId)?.documentId ?? null;

  return {
    tabs,
    activeTabId,
    activeDocumentId,
    closeTab,
    selectTab,
    createNewTab,
  };
}

export function openDocumentInNewTab(workspaceSlug: string, document: DocumentTabDocument) {
  const request = new CustomEvent("munjib:open-document-tab", { detail: { workspaceSlug, document }, cancelable: true });
  if (!window.dispatchEvent(request)) return;
  const storageKey = documentTabsStorageKey(workspaceSlug);
  const activeStorageKey = documentTabsActiveStorageKey(workspaceSlug);
  const tabs = parseStoredDocumentTabs(window.localStorage.getItem(storageKey));
  const result = addDocumentTab(tabs, document);

  window.localStorage.setItem(storageKey, serializeDocumentTabs(result.tabs));
  window.localStorage.setItem(activeStorageKey, result.activeTabId);
}

function documentTabsStorageKey(workspaceSlug: string) {
  return `munjib:open-tabs:${workspaceSlug}`;
}

function documentTabsActiveStorageKey(workspaceSlug: string) {
  return `munjib:open-tabs-active:${workspaceSlug}`;
}
