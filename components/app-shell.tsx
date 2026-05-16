"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { SetStateAction } from "react";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type RightPanelControls = {
  collapse: () => void;
};

export type HeadingNavigationTarget = {
  id: string;
  lineNumber: number;
};

type HeadingNavigator = ((target: HeadingNavigationTarget) => void) | null;

type HeadingNavigationControls = {
  navigateToHeading: (target: HeadingNavigationTarget) => boolean;
  setHeadingNavigator: (navigator: SetStateAction<HeadingNavigator>) => void;
};

const RightPanelContext = createContext<RightPanelControls | null>(null);
const HeadingNavigationContext = createContext<HeadingNavigationControls | null>(null);

export function useRightPanel() {
  return useContext(RightPanelContext);
}

export function useHeadingNavigation() {
  return useContext(HeadingNavigationContext);
}

export function AppShell({
  left,
  center,
  right,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode | ((controls: RightPanelControls) => React.ReactNode);
}) {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const headingNavigatorRef = useRef<HeadingNavigator>(null);
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

        headingNavigatorRef.current(target);
        return true;
      },
      setHeadingNavigator: (navigator) => {
        headingNavigatorRef.current =
          typeof navigator === "function"
            ? (navigator as (previous: HeadingNavigator) => HeadingNavigator)(
                headingNavigatorRef.current,
              )
            : navigator;
      },
    }),
    [],
  );
  const rightContent =
    typeof right === "function" ? right(rightPanelControls) : right;

  return (
    <HeadingNavigationContext.Provider value={headingNavigationControls}>
      <main
        className={
          rightPanelOpen
            ? "grid h-dvh max-h-dvh min-h-0 grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden bg-white text-ink"
            : "relative grid h-dvh max-h-dvh min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-white text-ink"
        }
      >
        <aside className="overflow-auto border-r border-border bg-muted px-4 pb-4 pt-0">{left}</aside>
        <section className="min-h-0 min-w-0 overflow-hidden bg-white">{center}</section>
        {rightPanelOpen ? (
          <aside className="overflow-auto border-l border-border bg-muted px-4 pb-4 pt-0">
            <RightPanelContext.Provider value={rightPanelControls}>
              {rightContent}
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
      </main>
    </HeadingNavigationContext.Provider>
  );
}
