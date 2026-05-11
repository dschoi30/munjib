"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  closeDocumentTab,
  parseStoredDocumentTabs,
  reconcileDocumentTabs,
  serializeDocumentTabs,
  type DocumentTab,
} from "@/lib/document-tabs";

type UseDocumentTabsInput = {
  workspaceSlug: string;
  documents: DocumentTab[];
  selectedDocument: DocumentTab | null;
};

export function useDocumentTabs({
  workspaceSlug,
  documents,
  selectedDocument,
}: UseDocumentTabsInput) {
  const storageKey = useMemo(() => `munjib:open-tabs:${workspaceSlug}`, [workspaceSlug]);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [tabs, setTabs] = useState<DocumentTab[]>(() =>
    reconcileDocumentTabs({
      storedTabs: [],
      readableDocuments: documents,
      selectedDocument,
    }),
  );

  useEffect(() => {
    const storedTabs = parseStoredDocumentTabs(window.localStorage.getItem(storageKey));

    setTabs(
      reconcileDocumentTabs({
        storedTabs,
        readableDocuments: documents,
        selectedDocument,
      }),
    );
    setHydratedStorageKey(storageKey);
  }, [documents, selectedDocument, storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, serializeDocumentTabs(tabs));
  }, [hydratedStorageKey, storageKey, tabs]);

  const closeTab = useCallback(
    (tabId: string) => {
      const result = closeDocumentTab({
        tabs,
        closedTabId: tabId,
        activeDocumentId: selectedDocument?.id ?? null,
      });

      setTabs(result.tabs);
      return result.nextDocumentId;
    },
    [selectedDocument?.id, tabs],
  );

  return {
    tabs,
    activeDocumentId: selectedDocument?.id ?? null,
    closeTab,
  };
}
