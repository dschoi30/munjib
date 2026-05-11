export type DocumentTab = {
  id: string;
  title: string;
  path: string;
};

type ReconcileDocumentTabsInput = {
  storedTabs: DocumentTab[];
  readableDocuments: DocumentTab[];
  selectedDocument: DocumentTab | null;
};

type CloseDocumentTabInput = {
  tabs: DocumentTab[];
  closedTabId: string;
  activeDocumentId: string | null;
};

function isDocumentTab(value: unknown): value is DocumentTab {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tab = value as Record<string, unknown>;

  return (
    typeof tab.id === "string" &&
    tab.id.length > 0 &&
    typeof tab.title === "string" &&
    tab.title.length > 0 &&
    typeof tab.path === "string"
  );
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

    return parsed.filter(isDocumentTab);
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
}: ReconcileDocumentTabsInput): DocumentTab[] {
  const readableById = new Map(readableDocuments.map((document) => [document.id, document]));
  const reconciled: DocumentTab[] = [];
  const seenTabIds = new Set<string>();

  for (const storedTab of storedTabs) {
    if (seenTabIds.has(storedTab.id)) {
      continue;
    }

    const readableDocument = readableById.get(storedTab.id);

    if (!readableDocument) {
      continue;
    }

    seenTabIds.add(storedTab.id);
    reconciled.push(readableDocument);
  }

  if (!selectedDocument || !readableById.has(selectedDocument.id)) {
    return reconciled;
  }

  const selectedReadableDocument = readableById.get(selectedDocument.id)!;
  const selectedIndex = reconciled.findIndex((tab) => tab.id === selectedDocument.id);

  if (selectedIndex >= 0) {
    return reconciled.map((tab, index) => (index === selectedIndex ? selectedReadableDocument : tab));
  }

  return [...reconciled, selectedReadableDocument];
}

export function closeDocumentTab({
  tabs,
  closedTabId,
  activeDocumentId,
}: CloseDocumentTabInput): { tabs: DocumentTab[]; nextDocumentId: string | null } {
  const closedIndex = tabs.findIndex((tab) => tab.id === closedTabId);

  if (closedIndex < 0) {
    return {
      tabs,
      nextDocumentId: activeDocumentId,
    };
  }

  const nextTabs = tabs.filter((tab) => tab.id !== closedTabId);

  if (closedTabId !== activeDocumentId) {
    return {
      tabs: nextTabs,
      nextDocumentId: activeDocumentId,
    };
  }

  const nextDocument = nextTabs[closedIndex] ?? nextTabs[closedIndex - 1] ?? null;

  return {
    tabs: nextTabs,
    nextDocumentId: nextDocument?.id ?? null,
  };
}

export function formatWorkspacePath(path: string): string {
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  return segments.join(" / ");
}
