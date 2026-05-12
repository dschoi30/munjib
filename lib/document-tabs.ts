export type DocumentTabDocument = {
  id: string;
  title: string;
  path: string;
};

export type DocumentTab = {
  id: string;
  documentId: string | null;
  title: string;
  path: string;
};

type ReconcileDocumentTabsInput = {
  storedTabs: DocumentTab[];
  readableDocuments: DocumentTabDocument[];
  selectedDocument: DocumentTabDocument | null;
  activeTabId: string | null;
};

type CloseDocumentTabInput = {
  tabs: DocumentTab[];
  closedTabId: string;
  activeTabId: string | null;
};

type CloseDocumentTabResult = {
  tabs: DocumentTab[];
  nextActiveTabId: string | null;
  nextDocumentId: string | null;
  closedWasActive: boolean;
};

type StoredDocumentTab = DocumentTab | {
  id: string;
  title: string;
  path: string;
};

export function createDocumentTab(
  document: DocumentTabDocument,
  tabId = createDocumentTabId(),
): DocumentTab {
  return {
    id: tabId,
    documentId: document.id,
    title: document.title,
    path: document.path,
  };
}

export function createEmptyDocumentTab(tabId = createDocumentTabId()): DocumentTab {
  return {
    id: tabId,
    documentId: null,
    title: "New tab",
    path: "/",
  };
}

export function createDocumentTabId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `tab:${crypto.randomUUID()}`;
  }

  return `tab:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function isDocumentTab(value: unknown): value is StoredDocumentTab {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tab = value as Record<string, unknown>;

  if (
    typeof tab.title !== "string" ||
    tab.title.length === 0 ||
    typeof tab.path !== "string"
  ) {
    return false;
  }

  if (typeof tab.documentId === "string" || tab.documentId === null) {
    return typeof tab.id === "string" && tab.id.length > 0;
  }

  return typeof tab.id === "string" && tab.id.length > 0;
}

export function parseStoredDocumentTabs(raw: string | null): DocumentTab[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isDocumentTab).map((tab): DocumentTab => {
      if ("documentId" in tab && (typeof tab.documentId === "string" || tab.documentId === null)) {
        return {
          id: tab.id,
          documentId: tab.documentId,
          title: tab.title,
          path: tab.path,
        };
      }

      return {
        id: tab.id,
        documentId: tab.id,
        title: tab.title,
        path: tab.path,
      };
    });
  } catch {
    return [];
  }
}

export function serializeDocumentTabs(tabs: DocumentTab[]): string {
  return JSON.stringify(tabs);
}

export function reconcileDocumentTabs({
  storedTabs,
  readableDocuments,
  selectedDocument,
  activeTabId,
}: ReconcileDocumentTabsInput): { tabs: DocumentTab[]; activeTabId: string | null } {
  const readableById = new Map(readableDocuments.map((document) => [document.id, document]));
  const tabs = refreshStoredTabs(storedTabs, readableById);
  const currentActiveTabId = tabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : (tabs[0]?.id ?? null);

  if (!selectedDocument || !readableById.has(selectedDocument.id)) {
    return { tabs, activeTabId: currentActiveTabId };
  }

  const activeIndex = tabs.findIndex((tab) => tab.id === currentActiveTabId);

  if (activeIndex >= 0) {
    const activeTab = tabs[activeIndex];
    if (!activeTab) {
      return { tabs, activeTabId: currentActiveTabId };
    }

    const nextActiveTabId = activeTab.id;
    const nextTabs = tabs.map((tab, index) =>
      index === activeIndex ? createDocumentTab(selectedDocument, tab.id) : tab,
    );

    return {
      tabs: dedupeDocumentTabs(nextTabs, nextActiveTabId),
      activeTabId: nextActiveTabId,
    };
  }

  const createdTab = createDocumentTab(selectedDocument, `tab:${selectedDocument.id}`);

  return {
    tabs: [createdTab],
    activeTabId: createdTab.id,
  };
}

export function closeDocumentTab({
  tabs,
  closedTabId,
  activeTabId,
}: CloseDocumentTabInput): CloseDocumentTabResult {
  const closedIndex = tabs.findIndex((tab) => tab.id === closedTabId);

  if (closedIndex < 0) {
    const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

    return {
      tabs,
      nextActiveTabId: activeTabId,
      nextDocumentId: activeTab?.documentId ?? null,
      closedWasActive: false,
    };
  }

  const closedWasActive = closedTabId === activeTabId;
  const nextTabs = tabs.filter((tab) => tab.id !== closedTabId);

  if (!closedWasActive) {
    const activeTab = nextTabs.find((tab) => tab.id === activeTabId) ?? null;

    return {
      tabs: nextTabs,
      nextActiveTabId: activeTab?.id ?? null,
      nextDocumentId: activeTab?.documentId ?? null,
      closedWasActive,
    };
  }

  const nextTab = nextTabs[closedIndex] ?? nextTabs[closedIndex - 1] ?? null;

  return {
    tabs: nextTabs,
    nextActiveTabId: nextTab?.id ?? null,
    nextDocumentId: nextTab?.documentId ?? null,
    closedWasActive,
  };
}

export function addEmptyDocumentTab(tabs: DocumentTab[]): {
  tabs: DocumentTab[];
  activeTabId: string;
} {
  const tab = createEmptyDocumentTab();

  return {
    tabs: [...tabs, tab],
    activeTabId: tab.id,
  };
}

export function addDocumentTab(
  tabs: DocumentTab[],
  document: DocumentTabDocument,
): { tabs: DocumentTab[]; activeTabId: string } {
  const tab = createDocumentTab(document);

  return {
    tabs: [...tabs, tab],
    activeTabId: tab.id,
  };
}

export function formatWorkspacePath(path: string): string {
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  return segments.join(" / ");
}

function refreshStoredTabs(
  storedTabs: DocumentTab[],
  readableById: Map<string, DocumentTabDocument>,
) {
  const refreshedTabs: DocumentTab[] = [];
  const seenTabIds = new Set<string>();

  for (const storedTab of storedTabs) {
    if (seenTabIds.has(storedTab.id)) {
      continue;
    }

    if (!storedTab.documentId) {
      refreshedTabs.push(storedTab);
      seenTabIds.add(storedTab.id);
      continue;
    }

    const readableDocument = readableById.get(storedTab.documentId);

    if (!readableDocument) {
      continue;
    }

    refreshedTabs.push(createDocumentTab(readableDocument, storedTab.id));
    seenTabIds.add(storedTab.id);
  }

  return refreshedTabs;
}

function dedupeDocumentTabs(tabs: DocumentTab[], activeTabId: string) {
  const seenDocumentIds = new Set<string>();
  const dedupedTabs: DocumentTab[] = [];

  for (const tab of tabs) {
    if (!tab.documentId || tab.id === activeTabId) {
      dedupedTabs.push(tab);
      if (tab.documentId) {
        seenDocumentIds.add(tab.documentId);
      }
      continue;
    }

    if (seenDocumentIds.has(tab.documentId)) {
      continue;
    }

    dedupedTabs.push(tab);
    seenDocumentIds.add(tab.documentId);
  }

  return dedupedTabs;
}
