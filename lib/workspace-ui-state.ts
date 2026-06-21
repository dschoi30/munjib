export type WorkspaceSidebarPanel = "documents" | "search" | "favorites";

export type WorkspaceUiGraphFilters = {
  tag: boolean;
  orphans: boolean;
};

export type WorkspaceUiGraphDisplay = {
  arrows: boolean;
  linkThickness: number;
  nodeSize: number;
  textFadeThreshold: number;
};

export type WorkspaceUiGraphForces = {
  center: number;
  link: number;
  linkDistance: number;
  repel: number;
};

export type WorkspaceUiState = {
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  activeSidebarPanel?: WorkspaceSidebarPanel;
  workspaceChatOpen?: boolean;
  graph?: {
    settingsOpen?: boolean;
    filtersOpen?: boolean;
    displayOpen?: boolean;
    forcesOpen?: boolean;
    filters?: WorkspaceUiGraphFilters;
    display?: WorkspaceUiGraphDisplay;
    forces?: WorkspaceUiGraphForces;
  };
};

const STORAGE_VERSION = "v1";

export function workspaceUiStateStorageKey(workspaceSlug: string) {
  return `munjib:workspace-ui:${workspaceSlug}:${STORAGE_VERSION}`;
}

export function readStoredWorkspaceUiState(workspaceSlug: string): WorkspaceUiState {
  const storage = getBrowserStorage();
  if (!storage) {
    return {};
  }

  const raw = safeGetItem(storage, workspaceUiStateStorageKey(workspaceSlug));
  if (!raw) {
    return {};
  }

  try {
    return validateWorkspaceUiState(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function updateStoredWorkspaceUiState(
  workspaceSlug: string,
  updater: (current: WorkspaceUiState) => WorkspaceUiState,
) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  const current = readStoredWorkspaceUiState(workspaceSlug);
  const patch = validateWorkspaceUiState(updater(current));
  const next = mergeWorkspaceUiState(current, patch);
  safeSetItem(storage, workspaceUiStateStorageKey(workspaceSlug), JSON.stringify(next));
}

function mergeWorkspaceUiState(
  current: WorkspaceUiState,
  patch: WorkspaceUiState,
): WorkspaceUiState {
  const next: WorkspaceUiState = { ...current, ...patch };
  if (current.graph || patch.graph) {
    next.graph = {
      ...current.graph,
      ...patch.graph,
    };
  }

  return next;
}

function validateWorkspaceUiState(value: unknown): WorkspaceUiState {
  if (!isRecord(value)) {
    return {};
  }

  const state: WorkspaceUiState = {};
  if (typeof value.leftSidebarOpen === "boolean") {
    state.leftSidebarOpen = value.leftSidebarOpen;
  }
  if (typeof value.rightSidebarOpen === "boolean") {
    state.rightSidebarOpen = value.rightSidebarOpen;
  }
  if (isWorkspaceSidebarPanel(value.activeSidebarPanel)) {
    state.activeSidebarPanel = value.activeSidebarPanel;
  }
  if (typeof value.workspaceChatOpen === "boolean") {
    state.workspaceChatOpen = value.workspaceChatOpen;
  }

  const graph = validateGraphState(value.graph);
  if (Object.keys(graph).length > 0) {
    state.graph = graph;
  }

  return state;
}

function validateGraphState(value: unknown): NonNullable<WorkspaceUiState["graph"]> {
  if (!isRecord(value)) {
    return {};
  }

  const graph: NonNullable<WorkspaceUiState["graph"]> = {};
  if (typeof value.settingsOpen === "boolean") {
    graph.settingsOpen = value.settingsOpen;
  }
  if (typeof value.filtersOpen === "boolean") {
    graph.filtersOpen = value.filtersOpen;
  }
  if (typeof value.displayOpen === "boolean") {
    graph.displayOpen = value.displayOpen;
  }
  if (typeof value.forcesOpen === "boolean") {
    graph.forcesOpen = value.forcesOpen;
  }

  const filters = validateGraphFilters(value.filters);
  if (filters) {
    graph.filters = filters;
  }

  const display = validateGraphDisplay(value.display);
  if (display) {
    graph.display = display;
  }

  const forces = validateGraphForces(value.forces);
  if (forces) {
    graph.forces = forces;
  }

  return graph;
}

function validateGraphFilters(value: unknown): WorkspaceUiGraphFilters | null {
  if (!isRecord(value) || typeof value.tag !== "boolean" || typeof value.orphans !== "boolean") {
    return null;
  }

  return { tag: value.tag, orphans: value.orphans };
}

function validateGraphDisplay(value: unknown): WorkspaceUiGraphDisplay | null {
  if (
    !isRecord(value) ||
    typeof value.arrows !== "boolean" ||
    !isNumberInRange(value.linkThickness, 0.5, 5) ||
    !isNumberInRange(value.nodeSize, 1, 10) ||
    !isNumberInRange(value.textFadeThreshold, 0.5, 3)
  ) {
    return null;
  }

  return {
    arrows: value.arrows,
    linkThickness: value.linkThickness,
    nodeSize: value.nodeSize,
    textFadeThreshold: value.textFadeThreshold,
  };
}

function validateGraphForces(value: unknown): WorkspaceUiGraphForces | null {
  if (
    !isRecord(value) ||
    !isNumberInRange(value.center, 0, 1) ||
    !isNumberInRange(value.link, 0, 1) ||
    !isNumberInRange(value.linkDistance, 20, 180) ||
    !isNumberInRange(value.repel, -300, -20)
  ) {
    return null;
  }

  return {
    center: value.center,
    link: value.link,
    linkDistance: value.linkDistance,
    repel: value.repel,
  };
}

function isWorkspaceSidebarPanel(value: unknown): value is WorkspaceSidebarPanel {
  return value === "documents" || value === "search" || value === "favorites";
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    return;
  }
}
