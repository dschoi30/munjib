"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
} from "@/lib/workspace-ui-state";

type LeftPanelControls = {
  isOpen: boolean;
  collapse: () => void;
  open: () => void;
};

type RightPanelControls = {
  collapse: () => void;
};

type TagSearchRequest = {
  tagName: string;
  token: number;
};

type TagSearchControls = {
  latestTagSearchRequest: TagSearchRequest | null;
  requestTagSearch: (tagName: string) => void;
};

export type HeadingNavigationTarget = {
  id: string;
  lineNumber: number;
};

export type HeadingNavigationDocument = {
  id: string;
  contentMarkdown: string;
};

type HeadingNavigator = ((target: HeadingNavigationTarget) => boolean) | null;

type HeadingNavigationControls = {
  outlineDocument: HeadingNavigationDocument | null;
  navigateToHeading: (target: HeadingNavigationTarget) => boolean;
  setOutlineDocument: (document: HeadingNavigationDocument | null) => void;
  setHeadingNavigator: (navigator: HeadingNavigator) => void;
};

const LeftPanelContext = createContext<LeftPanelControls | null>(null);
const RightPanelContext = createContext<RightPanelControls | null>(null);
const HeadingNavigationContext = createContext<HeadingNavigationControls | null>(null);
const TagSearchContext = createContext<TagSearchControls | null>(null);

export function useLeftPanel() {
  return useContext(LeftPanelContext);
}

export function useRightPanel() {
  return useContext(RightPanelContext);
}

export function useHeadingNavigation() {
  return useContext(HeadingNavigationContext);
}

export function useTagSearch() {
  return useContext(TagSearchContext);
}

export function AppShell({
  left,
  center,
  right,
  workspaceSlug,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode | ((controls: RightPanelControls) => React.ReactNode);
  workspaceSlug?: string;
}) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [shellStorageHydratedWorkspace, setShellStorageHydratedWorkspace] =
    useState<string | null>(null);
  const [outlineDocument, setOutlineDocument] = useState<HeadingNavigationDocument | null>(null);
  const [latestTagSearchRequest, setLatestTagSearchRequest] =
    useState<TagSearchRequest | null>(null);
  const headingNavigatorRef = useRef<HeadingNavigator>(null);
  const nextTagSearchTokenRef = useRef(0);
  useEffect(() => {
    if (!workspaceSlug) {
      setShellStorageHydratedWorkspace(null);
      return;
    }

    const storedState = readStoredWorkspaceUiState(workspaceSlug);
    setLeftPanelOpen(storedState.leftSidebarOpen ?? true);
    setRightPanelOpen(storedState.rightSidebarOpen ?? true);
    setShellStorageHydratedWorkspace(workspaceSlug);
  }, [workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || shellStorageHydratedWorkspace !== workspaceSlug) {
      return;
    }

    updateStoredWorkspaceUiState(workspaceSlug, (current) => ({
      ...current,
      leftSidebarOpen: leftPanelOpen,
      rightSidebarOpen: rightPanelOpen,
    }));
  }, [leftPanelOpen, rightPanelOpen, shellStorageHydratedWorkspace, workspaceSlug]);

  const requestTagSearch = useCallback((tagName: string) => {
    setLeftPanelOpen(true);
    nextTagSearchTokenRef.current += 1;
    setLatestTagSearchRequest({
      tagName,
      token: nextTagSearchTokenRef.current,
    });
  }, []);
  const leftPanelControls = useMemo(
    () => ({
      isOpen: leftPanelOpen,
      collapse: () => setLeftPanelOpen(false),
      open: () => setLeftPanelOpen(true),
    }),
    [leftPanelOpen],
  );
  const rightPanelControls = useMemo(
    () => ({
      collapse: () => setRightPanelOpen(false),
    }),
    [],
  );
  const headingNavigationControls = useMemo<HeadingNavigationControls>(
    () => ({
      navigateToHeading: (target) => {
        if (!headingNavigatorRef.current) {
          return false;
        }

        return headingNavigatorRef.current(target);
      },
      setHeadingNavigator: (navigator) => {
        headingNavigatorRef.current = navigator;
      },
      setOutlineDocument,
      outlineDocument,
    }),
    [outlineDocument],
  );
  const tagSearchControls = useMemo<TagSearchControls>(
    () => ({
      latestTagSearchRequest,
      requestTagSearch,
    }),
    [latestTagSearchRequest, requestTagSearch],
  );
  const shellStorageHydrated = !workspaceSlug || shellStorageHydratedWorkspace === workspaceSlug;
  const rightContent =
    typeof right === "function" ? right(rightPanelControls) : right;

  return (
    <HeadingNavigationContext.Provider value={headingNavigationControls}>
      <TagSearchContext.Provider value={tagSearchControls}>
        <main className={appShellGridClassName({ leftPanelOpen, rightPanelOpen })}>
          <LeftPanelContext.Provider value={leftPanelControls}>
            {leftPanelOpen ? (
              <aside className="overflow-auto border-r border-border bg-muted px-4 pb-4 pt-0">
                {shellStorageHydrated ? left : null}
              </aside>
            ) : (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      aria-label="Open sidebar"
                      onClick={() => setLeftPanelOpen(true)}
                      className="absolute left-4 top-1.5 z-30 h-8 w-8 bg-muted p-0 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-ink"
                    >
                      <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open sidebar</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <section className="min-h-0 min-w-0 overflow-hidden bg-white">{center}</section>
            {rightPanelOpen ? (
              <aside className="overflow-auto border-l border-border bg-muted px-4 pb-4 pt-0">
                <RightPanelContext.Provider value={rightPanelControls}>
                  {shellStorageHydrated ? rightContent : null}
                </RightPanelContext.Provider>
              </aside>
            ) : (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      aria-label="Open metadata panel"
                      onClick={() => setRightPanelOpen(true)}
                      className="absolute right-4 top-1.5 h-8 w-8 bg-muted p-0 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-ink"
                    >
                      <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open metadata panel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </LeftPanelContext.Provider>
        </main>
      </TagSearchContext.Provider>
    </HeadingNavigationContext.Provider>
  );
}

function appShellGridClassName({
  leftPanelOpen,
  rightPanelOpen,
}: {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
}) {
  const baseClassName =
    "relative grid h-dvh max-h-dvh min-h-0 overflow-hidden bg-white text-ink";
  if (leftPanelOpen && rightPanelOpen) {
    return `${baseClassName} grid-cols-[280px_minmax(0,1fr)_320px]`;
  }
  if (leftPanelOpen) {
    return `${baseClassName} grid-cols-[280px_minmax(0,1fr)]`;
  }
  if (rightPanelOpen) {
    return `${baseClassName} grid-cols-[minmax(0,1fr)_320px]`;
  }
  return `${baseClassName} grid-cols-[minmax(0,1fr)]`;
}
